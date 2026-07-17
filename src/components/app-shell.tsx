"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Command, Plus, Shield, Wallet } from "lucide-react";
import { NAV_ITEMS } from "@/components/nav-items";
import { ModeToggle } from "@/components/mode-toggle";
import { useApp } from "@/components/app-interactive";
import { UserMenu, type ShellUser } from "@/components/user-menu";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function isActive(pathname: string, href: string) {
  if (href === "/dashboard") return pathname === "/dashboard";
  return pathname.startsWith(href);
}

export function AppShell({ user, children }: { user: ShellUser; children: React.ReactNode }) {
  const pathname = usePathname();
  const { openPalette, openQuickAdd } = useApp();
  const primary = NAV_ITEMS.filter((i) => i.primary);

  return (
    <div className="min-h-dvh md:grid md:grid-cols-[240px_1fr]">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh flex-col border-r bg-card/40 px-3 py-4 md:flex">
        <div className="flex items-center gap-2 px-2 pb-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Wallet className="h-4 w-4" />
          </div>
          <div className="leading-tight">
            <div className="text-sm font-semibold">Cashflow</div>
            <div className="text-[11px] text-muted-foreground">Forward finance</div>
          </div>
        </div>

        <Button className="mb-3 justify-start gap-2" onClick={() => openQuickAdd("expense")}>
          <Plus className="h-4 w-4" /> Quick add
        </Button>

        <nav className="flex flex-1 flex-col gap-0.5">
          {NAV_ITEMS.map((item) => {
            const active = isActive(pathname, item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-secondary text-foreground"
                    : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
          {user.role === "admin" && (
            <Link
              href="/admin"
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                isActive(pathname, "/admin")
                  ? "bg-secondary text-foreground"
                  : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
              )}
            >
              <Shield className="h-4 w-4" /> Admin
            </Link>
          )}
        </nav>

        <button
          onClick={openPalette}
          className="mt-2 flex items-center justify-between rounded-md border px-3 py-2 text-xs text-muted-foreground transition-colors hover:bg-secondary/60"
        >
          <span className="flex items-center gap-2">
            <Command className="h-3.5 w-3.5" /> Command palette
          </span>
          <kbd className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px]">⌘K</kbd>
        </button>

        <div className="mt-2">
          <UserMenu user={user} />
        </div>
      </aside>

      {/* Main column */}
      <div className="flex min-w-0 flex-col">
        {/* Top bar (mobile + desktop) */}
        <header className="sticky top-0 z-30 flex items-center justify-between gap-2 border-b bg-background/80 px-4 py-3 backdrop-blur md:px-8">
          <div className="flex items-center gap-2 md:hidden">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Wallet className="h-4 w-4" />
            </div>
            <span className="font-semibold">Cashflow</span>
          </div>
          <div className="hidden md:block" />
          <div className="flex items-center gap-1.5">
            <button
              onClick={openPalette}
              aria-label="Open command palette"
              className="hidden items-center gap-2 rounded-md border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-secondary/60 sm:flex md:hidden lg:flex"
            >
              <Command className="h-3.5 w-3.5" /> Search
              <kbd className="rounded bg-muted px-1 font-mono text-[10px]">⌘K</kbd>
            </button>
            <ModeToggle />
            <Button size="sm" className="gap-1.5 md:hidden" onClick={() => openQuickAdd("expense")}>
              <Plus className="h-4 w-4" /> Add
            </Button>
            <div className="md:hidden">
              <UserMenu user={user} compact />
            </div>
          </div>
        </header>

        <main className="flex-1 px-4 py-5 pb-24 md:px-8 md:py-7 md:pb-10">{children}</main>
      </div>

      {/* Mobile bottom nav */}
      <nav className="fixed inset-x-0 bottom-0 z-40 flex items-center justify-around border-t bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        {primary.map((item) => {
          const active = isActive(pathname, item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-medium transition-colors",
                active ? "text-primary" : "text-muted-foreground",
              )}
            >
              <Icon className="h-5 w-5" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
