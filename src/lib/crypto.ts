// ─────────────────────────────────────────────────────────────────────────────
// Cryptography core. Node's built-in `crypto` only — no native deps.
//
// - Passwords: scrypt (memory-hard) with a random per-password salt, verified
//   in constant time.
// - Field encryption: AES-256-GCM with a random 12-byte IV per record (the
//   "salt" — identical plaintexts never produce identical ciphertext) and an
//   authentication tag (tamper detection).
// - Per-user DEK: a random 256-bit key wrapped by a password-derived key, so a
//   user's data is unreadable without their password.
// ─────────────────────────────────────────────────────────────────────────────

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "crypto";

const SCRYPT_N = 16384; // CPU/memory cost (2^14)
const SCRYPT_r = 8;
const SCRYPT_p = 1;
const KEY_LEN = 32; // 256-bit keys
const IV_LEN = 12; // GCM nonce

// ── Password hashing ──────────────────────────────────────────────────────────

/** Returns a self-describing string: `scrypt$N$r$p$salt$hash` (base64 parts). */
export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password.normalize("NFKC"), salt, KEY_LEN, {
    N: SCRYPT_N,
    r: SCRYPT_r,
    p: SCRYPT_p,
  });
  return `scrypt$${SCRYPT_N}$${SCRYPT_r}$${SCRYPT_p}$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  try {
    const [algo, nStr, rStr, pStr, saltB64, hashB64] = stored.split("$");
    if (algo !== "scrypt") return false;
    const salt = Buffer.from(saltB64, "base64");
    const expected = Buffer.from(hashB64, "base64");
    const actual = scryptSync(password.normalize("NFKC"), salt, expected.length, {
      N: Number(nStr),
      r: Number(rStr),
      p: Number(pStr),
    });
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

// ── Key derivation ────────────────────────────────────────────────────────────

/** Derive a 256-bit key from a password + salt (used to wrap the DEK). */
export function deriveKey(password: string, saltHex: string): Buffer {
  return scryptSync(password.normalize("NFKC"), Buffer.from(saltHex, "hex"), KEY_LEN, {
    N: SCRYPT_N,
    r: SCRYPT_r,
    p: SCRYPT_p,
  });
}

// ── AES-256-GCM field encryption ─────────────────────────────────────────────

/** Encrypt a UTF-8 string with a 32-byte key. Output: `v1:iv:tag:ciphertext`. */
export function encrypt(plaintext: string, key: Buffer): string {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64")}:${tag.toString("base64")}:${ct.toString("base64")}`;
}

export function decrypt(payload: string, key: Buffer): string {
  const [version, ivB64, tagB64, ctB64] = payload.split(":");
  if (version !== "v1") throw new Error("Unsupported ciphertext version");
  const iv = Buffer.from(ivB64, "base64");
  const tag = Buffer.from(tagB64, "base64");
  const ct = Buffer.from(ctB64, "base64");
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
}

/** Encrypt raw bytes (used to wrap the DEK). */
export function encryptBytes(data: Buffer, key: Buffer): string {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(data), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64")}:${tag.toString("base64")}:${ct.toString("base64")}`;
}

export function decryptBytes(payload: string, key: Buffer): Buffer {
  const [version, ivB64, tagB64, ctB64] = payload.split(":");
  if (version !== "v1") throw new Error("Unsupported ciphertext version");
  const iv = Buffer.from(ivB64, "base64");
  const tag = Buffer.from(tagB64, "base64");
  const ct = Buffer.from(ctB64, "base64");
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]);
}

// ── Per-user Data Encryption Key (DEK) ───────────────────────────────────────

export interface DekBundle {
  dekWrapped: string; // DEK encrypted with the password-derived key
  dekSalt: string; // hex salt for deriving the wrapping key
}

/** Create a fresh random DEK and wrap it with the user's password. */
export function createWrappedDek(password: string): { dek: Buffer } & DekBundle {
  const dek = randomBytes(KEY_LEN);
  const dekSalt = randomBytes(16).toString("hex");
  const kek = deriveKey(password, dekSalt);
  const dekWrapped = encryptBytes(dek, kek);
  return { dek, dekWrapped, dekSalt };
}

/** Recover the DEK from its wrapped form using the user's password. */
export function unwrapDek(password: string, bundle: DekBundle): Buffer {
  const kek = deriveKey(password, bundle.dekSalt);
  return decryptBytes(bundle.dekWrapped, kek);
}

/** Re-wrap an existing DEK for a new password (used on password change). */
export function rewrapDek(dek: Buffer, newPassword: string): DekBundle {
  const dekSalt = randomBytes(16).toString("hex");
  const kek = deriveKey(newPassword, dekSalt);
  return { dekWrapped: encryptBytes(dek, kek), dekSalt };
}

// ── Server key (from env) ─────────────────────────────────────────────────────

let cachedServerKey: Buffer | null = null;
export function serverKey(): Buffer {
  if (cachedServerKey) return cachedServerKey;
  const raw = process.env.SERVER_KEY;
  if (!raw) throw new Error("SERVER_KEY is not set");
  const key = Buffer.from(raw, "base64");
  if (key.length !== KEY_LEN) throw new Error("SERVER_KEY must be 32 bytes (base64)");
  cachedServerKey = key;
  return key;
}

/** Wrap the DEK with the server key for storage on the active session row. */
export function sealDekForSession(dek: Buffer): string {
  return encryptBytes(dek, serverKey());
}
export function openDekFromSession(sealed: string): Buffer {
  return decryptBytes(sealed, serverKey());
}

// ── Tokens ────────────────────────────────────────────────────────────────────

/** A URL-safe random token (for session cookies and email verification). */
export function generateToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

/** Store only the hash of a token; look up by hashing the presented value. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
