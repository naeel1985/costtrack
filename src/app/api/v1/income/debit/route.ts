import { type NextRequest } from "next/server";
import { apiMutation } from "@/server/api-auth";
import { debitRecurringOccurrenceCore } from "@/server/mutations/income";

export const dynamic = "force-dynamic";

// Body: { ruleId: string, date: ISO string, amount?: number }
export function POST(req: NextRequest) {
  return apiMutation(req, (auth, body) => debitRecurringOccurrenceCore(auth, body));
}
