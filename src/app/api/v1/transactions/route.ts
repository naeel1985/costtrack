import { type NextRequest } from "next/server";
import { apiJson } from "@/server/api-auth";
import { getTransactions, type TransactionFilters } from "@/server/queries";
import { parseDate, str } from "@/server/api-params";

export const dynamic = "force-dynamic";

export function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const typeParam = sp.get("type");
  const type =
    typeParam === "income" || typeParam === "expense" || typeParam === "transfer"
      ? typeParam
      : undefined;

  const filters: TransactionFilters = {
    type,
    accountId: str(sp.get("accountId")),
    categoryId: str(sp.get("categoryId")),
    tag: str(sp.get("tag")),
    search: str(sp.get("search")),
    from: parseDate(sp.get("from")),
    to: parseDate(sp.get("to")),
  };
  return apiJson(() => getTransactions(filters));
}
