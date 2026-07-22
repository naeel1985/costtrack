import { type NextRequest } from "next/server";
import { apiJson } from "@/server/api-auth";
import { getAccountsWithBalances } from "@/server/queries";

export const dynamic = "force-dynamic";

export function GET(req: NextRequest) {
  const includeArchived = req.nextUrl.searchParams.get("includeArchived") === "true";
  return apiJson(() => getAccountsWithBalances(includeArchived));
}
