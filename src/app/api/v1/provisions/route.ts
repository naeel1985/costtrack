import { apiJson } from "@/server/api-auth";
import { getProvisions } from "@/server/queries";

export const dynamic = "force-dynamic";

export function GET() {
  return apiJson(() => getProvisions());
}
