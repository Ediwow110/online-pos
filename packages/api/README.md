# @online-pos/api

Minimal API server exposing `/sales/commit`.

## Run

```bash
pnpm -w db:migrate   # ensure Prisma migrations applied
pnpm -w db:seed      # seed test data
pnpm -F @online-pos/api dev  # starts server on PORT (default 3000)
```

## Smoke test

In another terminal:

```bash
pnpm -F @online-pos/api smoke
```

Expect: `Smoke PASSED` with `moveQty: -N` and negative `balanceQty`.

## Env

- `DATABASE_URL` (required)
- `PORT` (default 3000)
