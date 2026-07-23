// Central encryption <-> decryption mapping for user-owned rows.
//
// Every read decrypts through here right after fetching; every write encrypts
// through here just before persisting. Downstream code (projection, balances,
// view models) keeps working with plain numbers/strings and never sees
// ciphertext. A `dek` (per-user Data Encryption Key) is required for all of it.

import { decrypt, encrypt } from "@/lib/crypto";
import { parseTags } from "@/lib/utils";

// ── Primitives ────────────────────────────────────────────────────────────────

export const encStr = (v: string, dek: Buffer) => encrypt(v, dek);
export const decStr = (v: string, dek: Buffer) => decrypt(v, dek);
export const encInt = (v: number, dek: Buffer) => encrypt(String(Math.trunc(v)), dek);
export const decInt = (v: string, dek: Buffer) => {
  const n = Number(decrypt(v, dek));
  return Number.isFinite(n) ? n : 0;
};
export const encNull = (v: string | null | undefined, dek: Buffer) =>
  v == null || v === "" ? null : encrypt(v, dek);
export const decNull = (v: string | null | undefined, dek: Buffer) =>
  v == null ? null : decrypt(v, dek);

// ── Row decryptors ────────────────────────────────────────────────────────────
// Each returns the shape the app used before encryption existed.

type Raw = Record<string, unknown>;

export function decryptAccount(a: Raw, dek: Buffer) {
  return {
    id: a.id as string,
    userId: a.userId as string,
    name: decStr(a.nameEnc as string, dek),
    type: a.type as string,
    currency: a.currency as string,
    openingBalanceMinor: decInt(a.openingBalanceEnc as string, dek),
    safetyBufferMinor: decInt(a.safetyBufferEnc as string, dek),
    creditLimitMinor: a.creditLimitEnc ? decInt(a.creditLimitEnc as string, dek) : null,
    bankName: a.bankNameEnc ? decStr(a.bankNameEnc as string, dek) : null,
    cardLast4: a.cardLast4Enc ? decStr(a.cardLast4Enc as string, dek) : null,
    color: a.color as string,
    isArchived: a.isArchived as boolean,
    isSystem: (a.isSystem as boolean | undefined) ?? false,
    dueDay: (a.dueDay as number | null | undefined) ?? null,
    sortOrder: a.sortOrder as number,
    createdAt: a.createdAt as Date,
    updatedAt: a.updatedAt as Date,
  };
}
export type DecryptedAccount = ReturnType<typeof decryptAccount>;

export function decryptCategory(c: Raw, dek: Buffer) {
  return {
    id: c.id as string,
    userId: c.userId as string,
    name: decStr(c.nameEnc as string, dek),
    kind: c.kind as string,
    icon: c.icon as string,
    color: c.color as string,
    parentId: (c.parentId as string | null) ?? null,
    sortOrder: c.sortOrder as number,
    createdAt: c.createdAt as Date,
    updatedAt: c.updatedAt as Date,
  };
}
export type DecryptedCategory = ReturnType<typeof decryptCategory>;

export function decryptTransaction(t: Raw, dek: Buffer) {
  const account = t.account ? decryptAccount(t.account as Raw, dek) : null;
  const transferAccount = t.transferAccount ? decryptAccount(t.transferAccount as Raw, dek) : null;
  const category = t.category ? decryptCategory(t.category as Raw, dek) : null;
  const tagsJson = t.tagsEnc ? decStr(t.tagsEnc as string, dek) : "[]";
  return {
    id: t.id as string,
    userId: t.userId as string,
    type: t.type as string,
    method: (t.method as string | undefined) ?? "account",
    amountMinor: decInt(t.amountEnc as string, dek),
    currency: t.currency as string,
    date: t.date as Date,
    note: t.noteEnc ? decStr(t.noteEnc as string, dek) : null,
    tags: tagsJson,
    tagList: parseTags(tagsJson),
    status: t.status as string,
    accountId: t.accountId as string,
    transferAccountId: (t.transferAccountId as string | null) ?? null,
    categoryId: (t.categoryId as string | null) ?? null,
    recurringRuleId: (t.recurringRuleId as string | null) ?? null,
    account,
    transferAccount,
    category,
    createdAt: t.createdAt as Date,
  };
}
export type DecryptedTransaction = ReturnType<typeof decryptTransaction>;

