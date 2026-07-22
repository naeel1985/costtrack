# Phase 0 — Mobile Audit & Decisions

**Status:** audit only. No application code was written in this phase.
**Goal:** map the current server surface, confirm the mobile blockers, and get four
decisions answered before any implementation.

**Bottom line up front:** the app is well-positioned for a mobile client. All money
logic already lives in pure, portable engines; all sensitive data is server-side
encrypted; auth already stores a hashed token + a server-sealed DEK per session row.
The one hard requirement is a **real HTTP/JSON API** (Server Actions and the RSC read
path are not consumable from React Native), plus a **bearer-token issuance path** next
to the existing cookie path. Neither requires touching the crypto or the engines.

---

## 0.1 — Current surface area

### A. Server Actions, grouped by domain

All actions are Next.js Server Actions (`"use server"`), invoked today only from the
web client via the RSC action protocol. Unless noted, the output is
`ActionResult = { ok: true; id?: string } | { ok: false; error: string }` and the
input is validated by the named Zod schema in `src/lib/schemas.ts`. **M** = mutates,
**R** = read-only.

#### Accounts — `src/server/actions.ts`
| Action | Input | Output | Kind |
|---|---|---|---|
| `saveAccount` | `accountSchema` (id?, name, type, currency, openingBalance, safetyBuffer, color, dueDay?, creditLimit?) | ActionResult (id) | M |
| `archiveAccount` | `(id: string, archived: boolean)` | ActionResult | M |
| `deleteAccount` | `(id: string)` | ActionResult | M |

#### Categories — `actions.ts`
| Action | Input | Output | Kind |
|---|---|---|---|
| `saveCategory` | `categorySchema` (id?, name, kind, icon, color, parentId?) | ActionResult (id) | M |
| `deleteCategory` | `(id: string)` | ActionResult | M |

#### Transactions / cards — `actions.ts`
| Action | Input | Output | Kind |
|---|---|---|---|
| `saveTransaction` | `transactionSchema` (id?, type, method, amount, currency, date, accountId?, transferAccountId?, categoryId?, note?, tags[]) | ActionResult (id) | M |
| `deleteTransaction` | `(id: string)` | ActionResult | M |
| `recordCreditCardPayment` | `{ fromAccountId, cardId?, amount, currency, date, note? }` | ActionResult | M |

#### Recurring rules & the income "debit" — `actions.ts`
| Action | Input | Output | Kind |
|---|---|---|---|
| `saveRecurring` | `recurringSchema` (id?, name, type, frequency, interval, startDate, endDate?, occurrenceCount?, amount, currency, accountId, categoryId?, note?) | ActionResult (id) | M |
| `toggleRecurring` | `(id: string, active: boolean)` | ActionResult | M |
| `deleteRecurring` | `(id: string)` | ActionResult | M |
| `postRecurringOccurrence` | `(id: string)` | ActionResult | M |
| `debitRecurringOccurrence` | `{ ruleId, date, amount? }` | ActionResult | M |
| `undoRecurringOccurrence` | `{ ruleId, date }` | ActionResult | M |

#### Notifications — `actions.ts`
| Action | Input | Output | Kind |
|---|---|---|---|
| `acknowledgeNotifications` | `(keys: string[])` | ActionResult | M |

#### Cheques (PDCs) — `actions.ts`
| Action | Input | Output | Kind |
|---|---|---|---|
| `savePdc` | `pdcSchema` | ActionResult (id) | M |
| `createPdcBatch` | `pdcBatchSchema` (…count, firstDueDate, createRecurringRule) | ActionResult | M |
| `setPdcStatus` | `pdcStatusSchema` (id, status, clearDate?) | ActionResult | M |
| `deletePdc` | `(id: string)` | ActionResult | M |

#### Provisions — `actions.ts`
| Action | Input | Output | Kind |
|---|---|---|---|
| `saveProvision` | `provisionSchema` | ActionResult (id) | M |
| `addAllocation` | `allocationSchema` | ActionResult | M |
| `deleteAllocation` | `(id: string)` | ActionResult | M |
| `deleteProvision` | `(id: string)` | ActionResult | M |

