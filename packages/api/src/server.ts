import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { createHmac, timingSafeEqual } from "node:crypto";
import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import { prisma } from "@online-pos/database";
import { CashMovementType } from "@online-pos/database";
import bcrypt from "bcryptjs";
import { commitSaleHandler } from "./routes/sales.js";
import { authenticateRequest, clearSessionCookie, createSession, hashToken, readCookie, sessionCookie } from "./auth.js";

dotenv.config({ path: fileURLToPath(new URL("../../../.env", import.meta.url)) });

const PORT = Number(process.env.PORT ?? 3001);
const registrationAttempts = new Map<string, { count: number; resetAt: number }>();

function providerSignature(payload: string) {
  const secret = process.env.PAYMENT_WEBHOOK_SECRET;
  return secret ? createHmac("sha256", secret).update(payload).digest("hex") : null;
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk);
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString());
    return value && typeof value === "object" ? value as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

async function currentMembership(req: IncomingMessage) {
  const session = await authenticateRequest(req);
  const membership = session?.user.memberships[0];
  return session && membership ? { session, membership } : null;
}

function json(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(body));
}

function requestId(req: IncomingMessage) {
  const value = req.headers["x-request-id"];
  return typeof value === "string" ? value : "unknown";
}

async function audit(req: IncomingMessage, data: { businessId: string; actorId: string; action: string; entityType: string; entityId?: string; reason?: string }) {
  await prisma.auditLog.create({ data: { ...data, requestId: requestId(req), ip: req.socket.remoteAddress } });
}

