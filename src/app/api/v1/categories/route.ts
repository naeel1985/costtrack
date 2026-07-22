import { apiJson } from "@/server/api-auth";
import { getCategories } from "@/server/queries";

export const dynamic = "force-dynamic";

export function GET() {
  return apiJson(() => getCategories());
}
