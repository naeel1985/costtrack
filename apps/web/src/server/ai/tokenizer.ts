import "server-only";
// ─────────────────────────────────────────────────────────────────────────────
// Privacy tokenizer for the AI assistant.
//
// The LLM must never see real names — account names, card names, or the people
// and companies you write cheques to. This builds a per-user, DETERMINISTIC map
// between each real entity and an opaque token (ACCT_001, CARD_002, PAYEE_003…):
//
//   • Data going TO the model is tokenised (real name -> token).
//   • The model's reply is de-tokenised (token -> real name) before you see it.
//
// It is deterministic (derived from the sorted entity ids), so tokens stay
// stable across turns without persisting anything — the chat remains stateless.
// ─────────────────────────────────────────────────────────────────────────────

import { prisma } from "@/lib/db";
import { decryptAccount, decryptPdc } from "@/server/crypto-map";

export interface Tokenizer {
  /** Token for an account/card id, or the id itself if unknown. */
  tokenForAccount(accountId: string): string;
  /** Token for a payee/counterparty name (creates a stable one if new). */
  tokenForPayee(name: string): string;
  /** Replace any known real name inside free text with its token. */
  tokenize(text: string | null | undefined): string;
  /** Replace tokens in the model's reply with the real names. */
  detokenize(text: string): string;
}

const pad = (n: number) => String(n).padStart(3, "0");
const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export async function buildTokenizer(userId: string, dek: Buffer): Promise<Tokenizer> {
  const [rawAccounts, rawPdcs] = await Promise.all([
    prisma.account.findMany({ where: { userId }, orderBy: { createdAt: "asc" } }),
    prisma.pDC.findMany({ where: { userId }, orderBy: { createdAt: "asc" } }),
  ]);

  const accountToken = new Map<string, string>(); // accountId -> token
  const reverse = new Map<string, string>(); // token -> real name
  const nameToToken: { name: string; token: string }[] = [];

  let acctN = 0;
  let cardN = 0;
  for (const raw of rawAccounts) {
    const a = decryptAccount(raw, dek);
    const token = a.type === "credit_card" ? `CARD_${pad(++cardN)}` : `ACCT_${pad(++acctN)}`;
    accountToken.set(a.id, token);
    reverse.set(token, a.name);
    if (a.name.trim()) nameToToken.push({ name: a.name, token });
  }

  // Payees/counterparties — from cheques, and any new ones a tool surfaces.
  const payeeToken = new Map<string, string>(); // lowercased name -> token
  let payeeN = 0;
  const mintPayee = (name: string): string => {
    const key = name.trim().toLowerCase();
    const existing = payeeToken.get(key);
    if (existing) return existing;
    const token = `PAYEE_${pad(++payeeN)}`;
    payeeToken.set(key, token);
    reverse.set(token, name);
    if (name.trim()) nameToToken.push({ name, token });
    return token;
  };
  for (const raw of rawPdcs) {
    const p = decryptPdc(raw, dek);
    if (p.counterparty?.trim()) mintPayee(p.counterparty);
  }

  // Longest names first so a name that contains another is replaced whole.
  const buildNameMatcher = () => {
    const sorted = [...nameToToken].sort((a, b) => b.name.length - a.name.length);
    if (sorted.length === 0) return null;
    const pattern = sorted.map((e) => escapeRegExp(e.name)).join("|");
    const lookup = new Map(sorted.map((e) => [e.name.toLowerCase(), e.token]));
    return { re: new RegExp(pattern, "gi"), lookup };
  };

  return {
    tokenForAccount: (id) => accountToken.get(id) ?? id,
    tokenForPayee: (name) => mintPayee(name),
    tokenize(text) {
      if (!text) return "";
      const matcher = buildNameMatcher();
      if (!matcher) return text;
      return text.replace(matcher.re, (m) => matcher.lookup.get(m.toLowerCase()) ?? m);
    },
    detokenize(text) {
      if (!text) return text;
      let out = text;
      // Replace longer tokens is unnecessary (fixed width); global per token.
      for (const [token, real] of reverse) {
        out = out.replace(new RegExp(`\\b${escapeRegExp(token)}\\b`, "g"), real);
      }
      return out;
    },
  };
}
