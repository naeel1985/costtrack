export const dynamic = "force-dynamic";

import { getSettings, getRates, getCategories } from "@/server/queries";
import { SettingsView, type RateRow, type CategoryRow } from "@/components/settings/settings-view";

export default async function SettingsPage() {
  const [settings, rates, categories] = await Promise.all([
    getSettings(),
    getRates(),
    getCategories(),
  ]);

  const rateRows: RateRow[] = rates.map((r) => ({ id: r.id, base: r.base, quote: r.quote, rate: r.rate }));
  const categoryRows: CategoryRow[] = categories.map((c) => ({
    id: c.id,
    name: c.name,
    kind: c.kind,
    color: c.color,
  }));

  return (
    <SettingsView
      baseCurrency={settings.baseCurrency}
      defaultBufferMinor={settings.defaultBufferMinor}
      rates={rateRows}
      categories={categoryRows}
    />
  );
}