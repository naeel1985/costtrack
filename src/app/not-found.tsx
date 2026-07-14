import Link from "next/link";
import { Compass } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Compass className="h-6 w-6" />
      </div>
      <h2 className="text-lg font-semibold">Page not found</h2>
      <p className="max-w-sm text-sm text-muted-foreground">
        That page doesn&apos;t exist. Let&apos;s get you back on track.
      </p>
      <Button asChild className="mt-2">
        <Link href="/">Back to dashboard</Link>
      </Button>
    </div>
  );
}
