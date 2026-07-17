"use client";

import * as React from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/forms/field";
import { LetterAvatar } from "@/components/letter-avatar";
import { RecoveryCodePanel } from "@/components/auth/recovery-code-panel";
import { createRecoveryCode, updateProfile } from "@/server/auth-actions";
import { getInitials } from "@/lib/initials";
import type { ShellUser } from "@/components/user-menu";

const MAX = 80;

export function ProfileDialog({
  user,
  open,
  onOpenChange,
}: {
  user: ShellUser;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [pending, startTransition] = React.useTransition();
  const [recoveryPending, startRecovery] = React.useTransition();
  const [name, setName] = React.useState(user.fullName);
  const [newRecoveryCode, setNewRecoveryCode] = React.useState<string | null>(null);

  // Re-sync when reopened, so a cancelled edit doesn't linger.
  React.useEffect(() => {
    if (open) {
      setName(user.fullName);
      setNewRecoveryCode(null);
    }
  }, [open, user.fullName]);

  function mintRecoveryCode() {
    startRecovery(async () => {
      const res = await createRecoveryCode();
      if (res.ok && res.recoveryCode) setNewRecoveryCode(res.recoveryCode);
      else if (!res.ok) toast.error(res.error);
    });
  }

  const trimmed = name.trim();
  const error =
    trimmed.length === 0
      ? "Name can't be empty"
      : trimmed.length > MAX
        ? `Name is too long (${MAX} characters max)`
        : !/\p{L}/u.test(trimmed)
          ? "Name must contain at least one letter"
          : null;
  const unchanged = trimmed.replace(/\s+/g, " ") === user.fullName.trim();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (error || pending) return;
    startTransition(async () => {
      const res = await updateProfile({ fullName: trimmed });
      if (res.ok) {
        toast.success(res.message ?? "Name updated");
        onOpenChange(false);
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Your profile</DialogTitle>
          <DialogDescription>
            Your name and avatar are how you appear in the app. Only you can see your financial
            data.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-5">
          {/* Live avatar preview — updates as you type */}
          <div className="flex items-center gap-4">
            <LetterAvatar name={trimmed || user.fullName} className="h-16 w-16 text-xl" />
            <div className="min-w-0">
              <div className="truncate font-medium">{trimmed || "—"}</div>
              <div className="truncate text-xs text-muted-foreground">@{user.username}</div>
              <div className="truncate text-xs text-muted-foreground">{user.email}</div>
            </div>
          </div>

          <Field label="Full name" htmlFor="fullName" error={error ?? undefined}>
            <Input
              id="fullName"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="First and last name"
              maxLength={MAX + 20}
              autoComplete="name"
              autoFocus
            />
          </Field>
          <p className="-mt-2 text-xs text-muted-foreground">
            Your avatar uses the first letter of your first and last name
            {trimmed ? ` — currently “${getInitials(trimmed)}”` : ""}.
          </p>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending || !!error || unchanged}>
              {pending ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </form>

        {/* Recovery code — needed to reset a forgotten password without losing
            data. Accounts created before this existed can mint one here. */}
        <div className="space-y-3 border-t pt-4">
          {newRecoveryCode ? (
            <RecoveryCodePanel code={newRecoveryCode} />
          ) : (
            <>
              <div className="text-sm font-medium">Recovery code</div>
              <p className="text-xs text-muted-foreground">
                Your data is encrypted with a key derived from your password. A recovery code is the
                only way to unlock it if you ever forget that password — generate one and store it
                safely. Generating a new code replaces any previous one.
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={mintRecoveryCode}
                disabled={recoveryPending}
              >
                {recoveryPending ? "Generating…" : "Generate recovery code"}
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
