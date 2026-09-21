import { PrismaClient, MembershipRole, InventoryMovementType, CashMovementType } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash("ChangeMe123!", 12);

  const owner = await prisma.user.upsert({
    where: { email: "owner@valdez.store" },
    update: {},
    create: { email: "owner@valdez.store", name: "Janella Valdez", passwordHash },
  });
  const manager = await prisma.user.upsert({
    where: { email: "manager@valdez.store" },
    update: {},
    create: { email: "manager@valdez.store", name: "Rico Manager", passwordHash },
  });
  const cashier = await prisma.user.upsert({
    where: { email: "cashier@valdez.store" },
    update: {},
    create: { email: "cashier@valdez.store", name: "Ana Cashier", passwordHash },
  });
  const stock = await prisma.user.upsert({
    where: { email: "stock@valdez.store" },
    update: {},
    create: { email: "stock@valdez.store", name: "Ben Stock", passwordHash },
  });

  const business = await prisma.business.upsert({
    where: { slug: "valdez-sari-sari" },
    update: {},
    create: {
      name: "Valdez Sari-Sari",
      slug: "valdez-sari-sari",
      currency: "PHP",
      timezone: "Asia/Manila",
      taxInclusive: true,
      taxRateBps: 1200,
      receiptHeader: "Valdez Sari-Sari",
      receiptFooter: "Salamat! This is not an official BIR invoice.",
      onboardingDone: true,
    },
  });

  const roles: Array<{ userId: string; role: MembershipRole }> = [
    { userId: owner.id, role: "OWNER" },
    { userId: manager.id, role: "MANAGER" },
    { userId: cashier.id, role: "CASHIER" },
    { userId: stock.id, role: "INVENTORY" },
  ];
  for (const row of roles) {
    await prisma.businessMembership.upsert({
      where: { businessId_userId: { businessId: business.id, userId: row.userId } },
      update: { role: row.role, active: true },
      create: { businessId: business.id, userId: row.userId, role: row.role },
    });
  }

  const branch = await prisma.branch.upsert({
    where: { id: "seed-branch-default" },
    update: {},
    create: { id: "seed-branch-default", businessId: business.id, name: "Main", isDefault: true },
  });

  const register = await prisma.register.upsert({
    where: { id: "seed-register-1" },
    update: {},
    create: { id: "seed-register-1", businessId: business.id, branchId: branch.id, name: "Front counter" },
  });

  const categories = [
    { id: "cat-staples", name: "Staples", sortOrder: 1 },
    { id: "cat-drinks", name: "Drinks", sortOrder: 2 },
    { id: "cat-snacks", name: "Snacks", sortOrder: 3 },
    { id: "cat-household", name: "Household", sortOrder: 4 },
  ];
  for (const c of categories) {
    await prisma.category.upsert({
      where: { businessId_name: { businessId: business.id, name: c.name } },
      update: {},
      create: { id: c.id, businessId: business.id, name: c.name, sortOrder: c.sortOrder },
    });
  }

  const products = [
    { sku: "RICE-1KG", barcode: "4800000000011", name: "Rice 1kg", categoryId: "cat-staples", cost: 4200, price: 5200, reorder: 10, qty: 40, favorite: true },
    { sku: "EGG-1", barcode: "4800000000028", name: "Egg", categoryId: "cat-staples", cost: 800, price: 1000, reorder: 30, qty: 120, favorite: true },
    { sku: "COKE-355", barcode: "4800000000035", name: "Coke 355ml", categoryId: "cat-drinks", cost: 1800, price: 2500, reorder: 12, qty: 36, favorite: true },
    { sku: "COFFEE-3IN1", barcode: "4800000000042", name: "Coffee 3-in-1", categoryId: "cat-drinks", cost: 700, price: 1200, reorder: 20, qty: 48, favorite: true },
    { sku: "NOODLES", barcode: "4800000000059", name: "Instant noodles", categoryId: "cat-snacks", cost: 900, price: 1500, reorder: 20, qty: 60, favorite: true },
    { sku: "BREAD", barcode: "4800000000066", name: "Pandesa", categoryId: "cat-snacks", cost: 300, price: 500, reorder: 20, qty: 40, favorite: false },
    { sku: "SOAP", barcode: "4800000000073", name: "Bath soap", categoryId: "cat-household", cost: 2200, price: 3500, reorder: 8, qty: 18, favorite: false },
    { sku: "LOAD-50", barcode: null, name: "E-load 50", categoryId: "cat-household", cost: 5000, price: 5000, reorder: 0, qty: 0, favorite: true, track: false },
  ];

  for (const p of products) {
    const product = await prisma.product.upsert({
      where: { businessId_sku: { businessId: business.id, sku: p.sku } },
      update: {},
      create: {
        businessId: business.id,
        categoryId: p.categoryId,
        name: p.name,
        sku: p.sku,
        barcode: p.barcode,
        cost: p.cost,
        price: p.price,
        reorderLevel: p.reorder,
        favorite: p.favorite,
        trackInventory: p.track ?? true,
        unit: "pc",
      },
    });
    if (p.track === false) continue;
    await prisma.inventoryBalance.upsert({
      where: { productId_branchId: { productId: product.id, branchId: branch.id } },
      update: { quantity: p.qty },
      create: { businessId: business.id, productId: product.id, branchId: branch.id, quantity: p.qty },
    });
    const existingMove = await prisma.inventoryMovement.findFirst({
      where: { productId: product.id, type: InventoryMovementType.OPENING },
    });
    if (!existingMove) {
      await prisma.inventoryMovement.create({
        data: {
          businessId: business.id,
          productId: product.id,
          branchId: branch.id,
          type: InventoryMovementType.OPENING,
          quantity: p.qty,
          reason: "Opening stock",
          actorId: owner.id,
        },
      });
    }
  }

  const openShift = await prisma.shift.findFirst({
    where: { registerId: register.id, status: "OPEN" },
  });
  if (!openShift) {
    const shift = await prisma.shift.create({
      data: {
        businessId: business.id,
        registerId: register.id,
        openedById: cashier.id,
        openingFloat: 200000,
        status: "OPEN",
      },
    });
    await prisma.cashMovement.create({
      data: {
        businessId: business.id,
        shiftId: shift.id,
        type: CashMovementType.OPENING_FLOAT,
        amount: 200000,
        actorId: cashier.id,
        reason: "Opening float",
      },
    });
  }

  console.log("Seeded Valdez Sari-Sari. Login owner@valdez.store / ChangeMe123!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
