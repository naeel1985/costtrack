import { Badge } from "@/components/ui/badge";
import { STATUS_TONE } from "@/lib/domain";

export function StatusBadge({ status }: { status: string }) {
  const tone = STATUS_TONE[status] ?? "neutral";
  return (
    <Badge variant={tone} className="capitalize">
      {status}
    </Badge>
  );
}
