import Link from "next/link";
import { format } from "date-fns";
import {
  Wallet,
  TrendingUp,
  TrendingDown,
  PiggyBank,
  Gauge,
  ArrowRight,
} from "lucide-react";
import { getDashboard } from "@/server/queries";
import { projectSeries } from "@/server/projection-actions";
import { PageHeader, StatCard } from "@/components/shared";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Money } from "@/components/money";
import { AddTransactionButton } from "@/components/add-transaction-button";
import { ProjectionExplorer } from "@/components/dashboard/projection-explorer";
import { WarningsBanner } from "@/components/dashboard/warnings-banner";
import { ObligationsList } from "@/components/dashboard/obligations-list";
import { ACCOUNT_TYPE_LABELS, type AccountType } from "@/lib/domain";

export default async function DashboardPage() {
  const [dashboard, series] = await Promise.all([getDashboard(90), projectSeries(90)]);
  const {
    accounts,
    netWorthMinor,
    monthIncomeMinor,
    monthExpenseMinor,
    savingsRate,
    runway,
    obligations,
    projection,
    baseCurrency,
  } = dashboard;

  const runwayLabel =
    runway.months === Infinity
      ? "Building savings"
      : runway.months > 24
        ? "24+ months"
        : `${runway.months.toFixed(1)} months`;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description={format(new Date(), "EEEE, d MMMM yyyy")}
        action={<AddTransactionButton size="sm" />}
      />

      <WarningsBanner warnings={projection.warnings} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard
          label="Net position"
          value={<Money minor={netWorthMinor} currency={baseCurrency} colored={netWorthMinor < 0} />}
          sub={`${accounts.length} accounts`}
          icon={<Wallet className="h-4 w-4" />}
        />
        <StatCard
          label="Income (mo)"
          value={<Money minor={monthIncomeMinor} currency={baseCurrency} />}
          tone="positive"
          icon={<TrendingUp className="h-4 w-4" />}
        />
        <StatCard
          label="Spent (mo)"
          value={<Money minor={monthExpenseMinor} currency={baseCurrency} />}
          tone="negative"
          icon={<TrendingDown className="h-4 w-4" />}
        />
        <StatCard
          label="Savings rate"
          value={`${Math.round(savingsRate * 100)}%`}
          sub={savingsRate >= 0.2 ? "Healthy" : savingsRate >= 0 ? "Tight" : "Overspending"}
          tone={savingsRate >= 0.2 ? "positive" : savingsRate < 0 ? "negative" : "warning"}
          icon={<PiggyBank className="h-4 w-4" />}
        />
        <StatCard
          label="Cash runway"
          value={<span className="text-xl">{runwayLabel}</span>}
          sub={runway.monthlyNetMinor < 0 ? "at current burn" : "cash-flow positive"}
          tone={runway.months !== Infinity && runway.months < 3 ? "warning" : "default"}
          icon={<Gauge className="h-4 w-4" />}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <ProjectionExplorer initial={series} currency={baseCurrency} />
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="text-base">Upcoming obligations</CardTitle>
              <Link
                href="/cheques"
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                All <ArrowRight className="h-3 w-3" />
              </Link>
            </CardHeader>
            <CardContent className="pt-0">
              <ObligationsList items={obligations} limit={7} />
            </CardContent>
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Accounts</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 pt-0 sm:grid-cols-2 lg:grid-cols-3">
          {accounts.map((a) => (
            <Link
              key={a.id}
              href="/accounts"
              className="flex items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-secondary/50"
            >
              <span
                className="flex h-9 w-9 items-center justify-center rounded-lg text-sm font-semibold text-white"
                style={{ backgroundColor: a.color }}
              >
                {a.name.charAt(0)}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{a.name}</div>
                <div className="text-xs text-muted-foreground">
                  {ACCOUNT_TYPE_LABELS[a.type as AccountType] ?? a.type}
                </div>
              </div>
              <Money
                minor={a.balanceMinor}
                currency={a.currency}
                colored={a.balanceMinor < 0}
                className="text-sm font-semibold"
              />
            </Link>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
