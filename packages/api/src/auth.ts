import { createHash, randomBytes } from "node:crypto";
import type { IncomingMessage } from "node:http";
import { prisma } from "@online-pos/database";

const SESSION_DAYS = 30;

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function readCookie(req: IncomingMessage, name: string) {
  const cookies = req.headers.cookie?.split(";").map((cookie) => cookie.trim()) ?? [];
  return cookies.find((cookie) => cookie.startsWith(`${name}=`))?.slice(name.length + 1);
}

export async function authenticateRequest(req: IncomingMessage) {
  const token = readCookie(req, "pos_session");
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: { include: { memberships: { where: { active: true }, include: { business: true } } } } },
  });
  if (!session || session.revokedAt || session.expiresAt <= new Date()) return null;
  return session;
}

export async function createSession(userId: string, req: IncomingMessage) {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await prisma.session.create({
    data: {
      userId,
      tokenHash: hashToken(token),
      expiresAt,
      ip: req.socket.remoteAddress,
      userAgent: req.headers["user-agent"],
    },
  });
  return { token, expiresAt };
}

export function sessionCookie(token: string, expiresAt: Date) {
  return `pos_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor((expiresAt.getTime() - Date.now()) / 1000)}${process.env.COOKIE_SECURE === "true" ? "; Secure" : ""}`;
}

export function clearSessionCookie() {
  return "pos_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0";
}
