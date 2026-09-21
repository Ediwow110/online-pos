import { PrismaClient } from "@online-pos/database";
import {
  roundHalfUp,
  pesosToCentavos,
  SALE_TRANSITIONS,
  PHP_VAT_BPS,
  type Money,
} from "@online-pos/domain";
import { z } from "zod";

const prisma = new PrismaClient();

const saleItemSchema = z.object({
  productId: z.string(),
  variantId: z.string().optional(),
  qty: z.number().int().positive(),
  unitPriceCentavos: z.number().int().nonnegative(),
  lineDiscountCentavos: z.number().int().nonnegative().optional(),
});

const saleCommitSchema = z.object({
  tenantId: z.string(),
  branchId: z.string(),
  registerId: z.string(),
  shiftId: z.string(),
  customerId: z.string().optional(),
  items: z.array(saleItemSchema).min(1),
  payments: z.array(
    z.object({
      method: z.enum(["CASH", "CARD", "GCASH", "MAYA", "BANK_TRANSFER", "OTHER"]),
      amountCentavos: z.number().int().positive(),
    })
  ).min(1),
  idempotencyKey: z.string().max(128),
});

export async function commitSaleHandler(req: Request) {
  const body = await req.json().catch(() => null);
  const parse = saleCommitSchema.safeParse(body);
  if (!parse.success) {
    return new Response(JSON.stringify({ error: "INVALID_PAYLOAD", details: parse.error.flatten() }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const data = parse.data;

  try {
    const result = await prisma.$transaction(async (tx) => {
      // Idempotency guard
      const existing = await tx.idempotencyRecord.findUnique({
        where: { key: data.idempotencyKey },
      });
      if (existing) {
        throw new Error("DUPLICATE_IDEMPOTENCY_KEY");
      }

      // Shift invariant
      const shift = await tx.shift.findUnique({
        where: { id: data.shiftId },
        include: { register: true },
      });
      if (!shift || shift.status !== "OPEN" || shift.registerId !== data.registerId || shift.branchId !== data.branchId) {
        throw new Error("SHIFT_NOT_OPEN_OR_MISMATCH");
      }

      // Compute totals
      let subtotalCentavos: Money = 0;
      let discountCentavos: Money = 0;

      for (const item of data.items) {
        const lineTotal = item.unitPriceCentavos * item.qty;
        const lineDisc = item.lineDiscountCentavos ?? 0;
        subtotalCentavos += lineTotal;
        discountCentavos += lineDisc;
      }

      const netCentavos = roundHalfUp(subtotalCentavos - discountCentavos);
      const vatBps = PHP_VAT_BPS;
      const vatCentavos = roundHalfUp((netCentavos * vatBps) / 10000);
      const totalCentavos = netCentavos + vatCentavos;

      const paidCentavos = data.payments.reduce((sum, p) => sum + p.amountCentavos, 0);
      if (paidCentavos < totalCentavos) {
        throw new Error("PAYMENT_INSUFFICIENT");
      }

      // Create sale
      const sale = await tx.sale.create({
        data: {
          id: crypto.randomUUID(),
          branchId: data.branchId,
          businessId: shift.businessId,
          registerId: data.registerId,
          shiftId: data.shiftId,
          customerId: data.customerId ?? null,
          status: "COMPLETED",
          subtotalCentavos,
          discountCentavos,
          vatCentavos,
          totalCentavos,
          paidCentavos,
          changeCentavos: paidCentavos - totalCentavos,
          items: {
            create: data.items.map((it) => ({
              id: crypto.randomUUID(),
              productId: it.productId,
              variantId: it.variantId ?? null,
              qty: it.qty,
              unitPriceCentavos: it.unitPriceCentavos,
              discountCentavos: it.lineDiscountCentavos ?? 0,
            })),
          },
          payments: {
            create: data.payments.map((p) => ({
              id: crypto.randomUUID(),
              method: p.method,
              amountCentavos: p.amountCentavos,
            })),
          },
        },
      });

      // Inventory movements and balance updates
      for (const it of data.items) {
        const move = await tx.inventoryMovement.create({
          data: {
            id: crypto.randomUUID(),
            businessId: shift.businessId,
            branchId: data.branchId,
            productId: it.productId,
            shiftId: data.shiftId,
            saleId: sale.id,
            type: "SALE",
            quantity: -it.qty,
          },
        });

        await tx.inventoryBalance.upsert({
          where: { productId_branchId: { productId: it.productId, branchId: data.branchId } },
          update: { quantity: { decrement: it.qty } },
          create: {
            id: crypto.randomUUID(),
            businessId: shift.businessId,
            branchId: data.branchId,
            productId: it.productId,
            quantity: -it.qty,
          },
        });
      }

      // Idempotency record
      await tx.idempotencyRecord.create({
        data: {
          id: crypto.randomUUID(),
          key: data.idempotencyKey,
          businessId: shift.businessId,
          lastStatus: "COMPLETED",
          lastResponse: { saleId: sale.id },
        },
      });

      return sale;
    });

    return new Response(JSON.stringify({ ok: true, saleId: result.id }), {
      status: 201,
      headers: { "content-type": "application/json" },
    });
  } catch (err: any) {
    const code = err?.message || "UNKNOWN";
    return new Response(JSON.stringify({ error: code }), {
      status: code.includes("DUPLICATE") ? 409 : code.includes("SHIFT") || code.includes("PAYMENT") ? 400 : 500,
      headers: { "content-type": "application/json" },
    });
  }
}
