import { type NextRequest } from "next/server";
import { apiMutation } from "@/server/api-auth";
import { acknowledgeNotificationsCore } from "@/server/mutations/notifications";

export const dynamic = "force-dynamic";

// Body: { keys: string[] }
export function POST(req: NextRequest) {
  return apiMutation(req, (auth, body) =>
    acknowledgeNotificationsCore(auth, (body as { keys?: unknown } | undefined)?.keys),
  );
}
