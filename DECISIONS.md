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

## Deferred (sensible next steps, intentionally out of scope for now)

- Optional PIN gate (schema field `AppSetting.pinHash` exists; no UI yet).
- Receipt/attachment upload (schema field `Transaction.attachmentPath` exists).
- Budgets have a schema + query + actions; a dedicated budgets screen isn't wired
  into the nav yet (reports show category spend which covers most of the need).
- Automatic materialisation of recurring occurrences on their due date (currently
  a manual "post next now"); projections already show them regardless.
