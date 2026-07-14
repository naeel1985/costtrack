import { getReportData } from "@/server/queries";
import { PageHeader } from "@/components/shared";
import { ReportsView } from "@/components/reports/reports-view";
import { ImportExport } from "@/components/reports/import-export";

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ months?: string }>;
}) {
  const { months } = await searchParams;
  const monthsBack = [3, 6, 12].includes(Number(months)) ? Number(months) : 6;
  const data = await getReportData(monthsBack);

  return (
    <div className="space-y-6">
      <PageHeader title="Reports & insights" description="Where your money goes, and how it trends over time." />
      <ReportsView data={data} monthsBack={monthsBack} />
      <ImportExport />
    </div>
  );
}