#### Budgets / rates / settings — `actions.ts`
| Action | Input | Output | Kind |
|---|---|---|---|
| `upsertBudget` | `budgetSchema` (categoryId, month, planned) | ActionResult | M |
| `deleteBudget` | `(categoryId: string, month: string)` | ActionResult | M |
| `saveRate` | `rateSchema` (base, quote, rate) | ActionResult | M |
| `deleteRate` | `(id: string)` | ActionResult | M |
| `updateSettings` | `settingsSchema` (baseCurrency, defaultBuffer, theme) | ActionResult | M |

#### Auth — `src/server/auth-actions.ts`
Output is `AuthResult = { ok: true; message?; recoveryCode? } | { ok: false; error }`
unless noted.
| Action | Input | Output | Kind | Notes |
|---|---|---|---|---|
| `registerUser` | `registerSchema` | AuthResult (recoveryCode) | M | creates user + DEK + default categories, emails verify link |
| `loginUser` | `loginSchema` | AuthResult | M | **sets the `cf_session` cookie** (side-effect, see blockers) |
| `logout` | — | `redirect("/login")` | M | clears cookie + deletes session row |
| `requestPasswordReset` | `forgotPasswordSchema` | AuthResult (generic) | M | emails a 6-digit code |
| `resetPassword` | `resetPasswordSchema` (email, code, recoveryCode, password) | AuthResult (new recoveryCode) | M | recovers DEK via recovery code, re-wraps, kills sessions |
| `createRecoveryCode` | — | AuthResult (recoveryCode) | M | uses live-session DEK |
| `updateProfile` | `{ fullName }` | AuthResult | M | plaintext identity field |
| `verifyEmailToken` | `(token: string)` | AuthResult | M | — |
| `resendVerification` | `{ email }` | AuthResult | M | — |

#### Admin — `src/server/admin-actions.ts`
| Action | Input | Output | Kind |
|---|---|---|---|
| `setUserActive` | `(userId, active)` | AdminResult | M (admin-gated) |

#### Read-shaped action — `src/server/projection-actions.ts`
| Action | Input | Output | Kind |
|---|---|---|---|
| `projectSeries` | `(horizonDays, whatIf: WhatIfInput[])` | `SerializedProjection` (points[], warnings[], accounts[]) | **R** — pure projection incl. what-if scenarios |

### B. Server reads (RSC query layer) and which page uses them

Reads live in `src/server/queries.ts` (+ `admin.ts`). Each resolves `requireUser()`,
scopes to the user, decrypts, and returns plain numbers/strings. **These are the reads
that need an HTTP equivalent for mobile.**

| Query | Returns (summary) | Used by |
|---|---|---|
| `getDashboard(horizonDays)` | net worth, month income/expense, savings rate, runway, projection result, obligations, salary period, cash-flow timeline, credit-card owed | `/dashboard` |
| `projectSeries(90)` | serialized day-by-day projection + warnings | `/dashboard` |
| `getAccountsWithBalances(includeArchived?)` | accounts + computed `balanceMinor` | `/accounts`, `/income`, `/costs`, `/cheques`, `/provisions`, **(app) layout** |
| `getCategories()` | decrypted categories | `/income`, `/costs`, `/cheques`, `/settings`, layout |
| `getRecurringRules()` | decrypted recurring rules | `/income`, `/costs` |
| `getRecurringIncomeSchedule()` | per-occurrence income schedule w/ `debitable`/`debited` | `/income` |
| `getTransactions(filters)` | posted transactions (≤500) | `/income`, `/costs` |
| `getNotifications()` | live, unacknowledged notifications | **(app) layout (every page)** |
| `getUpcomingObligations(horizonDays)` | PDCs + recurring + provisions due | `/dashboard` (via getDashboard) |
| `getPdcs(filters)` | decrypted cheques | `/cheques` |
| `getProvisions()` | provisions + funding progress | `/provisions` |
| `getReportData(monthsBack)` | monthly income/expense, by-category, top payees | `/reports` |
| `getBudgets(month)` | budgets + actuals by category | (budgets UI) |
| `getRates()` | FX rates | `/settings` |
| `getSettings()` | app settings row | `/accounts`, `/settings` |
| `getAdminData()` | user list + login attempts — **identity only, no financial data** | `/admin` |

