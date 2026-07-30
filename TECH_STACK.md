# Cashflow — Overview & Technology

A personal finance / cash-flow **forecasting** web app ("Cashflow"). Single
codebase, multi-user, with per-user encrypted financial data and a
privacy-preserving AI assistant. This page summarises what the app is and how it
works, then the technologies used, for archiving.

## What it is & its purpose

Most budgeting apps look **backwards** — they tell you what you already spent.
Cashflow looks **forwards**: its purpose is to answer *"given everything I know
is coming — salary, rent, subscriptions, credit-card bills, cheques — will my
accounts stay healthy, and how much money is actually free to spend or save?"*

It is a planning and early-warning tool for someone managing real-world
obligations (a common Gulf/UAE setup: a monthly salary, several credit cards
with different due dates, post-dated cheques, and recurring commitments). The
goal is to remove nasty surprises — a bounced cheque, an overdrawn account, a
card blown past its limit — by showing them **before** they happen.

## The idea behind it

- **A single forward timeline.** Every known future money movement — recurring
  income and costs, credit-card statements, post-dated cheques, provisions
  (savings goals with a due date), and one-off scheduled items — is projected
  onto one day-by-day timeline of account balances.
- **"Free savings" is what's truly yours.** Money sitting in an account isn't
  all spendable; some of it is already promised to this month's bills. The app
  reasons in **salary cycles** (e.g. the 25th to the 24th) and reports only the
  surplus a salary can't already account for as genuinely *free*.
- **Credit cards are loans, not cash.** A card charge doesn't leave you when you
  swipe it — it comes due on the card's statement date. The app models each
  card's cycle so charges hit the forecast on the day the bill is actually paid.
- **Privacy is structural, not a promise.** Financial data is encrypted per user
  so that even the operator can't read it, and the AI assistant only ever sees
  codenames, never real names or numbers.

## How it works (core logic)

- **Projection engine.** A pure function folds the current (posted) balance of
  each account forward across a horizon, applying each future event on its date.
  It records, per account, the first day it goes negative, the first day it
  breaches its safety buffer, and its lowest point — which become the app's
  **warnings**.
- **Recurrence expansion.** Recurring rules (weekly / monthly / yearly / every-N-
  days, with optional end date or occurrence count) are expanded into concrete
  dated occurrences that feed the timeline.
- **Credit-card statement cycles.** For each card, charges between two due dates
  form one statement, billed as a single repayment on the closing due date;
  back-dated and future-dated charges are placed in the correct cycle. This
  produces each card's current "Total Amount Due".
- **Salary-period / free-savings model.** Within a salary cycle, the salary is
  reserved against that cycle's committed costs (card bills, recurring costs,
  cheques, provisions due); only the surplus is added to free savings, and any
  shortfall is drawn from it. Non-salary income is treated as free savings
  immediately.
- **Recurring income "debit".** Projected income stays a forecast until the user
  confirms it landed by pressing *Debit* on that occurrence — which posts it to
  the real balance. Once debited, it is excluded from the forecast so the same
  money is never counted twice.
- **Notifications.** The forward-looking warnings (account going negative, below
  buffer, a cheque that may bounce), plus "income ready to debit" and
  "account recovering", are surfaced as acknowledgeable notifications whose
  dismissal is stored per user.
- **Everything financial is computed in integer *minor units*** (e.g. fils/
  cents) to avoid floating-point rounding errors, and the core engines are pure
  and unit-tested.

## At a glance

| Layer | Technology |
|---|---|
| Framework | **Next.js 16** (App Router, React Server Components, Server Actions) |
| UI runtime | **React 19** |
| Language | **TypeScript 5** (strict) |
| Database | **PostgreSQL** (hosted on **Neon**), accessed via **Prisma 6** ORM |
| Styling | **Tailwind CSS v4** + **shadcn/ui** components on **Radix UI** primitives |
| Charts | **Recharts 3** |
| AI assistant | **Claude** (Anthropic Messages API), model `claude-haiku-4-5`, via a hand-rolled **MCP** server |
| Testing | **Vitest 4** (pure-logic unit tests) |
| Hosting | **cPanel / Phusion Passenger** (Node), custom `server.js` |

