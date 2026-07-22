import { randomBytes } from "crypto";
import { beforeAll, describe, expect, it } from "vitest";
import {
  createWrappedDek,
  decrypt,
  encrypt,
  generateNumericCode,
  generateRecoveryCode,
  hashPassword,
  hashToken,
  openDekFromSession,
  rewrapDek,
  sealDekForSession,
  unwrapDek,
  unwrapDekWithRecovery,
  verifyPassword,
  wrapDekWithRecovery,
} from "./crypto";

beforeAll(() => {
  process.env.SERVER_KEY = randomBytes(32).toString("base64");
});

describe("password hashing", () => {
  it("verifies a correct password and rejects a wrong one", () => {
    const stored = hashPassword("S3cure!pass");
    expect(verifyPassword("S3cure!pass", stored)).toBe(true);
    expect(verifyPassword("wrong", stored)).toBe(false);
  });

  it("produces a different hash each time (random salt)", () => {
    expect(hashPassword("same")).not.toBe(hashPassword("same"));
  });
});

describe("field encryption", () => {
  const key = randomBytes(32);

  it("round-trips a value", () => {
    const ct = encrypt("5000", key);
    expect(ct).not.toContain("5000");
    expect(decrypt(ct, key)).toBe("5000");
  });

  it("uses a random IV so identical plaintext differs (salted)", () => {
    expect(encrypt("hello", key)).not.toBe(encrypt("hello", key));
  });

  it("fails to decrypt with the wrong key", () => {
    const ct = encrypt("secret", key);
    expect(() => decrypt(ct, randomBytes(32))).toThrow();
  });

  it("detects tampering (GCM auth tag)", () => {
    const ct = encrypt("secret note", key);
    const parts = ct.split(":");
    const bad = Buffer.from(parts[3], "base64");
    bad[0] ^= 0xff;
    parts[3] = bad.toString("base64");
    expect(() => decrypt(parts.join(":"), key)).toThrow();
  });
});

describe("per-user DEK", () => {
  it("unwraps only with the correct password", () => {
    const { dek, dekWrapped, dekSalt } = createWrappedDek("hunter2");
    const recovered = unwrapDek("hunter2", { dekWrapped, dekSalt });
    expect(recovered.equals(dek)).toBe(true);
    expect(() => unwrapDek("nope", { dekWrapped, dekSalt })).toThrow();
  });

  it("encrypts user data that only that DEK can read", () => {
    const alice = createWrappedDek("alice-pw");
    const bob = createWrappedDek("bob-pw");
    const ct = encrypt("Alice private note", alice.dek);
    expect(decrypt(ct, alice.dek)).toBe("Alice private note");
    expect(() => decrypt(ct, bob.dek)).toThrow(); // Bob (and admin) cannot read it
  });
});

describe("session DEK sealing (server key)", () => {
  it("seals and opens the DEK", () => {
    const { dek } = createWrappedDek("pw");
    const sealed = sealDekForSession(dek);
    expect(openDekFromSession(sealed).equals(dek)).toBe(true);
  });
});

describe("token hashing", () => {
  it("is deterministic and hides the token", () => {
    const h = hashToken("abc123");
    expect(h).toBe(hashToken("abc123"));
    expect(h).not.toContain("abc123");
    expect(h).toHaveLength(64);
  });
});

describe("recovery code", () => {
  it("generates a transcribable code with no look-alike characters", () => {
    const code = generateRecoveryCode();
    expect(code).toMatch(/^[0-9A-Z]{5}(-[0-9A-Z]{5}){3}$/);
    // I, L, O and U are excluded so the code can't be misread.
    expect(code).not.toMatch(/[ILOU]/);
  });

  it("generates a different code each time", () => {
    expect(generateRecoveryCode()).not.toBe(generateRecoveryCode());
  });

  it("recovers the DEK — this is what saves the data on a password reset", () => {
    const { dek } = createWrappedDek("OldPass123!");
    const code = generateRecoveryCode();
    const bundle = wrapDekWithRecovery(dek, code);
    expect(unwrapDekWithRecovery(code, bundle).equals(dek)).toBe(true);
  });

  it("forgives cosmetic mistyping (case, spaces, dashes, O/0 and I/1)", () => {
    const { dek } = createWrappedDek("OldPass123!");
    const bundle = wrapDekWithRecovery(dek, "K4M2X-9QT7B-0R5WZ-3NPHD");
    for (const typed of [
      "k4m2x-9qt7b-0r5wz-3nphd", // lowercase
      "K4M2X 9QT7B 0R5WZ 3NPHD", // spaces instead of dashes
      "K4M2X9QT7B0R5WZ3NPHD", // no separators
      "K4M2X-9QT7B-OR5WZ-3NPHD", // typed letter O for zero
    ]) {
      expect(unwrapDekWithRecovery(typed, bundle).equals(dek)).toBe(true);
    }
  });

  it("rejects a wrong recovery code", () => {
    const { dek } = createWrappedDek("OldPass123!");
    const bundle = wrapDekWithRecovery(dek, generateRecoveryCode());
    expect(() => unwrapDekWithRecovery(generateRecoveryCode(), bundle)).toThrow();
  });

  it("survives a full reset: recover with the code, re-wrap under a new password", () => {
    const { dek, dekWrapped, dekSalt } = createWrappedDek("OldPass123!");
    const code = generateRecoveryCode();
    const recovery = wrapDekWithRecovery(dek, code);

    // The user forgets "OldPass123!" entirely and resets.
    const recovered = unwrapDekWithRecovery(code, recovery);
    const next = rewrapDek(recovered, "BrandNewPass456!");

    // New password opens the DEK; the old wrapping is untouched but unused.
    expect(unwrapDek("BrandNewPass456!", next).equals(dek)).toBe(true);
    expect(unwrapDek("OldPass123!", { dekWrapped, dekSalt }).equals(dek)).toBe(true);
    // And the old password does NOT open the new wrapping.
    expect(() => unwrapDek("OldPass123!", next)).toThrow();
  });

  it("keeps the DEK unreadable without the code (no server escrow)", () => {
    const { dek } = createWrappedDek("OldPass123!");
    const bundle = wrapDekWithRecovery(dek, generateRecoveryCode());
    // The stored bundle is ciphertext; it must not leak the key material.
    expect(bundle.dekWrapped).not.toContain(dek.toString("base64"));
    expect(() => unwrapDek("", bundle)).toThrow();
  });
});

describe("generateNumericCode", () => {
  it("returns a zero-padded code of the requested length", () => {
    for (let i = 0; i < 50; i++) {
      expect(generateNumericCode(6)).toMatch(/^\d{6}$/);
    }
  });
});
