import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Centered loading spinner. Rendered by route `loading.tsx` files, so it shows
 * while the server is producing the next page — Next.js swaps it in as the
 * Suspense fallback the moment navigation starts, and back out when the page
 * streams in.
 */
export function PageLoader({ label = "Loading…", className }: { label?: string; className?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn("flex min-h-[60vh] w-full flex-col items-center justify-center gap-3", className)}
    >
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
      <span className="text-sm text-muted-foreground">{label}</span>
    </div>
  );
}