**Page → data quick map**
- `/` , `/packages` — public marketing, no user reads.
- `/login`, `/register`, `/forgot-password` — `getAuth()` (redirect if already in).
- `/verify`, `/verify-email` — call `verifyEmailToken` / `resendVerification`.
- `/dashboard` — `getDashboard(90)` + `projectSeries(90)`.
- `/income` — `getTransactions(income)`, `getCategories`, `getAccountsWithBalances`, `getRecurringRules`, `getRecurringIncomeSchedule`.
- `/costs` — same as income minus the income schedule.
- `/accounts` — `getAccountsWithBalances(true)`, `getSettings`.
- `/cheques` — `getPdcs`, `getAccountsWithBalances`, `getCategories`.
- `/provisions` — `getProvisions`, `getAccountsWithBalances`.
- `/reports` — `getReportData(monthsBack)`.
- `/settings` — `getSettings`, `getRates`, `getCategories`.
- `/admin` — `getAdminData` (admin only).
- **(app) layout (wraps all app pages)** — `getAccountsWithBalances`, `getCategories`, `getNotifications`.

### C. Auth flow (exact)

- **Registration** (`registerUser`): validate → check email/username uniqueness →
  `hashPassword` (scrypt) → `createWrappedDek(password)` mints a random 256-bit DEK,
  wrapped by a scrypt-derived KEK (`dekWrapped`, `dekSalt`) → also wrapped under a
  one-time **recovery code** (`dekRecoveryWrapped`, `dekRecoverySalt`) → create user +
  default settings + default categories (names encrypted with the DEK) → email a verify
  link (24 h). **The recovery code is returned once and never stored.**
- **Email verification** (`verifyEmailToken`): token is looked up by SHA-256 hash;
  sets `emailVerified`. Login is blocked for unverified non-admins.
- **Login** (`loginUser`): lockout check (5 fails / 15 min per identifier, configurable)
  → find user by email/username → `verifyPassword` (constant-time scrypt) → active &
  verified checks → `unwrapDek(password, …)` recovers the DEK → **`createSession`**.
- **Session issuance** (`createSession`, `src/server/auth.ts`): generate a 32-byte
  URL-safe token → store `tokenHash = sha256(token)` and
  `encDek = sealDekForSession(dek)` (DEK re-encrypted with the **server key**) plus
  ip/userAgent/expiry (**7 days**) → set cookie.
- **Cookie**: name **`cf_session`**, `httpOnly`, `sameSite: lax`, `secure` in
  production, `path=/`, `expires` = +7 days. The raw token lives only in the cookie;
  the DB stores its hash.
- **DEK during a session**: never re-derived from the password. On each request
  `getAuth()` looks up the session by token hash, checks expiry + `user.isActive`, then
  `openDekFromSession(encDek)` unwraps the DEK with the server key. `getAuth` is wrapped
  in React `cache` (one DB hit per request). `requireUser()` adds the verified-email
  gate + `/login` redirect; `requireAdmin()` gates the admin area (404 to non-admins).
- **Renewal**: none — sessions are fixed 7-day; no sliding expiry or refresh token
  today. (Mobile will want refresh; see Decision 1 notes.)
- **Logout** (`logout` / `destroySession`): delete the session row by token hash +
  clear cookie.
- **Password reset** (`requestPasswordReset` → `resetPassword`): email a 6-digit code
  (15 min, previous codes invalidated) → verify code → **`unwrapDekWithRecovery`** with
  the user's recovery code → `rewrapDek` under the new password + mint a fresh recovery
  wrapping → update user, consume token, **delete all sessions**. Without the recovery
  code the DEK is unrecoverable by design.
- **Server key**: `SERVER_KEY` env, 32 bytes base64. If it rotates or is wrong,
  `openDekFromSession` throws and the session is treated as invalid (forces re-login).

### D. Prisma schema — ciphertext vs plaintext

**Ciphertext columns** (`*Enc`, base64 AES-256-GCM under the per-user DEK):
- `Account.nameEnc`, `openingBalanceEnc`, `safetyBufferEnc`, `creditLimitEnc`
- `Category.nameEnc`
- `Transaction.amountEnc`, `noteEnc`, `tagsEnc`
- `RecurringRule.nameEnc`, `amountEnc`, `noteEnc`
- `PDC.counterpartyEnc`, `amountEnc`, `bankNameEnc`, `chequeNumberEnc`, `notesEnc`
- `Provision.nameEnc`, `targetEnc`; `ProvisionAllocation.amountEnc`, `noteEnc`
- `Budget.plannedEnc`
- On `User`: `passwordHash`, `dekWrapped`, `dekSalt`, `dekRecoveryWrapped`,
  `dekRecoverySalt`; on `Session`: `encDek`.

