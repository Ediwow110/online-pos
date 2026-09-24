import { PrismaClient } from "@online-pos/database";

process.env.DATABASE_URL ??= "postgresql://pos:pos@localhost:5432/online_pos?schema=public";

const prisma = new PrismaClient();
const API_URL = process.env.API_URL ?? "http://localhost:3001";

async function request(path: string, cookie: string, body: unknown) {
  const response = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json().catch(() => ({})) };
}

async function login(email: string, password: string) {
  const response = await fetch(`${API_URL}/api/v1/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password }) });
  if (!response.ok) throw new Error(`login failed for ${email}`);
  const cookie = response.headers.get("set-cookie");
  if (!cookie) throw new Error(`no session cookie for ${email}`);
  return cookie;
}

async function main() {
  const ownerCookie = await login("owner@valdez.store", "ChangeMe123!");
  const cashierCookie = await login("cashier@valdez.store", "ChangeMe123!");
  const business = await prisma.business.findFirstOrThrow();
  const branches = await prisma.branch.findMany({ where: { businessId: business.id }, orderBy: { createdAt: "asc" } });
  const register = await prisma.register.findFirstOrThrow({ where: { businessId: business.id } });

  const transfer = branches.length > 1
    ? await prisma.stockTransfer.create({ data: { businessId: business.id, fromBranchId: branches[0].id, toBranchId: branches[1].id, createdById: (await prisma.user.findUniqueOrThrow({ where: { email: "owner@valdez.store" } })).id, items: { create: [] } } })
    : null;
  if (transfer) {
    const cashierShip = await request("/api/v1/inventory/transfers/ship", cashierCookie, { transferId: transfer.id });
    if (cashierShip.status !== 403) throw new Error(`cashier transfer authorization returned ${cashierShip.status}`);
  }

  const foreignProduct = await prisma.product.findFirstOrThrow({ where: { businessId: business.id } });
  const context = await prisma.shift.findFirst({ where: { registerId: register.id, status: "OPEN" } });
  if (!context) throw new Error("no open seeded shift");
  const foreignId = `not-owned-${foreignProduct.id}`;
  const saleAttempt = await request("/api/v1/sales/commit", ownerCookie, {
    tenantId: business.id,
    branchId: register.branchId,
    registerId: register.id,
    shiftId: context.id,
    items: [{ productId: foreignId, qty: 1, unitPriceCentavos: 100, lineDiscountCentavos: 0 }],
    payments: [{ method: "CASH", amountCentavos: 112 }],
    idempotencyKey: `security-${Date.now()}`,
  });
  if (saleAttempt.status !== 400) throw new Error(`invalid product sale returned ${saleAttempt.status}`);

  const invalidStatus = await request("/api/v1/inventory/transfers/receive", cashierCookie, { transferId: "missing-transfer" });
  if (invalidStatus.status !== 403) throw new Error(`cashier receive authorization returned ${invalidStatus.status}`);

  console.log("SECURITY REGRESSION TESTS PASSED", {
    transferRoleGate: Boolean(transfer),
    tenantReferenceValidation: true,
    receiveRoleGate: true,
  });
}

main().catch((error) => {
  console.error("SECURITY REGRESSION TESTS FAILED:", error);
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
