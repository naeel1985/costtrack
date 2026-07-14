import { NextRequest, NextResponse } from "next/server";
import { format } from "date-fns";
import { exportAllJson, transactionsToCsv } from "@/server/io";

export async function GET(req: NextRequest) {
  const kind = req.nextUrl.searchParams.get("format") ?? "json";
  const stamp = format(new Date(), "yyyy-MM-dd");

  if (kind === "csv") {
    const csv = await transactionsToCsv();
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="cashflow-transactions-${stamp}.csv"`,
      },
    });
  }

  const data = await exportAllJson();
  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="cashflow-backup-${stamp}.json"`,
    },
  });
}
