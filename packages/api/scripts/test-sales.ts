import { PrismaClient } from "@online-pos/database";
import { randomUUID } from "node:crypto";

const prisma = new PrismaClient();

async function resetIdempotency(businessId: string, key: string) {
  await prisma.idempotencyRecord.deleteMany({ where: { businessId, key } });
}

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

async function postSale(payload: any) {
  const res = await fetch("http://localhost:3000/sales/commit", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  return { status: res.status, json: await res.json() };
}

async function runTests() {
  const [business, branch, register, product] = await Promise.all([
    prisma.business.findFirstOrThrow(),
    prisma.branch.findFirstOrThrow(),
    prisma.register.findFirstOrThrow(),
    prisma.product.findFirstOrThrow({ where: { trackInventory: true, allowNegative: false } }),
  ]);

  const shift = await ensureOpenShift(branch.id, register.id, business.id);

  // Ensure inventory balance exists with known qty
  const startingQty = 10;
  await prisma.inventoryBalance.upsert({
    where: { productId_branchId: { productId: product.id, branchId: branch.id } },
    update: { quantity: startingQty },
    create: {
      id: randomUUID(),
      businessId: business.id,
      productId: product.id,
      branchId: branch.id,
      quantity: startingQty,
    },
  });

  const basePayload = {
    tenantId: business.id,
    branchId: branch.id,
    registerId: register.id,
    shiftId: shift.id,
    items: [{ productId: product.id, qty: 2, unitPriceCentavos: 15000, lineDiscountCentavos: 0 }],
    payments: [{ method: "CASH" as const, amountCentavos: 35000 }],
    idempotencyKey: `test-${Date.now()}`,
  };

  // 1) Normal sale should succeed
  let res = await postSale(basePayload);
  if (res.status !== 201 || !res.json.ok) throw new Error("TEST 1 FAILED: normal sale");
  const saleId1 = res.json.saleId;

  // Verify inventory decremented
  const bal1 = await prisma.inventoryBalance.findUnique({
    where: { productId_branchId: { productId: product.id, branchId: branch.id } },
  });
  if (!bal1 || bal1.quantity !== startingQty - 2) throw new Error("TEST 1 FAILED: inventory not decremented");

  // 2) Duplicate idempotency key should fail (409)
  await resetIdempotency(business.id, basePayload.idempotencyKey);
  // First, create a fresh idempotency record by re-running same key
  res = await postSale(basePayload);
  if (res.status !== 201 || !res.json.ok) throw new Error("TEST 2 SETUP FAILED");
  res = await postSale(basePayload);
  if (res.status !== 409) throw new Error("TEST 2 FAILED: duplicate idempotency not rejected");

  // 3) Closed shift should fail
  const closedShift = await prisma.shift.create({
    data: {
      id: randomUUID(),
      businessId: business.id,
      branchId: branch.id,
      registerId: register.id,
      status: "CLOSED",
      openedAt: new Date(),
      closedAt: new Date(),
      openedBy: "system",
      closedBy: "system",
      startingCashCentavos: 0,
    },
  });
  res = await postSale({ ...basePayload, shiftId: closedShift.id, idempotencyKey: `test-${Date.now()}` });
  if (res.status !== 400) throw new Error("TEST 3 FAILED: closed shift not rejected");

  // 4) Insufficient payment should fail
  res = await postSale({ ...basePayload, payments: [{ method: "CASH", amountCentavos: 1 }], idempotencyKey: `test-${Date.now()}` });
  if (res.status !== 400) throw new Error("TEST 4 FAILED: insufficient payment not rejected");

  // 5) Insufficient stock should fail
  const bigQty = startingQty + 5;
  res = await postSale({
    ...basePayload,
    items: [{ productId: product.id, qty: bigQty, unitPriceCentavos: 15000, lineDiscountCentavos: 0 }],
    payments: [{ method: "CASH", amountCentavos: bigQty * 15000 + 5000 }],
    idempotencyKey: `test-${Date.now()}`,
  });
  if (res.status !== 400) throw new Error("TEST 5 FAILED: insufficient stock not rejected");

  console.log("ALL TESTS PASSED", { saleId1, finalBalance: bal1.quantity });
}

runTests().catch((e) => {
  console.error(e);
  process.exit(1);
});
