# Foundation Decisions

This document records non-negotiable conventions for the POS system. These are enforced in schema, code, and tests.

## 1. Identifiers

- **Public IDs:** UUID v7 (or ULID) for all external-facing record identifiers.
- **Internal keys:** Auto-increment integers may be used internally where beneficial (e.g., ordering), but never exposed as the primary API identifier.
- **Immutability:** Once assigned, public IDs never change. History records (sales, movements, payments) keep original IDs even if corrected via refunds/adjustments.

## 2. Money and Rounding

- **Storage:** Money is stored in **integer minor units** (PHP centavos). Example: ₱123.45 → `12345`.
- **Type discipline:** No binary floating-point arithmetic on authoritative money values. All money math uses integers or explicit decimal helpers.
- **Rounding policy:** Single, centralized rounding mode (default: half-up) and scale (0 decimal places in minor units). Applied consistently in:
  - Server validation and totals
  - Reports and exports
  - Receipts and customer-facing displays
- **Snapshotting:** Sale lines and payments snapshot effective price, tax, and total at commit time. Later catalog changes do not rewrite history.

## 3. Timestamps and Timezones

- **Storage:** All timestamps are stored in **UTC** (`TIMESTAMPTZ`).
- **Fields:** `createdAt` and `updatedAt` on every business-owned entity.
- **Display:** Business-local timezone is a preference on `Business` and/or `User`; UI renders timestamps in local time, but all queries and history use UTC.
- **Comparison semantics:** Analytics comparisons are always defined in UTC boundaries, then rendered in local time.

## 4. Soft Delete vs Immutability

- **Transactional history:** Sales, payments, refunds, inventory movements, cash movements, and audit logs are **immutable**. No soft deletes; corrections use explicit workflows (refund, adjustment, reversal).
- **Catalog and configuration:** Products, customers, categories, etc. use an `active` boolean flag rather than hard deletion. This preserves referential integrity for history.
- **Users and memberships:** Deactivation via `isActive` or similar; historical records remain attributable.

## 5. Tenant Isolation

- **Field:** Every business-owned record has a `businessId` (UUID) foreign key to `Business`.
- **Enforcement:** Tenant scoping is enforced in the backend repository/query layer, not only in the frontend.
- **Session context:** Tenant is derived from authenticated `BusinessMembership` and session, never trusted from client-supplied `businessId` on commands.

## 6. Audit and Attribution

- **Audit log:** Append-only. Sensitive actions (price/cost edits, discounts above threshold, voids, refunds, inventory adjustments, user management, settings, exports, shift overrides) produce audit records.
- **Fields:** `businessId`, `actorId`, `action`, `entityType`, `entityId`, `beforeSnapshot?`, `afterSnapshot?`, `reason`, `requestId`, IP/device/session metadata, timestamp.
- **Platform support:** Support access is time-bounded, purpose-bound, minimally privileged, and fully audited.

## 7. Transactional Boundaries

- **Critical path:** Sale creation is atomic across:
  - Sale snapshot
  - Payment record(s)
  - Inventory movement(s)
  - Cash movement(s) (when applicable)
- **No partial commits:** If any part fails, the entire transaction rolls back. No silent partial effects.

## 8. Evolution Rules

- **Backward compatibility:** Migrations are forward-only with documented rollback/restore guidance. No destructive changes without a plan.
- **Feature flags:** Risky workflows are guarded by flags for phased rollout.
- **Measure before optimizing:** Performance improvements are driven by measured p95/p99 and error budgets, not intuition.
