import { type NextRequest } from "next/server";
import { apiMutation } from "@/server/api-auth";
import { deleteTransactionCore } from "@/server/mutations/transactions";

export const dynamic = "force-dynamic";

// Body: { id: string }. (POST rather than DELETE so the body survives proxies.)
export function POST(req: NextRequest) {
  return apiMutation(req, (auth, body) => deleteTransactionCore(auth, body));
}
