import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { importAllJson, importTransactionsCsv } from "@/server/io";

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get("file");
    const mode = (form.get("mode") as string) ?? "json";
    if (!(file instanceof File)) {
      return NextResponse.json({ ok: false, error: "No file provided" }, { status: 400 });
    }
    const text = await file.text();

    if (mode === "csv") {
      const { imported } = await importTransactionsCsv(text);
      revalidatePath("/", "layout");
      return NextResponse.json({ ok: true, imported });
    }

    const data = JSON.parse(text);
    await importAllJson(data);
    revalidatePath("/", "layout");
    return NextResponse.json({ ok: true });
  } catch (e) {
    const error = e instanceof Error ? e.message : "Import failed";
    return NextResponse.json({ ok: false, error }, { status: 400 });
  }
}
