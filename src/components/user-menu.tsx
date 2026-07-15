"use client";

import * as React from "react";
import Link from "next/link";
import { LogOut, Shield, User as UserIcon } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { logout } from "@/server/auth-actions";

export interface ShellUser {
  fullName: string;
  username: string;
  email: string;
  role: string;
}

export function UserMenu({ user, compact = false }: { user: ShellUser; compact?: boolean }) {
  const [, startTransition] = React.useTransition();
  const initials = user.fullName
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Account menu"
        className={
          compact
            ? "flex h-9 w-9 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary"
            : "flex w-full items-center gap-2 rounded-md border px-2.5 py-2 text-left text-sm transition-colors hover:bg-secondary/60"
        }
      >
        {compact ? (
          initials || <UserIcon className="h-4 w-4" />
        ) : (
          <>
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary">
              {initials || <UserIcon className="h-4 w-4" />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium leading-tight">{user.fullName}</span>
              <span className="block truncate text-[11px] text-muted-foreground">@{user.username}</span>
            </span>
          </>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="truncate font-normal text-muted-foreground">
          {user.email}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {user.role === "admin" && (
          <DropdownMenuItem asChild>
            <Link href="/admin">
              <Shield /> Admin console
            </Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem
          className="text-negative focus:text-negative"
          onClick={() => startTransition(() => void logout())}
        >
          <LogOut /> Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
