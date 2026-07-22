import { apiJson } from "@/server/api-auth";
import { getRecurringRules } from "@/server/queries";

export const dynamic = "force-dynamic";

export function GET() {
  return apiJson(() => getRecurringRules());
}
