# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

Production build uses `next build --webpack` (see cPanel note below) — don't "fix" this to Turbopack.

## What this app is

Cashflow — a forward-looking, multi-user personal finance tracker (default currency AED). Its differentiator is projecting account balances forward across a horizon (30/60/90 days) using recurring income/costs, credit-card statement cycles, and post-dated cheques (PDCs), then warning about bounced cheques, negative balances, and buffer breaches before they happen. See [README.md](README.md), [TECH_STACK.md](TECH_STACK.md), and [DECISIONS.md](DECISIONS.md) for full product/architecture rationale — read `DECISIONS.md` before making a design choice that might already have a documented answer.

A companion mobile app (`cashtrack-mobile`, a separate repo) consumes the `/api/v1/*` bearer-authenticated REST endpoints this repo exposes. The mobile app is an API-first thin client — `packages/core` is *not* shared/vendored into it (a monorepo/vendoring approach was tried and superseded; see `docs/mobile/01a-spike.md` and `docs/mobile/02-mobile-plan.md` for why). When adding or changing an `/api/v1/*` route, check `docs/mobile/02-mobile-plan.md` for the intended contract first.

## Commands

```bash
npm run dev              # Next.js dev server (http://localhost:3000)
npm run build             # prisma generate && next build --webpack
npm start                 # production server (server.js, for Passenger/cPanel)
npm run lint               # eslint
npm test                   # vitest run — but only covers src/**/*.test.ts (see Testing below)
npm run test:watch

npm run db:migrate         # prisma migrate dev (uses DIRECT_URL)
npm run db:seed            # seed admin (from .env) + verified demo user
npm run db:clear           # wipe all data, keep schema
npm run db:reset           # reset + reseed
npm run db:studio
npm run db:embedded        # in-process PGlite Postgres for local dev without Docker/Neon
```

Single test file: `npx vitest run src/lib/crypto.test.ts`.

Verify the encryption/isolation model against a running DB: `npx tsx scripts/verify-auth.ts`.

## Testing — two separate suites

The financial engines (projection, card-cycle, salary-period, cashflow-timeline, notifications, money, domain, initials) live in **`packages/core/src/`**, each with its own `*.test.ts`. Root `vitest.config.ts` only includes `src/**/*.test.ts`, so **`npm test` at the repo root does NOT run the engine tests.** To run them:

```bash
cd packages/core && npm test        # or: npx vitest run (from packages/core)
```

`packages/core` is a standalone package (own `package.json`, own `vitest.config.ts`, only depends on `date-fns`) kept independently testable and shareable with the mobile app later. When touching projection/money/card-cycle/salary-period/notifications logic, run **both** suites.

## Architecture

### The `packages/core` re-export pattern

This is a flat single-app repo (no npm workspaces — cPanel/CloudLinux's npm can't handle them; see commits `84fbf5a`, `866a8c7`, `970d30f`). The shared financial engines live in `packages/core/src/` as the single source of truth. Files under `src/lib/` (`projection.ts`, `money.ts`, `domain.ts`, `card-cycle.ts`, `salary-period.ts`, `cashflow-timeline.ts`, `notifications.ts`, `initials.ts`) are **thin re-export shims**:

```ts
export * from "../../packages/core/src/projection";
```

**Always edit the logic in `packages/core/src/*`, never in the `src/lib/*` shim.** The shim exists only so existing `@/lib/projection` imports keep working elsewhere in the app.

Note: `package.json`'s top-level `"//"` comment still describes an older vendoring approach (`vendor/cashflow-core.tgz`, `npm run vendor:core`). That was removed (`file:` deps don't resolve correctly under cPanel's nodevenv) — the current, actual mechanism is the relative-import re-export shown above. Don't resurrect the tarball/vendor approach without checking `git log` for why it was dropped.

### Server Components read, Server Actions write

- All reads funnel through `src/server/queries.ts`.
- All web mutations funnel through `src/server/actions.ts` → Zod-validated → return `{ ok, error }`, mapped to a toast client-side.
- Mutation *cores* shared between the web action and the mobile API live in `src/server/mutations/*.ts`, returning a common `MutationResult` (`{ ok: true, id? } | { ok: false, error, status? }`) — see `src/server/mutations/types.ts`. When adding a mutation usable from both surfaces, put the core logic there, not duplicated in the action and the route handler.
- No REST layer for the web UI itself, except `/api/import` and `/api/export` (need raw request/response for file up/download), `/api/chat` (streaming AI assistant), `/api/mcp` (JSON-RPC tool server), and `/api/v1/*` (mobile REST API, bearer-authenticated).

