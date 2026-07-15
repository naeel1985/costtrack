import { randomBytes } from "crypto";
import { beforeAll, describe, expect, it } from "vitest";
import {
  createWrappedDek,
  decrypt,
  encrypt,
  hashPassword,
  hashToken,
  openDekFromSession,
  sealDekForSession,
  unwrapDek,
  verifyPassword,
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