## Framework & runtime

- **Next.js 16** with the **App Router**. Pages are React Server Components that
  read data directly on the server; mutations run through **Server Actions**
  (`"use server"`) rather than a separate REST layer. A middleware ("Proxy")
  guards authenticated routes.
- Production build uses the **webpack** builder (`next build --webpack`) for
  compatibility with the Passenger host; the app is started from a custom
  `server.js` (`npm start`).
- API route handlers back two things the UI streams from: `/api/chat`
  (streaming assistant) and `/api/mcp` (the JSON-RPC tool server).

## Data & persistence

- **Prisma 6** as the type-safe ORM and migration tool (`prisma migrate`).
- **PostgreSQL** on **Neon** (serverless Postgres). A pooled connection is used
  at runtime; an unpooled direct URL is used for migrations.
- For local/offline development the schema can run on **PGlite** (an embedded
  WASM Postgres) via the `@electric-sql/pglite` dev dependency.

## Security & privacy

- **Per-user encryption at rest.** Every sensitive financial field (amounts,
  names, notes) is stored as **AES-256-GCM** ciphertext, encrypted with a
  per-user **Data Encryption Key (DEK)**. The DEK is wrapped by a key derived
  from the user's password using **scrypt**, so no one — not another user, not
  an admin, not someone with a database dump — can read a user's data without
  that user's password. A one-time recovery code provides a survivable
  "forgot password" path.
- Only low-sensitivity columns (ids, types, dates, flags) stay plaintext, so
  the database can still filter and sort without decrypting.
- **Sessions** are opaque cookie tokens (only their hash is stored); the DEK is
  re-wrapped with a server key for the session's lifetime.
- **Auth & email**: password hashing with scrypt; verification / recovery emails
  via **Nodemailer** over SMTP.
- **Validation**: all input is validated with **Zod** before it reaches the
  database.

## AI assistant (privacy-preserving)

- Chat is powered by the **Claude** API (Anthropic Messages endpoint), streamed to a
  floating chat widget via a `ReadableStream`.
- The app exposes an in-process **MCP** (Model Context Protocol) server —
  JSON-RPC 2.0 over HTTP — giving the model read-only tools over the user's data.
- A **tokenizer** replaces real account names, cards and payees with opaque
  codenames (e.g. `ACCT_001`, `CARD_001`, `PAYEE_001`) before anything leaves the
  server; the model reasons over codenames and the server substitutes the real
  names back into the reply. Conversations are **ephemeral** — nothing is stored
  server-side and history lives only in the browser.

## UI & forms

- **Tailwind CSS v4** for styling; **shadcn/ui** components built on **Radix UI**
  primitives (dialogs, dropdowns, selects, tabs, tooltips, etc.).
- **lucide-react** icons, **Recharts** for the projection/cash-flow charts,
  **next-themes** for light/dark mode, **cmdk** for the command palette, and
  **sonner** for toasts.
- Forms use **react-hook-form** with **Zod** resolvers; dates handled with
  **date-fns**.

## Core domain logic & testing

- The financial engines — balance projection, credit-card statement cycles,
  salary-period free-savings, cash-flow timeline and notifications — are written
  as **pure, dependency-light TypeScript modules** (only `date-fns`), which keeps
  all money logic in one auditable place.
- These modules are covered by **Vitest** unit tests (the suite runs entirely on
  pure inputs, no database).

## Tooling & deployment

- **TypeScript** throughout; **ESLint 9** (`eslint-config-next`) for linting;
  **tsx** for running TypeScript scripts (seeding, maintenance).
- Deployed to **cPanel** with **Phusion Passenger** serving the Node process.
  Secrets (database URL, server/session keys, SMTP, Anthropic API key) are supplied
  via environment variables and must match between environments, or encrypted
  data becomes unreadable.
