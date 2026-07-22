import { type NextRequest } from "next/server";
import { apiJson } from "@/server/api-auth";
import { getPdcs, type PdcFilters } from "@/server/queries";
import { str } from "@/server/api-params";

export const dynamic = "force-dynamic";

export function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const filters: PdcFilters = { status: str(sp.get("status")), direction: str(sp.get("direction")) };
  return apiJson(() => getPdcs(filters));
}
