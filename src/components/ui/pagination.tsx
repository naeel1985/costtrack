"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Client-side pagination over an in-memory list. Keeps the page in range as the
 * list shrinks (e.g. after filtering) so callers never render an empty page.
 */
export function usePagination<T>(items: T[], pageSize: number) {
  const [page, setPage] = React.useState(0);
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const current = Math.min(page, pageCount - 1);

  React.useEffect(() => {
    if (page > pageCount - 1) setPage(pageCount - 1);
  }, [page, pageCount]);

  const start = current * pageSize;
  return {
    page: current,
    setPage,
    pageCount,
    total: items.length,
    start,
    end: Math.min(start + pageSize, items.length),
    pageItems: items.slice(start, start + pageSize),
  };
}

export function Pager({
  page,
  pageCount,
  onPage,
  className,
  label,
}: {
  page: number;
  pageCount: number;
  onPage: (p: number) => void;
  className?: string;
  /** Optional context, e.g. "3–8 of 40". */
  label?: string;
}) {
  if (pageCount <= 1) return null;
  return (
    <div className={cn("flex items-center justify-between gap-2 pt-1", className)}>
      <span className="text-xs text-muted-foreground">{label ?? `Page ${page + 1} of ${pageCount}`}</span>
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="icon-sm"
          disabled={page <= 0}
          onClick={() => onPage(page - 1)}
          aria-label="Previous page"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="icon-sm"
          disabled={page >= pageCount - 1}
          onClick={() => onPage(page + 1)}
          aria-label="Next page"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
