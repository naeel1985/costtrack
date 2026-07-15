# Design decisions

Running log of the meaningful choices made while building Cashflow, and why.

## Money & correctness

- **Integer minor units everywhere.** Every amount is stored and computed as an
  integer number of fils/cents (`amountMinor`, `targetMinor`, …). Floats only
  appear at the very edge — parsing input and formatting output
  (`src/lib/money.ts`). This structurally eliminates `0.1 + 0.2` rounding bugs
  in totals and projections.
- **Currency metadata drives decimals.** AED/USD = 2 dp, KWD = 3, JPY = 0. The
  minor-unit factor comes from the currency, not a hard-coded `* 100`.
- **Balances are always computed, never stored.** An account's balance is
  `openingBalance + folded posted transactions` (`src/server/balances.ts`).
  There is no denormalised balance column to drift out of sync. Transfers debit
  the source and credit the destination in the same fold.

## Projection engine

- **Pure module, isolated and unit-tested.** `src/lib/projection.ts` imports
  only `date-fns`. This is the core differentiator, so it gets 12 unit tests
  covering recurrence expansion, PDC clearing effects, negative-balance
  detection, bounce warnings, buffer breaches, and runway.
- **Today is the boundary between "actual" and "projected".** Past is the posted
  ledger; future comes from recurring rules + pending PDCs + scheduled/what-if
  events. Recurrence expansion starts at *today*, so already-posted history is
  never double-counted.
- **Recurring `custom` frequency = every N days**; weekly/monthly/yearly step by
  N of that unit. `occurrenceCount` and `endDate` are honoured from the rule's
  true start, not the projection window.
- **Provisions are obligations, not cash-flow line items.** They surface in the
  "upcoming obligations" feed and warnings, but the balance projection tracks
  only real cash movements (income, recurring costs, PDCs, scheduled). This
  keeps the projected line meaning exactly "money that will actually move".

## Persistence

- **Prisma + SQLite, pinned to Prisma 6.** Prisma 7 removed `url` from the schema
  and requires driver adapters + `prisma.config.ts`. For a zero-config
  local-first single-user app that's needless ceremony, so we pin to Prisma 6's
  classic setup. The data-access layer (`src/server/`) is the only thing that
  touches Prisma, so a Postgres move is a datasource swap, not a rewrite.
- **Enums modelled as `String` columns.** SQLite has no native enums. The allowed
  values live as TypeScript unions in `src/lib/domain.ts` and are enforced with
  Zod at every write. Bonus: promoting them to real Postgres enums later is
  mechanical.
- **`force-dynamic` on DB-backed routes.** The app is inherently live data;
  static prerendering could show a build-time snapshot. Server Actions call
  `revalidatePath`, but forcing dynamic guarantees every view reflects the
  current DB. Perf cost is irrelevant for a single local user.

## Architecture

- **Server Components read; Server Actions write.** All reads funnel through
  `src/server/queries.ts`; all mutations through `src/server/actions.ts`, each
  validated with Zod and returning a `{ ok, error }` result the client turns into
  a toast. No REST layer except the two import/export route handlers (they need
  raw request/response for file up/download).
- **Lightweight view-types at the client boundary.** Client components receive
  plain serialisable shapes (`src/lib/view-types.ts`) rather than raw Prisma
  rows, keeping bundles lean and props explicit. (`Date` crosses the RSC boundary
  fine, so date fields are passed as-is.)
- **shadcn-style primitives hand-authored for Tailwind v4.** The shadcn CLI's
  output *is* these Radix + CVA components; authoring them directly avoids
  CLI/registry friction with Next 16 / Tailwind v4 while keeping the same API.

## Product / UX

- **Colour is meaningful, never decorative.** Green = money in, red = money out /
  danger, amber = warning. Neutral slate surfaces carry everything else. `Money`
  only colours by sign when a caller opts in (`colored`).
- **PDC clearing reconciles into the ledger.** Marking a cheque cleared creates &
  links a real transaction; reopening/deleting unwinds it. The register and
  ledger can never disagree.
- **Mobile is first-class.** Bottom tab bar + top quick-add on phones, sidebar on
  desktop, `env(safe-area-inset-bottom)` respected. This is meant to be used on a
  phone daily.

## Extras beyond the brief

- **What-if simulator** layered on the projection chart (spend/receive X in N
  days, watch the line and warnings update).
