import { useDashboard } from "../hooks/useDashboard";
import { MetricCard } from "../components/MetricCard";
import { Spinner } from "../components/Spinner";
import { CategoryPill } from "../components/CategoryPill";
import { getCategoryHex } from "../lib/constants";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import type { TooltipProps } from "recharts";
import { useNavigate } from "react-router-dom";
import { getStoredRole } from "../api/client";
import { useFY } from "../context/FYContext";

function formatINR(n: number): string {
  if (n >= 100000) {
    return "₹" + (n / 100000).toFixed(1) + "L";
  }
  return "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

function formatMonthLabel(month: string): string {
  const [, m] = month.split("-");
  const names = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  return names[parseInt(m!, 10) - 1] ?? month;
}

const COLOR_MAP: Record<string, string> = {
  income: "#0F6E56",
  businessExpenses: "#A32D2D",
  nonBusinessExpenses: "#D4836A",
};

function ChartTooltip({ active, payload, label }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null;

  const hoveredKey = payload[0]!.dataKey as string;
  const row = payload[0]!.payload as Record<string, number>;
  const isExpense = hoveredKey === "businessExpenses" || hoveredKey === "nonBusinessExpenses";

  return (
    <div
      className="bg-surface-card rounded-lg border px-3 py-2 shadow-sm"
      style={{ fontSize: 12, border: "0.5px solid #d3d1c7" }}
    >
      <p className="text-text mb-1 font-medium">{label}</p>
      {isExpense ? (
        <>
          <p style={{ color: COLOR_MAP.businessExpenses }}>
            Business : {formatINR(row.businessExpenses ?? 0)}
          </p>
          <p style={{ color: COLOR_MAP.nonBusinessExpenses }}>
            Non-business : {formatINR(row.nonBusinessExpenses ?? 0)}
          </p>
          <p className="text-text border-border mt-1 border-t pt-1 font-medium">
            Total Expenses :{" "}
            {formatINR((row.businessExpenses ?? 0) + (row.nonBusinessExpenses ?? 0))}
          </p>
        </>
      ) : (
        <p style={{ color: COLOR_MAP.income }}>Income : {formatINR(row.income ?? 0)}</p>
      )}
    </div>
  );
}

interface PieEntry {
  category: string;
  value: number;
}

function mergeCategoryMaps(
  ...maps: (Record<string, number> | undefined | null)[]
): Record<string, number> {
  const merged: Record<string, number> = {};
  for (const m of maps) {
    if (!m) continue;
    for (const [k, v] of Object.entries(m)) {
      merged[k] = (merged[k] ?? 0) + v;
    }
  }
  return merged;
}

function toPieData(map: Record<string, number>): PieEntry[] {
  return Object.entries(map)
    .filter(([, v]) => v > 0)
    .sort(([, a], [, b]) => b - a)
    .map(([category, value]) => ({ category, value }));
}

function PieTooltipContent({ active, payload }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null;
  const entry = payload[0]!.payload as PieEntry;
  const total = (payload[0]!.payload as { __total?: number }).__total ?? 1;
  const pct = ((entry.value / total) * 100).toFixed(1);
  return (
    <div
      className="bg-surface-card rounded-lg border px-3 py-2 shadow-sm"
      style={{ fontSize: 12, border: "0.5px solid #d3d1c7" }}
    >
      <div className="mb-1">
        <CategoryPill category={entry.category} />
      </div>
      <p className="text-text font-medium">
        {formatINR(entry.value)} <span className="text-text-secondary font-normal">({pct}%)</span>
      </p>
    </div>
  );
}

function renderPieLabel({
  cx,
  cy,
  midAngle,
  outerRadius,
  percent,
}: {
  cx: number;
  cy: number;
  midAngle: number;
  outerRadius: number;
  percent: number;
}) {
  if (percent < 0.04) return null;
  const RADIAN = Math.PI / 180;
  const radius = outerRadius + 14;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);
  return (
    <text
      x={x}
      y={y}
      fill="#888780"
      textAnchor={x > cx ? "start" : "end"}
      dominantBaseline="central"
      fontSize={10}
    >
      {(percent * 100).toFixed(0)}%
    </text>
  );
}

