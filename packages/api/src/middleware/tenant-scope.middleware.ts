/**
 * Tenant-scope middleware for NestJS/Fastify-style APIs.
 *
 * This middleware:
 * - Reads the authenticated session/membership from the request context.
 * - Derives a TenantContext { businessId, userId, membershipId }.
 * - Attaches it to the request for downstream handlers.
 * - Rejects requests without valid membership.
 *
 * Integration pattern (adapt to your server):
 *
 * ```ts
 * // In your NestJS guard or Fastify hook:
 * import { ensureTenantContext, TenantContext } from '@repo/database';
 *
 * export function tenantScopeMiddleware(req, res, next) {
 *   const session = req.session; // from your auth layer
 *   if (!session?.membershipId || !session.userId || !session.businessId) {
 *     return res.status(401).json({ error: 'UNAUTHENTICATED', message: 'No active membership' });
 *   }
 *
 *   const ctx: TenantContext = {
 *     businessId: session.businessId,
 *     userId: session.userId,
 *     membershipId: session.membershipId,
 *   };
 *
 *   // Validate and attach
 *   try {
 *     ensureTenantContext(ctx);
 *     req.tenant = ctx;
 *     next();
 *   } catch (e) {
 *     return res.status(403).json({ error: 'FORBIDDEN', message: e.message });
 *   }
 * }
 * ```
 *
 * Rules:
 * - All business-scoped routes must run behind this middleware.
 * - Handlers read `req.tenant` and never trust client-supplied `businessId`.
 * - Public routes (login, register, password reset) are explicitly excluded.
 */
