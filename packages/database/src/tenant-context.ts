/**
 * Tenant context utilities for enforcing backend tenant isolation.
 *
 * Conventions:
 * - Every business-owned record has a `businessId` (UUID) foreign key to `Business`.
 * - Tenant is derived from authenticated session/membership, never trusted from client inputs.
 * - Repository/query helpers should require a TenantContext and scope all reads/writes.
 */

export type TenantContext = {
  /** The active business (tenant) ID for this request. */
  businessId: string;
  /** The authenticated user ID. */
  userId: string;
  /** The membership record linking user to business. */
  membershipId: string;
};

/**
 * Assert that a TenantContext is present and valid.
 * Throw if missing or malformed to prevent unscoped queries.
 */
export function ensureTenantContext(
  ctx: TenantContext | null | undefined
): TenantContext {
  if (!ctx || !ctx.businessId || !ctx.userId || !ctx.membershipId) {
    throw new Error(
      "Missing or invalid tenant context: all business queries must be scoped to an authenticated membership"
    );
  }
  return ctx;
}

/**
 * Example repository helper pattern (pseudo-code, adapt to your Prisma setup):
 *
 * ```ts
 * import { PrismaClient } from ".prisma/client";
 * import { TenantContext, ensureTenantContext } from "./tenant-context";
 *
 * export function createScopedRepository(ctx: TenantContext | null) {
 *   const tenant = ensureTenantContext(ctx);
 *   const prisma = new PrismaClient();
 *
 *   return {
 *     products: {
 *       list: (filters: { search?: string; limit?: number }) =>
 *         prisma.product.findMany({
 *           where: {
 *             businessId: tenant.businessId,
 *             active: true,
 *             ...(filters.search && {
 *               OR: [
 *                 { name: { contains: filters.search, mode: "insensitive" } },
 *                 { sku: { contains: filters.search, mode: "insensitive" } },
 *                 { barcode: { contains: filters.search, mode: "insensitive" } },
 *               ],
 *             }),
 *           },
 *           take: filters.limit ?? 50,
 *           orderBy: { name: "asc" },
 *         }),
 *     },
 *     // ... other entities
 *   };
 * }
 * ```
 *
 * Rules:
 * - Never construct queries without injecting `businessId` from `tenant`.
 * - Never accept `businessId` from client request bodies for scoping.
 * - For cross-tenant tests, seed two businesses and assert user A cannot read B's data.
 */
