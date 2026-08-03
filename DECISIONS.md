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
- **A provision counts as a cost once it has a due date.** *(Revised — this
  previously excluded provisions from the projection entirely.)* A provision with
  a due date is a dated obligation: money that will actually move, on a known
  day, so it belongs on the timeline like any recurring cost or cheque. A
  provision **without** a due date stays out — it's an open-ended savings goal
  with no point to plot. Only the **unfunded remainder** (`target − allocated`)
  is charged, since allocated money has already left the ledger via its
  allocation. See `eventsFromProvisions` in `src/lib/projection.ts`.

- **Cards are liabilities, not spendable accounts.** A credit card is an
  `Account` of type `credit_card` whose *negative* balance is the amount owed. A
  credit-card cost posts there as an expense (so it never touches cash), and a
  payment is a transfer asset → card that lifts the balance back toward zero.
  Users can hold several cards; a default is created on first use so the
  zero-config path still works. Cards are excluded from "free savings" and from
  every cash/debit/transfer picker.

## Free-savings pool

- **The pool is a cumulative ledger, not a live projection.** *(Supersedes an
  earlier fixed-30-day live-window model.)* Unlike the projection engine (which
  recomputes from scratch on every read), the free-savings pool
  (`packages/core/src/free-savings-pool.ts`) only changes when the user
  explicitly **confirms a salary debit** (the existing recurring-income
  "debit"/"undo" flow, `src/server/mutations/income.ts`). Confirming closes a
  *cycle*: actual posted income minus actual posted/closed costs since the last
  confirmation (including any credit-card statement that closed in the window)
  is folded into the running pool, which is persisted (`FreeSavingsState`,
  `FreeSavingsCycle` — encrypted, per-user) rather than derived. This matches
  how the user actually thinks about "what's safely spendable": it doesn't wobble
  with every pending/scheduled item, only with money that's actually landed.
- **One recurring income rule is explicitly "the salary."**
  `RecurringRule.isSalary` (at most one `true` per user, enforced in
  `saveRecurringCore`) replaced an earlier implicit "any monthly-frequency
  income = salary" convention — that broke down as soon as a user had more than
  one monthly income stream. Only confirming *that* rule's occurrence closes a
  cycle; other income (business/freelance, one-off) counts toward a cycle's
  income but never triggers one.
- **Bootstrapping reads current balances, never writes from a query.** The pool
  is lazily created the first time a salary is confirmed, seeded from the
  user's asset-account balances at that moment (`getOrCreateFreeSavingsState`,
  called only from the mutation path). Dashboard reads fall back to today's live
  balance for *display* when no pool row exists yet, but never persist it —
  keeping the read/write split (`CLAUDE.md` → Server Components read / Server
  Actions write) intact even for this stateful feature.
- **Credit-card cost for a cycle = the statement due in that window**, sourced
  via the same `nextStatement` the dashboard/AI tool already use for "next
  payment due" — not re-derived by bucketing individual charges. Simpler, and
  it means the pool math and the visible "next credit card due" figure can
  never silently disagree.

## Charts

- **Income/cost series are re-stepped away from `--positive`/`--negative`.** The
  product's semantic green/red pair sits at nearly the same lightness, which
  collapses to **ΔE 4.5 under deuteranopia** — a red-green colourblind reader
  cannot tell an income bar from a cost bar. `--chart-income` / `--chart-cost`
  keep the green/red *meaning* but widen the lightness gap, lifting the pair to
  ΔE ~18 while passing the lightness band, chroma floor, and normal-vision floor
  in both light and dark (dark steps are re-validated against the dark surface,
  not flipped). Identity never rests on colour alone: the two-series legend is
  always present and the tooltip names each series.

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

## Animation: `motion` + Magic UI, used sparingly

- **`motion` (v12) is a runtime dependency**, in `dependencies` (not `dev`) like
  everything else cPanel's production install must see. Nothing in
  `DEPLOYMENT.md` argues against it: the constraints there are `--webpack` (a
  symlink/Turbopack issue), build-time packages needing to survive a
  `NODE_ENV=production` install, and no workspaces. A client-side animation
  library touches none of that.
- **Magic UI components are vendored, not wrapped** — `npx shadcn add <url>`
  copies source into `src/components/ui/`. They are ours to edit, and three have
  local modifications, each marked with a comment saying why:
  - `number-ticker` — dropped its hardcoded `text-black dark:text-white` (money
    is coloured by sign here) and made it render the **final** value server-side.
    Upstream ships `0` in the HTML until JS runs and the element scrolls into
    view; for a balance, that is a wrong number presented as fact, and it stays
    wrong with JS off.
  - `animated-grid-pattern` — regenerating squares moved out of a `useEffect`
    into React's "adjust state during render" pattern, because
    `react-hooks/set-state-in-effect` is an enforced error in this repo.
- **`components.json` was written by hand rather than by `shadcn init`.** Init
  rewrites `globals.css`, which would have destroyed the CVD-validated chart
  palette documented there. Re-run `md5sum` on that file after any `shadcn add`.
- **Where animation is allowed.** Hero figures (the pool number) and the
  marketing page. Not tables, not lists, not the charts — the projection chart
  and runway strip stay server-rendered SVG, since they are geometry rather than
  motion and gain nothing from a client runtime. `<Money>` stays the default;
  `<AnimatedMoney>` is opt-in for a single headline figure.

## Deferred (sensible next steps, intentionally out of scope for now)

- Optional PIN gate (schema field `AppSetting.pinHash` exists; no UI yet).
- Receipt/attachment upload (schema field `Transaction.attachmentPath` exists).
- Budgets have a schema + query + actions; a dedicated budgets screen isn't wired
  into the nav yet (reports show category spend which covers most of the need).
- Automatic materialisation of recurring occurrences on their due date (currently
  a manual "post next now"); projections already show them regardless.