**Plaintext columns** (low-sensitivity, needed for querying/sorting): all ids and
foreign keys, `type`, `method`, `status`, `direction`, `frequency`, `interval`,
`currency`, all dates, `dueDay`, `isSystem`, `isArchived`, flags, `sortOrder`,
`NotificationAck.key`, and **user identity** (`email`, `username`, `fullName`, `phone`,
`role`) — identity is deliberately admin-visible; only financial *data* is encrypted.

**Encryption envelope formats** (`src/lib/crypto.ts`):
- Field/byte ciphertext: **`v1:<iv_b64>:<tag_b64>:<ciphertext_b64>`** — AES-256-GCM,
  random **12-byte IV** per record, 16-byte GCM auth tag.
- Password hash: **`scrypt$N$r$p$<salt_b64>$<hash_b64>`**.
- KDF params everywhere: **scrypt N=16384, r=8, p=1, keyLen=32**. DEK wrapping KEK =
  `scrypt(password, dekSalt_hex)`; session seal = `encryptBytes(dek, SERVER_KEY)`.
- Tokens (session/email): `randomBytes(32).base64url`, stored as `sha256` hex.

### E. Pure engines, tests, and React-Native (Hermes) hazards

**Engine modules** (source of truth for all money logic) and their Vitest suites:
`projection.ts`, `card-cycle.ts`, `cashflow-timeline.ts`, `salary-period.ts`,
`notifications.ts`, `money.ts`, `initials.ts` (+ `*.test.ts`). ~98 tests, run entirely
on pure inputs (no DB).

**Runtime-dependency scan (for Hermes portability):**
| Concern | Result |
|---|---|
| Node builtins (`crypto`, `Buffer`, `fs`) in engines | **None.** Confined to `crypto.ts`, `db.ts`, and server code — all behind the API boundary. |
| `process.env` in engines | **None.** Only `db.ts`, `crypto.ts`, `groq.ts`, `auth.ts` (server). |
| dynamic `import()` | **None** in `src/lib`. |
| `Intl` dependence | **Yes — the one portability caveat.** `money.ts::formatMoney` uses `Intl.NumberFormat`; `projection.ts::formatForMessage` (warning strings) also uses it; `notifications.ts` uses `formatMoney` transitively. |

**Implication:** the engines can be lifted into a shared package almost verbatim. The
only thing to verify on Hermes is `Intl.NumberFormat` (currency grouping/decimals).
Modern React Native ships Hermes with Intl enabled on Android and iOS, but it must be
confirmed on the target RN version; otherwise provide a tiny manual grouping fallback in
`formatMoney`. **No float/`parseFloat` on amounts anywhere** — confirmed; `toMinor`
does the only string→number conversion and immediately rounds to an integer.

### F. `/api/chat` and `/api/mcp`

**`POST /api/chat`** (`dynamic = "force-dynamic"`)
- **Auth:** `getAuth()` (cookie); 401 if none, 403 if email unverified, 503 if
  `GROQ_API_KEY` unset.
- **Request:** `{ messages: { role: "user"|"assistant"; content: string }[] }`
  (≤40 messages, each ≤6000 chars; last must be `user`).
- **Response:** a streamed `ReadableStream` of **raw UTF-8 text chunks** —
  **not SSE, not framed JSON**, just concatenated plaintext. Headers:
  `Content-Type: text/plain; charset=utf-8`, `Cache-Control: no-store`,
  `X-Accel-Buffering: no`, `X-Robots-Tag: noindex`. Pre-stream errors are JSON
  `{ error }` + status; a mid-stream failure appends an apology sentence as text.
- **Privacy:** history is re-tokenized server-side before hitting Groq
  (`openai/gpt-oss-20b`, `temperature 0.3`, `stream: true`); the reply is de-tokenized
  on a word boundary as it streams out. Nothing is persisted.

**`POST /api/mcp`** — JSON-RPC 2.0 (`dynamic = "force-dynamic"`)
- **Auth:** `getAuth()` (cookie); 401 → JSON-RPC error `-32001`.
- **Methods:** `initialize` (protocol `2024-11-05`), `ping`, `tools/list`, `tools/call`.
  Notifications (no `id`) → HTTP 202.
