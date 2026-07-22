"use client";

import * as React from "react";
import { format } from "date-fns";
import { Users, ShieldCheck, ShieldAlert, MailCheck, MailX } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader, StatCard } from "@/components/shared";
import { setUserActive } from "@/server/admin-actions";
import type { AdminData } from "@/server/admin";

export function AdminView({ data }: { data: AdminData }) {
  const [, startTransition] = React.useTransition();

  function toggleActive(userId: string, active: boolean) {
    startTransition(async () => {
      const res = await setUserActive(userId, active);
      if (res.ok) toast.success(active ? "User enabled" : "User disabled");
      else toast.error(res.error);
    });
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Admin console"
        description="User accounts and authentication activity. Financial data is encrypted per-user and is not accessible here."
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Users" value={data.stats.totalUsers} icon={<Users className="h-4 w-4" />} />
        <StatCard label="Verified" value={data.stats.verified} tone="positive" icon={<ShieldCheck className="h-4 w-4" />} />
        <StatCard label="Admins" value={data.stats.admins} icon={<ShieldCheck className="h-4 w-4" />} />
        <StatCard
          label="Failed logins (24h)"
          value={data.stats.failed24h}
          tone={data.stats.failed24h > 0 ? "warning" : "default"}
          icon={<ShieldAlert className="h-4 w-4" />}
        />
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Registered users</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead className="hidden sm:table-cell">Phone</TableHead>
                  <TableHead className="hidden md:table-cell">Joined</TableHead>
                  <TableHead>Records</TableHead>
                  <TableHead>Active</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.users.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell>
                      <div className="flex items-center gap-2 font-medium">
                        {u.fullName}
                        {u.role === "admin" && <Badge variant="info">admin</Badge>}
                      </div>
                      <div className="text-xs text-muted-foreground">@{u.username}</div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <span className="truncate">{u.email}</span>
                        {u.emailVerified ? (
                          <MailCheck className="h-3.5 w-3.5 text-positive" aria-label="verified" />
                        ) : (
                          <MailX className="h-3.5 w-3.5 text-warning-foreground dark:text-warning" aria-label="unverified" />
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {u.emailVerified
                          ? `verified ${u.emailVerifiedAt ? format(u.emailVerifiedAt, "d MMM yyyy") : ""}`
                          : "not verified"}
                      </div>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell tabular">{u.phone ?? "—"}</TableCell>
                    <TableCell className="hidden md:table-cell text-muted-foreground">
                      {format(u.createdAt, "d MMM yyyy")}
                    </TableCell>
                    <TableCell className="tabular text-muted-foreground">{u.recordCount}</TableCell>
                    <TableCell>
                      <Switch
                        checked={u.isActive}
                        disabled={u.role === "admin"}
                        onCheckedChange={(v) => toggleActive(u.id, v)}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Login attempts</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Identifier</TableHead>
                  <TableHead className="hidden sm:table-cell">Account</TableHead>
                  <TableHead>Result</TableHead>
                  <TableHead className="hidden md:table-cell">IP</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.attempts.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {format(a.createdAt, "d MMM HH:mm")}
                    </TableCell>
                    <TableCell className="font-medium">{a.identifier}</TableCell>
                    <TableCell className="hidden sm:table-cell text-muted-foreground">{a.email ?? "—"}</TableCell>
                    <TableCell>
                      {a.success ? (
                        <Badge variant="positive">success</Badge>
                      ) : (
                        <Badge variant="negative">{a.reason ?? "failed"}</Badge>
                      )}
                    </TableCell>
                    <TableCell className="hidden md:table-cell tabular text-muted-foreground">{a.ip ?? "—"}</TableCell>
                  </TableRow>
                ))}
                {data.attempts.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                      No login attempts recorded yet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