### Auth: cookie (web) + bearer (mobile), same gate

- Edge gate `src/proxy.ts` does a coarse, fast check (session cookie present?) before redirecting protected routes to `/login`; it does not itself decrypt/validate. Real validation happens in `requireUser()` in the `(app)` layout.
- `src/server/api-auth.ts` is the API equivalent: `requireApiUser()` resolves auth via `getAuth()` (cookie OR bearer token — same underlying session model), returning JSON errors instead of redirecting. Use `apiJson()` for GET routes and `apiMutation()` for writes under `src/app/api/v1/*` — both wrap auth + error mapping so a route handler is close to a one-liner.
- Routing: authenticated pages under the `(app)` route group (guarded layout), auth screens under `(auth)`, public marketing under `(marketing)`.

### Money and the projection engine

- Every amount is an integer in minor units (fils/cents) — `amountMinor`, `targetMinor`, etc. Floats only appear at the input/output edge (`packages/core/src/money.ts`). Never introduce float arithmetic into ledger or projection code.
- Balances are always computed (`opening balance + folded posted transactions`, in `src/server/balances.ts`), never stored/denormalised.
- The projection engine (`packages/core/src/projection.ts`) is pure — no Prisma, no Next imports — so it's unit-testable in isolation. Keep it that way; push any DB/Next-specific logic to the caller in `src/server/`.
- Credit cards are `Account`s of type `credit_card` with a negative balance representing amount owed; a card charge is an expense posted to the card, a payment is a transfer asset → card. Cards are excluded from "free savings" and cash pickers.

### Encryption model — do not weaken

Each user has a random per-user Data Encryption Key (DEK), wrapped by a key derived from their password (scrypt). Financial fields are AES-256-GCM ciphertext with a random per-record IV. The admin holds no DEK and can only query identity/telemetry tables (`src/server/admin.ts`), never financial columns. When adding a new financial field or a new admin-visible query, preserve this boundary: encrypted fields go through the existing per-user crypto helpers (`src/lib/crypto.ts`, `src/server/crypto-map.ts`), and admin code must not touch DEK-wrapped data. Every query/mutation must stay scoped by `userId` with row-ownership checks (`{ id, userId }` on `updateMany`/`deleteMany`).

### AI assistant privacy

`src/server/ai/tokenizer.ts` replaces real account/card/payee names with opaque codenames (e.g. `ACCT_001`) before anything is sent to Claude (`src/server/ai/claude.ts`, Anthropic Messages API); the MCP tool server (`src/server/ai/tools.ts`, exposed at `/api/mcp`) is read-only and reasons over codenames only, with real names substituted back into the reply server-side. Conversations are not persisted server-side. Don't send real identifying strings to the model.

## Database

PostgreSQL via Prisma 6 (pinned — Prisma 7 requires driver adapters/`prisma.config.ts`, unneeded ceremony here), hosted on Neon by default. `DATABASE_URL` is the pooled (PgBouncer, `&pgbouncer=true`) runtime connection; `DIRECT_URL` is unpooled and used only by `prisma migrate`. Local alternatives: `docker-compose.yml` (Postgres) or `npm run db:embedded` (in-process PGlite) — same wire protocol, just swap the two URLs. Enums are modelled as TypeScript unions (`packages/core/src/domain.ts`) enforced by Zod rather than native Postgres enums.

## Deployment notes that shape the code

Production target is cPanel/Phusion Passenger (see [DEPLOYMENT.md](DEPLOYMENT.md)). This explains several things that look unusual in isolation — don't "clean them up" without reading `DEPLOYMENT.md` first:

- `next build --webpack` (not Turbopack — Turbopack refuses to follow the symlinked `node_modules` cPanel/CloudLinux uses).
- Build-time deps (Tailwind/PostCSS, TypeScript, `@types/*`) live in `dependencies`, not `devDependencies`, because cPanel's production `npm install` skips dev deps.
- `server.js` is the Passenger entrypoint, listening on `process.env.PORT`.
- No npm workspaces anywhere in this repo (see the `packages/core` re-export pattern above).