- **Cash-flow runway** indicator (months of balance left at current burn).
- **⌘K command palette** for navigation + quick-add; `N` for a fast expense.
- **Recurring-cheque batch creation** that can spawn a matching recurring rule.
- **Safety buffer per account** with dedicated buffer-breach warnings.
- **Full CSV/JSON import & export** so the user is never locked in.

## Multi-user, auth & encryption (v2)

The app went from single-user local-first to a secure multi-tenant app. Key
decisions:

- **PostgreSQL** via Prisma (`provider = "postgresql"`), hosted on **Neon**
  (serverless). The datasource uses two URLs: `DATABASE_URL` is Neon's **pooled**
  (PgBouncer) endpoint with `pgbouncer=true` (disables prepared statements, which
  transaction-mode pooling can't keep) for the app at runtime; `directUrl`
  (`DIRECT_URL`) is the **unpooled** endpoint used only by Prisma Migrate. A
  `docker-compose.yml` (local Postgres) and `npm run db:embedded` (in-process
  PGlite, same wire protocol) remain drop-in alternatives — only the two URLs
  change. Migration + seed + full auth/encryption flow were verified live on Neon.
- **Custom auth, not a library.** Full control over the exact requirements
  (username *or* email login, email-verification gate, login-attempt telemetry).
  Passwords are hashed with **scrypt** (memory-hard) + random per-password salt,
  compared in constant time. Sessions are **opaque server-side tokens**: the
  cookie holds a random token, the DB stores only its SHA-256, cookie is
  `httpOnly` + `SameSite=Lax` + `Secure` in prod. Sessions are revocable.
- **Zero-knowledge-from-admin encryption.** Each user has a random 256-bit
  **Data Encryption Key (DEK)**. The DEK is wrapped by a key **derived from the
  user's password** (scrypt). On login the DEK is unwrapped and re-sealed with a
  server key (`SERVER_KEY`) onto the session row, so an active request can
  decrypt without re-deriving from the password. All financial fields (amounts,
  names, notes, counterparties, cheque numbers…) are stored **AES-256-GCM**
  encrypted with a **random IV per record** (the "salt") + auth tag. Result: no
  other user, no admin, and nobody with a raw DB dump can read a user's data
  without that user's password. Verified end-to-end (`scripts/verify-auth.ts`):
  a user decrypts their own rows; the admin's DEK throws on the same ciphertext.
  - **Trade-off:** because the DEK is only recoverable from the password, a
    forgotten-password *reset* would orphan existing data. We therefore ship
    email *verification* (required) but **not** password reset — the honest price
    of the zero-knowledge property. Identity fields (email, phone, full name) are
    stored plaintext on purpose: the admin is explicitly allowed to see them.
- **Admin sees telemetry, never data.** The admin console queries only identity
  + auth tables (users, verified-email, phone, login attempts). It never selects
  financial columns and holds no DEK, so user data is cryptographically out of
  reach. A non-admin hitting `/admin` gets a 404 (the route isn't even confirmed).
- **Defence in depth.** (1) Edge `proxy.ts` bounces cookie-less requests to
  `/login`; (2) the `(app)` layout runs `requireUser()`; (3) every query &
  mutation is scoped by `userId` and re-checks row ownership (`updateMany`/
  `deleteMany` with `{ id, userId }`, `assertOwnsAccounts`); (4) all mutations are
  Zod-validated; (5) login lockout after N failures; (6) security headers + CSP,
  `poweredByHeader` off. Even if tenant scoping were bypassed, the data is still
  encrypted to a key the attacker doesn't have.
- **Routing.** Authenticated app lives under the `(app)` route group (guarded
  layout + shell); auth screens under `(auth)` (bare layout). URLs are unchanged.
- **Seeding.** `npm run db:seed` upserts the **admin** from env
  (`ADMIN_USERNAME/PASSWORD/EMAIL`) and creates a **verified demo user**
  (`demo@cashflow.local` / `DemoPass123!`) with the encrypted AED sample data.

## Deferred (sensible next steps, intentionally out of scope for now)

- Optional PIN gate (schema field `AppSetting.pinHash` exists; no UI yet).
- Receipt/attachment upload (schema field `Transaction.attachmentPath` exists).
- Budgets have a schema + query + actions; a dedicated budgets screen isn't wired
  into the nav yet (reports show category spend which covers most of the need).
- Automatic materialisation of recurring occurrences on their due date (currently
  a manual "post next now"); projections already show them regardless.
