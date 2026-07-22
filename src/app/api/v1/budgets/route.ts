import { type NextRequest } from "next/server";
import { apiJson, ApiError } from "@/server/api-auth";
import { getBudgets } from "@/server/queries";

export const dynamic = "force-dynamic";

export function GET(req: NextRequest) {
  const month = req.nextUrl.searchParams.get("month");
  return apiJson(() => {
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      throw new ApiError(400, "A `month` query param in YYYY-MM format is required.");
    }
    return getBudgets(month);
  });
}