const routes: Record<string, (req: IncomingMessage, res: ServerResponse) => Promise<void>> = {
  "POST /api/v1/auth/register": async (req, res) => {
    const ip = req.socket.remoteAddress ?? "unknown";
    const now = Date.now();
    const attempt = registrationAttempts.get(ip);
    if (attempt && attempt.resetAt > now && attempt.count >= 5) return json(res, 429, { error: "REGISTRATION_RATE_LIMITED" });
    if (!attempt || attempt.resetAt <= now) registrationAttempts.set(ip, { count: 1, resetAt: now + 15 * 60 * 1000 });
    else attempt.count += 1;
    const body = await readJson(req);
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";
    const businessName = typeof body.businessName === "string" ? body.businessName.trim() : "";
    if (!name || name.length > 120 || !email.includes("@") || email.length > 200 || password.length < 10 || password.length > 200 || !businessName || businessName.length > 160) {
      return json(res, 400, { error: "INVALID_REGISTRATION" });
    }
    const slugBase = businessName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50) || "store";
    const slug = `${slugBase}-${Math.random().toString(36).slice(2, 8)}`;
    try {
      const passwordHash = await bcrypt.hash(password, 12);
      const created = await prisma.$transaction(async (tx) => {
        const user = await tx.user.create({ data: { email, name, passwordHash } });
        const business = await tx.business.create({ data: { name: businessName, slug, onboardingDone: true } });
        await tx.businessMembership.create({ data: { businessId: business.id, userId: user.id, role: "OWNER" } });
        const branch = await tx.branch.create({ data: { businessId: business.id, name: "Main", isDefault: true } });
        const register = await tx.register.create({ data: { businessId: business.id, branchId: branch.id, name: "Front counter" } });
        return { user, business, branch, register };
      });
      const session = await createSession(created.user.id, req);
      res.setHeader("set-cookie", sessionCookie(session.token, session.expiresAt));
      return json(res, 201, { user: { id: created.user.id, name: created.user.name, email: created.user.email }, business: { id: created.business.id, name: created.business.name } });
    } catch (error) {
      if (error instanceof Error && error.message.includes("Unique constraint")) return json(res, 409, { error: "EMAIL_ALREADY_REGISTERED" });
      throw error;
    }
  },
  "POST /api/v1/auth/login": async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk);
    let body: { email?: string; password?: string } = {};
    try { body = JSON.parse(Buffer.concat(chunks).toString()); } catch { /* validation below returns the same safe error */ }
    const email = body.email?.trim().toLowerCase();
    const user = email ? await prisma.user.findUnique({ where: { email } }) : null;
    if (!user || !body.password || !(await bcrypt.compare(body.password, user.passwordHash))) {
      res.statusCode = 401;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ error: "INVALID_CREDENTIALS" }));
      return;
    }
    const session = await createSession(user.id, req);
    res.statusCode = 200;
    res.setHeader("set-cookie", sessionCookie(session.token, session.expiresAt));
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ user: { id: user.id, email: user.email, name: user.name } }));
  },
  "GET /api/v1/auth/me": async (req, res) => {
    const session = await authenticateRequest(req);
    res.statusCode = session ? 200 : 401;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(session ? {
      user: { id: session.user.id, email: session.user.email, name: session.user.name },
      memberships: session.user.memberships.map((membership) => ({ businessId: membership.businessId, role: membership.role, businessName: membership.business.name })),
    } : { error: "UNAUTHENTICATED" }));
  },
  "GET /api/v1/operations/context": async (req, res) => {
    const session = await authenticateRequest(req);
    if (!session || session.user.memberships.length === 0) {
      res.statusCode = 401;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ error: "UNAUTHENTICATED" }));
      return;
    }
    const membership = session.user.memberships[0];
    const branch = await prisma.branch.findFirst({
      where: { businessId: membership.businessId },
      orderBy: { isDefault: "desc" },
      include: { registers: { where: { active: true }, orderBy: { createdAt: "asc" } } },
    });
    const register = branch?.registers[0];
    const shift = register
      ? await prisma.shift.findFirst({ where: { registerId: register.id, status: "OPEN" }, orderBy: { openedAt: "desc" } })
      : null;
    res.statusCode = 200;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({
      user: { id: session.user.id, name: session.user.name, email: session.user.email },
      business: { id: membership.businessId, name: membership.business.name, role: membership.role },
      branch: branch ? { id: branch.id, name: branch.name } : null,
      register: register ? { id: register.id, name: register.name } : null,
      shift: shift ? { id: shift.id, status: shift.status } : null,
    }));
  },
  "POST /api/v1/shifts/open": async (req, res) => {
    const current = await currentMembership(req);
    const body = await readJson(req);
    const registerId = typeof body.registerId === "string" ? body.registerId : "";
    const openingFloat = body.openingFloat;
    if (!current) return json(res, 401, { error: "UNAUTHENTICATED" });
    if (!Number.isInteger(openingFloat) || Number(openingFloat) < 0 || !registerId) return json(res, 400, { error: "INVALID_OPENING_SHIFT" });
    const register = await prisma.register.findFirst({ where: { id: registerId, businessId: current.membership.businessId, active: true } });
    if (!register) return json(res, 404, { error: "REGISTER_NOT_FOUND" });
    const existing = await prisma.shift.findFirst({ where: { registerId, status: "OPEN" } });
    if (existing) return json(res, 409, { error: "SHIFT_ALREADY_OPEN", shiftId: existing.id });
    const shift = await prisma.$transaction(async (tx) => {
      const created = await tx.shift.create({
        data: { businessId: register.businessId, registerId, openedById: current.session.userId, openingFloat: Number(openingFloat) },
      });
      await tx.cashMovement.create({
        data: { businessId: register.businessId, shiftId: created.id, type: CashMovementType.OPENING_FLOAT, amount: Number(openingFloat), actorId: current.session.userId, reason: "Opening float" },
      });
      return created;
    });
    await audit(req, { businessId: register.businessId, actorId: current.session.userId, action: "SHIFT_OPENED", entityType: "Shift", entityId: shift.id });
    return json(res, 201, { id: shift.id, status: shift.status, openingFloat: shift.openingFloat });
  },
  "POST /api/v1/shifts/cash-movements": async (req, res) => {
    const current = await currentMembership(req);
    const body = await readJson(req);
    const shiftId = typeof body.shiftId === "string" ? body.shiftId : "";
    const type = typeof body.type === "string" ? body.type : "";
    const amount = body.amount;
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    const allowed = new Set(["DEPOSIT", "WITHDRAWAL", "ADJUSTMENT"]);
    if (!current) return json(res, 401, { error: "UNAUTHENTICATED" });
    if (!allowed.has(type) || !Number.isInteger(amount) || Number(amount) <= 0 || !shiftId || !reason) return json(res, 400, { error: "INVALID_CASH_MOVEMENT" });
    const shift = await prisma.shift.findFirst({ where: { id: shiftId, businessId: current.membership.businessId, status: "OPEN" } });
    if (!shift) return json(res, 404, { error: "OPEN_SHIFT_NOT_FOUND" });
    const movement = await prisma.cashMovement.create({
      data: { businessId: shift.businessId, shiftId, type: type as CashMovementType, amount: Number(amount), reason, actorId: current.session.userId },
    });
    await audit(req, { businessId: shift.businessId, actorId: current.session.userId, action: "CASH_MOVEMENT_CREATED", entityType: "CashMovement", entityId: movement.id, reason });
    return json(res, 201, movement);
  },
  "POST /api/v1/shifts/close": async (req, res) => {
    const current = await currentMembership(req);
    const body = await readJson(req);
    const shiftId = typeof body.shiftId === "string" ? body.shiftId : "";
    const countedCash = body.countedCash;
    if (!current) return json(res, 401, { error: "UNAUTHENTICATED" });
    if (!shiftId || !Number.isInteger(countedCash) || Number(countedCash) < 0) return json(res, 400, { error: "INVALID_SHIFT_CLOSE" });
    const shift = await prisma.shift.findFirst({ where: { id: shiftId, businessId: current.membership.businessId, status: "OPEN" }, include: { sales: { include: { payments: true } }, cashMoves: true } });
    if (!shift) return json(res, 404, { error: "OPEN_SHIFT_NOT_FOUND" });
    const expectedCash = shift.cashMoves.reduce((total, movement) => {
      if (movement.type === "WITHDRAWAL" || movement.type === "EXPENSE" || movement.type === "CASH_REFUND") return total - movement.amount;
      return total + movement.amount;
    }, 0);
    const variance = Number(countedCash) - expectedCash;
    const closed = await prisma.shift.update({
      where: { id: shift.id },
      data: { status: "CLOSED", closedById: current.session.userId, countedCash: Number(countedCash), expectedCash, variance, closedAt: new Date() },
    });
    await audit(req, { businessId: shift.businessId, actorId: current.session.userId, action: "SHIFT_CLOSED", entityType: "Shift", entityId: shift.id });
    return json(res, 200, { id: closed.id, status: closed.status, expectedCash, countedCash: closed.countedCash, variance });
  },
  "POST /api/v1/payments/provider/webhook": async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk);
    const raw = Buffer.concat(chunks).toString();
    const configured = providerSignature(raw);
    const supplied = typeof req.headers["x-provider-signature"] === "string" ? req.headers["x-provider-signature"] : "";
    if (!configured || supplied.length !== configured.length || !timingSafeEqual(Buffer.from(supplied), Buffer.from(configured))) return json(res, 401, { error: "INVALID_PROVIDER_SIGNATURE" });
    let body: { businessId?: string; providerRef?: string; status?: string; saleId?: string; eventId?: string; eventType?: string };
    try { body = JSON.parse(raw) as typeof body; } catch { return json(res, 400, { error: "INVALID_WEBHOOK" }); }
    if (!body.businessId || !body.providerRef || !body.eventId || !body.eventType || !["COMPLETED", "FAILED", "UNKNOWN"].includes(body.status ?? "")) return json(res, 400, { error: "INVALID_WEBHOOK" });
    const duplicate = await prisma.webhookEvent.findUnique({ where: { businessId_provider_eventId: { businessId: body.businessId, provider: "sandbox", eventId: body.eventId } } });
    if (duplicate) return json(res, 200, { ok: true, duplicate: true });
    const payment = await prisma.payment.findFirst({ where: { businessId: body.businessId, providerRef: body.providerRef } });
    if (!payment) return json(res, 404, { error: "PAYMENT_NOT_FOUND" });
    const next = body.status as "COMPLETED" | "FAILED" | "UNKNOWN";
    await prisma.$transaction(async (tx) => {
      await tx.payment.update({ where: { id: payment.id }, data: { status: next } });
      await tx.sale.update({ where: { id: payment.saleId }, data: { status: next === "COMPLETED" ? "COMPLETED" : next === "FAILED" ? "PAYMENT_FAILED" : "PAYMENT_UNKNOWN" } });
      await tx.webhookEvent.create({ data: { businessId: payment.businessId, provider: "sandbox", eventId: body.eventId!, eventType: body.eventType! } });
      await tx.auditLog.create({ data: { businessId: payment.businessId, action: "PAYMENT_PROVIDER_WEBHOOK", entityType: "Payment", entityId: payment.id, reason: next } });
    });
    return json(res, 200, { ok: true, paymentId: payment.id, status: next });
  },
  "POST /api/v1/payments/provider/sandbox-intent": async (req, res) => {
    const current = await currentMembership(req);
    const body = await readJson(req);
    if (!current) return json(res, 401, { error: "UNAUTHENTICATED" });
    const saleId = typeof body.saleId === "string" ? body.saleId : "";
    const sale = await prisma.sale.findFirst({ where: { id: saleId, businessId: current.membership.businessId }, include: { payments: true } });
    if (!sale) return json(res, 404, { error: "SALE_NOT_FOUND" });
    const providerRef = `sandbox_${randomUUID()}`;
    const payment = await prisma.payment.create({ data: { businessId: sale.businessId, saleId: sale.id, method: "CARD", amount: sale.total, status: "PENDING", providerRef, actorId: current.session.userId } });
    await audit(req, { businessId: sale.businessId, actorId: current.session.userId, action: "PAYMENT_PROVIDER_INTENT_CREATED", entityType: "Payment", entityId: payment.id, reason: "sandbox" });
    return json(res, 201, { paymentId: payment.id, provider: "sandbox", providerRef, status: payment.status });
  },
  "GET /api/v1/branches": async (req, res) => {
    const current = await currentMembership(req);
    if (!current) return json(res, 401, { error: "UNAUTHENTICATED" });
    const branches = await prisma.branch.findMany({ where: { businessId: current.membership.businessId }, include: { registers: { where: { active: true }, select: { id: true, name: true } } }, orderBy: { createdAt: "asc" } });
    return json(res, 200, branches);
  },
  "POST /api/v1/branches": async (req, res) => {
    const current = await currentMembership(req);
    const body = await readJson(req);
    if (!current) return json(res, 401, { error: "UNAUTHENTICATED" });
    if (current.membership.role !== "OWNER") return json(res, 403, { error: "FORBIDDEN" });
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name || name.length > 120) return json(res, 400, { error: "INVALID_BRANCH" });
    const subscription = await prisma.subscription.upsert({ where: { businessId: current.membership.businessId }, create: { businessId: current.membership.businessId }, update: {} });
    const branchCount = await prisma.branch.count({ where: { businessId: current.membership.businessId } });
    if (branchCount >= subscription.branchesLimit) return json(res, 409, { error: "BRANCH_LIMIT_REACHED", limit: subscription.branchesLimit });
    const branch = await prisma.branch.create({ data: { businessId: current.membership.businessId, name, isDefault: false } });
    await audit(req, { businessId: branch.businessId, actorId: current.session.userId, action: "BRANCH_CREATED", entityType: "Branch", entityId: branch.id });
    return json(res, 201, branch);
  },
  "POST /api/v1/branches/registers": async (req, res) => {
    const current = await currentMembership(req);
    const body = await readJson(req);
    if (!current) return json(res, 401, { error: "UNAUTHENTICATED" });
    if (current.membership.role !== "OWNER") return json(res, 403, { error: "FORBIDDEN" });
    const branchId = typeof body.branchId === "string" ? body.branchId : "";
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!branchId || !name || name.length > 120) return json(res, 400, { error: "INVALID_REGISTER" });
    const branch = await prisma.branch.findFirst({ where: { id: branchId, businessId: current.membership.businessId } });
    if (!branch) return json(res, 404, { error: "BRANCH_NOT_FOUND" });
    const register = await prisma.register.create({ data: { businessId: branch.businessId, branchId, name } });
    await audit(req, { businessId: branch.businessId, actorId: current.session.userId, action: "REGISTER_CREATED", entityType: "Register", entityId: register.id });
    return json(res, 201, register);
  },
  "GET /api/v1/inventory/transfers": async (req, res) => {
    const current = await currentMembership(req);
    if (!current) return json(res, 401, { error: "UNAUTHENTICATED" });
    const transfers = await prisma.stockTransfer.findMany({ where: { businessId: current.membership.businessId }, include: { fromBranch: true, toBranch: true, items: true }, orderBy: { createdAt: "desc" }, take: 100 });
    return json(res, 200, transfers.map((transfer) => ({ ...transfer, fromBranch: transfer.fromBranch.name, toBranch: transfer.toBranch.name })));
  },
  "POST /api/v1/inventory/transfers": async (req, res) => {
    const current = await currentMembership(req);
    const body = await readJson(req);
    if (!current) return json(res, 401, { error: "UNAUTHENTICATED" });
    if (!["OWNER", "MANAGER", "INVENTORY"].includes(current.membership.role)) return json(res, 403, { error: "FORBIDDEN" });
    const fromBranchId = typeof body.fromBranchId === "string" ? body.fromBranchId : "";
    const toBranchId = typeof body.toBranchId === "string" ? body.toBranchId : "";
    const items = Array.isArray(body.items) ? body.items : [];
    if (!fromBranchId || !toBranchId || fromBranchId === toBranchId || !items.length) return json(res, 400, { error: "INVALID_TRANSFER" });
    const branchCount = await prisma.branch.count({ where: { businessId: current.membership.businessId, id: { in: [fromBranchId, toBranchId] } } });
    if (branchCount !== 2) return json(res, 404, { error: "BRANCH_NOT_FOUND" });
    const normalized = items.map((item) => ({ productId: typeof item.productId === "string" ? item.productId : "", quantity: Number(item.quantity) }));
    if (normalized.some((item) => !item.productId || !Number.isInteger(item.quantity) || item.quantity <= 0)) return json(res, 400, { error: "INVALID_TRANSFER_ITEMS" });
    const transfer = await prisma.stockTransfer.create({ data: { businessId: current.membership.businessId, fromBranchId, toBranchId, createdById: current.session.userId, items: { create: normalized } }, include: { items: true } });
    await audit(req, { businessId: transfer.businessId, actorId: current.session.userId, action: "STOCK_TRANSFER_CREATED", entityType: "StockTransfer", entityId: transfer.id });
    return json(res, 201, transfer);
  },
  "POST /api/v1/inventory/transfers/ship": async (req, res) => {
    const current = await currentMembership(req);
    const body = await readJson(req);
    if (!current) return json(res, 401, { error: "UNAUTHENTICATED" });
    if (!["OWNER", "MANAGER", "INVENTORY"].includes(current.membership.role)) return json(res, 403, { error: "FORBIDDEN" });
    const transferId = typeof body.transferId === "string" ? body.transferId : "";
    try {
      await prisma.$transaction(async (tx) => {
        const claimed = await tx.stockTransfer.updateMany({ where: { id: transferId, businessId: current.membership.businessId, status: "DRAFT" }, data: { status: "SHIPPED", shippedAt: new Date() } });
        if (claimed.count !== 1) throw new Error("TRANSFER_NOT_FOUND");
        const transfer = await tx.stockTransfer.findUniqueOrThrow({ where: { id: transferId }, include: { items: true } });
        for (const item of transfer.items) {
          const balance = await tx.inventoryBalance.findUnique({ where: { productId_branchId: { productId: item.productId, branchId: transfer.fromBranchId } } });
          if (!balance || balance.quantity < item.quantity) throw new Error("INSUFFICIENT_STOCK");
          await tx.inventoryBalance.update({ where: { id: balance.id }, data: { quantity: { decrement: item.quantity }, version: { increment: 1 } } });
          await tx.inventoryMovement.create({ data: { businessId: transfer.businessId, branchId: transfer.fromBranchId, productId: item.productId, type: "TRANSFER", quantity: -item.quantity, actorId: current.session.userId, reason: `Transfer ${transfer.id}` } });
        }
      });
    } catch (error) { return json(res, error instanceof Error && ["INSUFFICIENT_STOCK", "TRANSFER_NOT_FOUND"].includes(error.message) ? 400 : 500, { error: error instanceof Error ? error.message : "TRANSFER_FAILED" }); }
    return json(res, 200, { ok: true, transferId, status: "SHIPPED" });
  },
  "POST /api/v1/inventory/transfers/receive": async (req, res) => {
    const current = await currentMembership(req);
    const body = await readJson(req);
    if (!current) return json(res, 401, { error: "UNAUTHENTICATED" });
    if (!["OWNER", "MANAGER", "INVENTORY"].includes(current.membership.role)) return json(res, 403, { error: "FORBIDDEN" });
    const transferId = typeof body.transferId === "string" ? body.transferId : "";
    try {
      await prisma.$transaction(async (tx) => {
      const claimed = await tx.stockTransfer.updateMany({ where: { id: transferId, businessId: current.membership.businessId, status: "SHIPPED" }, data: { status: "RECEIVED", receivedAt: new Date(), receivedById: current.session.userId } });
      if (claimed.count !== 1) throw new Error("TRANSFER_NOT_FOUND");
      const transfer = await tx.stockTransfer.findUniqueOrThrow({ where: { id: transferId }, include: { items: true } });
      for (const item of transfer.items) {
        await tx.inventoryBalance.upsert({ where: { productId_branchId: { productId: item.productId, branchId: transfer.toBranchId } }, create: { businessId: transfer.businessId, productId: item.productId, branchId: transfer.toBranchId, quantity: item.quantity }, update: { quantity: { increment: item.quantity }, version: { increment: 1 } } });
        await tx.inventoryMovement.create({ data: { businessId: transfer.businessId, branchId: transfer.toBranchId, productId: item.productId, type: "TRANSFER", quantity: item.quantity, actorId: current.session.userId, reason: `Transfer ${transfer.id}` } });
      }
      });
    } catch (error) { return json(res, error instanceof Error && error.message === "TRANSFER_NOT_FOUND" ? 400 : 500, { error: error instanceof Error ? error.message : "TRANSFER_FAILED" }); }
    return json(res, 200, { ok: true, transferId, status: "RECEIVED" });
  },
  "POST /api/v1/inventory/transfers/cancel": async (req, res) => {
    const current = await currentMembership(req);
    const body = await readJson(req);
    if (!current) return json(res, 401, { error: "UNAUTHENTICATED" });
    if (!["OWNER", "MANAGER", "INVENTORY"].includes(current.membership.role)) return json(res, 403, { error: "FORBIDDEN" });
    const transfer = await prisma.stockTransfer.findFirst({ where: { id: typeof body.transferId === "string" ? body.transferId : "", businessId: current.membership.businessId, status: "DRAFT" } });
    if (!transfer) return json(res, 404, { error: "TRANSFER_NOT_CANCELLABLE" });
    await prisma.stockTransfer.update({ where: { id: transfer.id }, data: { status: "CANCELLED" } });
    await audit(req, { businessId: transfer.businessId, actorId: current.session.userId, action: "STOCK_TRANSFER_CANCELLED", entityType: "StockTransfer", entityId: transfer.id });
    return json(res, 200, { ok: true, transferId: transfer.id, status: "CANCELLED" });
  },
  "GET /api/v1/billing/status": async (req, res) => {
    const current = await currentMembership(req);
    if (!current) return json(res, 401, { error: "UNAUTHENTICATED" });
    const subscription = await prisma.subscription.upsert({ where: { businessId: current.membership.businessId }, create: { businessId: current.membership.businessId }, update: {}, select: { plan: true, status: true, seatsLimit: true, branchesLimit: true, monthlyOrderLimit: true, currentPeriodEnd: true } });
    const [branches, orders] = await Promise.all([prisma.branch.count({ where: { businessId: current.membership.businessId } }), prisma.sale.count({ where: { businessId: current.membership.businessId, createdAt: { gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) } } })]);
    return json(res, 200, { subscription, usage: { branches, monthlyOrders: orders }, entitlements: { canAddBranch: branches < subscription.branchesLimit, canCreateOrder: orders < subscription.monthlyOrderLimit } });
  },
  "POST /api/v1/billing/plan": async (req, res) => {
    const current = await currentMembership(req);
    const body = await readJson(req);
    if (!current) return json(res, 401, { error: "UNAUTHENTICATED" });
    if (current.membership.role !== "OWNER") return json(res, 403, { error: "FORBIDDEN" });
    const plans: Record<string, { branchesLimit: number; seatsLimit: number; monthlyOrderLimit: number }> = { STARTER: { branchesLimit: 1, seatsLimit: 3, monthlyOrderLimit: 1000 }, GROWTH: { branchesLimit: 5, seatsLimit: 15, monthlyOrderLimit: 10000 } };
    const plan = typeof body.plan === "string" ? body.plan : "";
    if (!plans[plan]) return json(res, 400, { error: "INVALID_PLAN" });
    const subscription = await prisma.subscription.upsert({ where: { businessId: current.membership.businessId }, create: { businessId: current.membership.businessId, plan, status: "ACTIVE", ...plans[plan] }, update: { plan, status: "ACTIVE", ...plans[plan] } });
    await audit(req, { businessId: subscription.businessId, actorId: current.session.userId, action: "BILLING_PLAN_CHANGED", entityType: "Subscription", entityId: subscription.id, reason: plan });
    return json(res, 200, { plan: subscription.plan, status: subscription.status, branchesLimit: subscription.branchesLimit, seatsLimit: subscription.seatsLimit, monthlyOrderLimit: subscription.monthlyOrderLimit });
  },
  "POST /api/v1/billing/provider/webhook": async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk);
    const raw = Buffer.concat(chunks).toString();
    const configured = providerSignature(raw);
    const supplied = typeof req.headers["x-provider-signature"] === "string" ? req.headers["x-provider-signature"] : "";
    if (!configured || supplied.length !== configured.length || !timingSafeEqual(Buffer.from(supplied), Buffer.from(configured))) return json(res, 401, { error: "INVALID_PROVIDER_SIGNATURE" });
    let body: { businessId?: string; eventId?: string; status?: string; providerReference?: string };
    try { body = JSON.parse(raw) as typeof body; } catch { return json(res, 400, { error: "INVALID_BILLING_WEBHOOK" }); }
    if (!body.businessId || !body.eventId || !["TRIALING", "ACTIVE", "PAST_DUE", "CANCELLED"].includes(body.status ?? "")) return json(res, 400, { error: "INVALID_BILLING_WEBHOOK" });
    const duplicate = await prisma.webhookEvent.findUnique({ where: { businessId_provider_eventId: { businessId: body.businessId, provider: "billing", eventId: body.eventId } } });
    if (duplicate) return json(res, 200, { ok: true, duplicate: true });
    const subscription = await prisma.$transaction(async (tx) => {
      const updated = await tx.subscription.upsert({ where: { businessId: body.businessId! }, create: { businessId: body.businessId!, status: body.status as "TRIALING" | "ACTIVE" | "PAST_DUE" | "CANCELLED", provider: "billing", providerReference: body.providerReference }, update: { status: body.status as "TRIALING" | "ACTIVE" | "PAST_DUE" | "CANCELLED", provider: "billing", providerReference: body.providerReference } });
      await tx.webhookEvent.create({ data: { businessId: body.businessId!, provider: "billing", eventId: body.eventId!, eventType: "subscription.updated" } });
      return updated;
    });
    return json(res, 200, { ok: true, status: subscription.status });
  },
  "GET /api/v1/dashboard/insights": async (req, res) => {
    const current = await currentMembership(req);
    if (!current) return json(res, 401, { error: "UNAUTHENTICATED" });
    if (!["OWNER", "MANAGER"].includes(current.membership.role)) return json(res, 403, { error: "FORBIDDEN" });
    const products = await prisma.product.findMany({ where: { businessId: current.membership.businessId, active: true }, include: { balances: true }, orderBy: { name: "asc" }, take: 100 });
    const lowStock = products.filter((product) => product.trackInventory && product.balances.reduce((sum, balance) => sum + balance.quantity, 0) <= product.reorderLevel);
    return json(res, 200, { generatedAt: new Date().toISOString(), insights: lowStock.slice(0, 8).map((product) => ({ type: "LOW_STOCK", title: `${product.name} needs attention`, explanation: `Stock is at or below the configured reorder level of ${product.reorderLevel}.`, productId: product.id })) });
  },
  "GET /api/v1/dashboard/overview": async (req, res) => {
    const current = await currentMembership(req);
    if (!current) return json(res, 401, { error: "UNAUTHENTICATED" });
    if (!["OWNER", "MANAGER"].includes(current.membership.role)) return json(res, 403, { error: "FORBIDDEN" });
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const [sales, products, openShifts] = await Promise.all([
      prisma.sale.findMany({ where: { businessId: current.membership.businessId, status: "COMPLETED", createdAt: { gte: start } }, select: { total: true, tax: true, paid: true } }),
      prisma.product.findMany({ where: { businessId: current.membership.businessId, active: true }, include: { balances: { select: { quantity: true } } }, orderBy: { name: "asc" } }),
      prisma.shift.count({ where: { businessId: current.membership.businessId, status: "OPEN" } }),
    ]);
    const lowStock = products.filter((product) => product.trackInventory && (product.balances.reduce((sum, balance) => sum + balance.quantity, 0) <= product.reorderLevel));
    const total = sales.reduce((sum, sale) => sum + sale.total, 0);
    return json(res, 200, {
      date: start.toISOString().slice(0, 10),
      sales: { total, orders: sales.length, averageOrder: sales.length ? Math.round(total / sales.length) : 0 },
      inventory: { products: products.length, lowStock: lowStock.length, outOfStock: lowStock.filter((product) => product.balances.every((balance) => balance.quantity === 0)).length },
      operations: { openShifts },
      attention: lowStock.slice(0, 8).map((product) => ({ id: product.id, name: product.name, reorderLevel: product.reorderLevel, stock: product.balances.reduce((sum, balance) => sum + balance.quantity, 0) })),
    });
  },
  "GET /api/v1/sales": async (req, res) => {
    const current = await currentMembership(req);
    if (!current) return json(res, 401, { error: "UNAUTHENTICATED" });
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? 50), 1), 100);
    const sales = await prisma.sale.findMany({
      where: { businessId: current.membership.businessId },
      include: { items: true, payments: true, customer: true, register: true },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    return json(res, 200, sales.map((sale) => ({
      id: sale.id,
      receiptNumber: sale.receiptNumber,
      status: sale.status,
      total: sale.total,
      paid: sale.paid,
      changeDue: sale.changeDue,
      createdAt: sale.createdAt,
      customer: sale.customer?.name ?? null,
      register: sale.register.name,
      itemCount: sale.items.reduce((sum, item) => sum + item.quantity, 0),
      paymentMethods: sale.payments.map((payment) => payment.method),
      canVoid: ["OWNER", "MANAGER"].includes(current.membership.role) && sale.status === "COMPLETED",
    })));
  },
  "POST /api/v1/sync/commands/status": async (req, res) => {
    const current = await currentMembership(req);
    if (!current) return json(res, 401, { error: "UNAUTHENTICATED" });
    const body = await readJson(req);
    const commands = Array.isArray(body.commands) ? body.commands : [];
    if (commands.length > 100 || commands.some((command) => !command || typeof command !== "object" || typeof (command as { key?: unknown }).key !== "string" || typeof (command as { type?: unknown }).type !== "string")) {
      return json(res, 400, { error: "INVALID_COMMANDS" });
    }
    const records = await prisma.idempotencyRecord.findMany({
      where: {
        businessId: current.membership.businessId,
        OR: commands.map((command) => ({ key: (command as { key: string }).key, commandType: (command as { type: string }).type })),
      },
      select: { key: true, commandType: true, resourceId: true, responseJson: true },
    });
    return json(res, 200, records.map((record) => ({ key: record.key, type: record.commandType, status: "APPLIED", resourceId: record.resourceId, response: record.responseJson })));
  },
  "POST /api/v1/sync/commands/retry": async (req, res) => {
    const current = await currentMembership(req);
    if (!current) return json(res, 401, { error: "UNAUTHENTICATED" });
    const body = await readJson(req);
    const key = typeof body.key === "string" ? body.key : "";
    const type = typeof body.type === "string" ? body.type : "";
    if (!key || !type || key.length > 128 || type.length > 64) return json(res, 400, { error: "INVALID_COMMAND" });
    const record = await prisma.idempotencyRecord.findFirst({ where: { businessId: current.membership.businessId, key, commandType: type }, select: { key: true, commandType: true, resourceId: true, responseJson: true } });
    return json(res, 200, record ? { key: record.key, type: record.commandType, status: "APPLIED", resourceId: record.resourceId, response: record.responseJson } : { key, type, status: "PENDING" });
  },
  "GET /api/v1/sales/held": async (req, res) => {
    const current = await currentMembership(req);
    if (!current) return json(res, 401, { error: "UNAUTHENTICATED" });
    const held = await prisma.sale.findMany({ where: { businessId: current.membership.businessId, held: true, status: "DRAFT" }, include: { items: true, customer: true, register: true }, orderBy: { updatedAt: "desc" }, take: 50 });
    return json(res, 200, held.map((sale) => ({ id: sale.id, receiptNumber: sale.receiptNumber, customer: sale.customer?.name ?? null, register: sale.register.name, itemCount: sale.items.reduce((sum, item) => sum + item.quantity, 0), total: sale.total, updatedAt: sale.updatedAt })));
  },
  "POST /api/v1/sales/hold": async (req, res) => {
    const current = await currentMembership(req);
    const body = await readJson(req);
    if (!current) return json(res, 401, { error: "UNAUTHENTICATED" });
    const registerId = typeof body.registerId === "string" ? body.registerId : "";
    const shiftId = typeof body.shiftId === "string" ? body.shiftId : "";
    const branchId = typeof body.branchId === "string" ? body.branchId : "";
    const customerId = typeof body.customerId === "string" ? body.customerId : null;
    const items = Array.isArray(body.items) ? body.items : [];
    if (!registerId || !shiftId || !branchId || !items.length) return json(res, 400, { error: "INVALID_HELD_SALE" });
    const shift = await prisma.shift.findFirst({ where: { id: shiftId, businessId: current.membership.businessId, registerId, status: "OPEN", register: { branchId } } });
    if (!shift) return json(res, 404, { error: "OPEN_SHIFT_NOT_FOUND" });
    const productIds = items.map((item) => typeof item.productId === "string" ? item.productId : "");
    const products = await prisma.product.findMany({ where: { businessId: current.membership.businessId, id: { in: productIds } }, select: { id: true, name: true, sku: true } });
    const productMap = new Map(products.map((product) => [product.id, product]));
    const normalized = items.map((item) => {
      const product = productMap.get(item.productId);
      if (!product || !Number.isInteger(item.quantity) || item.quantity <= 0 || !Number.isInteger(item.unitPrice) || item.unitPrice < 0) throw new Error("INVALID_HELD_ITEM");
      return { product, quantity: item.quantity, unitPrice: item.unitPrice };
    });
    const subtotal = normalized.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
    const tax = Math.round(subtotal * 0.12);
    const sale = await prisma.sale.create({ data: { businessId: current.membership.businessId, registerId, shiftId, cashierId: current.session.userId, receiptNumber: `HOLD-${Date.now()}-${Math.floor(Math.random() * 1000)}`, customerId, status: "DRAFT", held: true, subtotal, tax, total: subtotal + tax, items: { create: normalized.map((item) => ({ businessId: current.membership.businessId, productId: item.product.id, nameSnapshot: item.product.name, skuSnapshot: item.product.sku, quantity: item.quantity, unitPrice: item.unitPrice, taxRateBps: 1200, lineTotal: item.quantity * item.unitPrice })) } } });
    await audit(req, { businessId: current.membership.businessId, actorId: current.session.userId, action: "SALE_HELD", entityType: "Sale", entityId: sale.id });
    return json(res, 201, { id: sale.id, total: sale.total });
  },
  "POST /api/v1/sales/held/resume": async (req, res) => {
    const current = await currentMembership(req);
    const body = await readJson(req);
    if (!current) return json(res, 401, { error: "UNAUTHENTICATED" });
    const saleId = typeof body.saleId === "string" ? body.saleId : "";
    const sale = await prisma.sale.findFirst({ where: { id: saleId, businessId: current.membership.businessId, held: true, status: "DRAFT" }, include: { items: true, customer: true } });
    if (!sale) return json(res, 404, { error: "HELD_SALE_NOT_FOUND" });
    await prisma.sale.update({ where: { id: sale.id }, data: { held: false, status: "VOIDED" } });
    return json(res, 200, { saleId: sale.id, customerId: sale.customerId, items: sale.items.map((item) => ({ productId: item.productId, quantity: item.quantity, unitPrice: item.unitPrice })) });
  },
  "POST /api/v1/sales/held/void": async (req, res) => {
    const current = await currentMembership(req);
    const body = await readJson(req);
    if (!current) return json(res, 401, { error: "UNAUTHENTICATED" });
    const saleId = typeof body.saleId === "string" ? body.saleId : "";
    const sale = await prisma.sale.findFirst({ where: { id: saleId, businessId: current.membership.businessId, held: true, status: "DRAFT" } });
    if (!sale) return json(res, 404, { error: "HELD_SALE_NOT_FOUND" });
    await prisma.sale.update({ where: { id: sale.id }, data: { held: false, status: "VOIDED" } });
    await audit(req, { businessId: sale.businessId, actorId: current.session.userId, action: "HELD_SALE_VOIDED", entityType: "Sale", entityId: sale.id });
    return json(res, 200, { ok: true, saleId: sale.id });
  },
  "POST /api/v1/sales/void": async (req, res) => {
    const current = await currentMembership(req);
    const body = await readJson(req);
    const saleId = typeof body.saleId === "string" ? body.saleId : "";
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    if (!current) return json(res, 401, { error: "UNAUTHENTICATED" });
    if (!["OWNER", "MANAGER"].includes(current.membership.role)) return json(res, 403, { error: "FORBIDDEN" });
    if (!saleId || !reason) return json(res, 400, { error: "INVALID_VOID" });
    const sale = await prisma.sale.findFirst({ where: { id: saleId, businessId: current.membership.businessId, status: "COMPLETED" }, include: { items: true, payments: true, refunds: true, register: true, shift: true } });
    if (!sale) return json(res, 404, { error: "SALE_NOT_VOIDABLE" });
    if (sale.refunds.length > 0) return json(res, 409, { error: "SALE_HAS_REFUNDS" });
    await prisma.$transaction(async (tx) => {
      for (const item of sale.items) {
        await tx.inventoryMovement.create({ data: { businessId: sale.businessId, branchId: sale.register.branchId, productId: item.productId, type: "RETURN", quantity: item.quantity, reason: `Void ${sale.receiptNumber}: ${reason}`, actorId: current.session.userId, saleItemId: item.id } });
        await tx.inventoryBalance.update({ where: { productId_branchId: { productId: item.productId, branchId: sale.register.branchId } }, data: { quantity: { increment: item.quantity }, version: { increment: 1 } } });
      }
      if (sale.shiftId && sale.payments.some((payment) => payment.method === "CASH")) {
        const cashAmount = sale.payments.filter((payment) => payment.method === "CASH").reduce((sum, payment) => sum + payment.amount, 0);
        await tx.cashMovement.create({ data: { businessId: sale.businessId, shiftId: sale.shiftId, type: "CASH_REFUND", amount: Math.min(cashAmount, sale.total), reason: `Void ${sale.receiptNumber}: ${reason}`, actorId: current.session.userId } });
      }
      await tx.payment.updateMany({ where: { saleId: sale.id }, data: { status: "FAILED" } });
      await tx.sale.update({ where: { id: sale.id }, data: { status: "VOIDED" } });
      await tx.auditLog.create({ data: { businessId: sale.businessId, actorId: current.session.userId, action: "SALE_VOIDED", entityType: "Sale", entityId: sale.id, reason, requestId: req.headers["x-request-id"] as string | undefined, ip: req.socket.remoteAddress } });
    });
    return json(res, 200, { ok: true, saleId });
  },
  "GET /api/v1/sales/detail": async (req, res) => {
    const current = await currentMembership(req);
    if (!current) return json(res, 401, { error: "UNAUTHENTICATED" });
    const saleId = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`).searchParams.get("id");
    if (!saleId) return json(res, 400, { error: "SALE_ID_REQUIRED" });
    const sale = await prisma.sale.findFirst({
      where: { id: saleId, businessId: current.membership.businessId },
      include: { items: true, payments: true, customer: true, register: true, business: true },
    });
    if (!sale) return json(res, 404, { error: "SALE_NOT_FOUND" });
    return json(res, 200, {
      id: sale.id,
      receiptNumber: sale.receiptNumber,
      status: sale.status,
      createdAt: sale.createdAt,
      completedAt: sale.completedAt,
      business: { name: sale.business.name, receiptHeader: sale.business.receiptHeader, receiptFooter: sale.business.receiptFooter },
      register: sale.register.name,
      customer: sale.customer ? { name: sale.customer.name, phone: sale.customer.phone } : null,
      items: sale.items.map((item) => ({ name: item.nameSnapshot, sku: item.skuSnapshot, quantity: item.quantity, unitPrice: item.unitPrice, lineDiscount: item.lineDiscount, lineTotal: item.lineTotal })),
      payments: sale.payments.map((payment) => ({ method: payment.method, amount: payment.amount, status: payment.status })),
      subtotal: sale.subtotal,
      discount: sale.lineDiscount + sale.orderDiscount,
      tax: sale.tax,
      total: sale.total,
      paid: sale.paid,
      changeDue: sale.changeDue,
    });
  },
  "GET /api/v1/reports/sales.csv": async (req, res) => {
    const current = await currentMembership(req);
    if (!current) return json(res, 401, { error: "UNAUTHENTICATED" });
    if (!["OWNER", "MANAGER"].includes(current.membership.role)) return json(res, 403, { error: "FORBIDDEN" });
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    const start = from ? new Date(`${from}T00:00:00.000Z`) : new Date(0);
    const end = to ? new Date(`${to}T23:59:59.999Z`) : new Date();
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) return json(res, 400, { error: "INVALID_DATE_RANGE" });
    const sales = await prisma.sale.findMany({ where: { businessId: current.membership.businessId, createdAt: { gte: start, lte: end } }, include: { register: true }, orderBy: { createdAt: "asc" }, take: 5000 });
    const csvCell = (value: string | number) => `"${String(value).replaceAll('"', '""')}"`;
    const rows = [["receipt_number", "status", "created_at", "register", "total", "paid", "change_due"], ...sales.map((sale) => [sale.receiptNumber, sale.status, sale.createdAt.toISOString(), sale.register.name, sale.total, sale.paid, sale.changeDue])];
    res.statusCode = 200;
    res.setHeader("content-type", "text/csv; charset=utf-8");
    res.setHeader("content-disposition", "attachment; filename=\"ledgerly-sales.csv\"");
    res.end(rows.map((row) => row.map(csvCell).join(",")).join("\n"));
  },
  "GET /api/v1/operations/audit": async (req, res) => {
    const current = await currentMembership(req);
    if (!current) return json(res, 401, { error: "UNAUTHENTICATED" });
    if (!["OWNER", "MANAGER"].includes(current.membership.role)) return json(res, 403, { error: "FORBIDDEN" });
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    const requested = Number(url.searchParams.get("limit") ?? "100");
    const limit = Number.isFinite(requested) ? Math.min(Math.max(Math.floor(requested), 1), 200) : 100;
    const logs = await prisma.auditLog.findMany({ where: { businessId: current.membership.businessId }, orderBy: { createdAt: "desc" }, take: limit });
    return json(res, 200, logs.map((log) => ({ id: log.id, action: log.action, entityType: log.entityType, entityId: log.entityId, reason: log.reason, createdAt: log.createdAt, actorId: log.actorId, requestId: log.requestId })));
  },
  "POST /api/v1/payments/reconcile": async (req, res) => {
    const current = await currentMembership(req);
    const body = await readJson(req);
    const saleId = typeof body.saleId === "string" ? body.saleId : "";
    const status = typeof body.status === "string" ? body.status : "";
    if (!current) return json(res, 401, { error: "UNAUTHENTICATED" });
    if (!["OWNER", "MANAGER"].includes(current.membership.role)) return json(res, 403, { error: "FORBIDDEN" });
    if (!saleId || !["RECONCILED", "FAILED"].includes(status)) return json(res, 400, { error: "INVALID_RECONCILIATION" });
    const sale = await prisma.sale.findFirst({ where: { id: saleId, businessId: current.membership.businessId }, include: { payments: true } });
    if (!sale) return json(res, 404, { error: "SALE_NOT_FOUND" });
    const payment = sale.payments.find((item) => item.status === "UNKNOWN");
    if (!payment) return json(res, 409, { error: "NO_UNKNOWN_PAYMENT" });
    await prisma.$transaction(async (tx) => {
      await tx.payment.update({ where: { id: payment.id }, data: { status: status as "RECONCILED" | "FAILED" } });
      await tx.sale.update({ where: { id: sale.id }, data: { status: status === "RECONCILED" ? "COMPLETED" : "PAYMENT_FAILED" } });
      await tx.auditLog.create({ data: { businessId: sale.businessId, actorId: current.session.userId, action: "PAYMENT_RECONCILED", entityType: "Payment", entityId: payment.id, reason: status, requestId: req.headers["x-request-id"] as string | undefined, ip: req.socket.remoteAddress } });
    });
    return json(res, 200, { ok: true, saleId, paymentId: payment.id, status });
  },
  "GET /api/v1/customers": async (req, res) => {
    const current = await currentMembership(req);
    if (!current) return json(res, 401, { error: "UNAUTHENTICATED" });
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    const query = url.searchParams.get("q")?.trim();
    const customers = await prisma.customer.findMany({
      where: { businessId: current.membership.businessId, ...(query ? { OR: [{ name: { contains: query, mode: "insensitive" } }, { phone: { contains: query } }] } : {}) },
      include: { _count: { select: { sales: true } } },
      orderBy: { name: "asc" },
      take: 100,
    });
    return json(res, 200, customers.map((customer) => ({ id: customer.id, name: customer.name, phone: customer.phone, email: customer.email, purchases: customer._count.sales })));
  },
  "POST /api/v1/customers": async (req, res) => {
    const current = await currentMembership(req);
    const body = await readJson(req);
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!current) return json(res, 401, { error: "UNAUTHENTICATED" });
    if (!name || name.length > 120) return json(res, 400, { error: "INVALID_CUSTOMER" });
    const customer = await prisma.customer.create({
      data: {
        businessId: current.membership.businessId,
        name,
        phone: typeof body.phone === "string" ? body.phone.trim() || null : null,
        email: typeof body.email === "string" ? body.email.trim().toLowerCase() || null : null,
        note: typeof body.note === "string" ? body.note.trim() || null : null,
      },
    });
    return json(res, 201, customer);
  },
  "POST /api/v1/refunds": async (req, res) => {
    const current = await currentMembership(req);
    const body = await readJson(req);
    const saleId = typeof body.saleId === "string" ? body.saleId : "";
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    const requestedItems = Array.isArray(body.items) ? body.items : [];
    if (!current) return json(res, 401, { error: "UNAUTHENTICATED" });
    if (!["OWNER", "MANAGER"].includes(current.membership.role)) return json(res, 403, { error: "FORBIDDEN" });
    if (!saleId || !reason) return json(res, 400, { error: "INVALID_REFUND" });
    const sale = await prisma.sale.findFirst({ where: { id: saleId, businessId: current.membership.businessId, status: { in: ["COMPLETED", "PARTIALLY_REFUNDED"] } }, include: { items: true, shift: true, refunds: { include: { items: true } } } });
    if (!sale) return json(res, 404, { error: "SALE_NOT_REFUNDABLE" });
    const items = requestedItems.length ? requestedItems : sale.items.map((item) => ({ saleItemId: item.id, quantity: item.quantity }));
    let refund;
    try {
      refund = await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Sale" WHERE id = ${sale.id} FOR UPDATE`;
        const currentSale = await tx.sale.findUniqueOrThrow({ where: { id: sale.id }, include: { items: true, refunds: { include: { items: true } } } });
        const refundLines = items.map((item) => {
          const saleItem = currentSale.items.find((candidate) => candidate.id === item.saleItemId);
          const quantity = item.quantity;
          const refundedQuantity = currentSale.refunds.reduce((sum, prior) => sum + prior.items.filter((priorItem) => priorItem.saleItemId === item.saleItemId).reduce((itemSum, priorItem) => itemSum + priorItem.quantity, 0), 0);
          if (!saleItem || !Number.isInteger(quantity) || quantity <= 0 || refundedQuantity + quantity > saleItem.quantity) throw new Error("INVALID_REFUND_QUANTITY");
          return { saleItem, quantity, amount: Math.round((saleItem.lineTotal / saleItem.quantity) * quantity) };
        });
        const total = refundLines.reduce((sum, line) => sum + line.amount, 0);
        const register = await tx.register.findUniqueOrThrow({ where: { id: sale.registerId } });
        const created = await tx.refund.create({ data: { businessId: sale.businessId, saleId: sale.id, actorId: current.session.userId, reason, total, items: { create: refundLines.map((line) => ({ saleItemId: line.saleItem.id, quantity: line.quantity, amount: line.amount })) } }, include: { items: true } });
        for (const line of refundLines) {
          await tx.inventoryMovement.create({ data: { businessId: sale.businessId, branchId: register.branchId, productId: line.saleItem.productId, type: "RETURN", quantity: line.quantity, reason: `Refund ${created.id}`, actorId: current.session.userId, refundItemId: created.items.find((item) => item.saleItemId === line.saleItem.id)?.id } });
          await tx.inventoryBalance.update({ where: { productId_branchId: { productId: line.saleItem.productId, branchId: register.branchId } }, data: { quantity: { increment: line.quantity } } });
        }
        if (sale.shiftId) {
          const cashPaid = await tx.payment.aggregate({ where: { saleId: sale.id, method: "CASH", status: { in: ["COMPLETED", "RECONCILED"] } }, _sum: { amount: true } });
          const cashRefund = Math.min(total, cashPaid._sum.amount ?? 0);
          if (cashRefund > 0) await tx.cashMovement.create({ data: { businessId: sale.businessId, shiftId: sale.shiftId, type: "CASH_REFUND", amount: cashRefund, reason: `Refund ${created.id}`, actorId: current.session.userId } });
        }
        const refundedAfter = currentSale.refunds.reduce((sum, prior) => sum + prior.items.reduce((itemSum, item) => itemSum + item.quantity, 0), 0) + refundLines.reduce((sum, line) => sum + line.quantity, 0);
        const saleQuantity = currentSale.items.reduce((sum, item) => sum + item.quantity, 0);
        await tx.sale.update({ where: { id: sale.id }, data: { status: refundedAfter >= saleQuantity ? "REFUNDED" : "PARTIALLY_REFUNDED" } });
        return created;
      });
    } catch (error) {
      if (error instanceof Error && error.message === "INVALID_REFUND_QUANTITY") return json(res, 400, { error: error.message });
      throw error;
    }
    await audit(req, { businessId: sale.businessId, actorId: current.session.userId, action: "REFUND_CREATED", entityType: "Refund", entityId: refund.id, reason });
    return json(res, 201, { id: refund.id, saleId: sale.id, total: refund.total });
  },
  "POST /api/v1/auth/logout": async (req, res) => {
    const token = readCookie(req, "pos_session");
    if (token) await prisma.session.updateMany({ where: { tokenHash: hashToken(token) }, data: { revokedAt: new Date() } });
    res.statusCode = 204;
    res.setHeader("set-cookie", clearSessionCookie());
    res.end();
  },
  "GET /api/v1/health": async (_req, res) => {
    res.statusCode = 200;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ ok: true, service: "online-pos-api" }));
  },
  "GET /api/v1/ready": async (_req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return json(res, 200, { ok: true, service: "online-pos-api", database: "ready" });
    } catch {
      return json(res, 503, { ok: false, service: "online-pos-api", database: "unavailable" });
    }
  },
  "POST /api/v1/catalog/products": async (req, res) => {
    const current = await currentMembership(req);
    const body = await readJson(req);
    if (!current) return json(res, 401, { error: "UNAUTHENTICATED" });
    if (!["OWNER", "MANAGER", "INVENTORY"].includes(current.membership.role)) return json(res, 403, { error: "FORBIDDEN" });
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const sku = typeof body.sku === "string" ? body.sku.trim() : "";
    const price = body.price;
    const branchId = typeof body.branchId === "string" ? body.branchId : "";
    if (!name || !sku || !Number.isInteger(price) || Number(price) < 0 || !branchId) return json(res, 400, { error: "INVALID_PRODUCT" });
    const branch = await prisma.branch.findFirst({ where: { id: branchId, businessId: current.membership.businessId } });
    if (!branch) return json(res, 404, { error: "BRANCH_NOT_FOUND" });
    try {
      const product = await prisma.$transaction(async (tx) => {
        const created = await tx.product.create({
          data: {
            businessId: current.membership.businessId,
            name,
            sku,
            price: Number(price),
            cost: Number.isInteger(body.cost) ? Number(body.cost) : 0,
            reorderLevel: Number.isInteger(body.reorderLevel) ? Number(body.reorderLevel) : 0,
            trackInventory: body.trackInventory !== false,
            categoryId: typeof body.categoryId === "string" ? body.categoryId : null,
          },
        });
        await tx.inventoryBalance.create({ data: { businessId: current.membership.businessId, productId: created.id, branchId, quantity: 0 } });
        return created;
      });
      await audit(req, { businessId: current.membership.businessId, actorId: current.session.userId, action: "PRODUCT_CREATED", entityType: "Product", entityId: product.id });
      return json(res, 201, product);
    } catch (error) {
      if (error instanceof Error && error.message.includes("Unique constraint")) return json(res, 409, { error: "SKU_ALREADY_EXISTS" });
      throw error;
    }
  },
  "POST /api/v1/inventory/movements": async (req, res) => {
    const current = await currentMembership(req);
    const body = await readJson(req);
    if (!current) return json(res, 401, { error: "UNAUTHENTICATED" });
    if (!["OWNER", "MANAGER", "INVENTORY"].includes(current.membership.role)) return json(res, 403, { error: "FORBIDDEN" });
    const productId = typeof body.productId === "string" ? body.productId : "";
    const branchId = typeof body.branchId === "string" ? body.branchId : "";
    const type = typeof body.type === "string" ? body.type : "";
    const quantity = body.quantity;
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    if (!productId || !branchId || !["RECEIVE", "DAMAGE", "ADJUSTMENT"].includes(type) || !Number.isInteger(quantity) || Number(quantity) <= 0 || !reason) return json(res, 400, { error: "INVALID_INVENTORY_MOVEMENT" });
    const product = await prisma.product.findFirst({ where: { id: productId, businessId: current.membership.businessId } });
    const branch = await prisma.branch.findFirst({ where: { id: branchId, businessId: current.membership.businessId } });
    if (!product || !branch) return json(res, 404, { error: "PRODUCT_OR_BRANCH_NOT_FOUND" });
    const delta = type === "RECEIVE" ? Number(quantity) : -Number(quantity);
    const movement = await prisma.$transaction(async (tx) => {
      const balance = await tx.inventoryBalance.findUnique({ where: { productId_branchId: { productId, branchId } } });
      if (!balance || balance.quantity + delta < 0) throw new Error("INSUFFICIENT_STOCK");
      const created = await tx.inventoryMovement.create({ data: { businessId: current.membership.businessId, productId, branchId, type: type as "RECEIVE" | "DAMAGE" | "ADJUSTMENT", quantity: delta, reason, actorId: current.session.userId } });
      await tx.inventoryBalance.update({ where: { id: balance.id }, data: { quantity: { increment: delta }, version: { increment: 1 } } });
      return created;
    });
    await audit(req, { businessId: current.membership.businessId, actorId: current.session.userId, action: "INVENTORY_MOVEMENT_CREATED", entityType: "InventoryMovement", entityId: movement.id, reason });
    return json(res, 201, movement);
  },
  "GET /api/v1/catalog/products": async (req, res) => {
    const current = await currentMembership(req);
    if (!current) return json(res, 401, { error: "UNAUTHENTICATED" });
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    const businessId = url.searchParams.get("businessId");
    const branchId = url.searchParams.get("branchId");
    const query = url.searchParams.get("q")?.trim();
    if (!businessId || !branchId) {
      res.statusCode = 400;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ error: "BUSINESS_AND_BRANCH_REQUIRED" }));
      return;
    }
    if (businessId !== current.membership.businessId) {
      return json(res, 403, { error: "BUSINESS_SCOPE_MISMATCH" });
    }
    const branch = await prisma.branch.findFirst({ where: { id: branchId, businessId: current.membership.businessId } });
    if (!branch) return json(res, 404, { error: "BRANCH_NOT_FOUND" });

    const products = await prisma.product.findMany({
      where: {
        businessId,
        active: true,
        ...(query
          ? {
              OR: [
                { name: { contains: query, mode: "insensitive" } },
                { sku: { contains: query, mode: "insensitive" } },
                { barcode: { contains: query, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      include: { category: true, balances: { where: { branchId }, select: { quantity: true } } },
      orderBy: [{ favorite: "desc" }, { name: "asc" }],
      take: 100,
    });
    res.statusCode = 200;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(products.map((product) => ({
      id: product.id,
      name: product.name,
      sku: product.sku,
      price: product.price,
      category: product.category?.name ?? "Uncategorized",
      favorite: product.favorite,
      stock: product.balances[0]?.quantity ?? 0,
      trackInventory: product.trackInventory,
    }))));
  },
  "POST /sales/commit": async (req, res) => {
    const current = await currentMembership(req);
    if (!current) return json(res, 401, { error: "UNAUTHENTICATED" });
    const fakeReq = {
      json: async () => {
        const chunks: Buffer[] = [];
        for await (const chunk of req) chunks.push(chunk);
        return JSON.parse(Buffer.concat(chunks).toString());
      },
    } as unknown as Request;

    const result = await commitSaleHandler(fakeReq, {
      userId: current.session.userId,
      businessId: current.membership.businessId,
    });
    res.statusCode = result.status;
    res.setHeader("content-type", result.headers.get("content-type") || "application/json");
    const text = await (result as any).text?.();
    res.end(text || "{}");
  },
};

routes["POST /api/v1/sales/commit"] = routes["POST /sales/commit"];

const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
  const id = randomUUID();
  req.headers["x-request-id"] = id;
  res.setHeader("x-request-id", id);
  res.setHeader("x-content-type-options", "nosniff");
  res.setHeader("x-frame-options", "DENY");
  res.setHeader("referrer-policy", "no-referrer");
  res.setHeader("permissions-policy", "camera=(), microphone=(), geolocation=()");
  res.setHeader("access-control-allow-origin", process.env.WEB_ORIGIN ?? "http://localhost:3000");
  res.setHeader("access-control-allow-credentials", "true");
  res.setHeader("access-control-allow-headers", "content-type");
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }
  const pathname = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`).pathname;
  const key = `${req.method} ${pathname}`;
  const handler = routes[key];
  if (!handler) {
    res.statusCode = 404;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ error: "NOT_FOUND" }));
    return;
  }
  try {
    await handler(req, res);
  } catch (err: any) {
    res.statusCode = 500;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ error: err?.message || "UNKNOWN" }));
  }
});

server.listen(PORT, () => {
  console.log(`API listening on http://localhost:${PORT}`);
});
