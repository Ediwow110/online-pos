-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "MembershipRole" AS ENUM ('OWNER', 'MANAGER', 'CASHIER', 'INVENTORY');

-- CreateEnum
CREATE TYPE "SaleStatus" AS ENUM ('DRAFT', 'PENDING_PAYMENT', 'PAID', 'COMPLETED', 'VOIDED', 'PAYMENT_FAILED', 'PAYMENT_UNKNOWN', 'REFUND_REQUESTED', 'PARTIALLY_REFUNDED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'CARD', 'GCASH', 'MAYA', 'BANK_TRANSFER', 'OTHER');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED', 'UNKNOWN', 'RECONCILED');

-- CreateEnum
CREATE TYPE "InventoryMovementType" AS ENUM ('OPENING', 'RECEIVE', 'SALE', 'RETURN', 'DAMAGE', 'ADJUSTMENT', 'TRANSFER', 'COUNT');

-- CreateEnum
CREATE TYPE "CashMovementType" AS ENUM ('OPENING_FLOAT', 'CASH_SALE', 'CASH_REFUND', 'EXPENSE', 'DEPOSIT', 'WITHDRAWAL', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "ShiftStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "TransferStatus" AS ENUM ('DRAFT', 'SHIPPED', 'RECEIVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELLED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "emailVerified" TIMESTAMP(3),
    "platformAdmin" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PasswordReset" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordReset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Business" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'PHP',
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Manila',
    "taxInclusive" BOOLEAN NOT NULL DEFAULT true,
    "taxRateBps" INTEGER NOT NULL DEFAULT 1200,
    "receiptHeader" TEXT,
    "receiptFooter" TEXT,
    "onboardingDone" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Business_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BusinessMembership" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "MembershipRole" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BusinessMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Branch" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Branch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Register" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Register_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Shift" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "registerId" TEXT NOT NULL,
    "openedById" TEXT NOT NULL,
    "closedById" TEXT,
    "status" "ShiftStatus" NOT NULL DEFAULT 'OPEN',
    "openingFloat" INTEGER NOT NULL,
    "countedCash" INTEGER,
    "expectedCash" INTEGER,
    "variance" INTEGER,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "note" TEXT,

    CONSTRAINT "Shift_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CashMovement" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "shiftId" TEXT NOT NULL,
    "type" "CashMovementType" NOT NULL,
    "amount" INTEGER NOT NULL,
    "reason" TEXT,
    "actorId" TEXT NOT NULL,
    "saleId" TEXT,
    "expenseId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CashMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "categoryId" TEXT,
    "name" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "barcode" TEXT,
    "brand" TEXT,
    "unit" TEXT NOT NULL DEFAULT 'pc',
    "cost" INTEGER NOT NULL DEFAULT 0,
    "price" INTEGER NOT NULL,
    "taxRateBps" INTEGER,
    "reorderLevel" INTEGER NOT NULL DEFAULT 0,
    "trackInventory" BOOLEAN NOT NULL DEFAULT true,
    "allowNegative" BOOLEAN NOT NULL DEFAULT false,
    "favorite" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "imageUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryBalance" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryBalance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryMovement" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "type" "InventoryMovementType" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "reason" TEXT,
    "actorId" TEXT NOT NULL,
    "saleItemId" TEXT,
    "refundItemId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockTransfer" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "fromBranchId" TEXT NOT NULL,
    "toBranchId" TEXT NOT NULL,
    "status" "TransferStatus" NOT NULL DEFAULT 'DRAFT',
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "receivedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "shippedAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3),

    CONSTRAINT "StockTransfer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockTransferItem" (
    "id" TEXT NOT NULL,
    "transferId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,

    CONSTRAINT "StockTransferItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sale" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "registerId" TEXT NOT NULL,
    "shiftId" TEXT,
    "cashierId" TEXT NOT NULL,
    "customerId" TEXT,
    "receiptNumber" TEXT NOT NULL,
    "status" "SaleStatus" NOT NULL DEFAULT 'DRAFT',
    "subtotal" INTEGER NOT NULL DEFAULT 0,
    "lineDiscount" INTEGER NOT NULL DEFAULT 0,
    "orderDiscount" INTEGER NOT NULL DEFAULT 0,
    "tax" INTEGER NOT NULL DEFAULT 0,
    "total" INTEGER NOT NULL DEFAULT 0,
    "paid" INTEGER NOT NULL DEFAULT 0,
    "changeDue" INTEGER NOT NULL DEFAULT 0,
    "taxInclusive" BOOLEAN NOT NULL DEFAULT true,
    "taxRateBps" INTEGER NOT NULL DEFAULT 1200,
    "note" TEXT,
    "held" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "Sale_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SaleItem" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "nameSnapshot" TEXT NOT NULL,
    "skuSnapshot" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPrice" INTEGER NOT NULL,
    "unitCost" INTEGER NOT NULL DEFAULT 0,
    "lineDiscount" INTEGER NOT NULL DEFAULT 0,
    "taxRateBps" INTEGER NOT NULL,
    "lineTotal" INTEGER NOT NULL,

    CONSTRAINT "SaleItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "amount" INTEGER NOT NULL,
    "providerRef" TEXT,
    "idempotencyKey" TEXT,
    "actorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Refund" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "total" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Refund_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefundItem" (
    "id" TEXT NOT NULL,
    "refundId" TEXT NOT NULL,
    "saleItemId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "amount" INTEGER NOT NULL,

    CONSTRAINT "RefundItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Expense" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "shiftId" TEXT,
    "actorId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "paymentMethod" "PaymentMethod" NOT NULL DEFAULT 'CASH',
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "businessId" TEXT,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "beforeSnapshot" JSONB,
    "afterSnapshot" JSONB,
    "reason" TEXT,
    "requestId" TEXT,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Setting" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "plan" TEXT NOT NULL DEFAULT 'STARTER',
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'TRIALING',
    "provider" TEXT,
    "providerReference" TEXT,
    "seatsLimit" INTEGER NOT NULL DEFAULT 3,
    "branchesLimit" INTEGER NOT NULL DEFAULT 1,
    "monthlyOrderLimit" INTEGER NOT NULL DEFAULT 1000,
    "currentPeriodEnd" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookEvent" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IdempotencyRecord" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "commandType" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "responseJson" JSONB NOT NULL,
    "resourceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IdempotencyRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordReset_tokenHash_key" ON "PasswordReset"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "Business_slug_key" ON "Business"("slug");

-- CreateIndex
CREATE INDEX "BusinessMembership_userId_idx" ON "BusinessMembership"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "BusinessMembership_businessId_userId_key" ON "BusinessMembership"("businessId", "userId");

-- CreateIndex
CREATE INDEX "Branch_businessId_idx" ON "Branch"("businessId");

-- CreateIndex
CREATE INDEX "Register_businessId_idx" ON "Register"("businessId");

-- CreateIndex
CREATE INDEX "Shift_businessId_status_idx" ON "Shift"("businessId", "status");

-- CreateIndex
CREATE INDEX "Shift_registerId_status_idx" ON "Shift"("registerId", "status");

-- CreateIndex
CREATE INDEX "CashMovement_businessId_createdAt_idx" ON "CashMovement"("businessId", "createdAt");

-- CreateIndex
CREATE INDEX "CashMovement_shiftId_idx" ON "CashMovement"("shiftId");

-- CreateIndex
CREATE UNIQUE INDEX "Category_businessId_name_key" ON "Category"("businessId", "name");

-- CreateIndex
CREATE INDEX "Product_businessId_name_idx" ON "Product"("businessId", "name");

-- CreateIndex
CREATE INDEX "Product_businessId_active_idx" ON "Product"("businessId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "Product_businessId_sku_key" ON "Product"("businessId", "sku");

-- CreateIndex
CREATE UNIQUE INDEX "Product_businessId_barcode_key" ON "Product"("businessId", "barcode");

-- CreateIndex
CREATE INDEX "InventoryBalance_businessId_idx" ON "InventoryBalance"("businessId");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryBalance_productId_branchId_key" ON "InventoryBalance"("productId", "branchId");

-- CreateIndex
CREATE INDEX "InventoryMovement_businessId_createdAt_idx" ON "InventoryMovement"("businessId", "createdAt");

-- CreateIndex
CREATE INDEX "InventoryMovement_productId_createdAt_idx" ON "InventoryMovement"("productId", "createdAt");

-- CreateIndex
CREATE INDEX "StockTransfer_businessId_createdAt_idx" ON "StockTransfer"("businessId", "createdAt");

-- CreateIndex
CREATE INDEX "StockTransfer_fromBranchId_status_idx" ON "StockTransfer"("fromBranchId", "status");

-- CreateIndex
CREATE INDEX "StockTransfer_toBranchId_status_idx" ON "StockTransfer"("toBranchId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "StockTransferItem_transferId_productId_key" ON "StockTransferItem"("transferId", "productId");

-- CreateIndex
CREATE INDEX "Customer_businessId_name_idx" ON "Customer"("businessId", "name");

-- CreateIndex
CREATE INDEX "Sale_businessId_createdAt_idx" ON "Sale"("businessId", "createdAt");

-- CreateIndex
CREATE INDEX "Sale_businessId_status_idx" ON "Sale"("businessId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Sale_businessId_receiptNumber_key" ON "Sale"("businessId", "receiptNumber");

-- CreateIndex
CREATE INDEX "SaleItem_saleId_idx" ON "SaleItem"("saleId");

-- CreateIndex
CREATE INDEX "Payment_saleId_idx" ON "Payment"("saleId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_businessId_providerRef_key" ON "Payment"("businessId", "providerRef");

-- CreateIndex
CREATE INDEX "Refund_businessId_createdAt_idx" ON "Refund"("businessId", "createdAt");

-- CreateIndex
CREATE INDEX "Expense_businessId_occurredAt_idx" ON "Expense"("businessId", "occurredAt");

-- CreateIndex
CREATE INDEX "AuditLog_businessId_createdAt_idx" ON "AuditLog"("businessId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "Setting_businessId_key_key" ON "Setting"("businessId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_businessId_key" ON "Subscription"("businessId");

-- CreateIndex
CREATE INDEX "Subscription_status_idx" ON "Subscription"("status");

-- CreateIndex
CREATE INDEX "WebhookEvent_businessId_receivedAt_idx" ON "WebhookEvent"("businessId", "receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "WebhookEvent_businessId_provider_eventId_key" ON "WebhookEvent"("businessId", "provider", "eventId");

-- CreateIndex
CREATE UNIQUE INDEX "IdempotencyRecord_businessId_key_commandType_key" ON "IdempotencyRecord"("businessId", "key", "commandType");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PasswordReset" ADD CONSTRAINT "PasswordReset_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessMembership" ADD CONSTRAINT "BusinessMembership_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessMembership" ADD CONSTRAINT "BusinessMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Branch" ADD CONSTRAINT "Branch_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Register" ADD CONSTRAINT "Register_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Register" ADD CONSTRAINT "Register_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shift" ADD CONSTRAINT "Shift_registerId_fkey" FOREIGN KEY ("registerId") REFERENCES "Register"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashMovement" ADD CONSTRAINT "CashMovement_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "Shift"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryBalance" ADD CONSTRAINT "InventoryBalance_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryBalance" ADD CONSTRAINT "InventoryBalance_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryBalance" ADD CONSTRAINT "InventoryBalance_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTransfer" ADD CONSTRAINT "StockTransfer_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTransfer" ADD CONSTRAINT "StockTransfer_fromBranchId_fkey" FOREIGN KEY ("fromBranchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTransfer" ADD CONSTRAINT "StockTransfer_toBranchId_fkey" FOREIGN KEY ("toBranchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTransferItem" ADD CONSTRAINT "StockTransferItem_transferId_fkey" FOREIGN KEY ("transferId") REFERENCES "StockTransfer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTransferItem" ADD CONSTRAINT "StockTransferItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_registerId_fkey" FOREIGN KEY ("registerId") REFERENCES "Register"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "Shift"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleItem" ADD CONSTRAINT "SaleItem_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleItem" ADD CONSTRAINT "SaleItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefundItem" ADD CONSTRAINT "RefundItem_refundId_fkey" FOREIGN KEY ("refundId") REFERENCES "Refund"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "Shift"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Setting" ADD CONSTRAINT "Setting_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookEvent" ADD CONSTRAINT "WebhookEvent_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IdempotencyRecord" ADD CONSTRAINT "IdempotencyRecord_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