export function decryptRecurring(r: Raw, dek: Buffer) {
  const account = r.account ? decryptAccount(r.account as Raw, dek) : null;
  const category = r.category ? decryptCategory(r.category as Raw, dek) : null;
  return {
    id: r.id as string,
    userId: r.userId as string,
    name: decStr(r.nameEnc as string, dek),
    type: r.type as string,
    frequency: r.frequency as string,
    interval: r.interval as number,
    startDate: r.startDate as Date,
    endDate: (r.endDate as Date | null) ?? null,
    occurrenceCount: (r.occurrenceCount as number | null) ?? null,
    nextRunDate: r.nextRunDate as Date,
    isActive: r.isActive as boolean,
    amountMinor: decInt(r.amountEnc as string, dek),
    currency: r.currency as string,
    accountId: r.accountId as string,
    categoryId: (r.categoryId as string | null) ?? null,
    note: r.noteEnc ? decStr(r.noteEnc as string, dek) : null,
    account,
    category,
  };
}
export type DecryptedRecurring = ReturnType<typeof decryptRecurring>;

export function decryptPdc(p: Raw, dek: Buffer) {
  const account = p.account ? decryptAccount(p.account as Raw, dek) : null;
  return {
    id: p.id as string,
    userId: p.userId as string,
    direction: p.direction as string,
    counterparty: decStr(p.counterpartyEnc as string, dek),
    amountMinor: decInt(p.amountEnc as string, dek),
    currency: p.currency as string,
    issueDate: p.issueDate as Date,
    dueDate: p.dueDate as Date,
    bankName: p.bankNameEnc ? decStr(p.bankNameEnc as string, dek) : null,
    chequeNumber: p.chequeNumberEnc ? decStr(p.chequeNumberEnc as string, dek) : null,
    status: p.status as string,
    notes: p.notesEnc ? decStr(p.notesEnc as string, dek) : null,
    accountId: p.accountId as string,
    recurringRuleId: (p.recurringRuleId as string | null) ?? null,
    clearedTransactionId: (p.clearedTransactionId as string | null) ?? null,
    account,
    createdAt: p.createdAt as Date,
  };
}
export type DecryptedPdc = ReturnType<typeof decryptPdc>;

export function decryptAllocation(a: Raw, dek: Buffer) {
  return {
    id: a.id as string,
    provisionId: a.provisionId as string,
    amountMinor: decInt(a.amountEnc as string, dek),
    date: a.date as Date,
    note: a.noteEnc ? decStr(a.noteEnc as string, dek) : null,
    accountId: (a.accountId as string | null) ?? null,
  };
}

export function decryptProvision(p: Raw, dek: Buffer) {
  const account = p.account ? decryptAccount(p.account as Raw, dek) : null;
  const allocations = Array.isArray(p.allocations)
    ? (p.allocations as Raw[]).map((a) => decryptAllocation(a, dek))
    : [];
  return {
    id: p.id as string,
    userId: p.userId as string,
    name: decStr(p.nameEnc as string, dek),
    targetMinor: decInt(p.targetEnc as string, dek),
    currency: p.currency as string,
    dueDate: (p.dueDate as Date | null) ?? null,
    priority: p.priority as number,
    status: p.status as string,
    accountId: (p.accountId as string | null) ?? null,
    account,
    allocations,
    createdAt: p.createdAt as Date,
  };
}
export type DecryptedProvision = ReturnType<typeof decryptProvision>;

export function decryptBudget(b: Raw, dek: Buffer) {
  return {
    id: b.id as string,
    userId: b.userId as string,
    categoryId: b.categoryId as string,
    month: b.month as string,
    plannedMinor: decInt(b.plannedEnc as string, dek),
    category: b.category ? decryptCategory(b.category as Raw, dek) : null,
  };
}