function CategoryPieChart({ title, data }: { title: string; data: PieEntry[] }) {
  if (data.length === 0) return null;
  const total = data.reduce((sum, d) => sum + d.value, 0);
  const enriched = data.map((d) => ({ ...d, __total: total }));
  return (
    <div className="border-thin border-border bg-surface-card rounded-xl px-4 py-4">
      <div className="label-uppercase mb-2 text-center">{title}</div>
      <ResponsiveContainer width="100%" height={200}>
        <PieChart>
          <Pie
            data={enriched}
            dataKey="value"
            nameKey="category"
            cx="50%"
            cy="50%"
            outerRadius={65}
            innerRadius={28}
            label={renderPieLabel}
            labelLine={false}
          >
            {enriched.map((entry) => (
              <Cell key={entry.category} fill={getCategoryHex(entry.category)} />
            ))}
          </Pie>
          <Tooltip content={<PieTooltipContent />} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

export function Dashboard() {
  const { fy } = useFY();
  const { summary, monthly, loading, error } = useDashboard(fy);
  const navigate = useNavigate();
  const isOwner = getStoredRole() === "owner";

  const chartData = summary
    ? monthly.map((m) => ({
        month: formatMonthLabel(m.month),
        income: Math.round(m.income),
        businessExpenses: Math.round(m.businessExpenses),
        nonBusinessExpenses: Math.round(m.nonBusinessExpenses),
      }))
    : [];

  return (
    <div className="max-w-container mx-auto px-4 pb-8 pt-6">
      <div className="mb-6">
        <h1 className="label-uppercase">Dashboard</h1>
      </div>

      {loading ? (
        <Spinner />
      ) : error ? (
        <div className="bg-accent-red/10 rounded-lg px-3 py-2.5">
          <p className="text-accent-red text-sm">{error}</p>
        </div>
      ) : !summary ? (
        <div className="text-text-tertiary py-12 text-center text-sm">
          {isOwner
            ? "No data available yet. Upload your first document to get started."
            : "No data available yet. Ask the client to upload the invoice / expense document to get started."}
        </div>
      ) : (
        <>
          {/* Metric cards */}
          <div className="mb-5 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            <MetricCard
              label="YTD Income"
              value={formatINR(summary.income.ytd_inr)}
              subtitle={`${Object.keys(summary.income.by_client).length} client(s)`}
              valueColor="green"
            />
            <MetricCard
              label="Business Expenses"
              value={formatINR(summary.expenses.ytd_claimable)}
              subtitle={`${Object.keys(summary.expenses.by_category).length} categories`}
              valueColor="red"
            />
            <MetricCard
              label="Non-business Expenses"
              value={formatINR(summary.non_business_expenses)}
              subtitle="Not tax-deductible"
            />
            <MetricCard
              label="Total Expenses"
              value={formatINR(summary.expenses.ytd_claimable + summary.non_business_expenses)}
              subtitle="Business + Non-business"
              valueColor="red"
            />
          </div>

          {/* Monthly chart */}
          {chartData.length > 0 && (
            <div className="card border-thin border-border bg-surface-card mb-5 rounded-xl px-5 py-4">
              <div className="label-uppercase mb-4">Monthly Income vs Expenses</div>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={chartData} barGap={4}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eceae3" />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#888780" }} />
                  <YAxis
                    tick={{ fontSize: 11, fill: "#888780" }}
                    tickFormatter={(v: number) => formatINR(v)}
                  />
                  <Tooltip
                    content={<ChartTooltip />}
                    shared={false}
                    cursor={{ fill: "transparent" }}
                  />
                  <Legend
                    formatter={(value: string) =>
                      value === "income"
                        ? "Income"
                        : value === "businessExpenses"
                          ? "Business Exp."
                          : "Non-business Exp."
                    }
                    iconSize={10}
                    wrapperStyle={{ fontSize: 11 }}
                  />
                  <Bar dataKey="income" fill="#0F6E56" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="businessExpenses" stackId="expenses" fill="#A32D2D" />
                  <Bar
                    dataKey="nonBusinessExpenses"
                    stackId="expenses"
                    fill="#D4836A"
                    radius={[3, 3, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Client breakdown */}
          {Object.keys(summary.income.by_client).length > 0 && (
            <div className="border-thin border-border bg-surface-card mb-5 rounded-xl px-5 py-4">
              <div className="label-uppercase mb-3">Income by Client</div>
              {Object.entries(summary.income.by_client)
                .sort(([, a], [, b]) => b - a)
                .map(([client, amount]) => (
                  <div
                    key={client}
                    className="border-border flex items-center justify-between border-b py-2 text-[13px] last:border-b-0"
                  >
                    <span className="text-text">{client}</span>
                    <span className="text-accent-green font-medium">{formatINR(amount)}</span>
                  </div>
                ))}
            </div>
          )}

          {/* Expenses by category — pie charts */}
          {(Object.keys(summary.expenses.by_category).length > 0 ||
            Object.keys(summary.non_business_by_category).length > 0) && (
            <>
              <div className="mb-5 grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                <CategoryPieChart
                  title="All Expenses"
                  data={toPieData(
                    mergeCategoryMaps(
                      summary.expenses.by_category,
                      summary.non_business_by_category,
                    ),
                  )}
                />
                <CategoryPieChart title="Business" data={toPieData(summary.expenses.by_category)} />
                <CategoryPieChart
                  title="Non-business"
                  data={toPieData(summary.non_business_by_category)}
                />
              </div>

              <div className="border-thin border-border bg-surface-card mb-5 rounded-xl px-5 py-4">
                <div className="label-uppercase mb-3">Expenses by Category</div>
                {(() => {
                  const catMap = mergeCategoryMaps(
                    summary.expenses.by_category,
                    summary.non_business_by_category,
                  );
                  const total = Object.values(catMap).reduce((s, v) => s + v, 0) || 1;
                  return Object.entries(catMap)
                    .sort(([, a], [, b]) => b - a)
                    .map(([category, amount]) => (
                      <div
                        key={category}
                        className="border-border flex items-center justify-between border-b py-2 text-[13px] last:border-b-0"
                      >
                        <CategoryPill category={category} />
                        <span className="text-accent-red font-medium">
                          {formatINR(amount)}{" "}
                          <span className="text-text-secondary font-normal">
                            ({((amount / total) * 100).toFixed(1)}%)
                          </span>
                        </span>
                      </div>
                    ));
                })()}
              </div>
            </>
          )}

          {/* Quick links */}
          <div className={`grid gap-2.5 ${isOwner ? "grid-cols-2" : "grid-cols-1"}`}>
            {isOwner && (
              <button
                onClick={() => navigate("/upload")}
                className="border-thin border-border bg-surface-card text-text hover:bg-surface-muted rounded-lg px-4 py-3 text-sm font-medium transition-colors"
              >
                Upload Document
              </button>
            )}
            <button
              onClick={() => navigate("/transactions")}
              className="border-thin border-border bg-surface-card text-text hover:bg-surface-muted rounded-lg px-4 py-3 text-sm font-medium transition-colors"
            >
              View Transactions
            </button>
          </div>
        </>
      )}
    </div>
  );
}
