"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Download, Upload, FileJson, FileSpreadsheet, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export function ImportExport() {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const jsonInput = React.useRef<HTMLInputElement>(null);
  const csvInput = React.useRef<HTMLInputElement>(null);

  async function upload(file: File, mode: "json" | "csv") {
    if (mode === "json" && !confirm("Importing a backup replaces ALL current data. Continue?")) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("mode", mode);
      const res = await fetch("/api/import", { method: "POST", body: fd });
      const json = await res.json();
      if (json.ok) {
        toast.success(mode === "csv" ? `Imported ${json.imported} transactions` : "Backup restored");
        router.refresh();
      } else {
        toast.error(json.error ?? "Import failed");
      }
    } catch {
      toast.error("Import failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Data · import &amp; export</CardTitle>
        <p className="text-sm text-muted-foreground">
          Your data is yours. Export a full JSON backup or the ledger as CSV; restore or bulk-add
          any time.
        </p>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2 rounded-lg border p-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Download className="h-4 w-4" /> Export
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm">
              <a href="/api/export?format=json">
                <FileJson className="h-4 w-4" /> Full backup (JSON)
              </a>
            </Button>
            <Button asChild variant="outline" size="sm">
              <a href="/api/export?format=csv">
                <FileSpreadsheet className="h-4 w-4" /> Ledger (CSV)
              </a>
            </Button>
          </div>
        </div>

        <div className="space-y-2 rounded-lg border p-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Import
          </div>
          <div className="flex flex-wrap gap-2">
            <input
              ref={jsonInput}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && upload(e.target.files[0], "json")}
            />
            <input
              ref={csvInput}
              type="file"
              accept="text/csv,.csv"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && upload(e.target.files[0], "csv")}
            />
            <Button variant="outline" size="sm" disabled={busy} onClick={() => jsonInput.current?.click()}>
              <FileJson className="h-4 w-4" /> Restore JSON
            </Button>
            <Button variant="outline" size="sm" disabled={busy} onClick={() => csvInput.current?.click()}>
              <FileSpreadsheet className="h-4 w-4" /> Import CSV
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            CSV columns: date, type, amount, currency, account, category, note, tags.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
