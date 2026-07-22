import { type NextRequest } from "next/server";
import { apiJson } from "@/server/api-auth";
import { getReportData } from "@/server/queries";
import { clampInt } from "@/server/api-params";

export const dynamic = "force-dynamic";

export function GET(req: NextRequest) {
  const monthsBack = clampInt(req.nextUrl.searchParams.get("monthsBack"), 6, 1, 36);
  return apiJson(() => getReportData(monthsBack));
}
