/**
 * Letter avatar initials: first letter of the first name + first letter of the
 * last name (two letters). Falls back sensibly rather than throwing or
 * rendering blank, because this runs on every shell paint for whatever the user
 * typed into the name field.
 *
 * Rules, in order:
 *  • 2+ name parts  → first letter of first part + first letter of last part
 *  • 1 name part    → its first two letters ("Naeel" → "NA")
 *  • nothing usable → "?" (the UI shows a person icon instead)
 *
 * Handles extra/odd whitespace, punctuation-only tokens, and astral characters
 * (emoji/scripts outside the BMP) without splitting a surrogate pair in half.
 */
export function getInitials(fullName: string | null | undefined): string {
  if (typeof fullName !== "string") return "?";

  // Split on any whitespace; drop tokens with no letter or digit in them
  // (e.g. a stray "-" or "•"), so punctuation never becomes an initial.
  const parts = fullName
    .trim()
    .split(/\s+/)
    .map((p) => stripLeadingNonAlnum(p))
    .filter((p) => p.length > 0);

  if (parts.length === 0) return "?";

  if (parts.length === 1) {
    // Single name: take its first two characters.
    return toChars(parts[0]).slice(0, 2).join("").toUpperCase();
  }

  const first = toChars(parts[0])[0] ?? "";
  const last = toChars(parts[parts.length - 1])[0] ?? "";
  const initials = `${first}${last}`.toUpperCase();
  return initials || "?";
}

/** Code-point-aware split, so emoji/astral chars stay intact. */
function toChars(s: string): string[] {
  return Array.from(s);
}

/** Drop leading characters that are neither letters nor digits. */
function stripLeadingNonAlnum(token: string): string {
  const chars = toChars(token);
  let i = 0;
  while (i < chars.length && !isAlnum(chars[i])) i++;
  return chars.slice(i).join("");
}

function isAlnum(ch: string): boolean {
  // Unicode-aware: covers accented Latin, Arabic, etc. — not just [A-Za-z0-9].
  return /\p{L}|\p{N}/u.test(ch);
}
