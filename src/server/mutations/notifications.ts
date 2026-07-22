import "server-only";
import { prisma } from "@/lib/db";
import type { AuthContext } from "@/server/auth";
import type { MutationResult } from "./types";

/**
 * Acknowledge (dismiss) one or more notifications. Only the opaque key is
 * stored, scoped to the user, so the dismissal survives across sessions and
 * devices. Idempotent — re-acknowledging is a no-op, and unknown/oversized keys
 * are dropped. Pure DB core, shared by the web action and the mobile API.
 */
export async function acknowledgeNotificationsCore(
  auth: AuthContext,
  keys: unknown,
): Promise<MutationResult> {
  const arr = Array.isArray(keys) ? keys : [];
  const clean = [
    ...new Set(arr.filter((k): k is string => typeof k === "string" && k.length > 0 && k.length <= 300)),
  ];
  if (clean.length === 0) return { ok: true };

  await prisma.notificationAck.createMany({
    data: clean.map((key) => ({ userId: auth.user.id, key })),
    skipDuplicates: true,
  });
  return { ok: true };
}
