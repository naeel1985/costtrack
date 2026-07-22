import { type NextRequest } from "next/server";
import { apiJson } from "@/server/api-auth";
import { getDashboard } from "@/server/queries";
import { clampHorizon } from "@/server/api-params";

export const dynamic = "force-dynamic";

export function GET(req: NextRequest) {
  const horizonDays = clampHorizon(req.nextUrl.searchParams.get("horizonDays"));
  // getDashboard runs the projection/timeline engines and decrypts per-user; it
  // re-resolves auth through requireUser(), a no-op after apiJson's guard.
  return apiJson(() => getDashboard(horizonDays));
}
