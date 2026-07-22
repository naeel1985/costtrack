import { apiJson } from "@/server/api-auth";
import { getNotifications } from "@/server/queries";

export const dynamic = "force-dynamic";

export function GET() {
  return apiJson(() => getNotifications());
}
