# Online POS

Multi-tenant SaaS point of sale for small and medium inventory-based businesses. Philippines-first (PHP, VAT, GCash/Maya), with a path to other markets.

> Sell, track inventory, manage customers, monitor cash, and understand the business from one system.

**Status:** Implementation in progress against `PLAN.md`  
**Stack:** TypeScript, Next.js, NestJS, PostgreSQL, Prisma, pnpm, Turborepo  
**AI:** Deferred. No forecasting or assistants in this generation.

## Daily loop

```text
Set up business -> add products -> open shift -> sell -> take payment
-> update inventory -> close shift -> review what happened
```

## Quick start

```bash
cp .env.example .env
docker compose up -d postgres
pnpm install
pnpm db:migrate
pnpm db:seed
pnpm dev
```

- Web: http://localhost:3000
- API: http://localhost:3001/api/v1/health

### Demo login

| Role | Email | Password |
| --- | --- | --- |
| Owner | owner@valdez.store | ChangeMe123! |
| Manager | manager@valdez.store | ChangeMe123! |
| Cashier | cashier@valdez.store | ChangeMe123! |
| Inventory | stock@valdez.store | ChangeMe123! |

## Architecture

```text
Browser clients
    |
    v
Next.js web app (dashboard, POS, admin)
    |
    | HTTPS REST /api/v1
    v
NestJS modular monolith
    |
    v
PostgreSQL (authoritative transactional store)
```

Invariants:

- Tenant isolation is enforced in the API and data layer, never only in the UI.
- Money is integer centavos. No binary floats for totals.
- Inventory is an append-only ledger; balances are a transactional projection.
- Sale, payment, inventory, and cash effects commit in one transaction.
- Duplicate sale/payment commands reuse an idempotency key.
- Unknown payments are queryable. The UI never asks for a blind retry.

## Repo layout

```text
apps/web                 Next.js cashier + dashboard
apps/api                 NestJS modular monolith
packages/database        Prisma schema, client, seed
packages/domain          Money, totals, cash, state machine, RBAC
packages/validation      Shared Zod request schemas
```

## Product principles

1. Correctness before raw speed.
2. POS optimizes for speed of action; dashboard for speed of understanding.
3. Sensitive actions are attributable and reversible through workflows, not deletes.
4. Small businesses get a strong default workflow.
