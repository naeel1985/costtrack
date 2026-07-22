"use client";

import * as React from "react";
import Link from "next/link";
import { LogOut, Shield, UserPen } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LetterAvatar } from "@/components/letter-avatar";
import { ProfileDialog } from "@/components/profile-dialog";
import { clearStoredChat } from "@/lib/chat-storage";
import { logout } from "@/server/auth-actions";

export interface ShellUser {
  fullName: string;
  username: string;
  email: string;
  role: string;
}

export function UserMenu({ user, compact = false }: { user: ShellUser; compact?: boolean }) {
  const [, startTransition] = React.useTransition();
  const [profileOpen, setProfileOpen] = React.useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label="Account menu"
          className={
            compact
              ? "rounded-full"
              : "flex w-full items-center gap-2 rounded-md border px-2.5 py-2 text-left text-sm transition-colors hover:bg-secondary/60"
          }
        >
          {compact ? (
            <LetterAvatar name={user.fullName} className="h-9 w-9 text-xs" />
          ) : (
            <>
              <LetterAvatar name={user.fullName} className="h-7 w-7 text-xs" />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium leading-tight">{user.fullName}</span>
                <span className="block truncate text-[11px] text-muted-foreground">
                  @{user.username}
                </span>
              </span>
            </>
          )}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel className="truncate font-normal text-muted-foreground">
            {user.email}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setProfileOpen(true)}>
            <UserPen /> Edit profile
          </DropdownMenuItem>
          {user.role === "admin" && (
            <DropdownMenuItem asChild>
              <Link href="/admin">
                <Shield /> Admin console
              </Link>
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-negative focus:text-negative"
            onClick={() => {
              clearStoredChat(); // the conversation ends with the session
              startTransition(() => void logout());
            }}
          >
            <LogOut /> Log out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ProfileDialog user={user} open={profileOpen} onOpenChange={setProfileOpen} />
    </>
  );
}
