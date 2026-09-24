import { PrismaClient } from "@online-pos/database";
import { randomUUID } from "node:crypto";
import {
  roundHalfUp,
  pesosToCentavos,
  SALE_TRANSITIONS,
  PHP_VAT_BPS,
  type Money,
} from "@online-pos/domain";
import { z } from "zod";

const prisma = new PrismaClient();

export type SaleActorContext = {
  userId: string;
  businessId: string;
};

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

export async function commitSaleHandler(req: Request, actor?: SaleActorContext) {
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
    if (!actor) {
      return new Response(JSON.stringify({ error: "UNAUTHENTICATED" }), {
        status: 401,
        headers: { "content-type": "application/json" },
      });
    }
    if (data.tenantId !== actor.businessId) {
      return new Response(JSON.stringify({ error: "BUSINESS_SCOPE_MISMATCH" }), {
        status: 403,
        headers: { "content-type": "application/json" },
      });
    }

    const result = await prisma.$transaction(async (tx) => {
      // Idempotency guard (scoped by business via unique constraint)
      const existing = await tx.idempotencyRecord.findFirst({
        where: { businessId: data.tenantId, key: data.idempotencyKey, commandType: "SALE_COMMIT" },
      });
      if (existing) {
        if (existing.requestHash !== JSON.stringify(data)) {
          throw new Error("IDEMPOTENCY_KEY_REUSED");
        }
        return { replay: true, saleId: existing.resourceId };
      }

      // Shift invariant
      const shift = await tx.shift.findUnique({
        where: { id: data.shiftId },
        include: { register: true },
      });
      if (
        !shift ||
        shift.businessId !== actor.businessId ||
        shift.status !== "OPEN" ||
        shift.registerId !== data.registerId ||
        shift.register.branchId !== data.branchId
      ) {
        throw new Error("SHIFT_NOT_OPEN_OR_MISMATCH");
      }
      const subscription = await tx.subscription.findUnique({ where: { businessId: actor.businessId } });
      if (subscription && (subscription.status === "CANCELLED" || subscription.status === "PAST_DUE")) {
        throw new Error("SUBSCRIPTION_INACTIVE");
      }
      if (subscription) {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${actor.businessId}))::text`;
        const periodStart = new Date();
        periodStart.setDate(1);
        periodStart.setHours(0, 0, 0, 0);
        const orderCount = await tx.sale.count({ where: { businessId: actor.businessId, createdAt: { gte: periodStart }, status: { not: "VOIDED" } } });
        if (orderCount >= subscription.monthlyOrderLimit) throw new Error("MONTHLY_ORDER_LIMIT_REACHED");
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

      // Stock invariants: check and lock per tracked product
      const products = await tx.product.findMany({
        where: { businessId: actor.businessId, id: { in: [...new Set(data.items.map((i) => i.productId))] } },
        select: { id: true, name: true, sku: true, trackInventory: true, allowNegative: true },
      });
      const prodMap = new Map(products.map((p) => [p.id, p]));
      if (data.customerId) {
        const customer = await tx.customer.findFirst({ where: { id: data.customerId, businessId: actor.businessId } });
        if (!customer) throw new Error("CUSTOMER_NOT_FOUND");
      }

      for (const [index, it] of data.items.entries()) {
        const prod = prodMap.get(it.productId);
        if (!prod) throw new Error("PRODUCT_NOT_FOUND");
        if (!prod.trackInventory) continue;

        const bal = await tx.inventoryBalance.findUnique({
          where: { productId_branchId: { productId: it.productId, branchId: data.branchId } },
        });
        if (!bal) {
          throw new Error("INVENTORY_BALANCE_MISSING");
        }
        if (bal.quantity < it.qty && !prod.allowNegative) {
          throw new Error("INSUFFICIENT_STOCK");
        }
      }

      // Create sale
      const receiptNumber = `SALE-${Date.now()}-${Math.floor(Math.random() * 1000).toString().padStart(3, "0")}`;
      const cashierId = actor.userId;
      const saleItemIds = data.items.map(() => randomUUID());
      const sale = await tx.sale.create({
        data: {
          id: randomUUID(),
          businessId: shift.businessId,
          registerId: data.registerId,
          shiftId: data.shiftId,
          cashierId,
          receiptNumber,
          customerId: data.customerId ?? null,
          status: "COMPLETED",
          subtotal: subtotalCentavos,
          lineDiscount: discountCentavos,
          orderDiscount: 0,
          tax: vatCentavos,
          total: totalCentavos,
          paid: paidCentavos,
          changeDue: paidCentavos - totalCentavos,
          taxInclusive: false,
          taxRateBps: vatBps,
          completedAt: new Date(),
          items: {
            create: data.items.map((it, index) => ({
              id: saleItemIds[index],
              businessId: shift.businessId,
              productId: it.productId,
              nameSnapshot: prodMap.get(it.productId)?.name ?? "Product",
              skuSnapshot: prodMap.get(it.productId)?.sku ?? "",
              quantity: it.qty,
              unitPrice: it.unitPriceCentavos,
              unitCost: 0,
              lineDiscount: it.lineDiscountCentavos ?? 0,
              taxRateBps: vatBps,
              lineTotal: it.unitPriceCentavos * it.qty - (it.lineDiscountCentavos ?? 0),
            })),
          },
          payments: {
            create: data.payments.map((p) => ({
              id: randomUUID(),
              businessId: shift.businessId,
              method: p.method,
              amount: p.amountCentavos,
              status: "COMPLETED",
              actorId: cashierId,
              idempotencyKey: data.idempotencyKey,
            })),
          },
        },
      });

      // Inventory movements and balance updates (after sale creation)
      for (const [index, it] of data.items.entries()) {
        const prod = prodMap.get(it.productId)!;
        if (!prod.trackInventory) continue;

        await tx.inventoryMovement.create({
          data: {
            id: randomUUID(),
            businessId: shift.businessId,
            branchId: data.branchId,
            productId: it.productId,
            type: "SALE",
            quantity: -it.qty,
            actorId: cashierId,
            saleItemId: saleItemIds[index],
          },
        });

        await tx.inventoryBalance.update({
          where: { productId_branchId: { productId: it.productId, branchId: data.branchId } },
          data: { quantity: { decrement: it.qty } },
        });
      }

      const cashAmount = data.payments
        .filter((payment) => payment.method === "CASH")
        .reduce((sum, payment) => sum + payment.amountCentavos, 0);
      if (cashAmount > 0) {
        await tx.cashMovement.create({
          data: {
            businessId: shift.businessId,
            shiftId: shift.id,
            type: "CASH_SALE",
            amount: Math.min(cashAmount, totalCentavos),
            saleId: sale.id,
            actorId: cashierId,
            reason: `Sale ${sale.receiptNumber}`,
          },
        });
      }

      // Idempotency record
      await tx.idempotencyRecord.create({
        data: {
          id: randomUUID(),
          key: data.idempotencyKey,
          businessId: shift.businessId,
          commandType: "SALE_COMMIT",
          requestHash: JSON.stringify(data),
          responseJson: { saleId: sale.id },
          resourceId: sale.id,
        },
      });

      await tx.auditLog.create({
        data: {
          businessId: shift.businessId,
          actorId: cashierId,
          action: "SALE_COMMITTED",
          entityType: "Sale",
          entityId: sale.id,
          reason: `Receipt ${sale.receiptNumber}`,
        },
      });
      return { replay: false, saleId: sale.id };
    });

    return new Response(JSON.stringify({ ok: true, saleId: result.saleId, ...(result.replay ? { replayed: true } : {}) }), {
      status: result.replay ? 200 : 201,
      headers: { "content-type": "application/json" },
    });
  } catch (err: any) {
    const code = err?.message || "UNKNOWN";
    return new Response(JSON.stringify({ error: code }), {
      status: code.includes("DUPLICATE") || code.includes("IDEMPOTENCY") ? 409 : code.includes("SHIFT") || code.includes("PAYMENT") || code.includes("STOCK") || code.includes("INVENTORY") || code.includes("SUBSCRIPTION") || code.includes("CUSTOMER") || code.includes("PRODUCT") || code.includes("LIMIT") ? 400 : 500,
      headers: { "content-type": "application/json" },
    });
  }
}
