import { describe, expect, it } from "vitest";
import { getInitials } from "./initials";

describe("getInitials", () => {
  it("takes the first letter of the first and last name", () => {
    expect(getInitials("Naeel Zuriek")).toBe("NZ");
    expect(getInitials("ada lovelace")).toBe("AL");
  });

  it("uses the first and LAST part when there are middle names", () => {
    expect(getInitials("Naeel Ahmed Zuriek")).toBe("NZ");
  });

  it("falls back to the first two letters of a single name", () => {
    expect(getInitials("Naeel")).toBe("NA");
    expect(getInitials("Jo")).toBe("JO");
  });

  it("handles a single-letter name without padding or crashing", () => {
    expect(getInitials("X")).toBe("X");
  });

  it("tolerates messy whitespace", () => {
    expect(getInitials("   Naeel    Zuriek   ")).toBe("NZ");
    expect(getInitials("Naeel\tZuriek")).toBe("NZ");
    expect(getInitials("Naeel\n Zuriek")).toBe("NZ");
  });

  it("never returns punctuation as an initial", () => {
    expect(getInitials("- Naeel -Zuriek")).toBe("NZ");
    expect(getInitials("•")).toBe("?");
  });

  it("returns a safe fallback for empty / invalid input", () => {
    expect(getInitials("")).toBe("?");
    expect(getInitials("   ")).toBe("?");
    expect(getInitials(null)).toBe("?");
    expect(getInitials(undefined)).toBe("?");
    // Defends against non-string values sneaking through untyped boundaries.
    expect(getInitials(42 as unknown as string)).toBe("?");
  });

  it("supports non-Latin scripts and accents", () => {
    expect(getInitials("نائل زريق")).toBe("نز");
    expect(getInitials("Ólafur Árnason")).toBe("ÓÁ");
  });

  it("keeps astral (non-BMP) letters intact rather than splitting a surrogate pair", () => {
    // U+1D40D / U+1D419 are astral MATHEMATICAL BOLD capitals — each is two
    // UTF-16 code units, so a naive charAt(0) would emit half a pair.
    expect(getInitials("𝐍aeel 𝐙uriek")).toBe("𝐍𝐙");
  });

  it("degrades to the fallback for emoji-only names (no letters to take)", () => {
    expect(getInitials("😀😃")).toBe("?");
  });
});
