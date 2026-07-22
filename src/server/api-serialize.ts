import "server-only";

/**
 * The wire shape of a server value: `Date` becomes an ISO string, everything
 * else is carried through structurally. Money stays as-is — it's already an
 * integer number of minor units, which is JSON-safe and must NOT be reformatted
 * server-side (the client formats it). This type lets a route's response type be
 * stated precisely and mirrored by the mobile client's DTOs.
 */
export type Serialized<T> = T extends Date
  ? string
  : T extends (infer U)[]
    ? Serialized<U>[]
    : T extends object
      ? { [K in keyof T]: Serialized<T[K]> }
      : T;

/**
 * Deep-convert a server value into its JSON wire form: `Date` → ISO 8601 string,
 * recursively through arrays and plain objects. Numbers (incl. minor-unit money),
 * strings, booleans and null pass through untouched. This is the single, explicit
 * transformation point between the RSC data layer (which hands back `Date`s) and
 * the JSON API. `NextResponse.json` would coerce dates via `toJSON` anyway, but
 * doing it here makes the contract deliberate and typed.
 */
export function serialize<T>(value: T): Serialized<T> {
  return serializeValue(value) as Serialized<T>;
}

function serializeValue(v: unknown): unknown {
  if (v === null || v === undefined) return v;
  if (v instanceof Date) return v.toISOString();
  if (Array.isArray(v)) return v.map(serializeValue);
  if (typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      out[k] = serializeValue(val);
    }
    return out;
  }
  return v;
}
