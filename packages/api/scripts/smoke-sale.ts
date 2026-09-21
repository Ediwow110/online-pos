import { PrismaClient, type Prisma } from "@online-pos/database";
import { randomUUID } from "node:crypto";

const prisma = new PrismaClient();

async function ensureOpenShift(branchId: string, registerId: string, businessId: string) {
  const open = await prisma.shift.findFirst({ where: { branchId, registerId, status: "OPEN" } });
  if (open) return open;

  return prisma.shift.create({
    data: {
      id: randomUUID(),
      businessId,
      branchId,
      registerId,
      status: "OPEN",
      openedAt: new Date(),
      openedBy: "system",
      startingCashCentavos: 0,
    },
  });
}

async function main() {
  const [business, branch, register, product] = await Promise.all([
    prisma.business.findFirstOrThrow(),
    prisma.branch.findFirstOrThrow(),
    prisma.register.findFirstOrThrow(),
    prisma.product.findFirstOrThrow(),
  ]);

  const shift = await ensureOpenShift(branch.id, register.id, business.id);

  const payload = {
    tenantId: business.id,
    branchId: branch.id,
    registerId: register.id,
    shiftId: shift.id,
    items: [
      {
        productId: product.id,
        qty: 2,
        unitPriceCentavos: 15000,
        lineDiscountCentavos: 0,
      },
    ],
    payments: [{ method: "CASH" as const, amountCentavos: 35000 }],
    idempotencyKey: `smoke-${Date.now()}`,
  };

  const res = await fetch("http://localhost:3000/sales/commit", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });

  const json = await res.json();
  if (!res.ok || !json.ok) {
    console.error("Smoke FAILED:", json);
    process.exit(1);
  }

  const saleId = json.saleId as string;

  const move = await prisma.inventoryMovement.findFirst({ where: { saleId } });
  const bal = await prisma.inventoryBalance.findUnique({
    where: { productId_branchId: { productId: product.id, branchId: branch.id } },
  });

  if (!move || !bal || bal.quantity >= 0) {
    console.error("Smoke FAILED: inventory not decremented", { move, bal });
    process.exit(1);
  }

  console.log("Smoke PASSED:", { saleId, moveQty: move.quantity, balanceQty: bal.quantity });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
