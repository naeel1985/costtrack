"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/server/auth";

export type AdminResult = { ok: true } | { ok: false; error: string };

/** Enable/disable a user account (also kills their sessions when disabling). */
export async function setUserActive(userId: string, active: boolean): Promise<AdminResult> {
  try {
    const admin = await requireAdmin();
    if (userId === admin.user.id) return { ok: false, error: "You can't disable your own account." };
    await prisma.user.update({ where: { id: userId }, data: { isActive: active } });
    if (!active) await prisma.session.deleteMany({ where: { userId } });
    revalidatePath("/admin");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed" };
  }
}
