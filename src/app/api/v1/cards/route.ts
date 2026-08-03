import { apiJson } from "@/server/api-auth";
import { getCreditCardStatements } from "@/server/queries";

export const dynamic = "force-dynamic";

// Credit cards with their billed statements: each carries the charges that sum
// to its total, what has been paid against it, and what is still owed.
export function GET() {
  return apiJson(() => getCreditCardStatements());
}
