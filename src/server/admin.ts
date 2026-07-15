import "server-only";
import { subDays } from "date-fns";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/server/auth";

export interface AdminUserRow {
  id: string;
  username: string;
  email: string;
  fullName: string;
  phone: string | null;
  role: string;
  emailVerified: boolean;
  emailVerifiedAt: Date | null;
  isActive: boolean;
  createdAt: Date;
  recordCount: number; // metadata only — number of ledger entries, never content
}

export interface AdminAttemptRow {
  id: string;
  identifier: string;
  email: string | null;
  success: boolean;
  reason: string | null;
  ip: string | null;
  createdAt: Date;
}

export interface AdminData {
  users: AdminUserRow[];
  attempts: AdminAttemptRow[];
  stats: {
    totalUsers: number;
    verified: number;
    admins: number;
    failed24h: number;
  };
}

/**
 * Admin overview. Deliberately exposes only account identity + auth telemetry.
 * Financial data is encrypted per-user and the admin holds no DEK for it, so it
 * is cryptographically inaccessible here — we don't even query those columns.
 */
export async function getAdminData(): Promise<AdminData> {
  await requireAdmin();

  const [users, attempts, failed24h] = await Promise.all([
    prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        username: true,
        email: true,
        fullName: true,
        phone: true,
        role: true,
        emailVerified: true,
        emailVerifiedAt: true,
        isActive: true,
        createdAt: true,
        _count: { select: { transactions: true } },
      },
    }),
    prisma.loginAttempt.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { user: { select: { email: true } } },
    }),
    prisma.loginAttempt.count({ where: { success: false, createdAt: { gte: subDays(new Date(), 1) } } }),
  ]);

  return {
    users: users.map((u) => ({
      id: u.id,
      username: u.username,
      email: u.email,
      fullName: u.fullName,
      phone: u.phone,
      role: u.role,
      emailVerified: u.emailVerified,
      emailVerifiedAt: u.emailVerifiedAt,
      isActive: u.isActive,
      createdAt: u.createdAt,
      recordCount: u._count.transactions,
    })),
    attempts: attempts.map((a) => ({
      id: a.id,
      identifier: a.identifier,
      email: a.user?.email ?? null,
      success: a.success,
      reason: a.reason,
      ip: a.ip,
      createdAt: a.createdAt,
    })),
    stats: {
      totalUsers: users.length,
      verified: users.filter((u) => u.emailVerified).length,
      admins: users.filter((u) => u.role === "admin").length,
      failed24h,
    },
  };
}