- **Tools** (identical to the in-app assistant, all tokenized): `list_accounts`,
  `get_credit_cards`, `list_due_payments`, `spending_summary`, `search_transactions`.
  Amounts in major units, dates `yyyy-MM-dd`, names as `ACCT_/CARD_/PAYEE_` tokens.

**`GET /api/export`** (`?format=json|csv`) and **`POST /api/import`** (multipart
`{ file, mode }`) — both cookie-authed file endpoints.

### G. `server.js` / Passenger

- `server.js` is a plain Node `http` server that boots Next in production and lets
  Phusion Passenger intercept `.listen()`. No app-level response buffering, no CORS, no
  timeout config in this file.
- **Streaming risk:** Passenger (and any fronting nginx/Apache on cPanel) may **buffer
  responses**, which would break `/api/chat` streaming. The route already sets
  `X-Accel-Buffering: no` (an nginx hint) but Passenger buffering is separate — must be
  verified in production, and may need `PassengerBufferResponse off` / raising the
  response-buffer watermark, or serving the stream from a direct Node port.
- **Long-lived connections:** cPanel/Passenger may impose a max request time that could
  cut a long tool-round stream. Verify `PassengerMaxRequestTime` (0 = unlimited).
- **CORS:** none configured. **Note:** React Native's native `fetch` is *not* subject to
  browser CORS, so a native client needs no CORS headers. CORS only becomes relevant if a
  browser-based (Expo web / PWA) client is added later.

---

## 0.2 — Blocker confirmations

**1. "Server Actions are not callable from React Native → a real HTTP API is required."**
**CONFIRMED.** Server Actions are dispatched over Next's RSC action protocol: a POST
carrying a `Next-Action` header with a build-generated **action id** and RSC-serialized
arguments, returning an RSC stream — not a stable, documented JSON contract, and the ids
change per build. They are unusable as a mobile API. **A dedicated versioned REST/JSON
API (`/api/v1/*`) is required.** The good news: every action already delegates to
thin, testable logic (Zod schema + Prisma + crypto-map), so the API handlers are mostly
a new transport layer over existing functions.

**2. "Session auth is cookie-based; mobile needs bearer tokens → a second issuance path."**
**CONFIRMED, and it extends cleanly.** The `Session` model already stores
`tokenHash` + server-sealed `encDek`; only *transport* is cookie-specific. Mobile needs:
(a) a login endpoint that returns the **raw token as a bearer** (no `Set-Cookie`), and
(b) a `getAuth` variant that reads `Authorization: Bearer <token>` in addition to the
cookie. The DEK-sealing/unsealing is transport-agnostic and unchanged. Recommend also
adding **refresh/rotation** for mobile (the current fixed 7-day session with no renewal
is fine for web but weak for a long-lived app) and a **token-scoped logout**.

**3. "Hermes has no Node crypto → engine/shared code touching it must be isolated."**
**CONFIRMED, and already satisfied.** No engine or shared-candidate module imports
`crypto`/`Buffer`/`fs`. Under Decision 1(A) the device never decrypts, so it never needs
scrypt/AES at all. **The only Hermes caveat is `Intl` (formatting), not crypto** — see
§0.1E.

---

## 0.3 — Decisions

**RESOLVED (2026-07-22).** All four confirmed on the recommended path:
1. **Decryption:** (A) **server-side** — device never decrypts; DEK stays server-side per session.
2. **Repo layout:** (A) **npm-workspaces monorepo** — gated on proving the Passenger `next build --webpack` survives; extract `packages/core` first.
3. **Offline:** (B) **encrypted read-only cache**, off by default, biometric-gated, hard-wipe on logout.
4. **v1 scope:** **accept the proposed cut** (reads/forecast + notifications + streaming assistant + debit-income / acknowledge / add one-off cost).

Full rationale for each is retained below.



