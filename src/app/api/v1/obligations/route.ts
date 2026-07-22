import { type NextRequest } from "next/server";
import { apiJson } from "@/server/api-auth";
import { getUpcomingObligations } from "@/server/queries";
import { clampHorizon } from "@/server/api-params";

export const dynamic = "force-dynamic";

export function GET(req: NextRequest) {
  const horizonDays = clampHorizon(req.nextUrl.searchParams.get("horizonDays"));
  return apiJson(() => getUpcomingObligations(horizonDays));
}
