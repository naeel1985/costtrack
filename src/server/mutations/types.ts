import "server-only";
import { z } from "zod";

/**
 * The result of a mutation core. Shared by the web server action (which maps it
 * to ActionResult + revalidates) and the mobile API (which maps `status` to the
 * HTTP status). `status` is advisory — the web path ignores it.
 */
export type MutationResult =
  | { ok: true; id?: string }
  | { ok: false; error: string; status?: number };

/**
 * Map a caught error to a 400 MutationResult when it's a validation failure;
 * re-throw anything else so the caller's handler (web `fail`, API 500) sees it.
 */
export function zodFail(e: unknown): MutationResult {
  if (e instanceof z.ZodError) {
    return { ok: false, error: e.issues.map((i) => i.message).join(", "), status: 400 };
  }
  throw e;
}
