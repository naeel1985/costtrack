import { User as UserIcon } from "lucide-react";
import { getInitials } from "@/lib/initials";
import { cn } from "@/lib/utils";

/**
 * Letter avatar — the user's initials on a tinted disc. Falls back to a person
 * icon when the name yields nothing usable, so it never renders empty.
 */
export function LetterAvatar({ name, className }: { name: string | null | undefined; className?: string }) {
  const initials = getInitials(name);
  const usable = initials !== "?";
  return (
    <span
      aria-hidden
      className={cn(
        "flex shrink-0 select-none items-center justify-center rounded-full bg-primary/15 font-semibold text-primary",
        className,
      )}
    >
      {usable ? initials : <UserIcon className="h-1/2 w-1/2" />}
    </span>
  );
}
