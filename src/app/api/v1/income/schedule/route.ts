import { apiJson } from "@/server/api-auth";
import { getRecurringIncomeSchedule } from "@/server/queries";

export const dynamic = "force-dynamic";

export function GET() {
  return apiJson(() => getRecurringIncomeSchedule());
}
