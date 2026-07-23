import { type NextRequest } from "next/server";
import { apiJson, apiMutation } from "@/server/api-auth";
import { getAccountsWithBalances } from "@/server/queries";
import { saveAccountCore } from "@/server/mutations/accounts";

export const dynamic = "force-dynamic";

export function GET(req: NextRequest) {
  const includeArchived = req.nextUrl.searchParams.get("includeArchived") === "true";
  return apiJson(() => getAccountsWithBalances(includeArchived));
}

// Create (no id) or update (with id) an account.
// Body: { id?, name, type, currency?, openingBalance?, safetyBuffer?, color?,
//         dueDay?, creditLimit?, bankName?, cardLast4? }
export function POST(req: NextRequest) {
  return apiMutation(req, (auth, body) => saveAccountCore(auth, body));
}
