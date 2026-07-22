import { type NextRequest } from "next/server";
import { apiMutation } from "@/server/api-auth";
import { undoRecurringOccurrenceCore } from "@/server/mutations/income";

export const dynamic = "force-dynamic";

// Body: { ruleId: string, date: ISO string }
export function POST(req: NextRequest) {
  return apiMutation(req, (auth, body) => undoRecurringOccurrenceCore(auth, body));
}
