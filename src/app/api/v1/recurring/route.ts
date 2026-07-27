import { type NextRequest } from "next/server";
import { apiJson, apiMutation } from "@/server/api-auth";
import { getRecurringRules } from "@/server/queries";
import { saveRecurringCore } from "@/server/mutations/recurring";

export const dynamic = "force-dynamic";

export function GET() {
  return apiJson(() => getRecurringRules());
}

// Create (no id) or update (with id) a recurring rule.
// Body: { name, type, amount, currency, accountId, categoryId?, frequency,
//         interval, startDate, endDate?, occurrenceCount?, note?, id? }
export function POST(req: NextRequest) {
  return apiMutation(req, (auth, body) => saveRecurringCore(auth, body));
}