### Decision 1 — Where does decryption happen on mobile?
**Recommendation: (A) server-side, same as web.**
The server unwraps the session DEK and returns plaintext JSON over TLS. This is the
*exact* trust model the app already advertises ("operator can't read data at rest
without the password"); the DEK already lives server-side for the session's lifetime, so
nothing about the guarantee changes. (B) end-to-end would require a scrypt+AES
implementation on Hermes (a native module such as `react-native-quick-crypto`, or a WASM
scrypt), on-device key custody, and exact KDF-parameter parity — large build, severe
failure modes (lost device key = unreadable data), small marginal benefit over (A).
**Recommend A now; revisit B only if on-device zero-knowledge becomes a selling point.**

### Decision 2 — Repo layout.
**Recommendation: (A) npm-workspaces monorepo** — `apps/web`, `apps/mobile`,
`packages/core` (the pure engines + shared types + `money`), `packages/api-client`
(typed client) — **but gated on proving the Passenger production build survives the
restructure.** The main risk is `next build --webpack` + the Prisma engine under
hoisted `node_modules` when run by cPanel/Passenger.
**Proposed de-risking order:** (1) extract `packages/core` first — it has **zero Node
dependencies**, so it is safe to share and easy to test; (2) restructure `apps/web` and
run `next build --webpack` + a real Passenger smoke deploy **before** adding mobile.
If the hoisted layout breaks the build, fall back to npm `nohoist`/keeping web deps
local, or Decision 2(B) (separate mobile repo consuming `core` as a git dependency).
*(Repo currently uses npm — `package-lock.json`.)*

### Decision 3 — Offline behaviour.
**Recommendation: (B) encrypted local cache, read-only, off by default, wiped on logout.**
Agreed with your instinct — a forecast is exactly what you want on a plane. Cache only
the **derived read models** (projection series, balances, notifications), encrypted at
rest via SQLCipher or encrypted MMKV, keyed from the Android Keystore / iOS Keychain,
behind an explicit opt-in setting and a biometric gate, with a **hard wipe on logout /
biometric failure / token invalidation**. No raw ciphertext and no keys are cached.

### Decision 4 — Scope of v1 (Android).
**Recommendation — accept the cut, with a concrete list:**

*In v1 (read + the highest-frequency writes):*
- **Reads/forecast:** dashboard (incl. projection + warnings), accounts & card status,
  income schedule, cheques, provisions, reports summary.
- **Notifications:** list + `acknowledgeNotifications`.
- **Assistant:** streaming chat (`/api/chat`) — needs the Passenger streaming check first.
- **Mutations (3–4):** `debitRecurringOccurrence`, `acknowledgeNotifications`,
  `saveTransaction` (add a one-off cost — and, near-free, a one-off income).
  *Optional stretch:* `recordCreditCardPayment`.
- **Auth:** login (bearer), logout, email-verify status, forgot-password can stay
  web-only for v1.

*Deferred to web for v1:* full CRUD of accounts/cards, recurring rules, categories,
provisions, PDC batches, budgets, rates, settings; import/export.

**Implied v1 API surface to build (Phase 1):** `POST /api/v1/auth/login|logout`,
bearer-aware `getAuth`; `GET /api/v1/dashboard`, `/accounts`, `/cards`,
`/income/schedule`, `/cheques`, `/provisions`, `/notifications`, `/reports`;
`POST /api/v1/notifications/ack`, `/income/debit`, `/transactions`; and pass-throughs for
`/api/chat` + `/api/mcp` with bearer auth. All returning the same plain JSON the queries
already produce.

---

## Phase 1 — proposed spike (small, reversible; awaiting go-ahead)
With the decisions locked, Phase 1 should prove the architecture end-to-end before
committing to the full build, in this order:
1. **Extract `packages/core`** (pure engines + types + `money`) and re-run
   `next build --webpack` + a **real Passenger smoke deploy** — this is the single
   biggest restructuring risk (Decision 2).
2. **Verify `/api/chat` streaming survives Passenger** in production (buffering +
   max-request-time). If it doesn't, resolve before building the mobile assistant.
3. **Bearer-aware `getAuth`** + `POST /api/v1/auth/login` (returns a bearer token, no
   cookie) — the minimal auth path (Decision 1A keeps decryption server-side).
4. Stand up **one read** (`GET /api/v1/dashboard`) and **one mutation**
   (`POST /api/v1/income/debit`) as the pattern for the rest of the v1 surface.
5. Confirm `Intl.NumberFormat` behaviour on the target Hermes/RN version, or add the
   fallback formatter in `money.ts`.

*End of Phase 0. Decisions resolved; no Phase 1 code until you give the go-ahead.*
