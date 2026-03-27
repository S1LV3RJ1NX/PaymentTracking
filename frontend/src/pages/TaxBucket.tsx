import { MetricCard } from "../components/MetricCard";
import { Spinner } from "../components/Spinner";
import { useState, useEffect, useCallback } from "react";
import { getTaxEstimate, saveTaxEstimate } from "../api/tax";
import { getDashboardSummary } from "../api/dashboard";
import { useFY } from "../context/FYContext";

function getFYStartYear(fy: string): number {
  const match = fy.match(/^FY(\d{2})-/);
  return match ? 2000 + parseInt(match[1]!, 10) : new Date().getFullYear();
}

// --- 44ADA Presumptive Taxation + New Regime Tax Computation ---

const PRESUMPTIVE_LIMIT = 7500000; // ₹75L — Sec 44ADA threshold
const PRESUMPTIVE_PROFIT_PCT = 50; // 50% of gross receipts deemed as profit
const REBATE_87A_LIMIT = 1200000; // ₹12L — Sec 87A taxable income ceiling
const REBATE_87A_MAX = 60000; // Max rebate amount under Sec 87A

interface SlabResult {
  from: number;
  to: number | null;
  rate: number;
  tax: number;
}

const SLABS = [
  { from: 0, to: 400000, rate: 0 },
  { from: 400000, to: 800000, rate: 5 },
  { from: 800000, to: 1200000, rate: 10 },
  { from: 1200000, to: 1600000, rate: 15 },
  { from: 1600000, to: 2000000, rate: 20 },
  { from: 2000000, to: 2400000, rate: 25 },
  { from: 2400000, to: Infinity, rate: 30 },
];

function computeSurchargeRate(taxableIncome: number): number {
  if (taxableIncome > 20000000) return 25;
  if (taxableIncome > 10000000) return 15;
  if (taxableIncome > 5000000) return 10;
  return 0;
}

interface TaxBreakdown {
  slabs: SlabResult[];
  basicTax: number;
  surchargeRate: number;
  surcharge: number;
  cess: number;
  rebate87A: number;
  totalTax: number;
  effectiveRate: number;
  is44ADA: boolean;
  taxableIncome: number;
}

function computeTax(grossReceipts: number): TaxBreakdown {
  const is44ADA = grossReceipts > 0 && grossReceipts <= PRESUMPTIVE_LIMIT;
  const taxableIncome = is44ADA
    ? Math.round(grossReceipts * (PRESUMPTIVE_PROFIT_PCT / 100))
    : grossReceipts;

  const slabs: SlabResult[] = [];
  let remaining = taxableIncome;
  let basicTax = 0;

  for (const slab of SLABS) {
    if (remaining <= 0) break;
    const width = slab.to === Infinity ? remaining : slab.to - slab.from;
    const taxable = Math.min(remaining, width);
    const tax = taxable * (slab.rate / 100);
    slabs.push({
      from: slab.from,
      to: slab.to === Infinity ? null : slab.to,
      rate: slab.rate,
      tax,
    });
    basicTax += tax;
    remaining -= taxable;
  }

  const surchargeRate = computeSurchargeRate(taxableIncome);
  const surcharge = basicTax * (surchargeRate / 100);
  const cess = (basicTax + surcharge) * 0.04;
  const taxBeforeRebate = Math.round(basicTax + surcharge + cess);

  const rebate87A =
    taxableIncome <= REBATE_87A_LIMIT ? Math.min(taxBeforeRebate, REBATE_87A_MAX) : 0;

  const totalTax = Math.max(0, taxBeforeRebate - rebate87A);

  return {
    slabs,
    basicTax: Math.round(basicTax),
    surchargeRate,
    surcharge: Math.round(surcharge),
    cess: Math.round(cess),
    rebate87A,
    totalTax,
    effectiveRate: grossReceipts > 0 ? (totalTax / grossReceipts) * 100 : 0,
    is44ADA,
    taxableIncome,
  };
}

// --- Formatting ---

function formatINR(n: number): string {
  if (n === 0) return "₹0";
  return "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

function formatLakhs(n: number): string {
  if (n >= 10000000) return "₹" + (n / 10000000).toFixed(1) + "Cr";
  if (n >= 100000) return "₹" + (n / 100000).toFixed(1) + "L";
  return formatINR(n);
}

function formatSlabRange(from: number, to: number | null): string {
  const f = formatLakhs(from);
  if (to === null) return `${f}+`;
  return `${f} – ${formatLakhs(to)}`;
}

// --- Component ---

export function TaxBucket() {
  const { fy } = useFY();
  const [estimatedAnnual, setEstimatedAnnual] = useState<number | null>(null);
  const [inputValue, setInputValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [ytdIncome, setYtdIncome] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [estimate, summary] = await Promise.all([
        getTaxEstimate(fy).catch(() => null),
        getDashboardSummary(fy).catch(() => null),
      ]);
      setEstimatedAnnual(estimate);
      setInputValue(estimate != null ? String(estimate) : "");
      setYtdIncome(summary?.income?.ytd_inr ?? 0);
    } finally {
      setLoading(false);
    }
  }, [fy]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const handleSave = async () => {
    const parsed = parseFloat(inputValue.replace(/,/g, ""));
    if (isNaN(parsed) || parsed < 0) return;
    setSaving(true);
    try {
      await saveTaxEstimate(fy, parsed);
      setEstimatedAnnual(parsed);
    } finally {
      setSaving(false);
    }
  };

  const gross = estimatedAnnual ?? 0;
  const tax = computeTax(gross);
  const netInHand = gross - tax.totalTax;
  const y = getFYStartYear(fy);

  const deadlines = [
    { date: `15 Jun ${y}`, pct: 15, incremental: "15%", color: "#378ADD" },
    { date: `15 Sep ${y}`, pct: 30, incremental: "+30%", color: "#EF9F27" },
    { date: `15 Dec ${y}`, pct: 30, incremental: "+30%", color: "#EF9F27" },
    { date: `15 Mar ${y + 1}`, pct: 25, incremental: "+25%", color: "#0F6E56" },
  ];
  let cumulativePct = 0;

  if (loading) {
    return (
      <div className="max-w-container mx-auto px-4 pt-6">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="max-w-container mx-auto px-4 pb-8 pt-6">
      <div className="mb-6">
        <h1 className="label-uppercase">Tax Planner</h1>
      </div>

      {/* Estimated earnings input */}
      <div className="border-thin border-border bg-surface-card mb-5 rounded-xl px-5 py-4">
        <div className="label-uppercase mb-3">Estimated Annual Earnings (Gross INR)</div>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <span className="text-text-tertiary absolute left-3 top-1/2 -translate-y-1/2 text-sm">
              ₹
            </span>
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleSave();
              }}
              placeholder="e.g. 2500000"
              className="border-thin border-border bg-surface text-text focus:ring-accent-blue/30 w-full rounded-lg py-2.5 pl-7 pr-3 text-sm focus:outline-none focus:ring-2"
            />
          </div>
          <button
            onClick={() => void handleSave()}
            disabled={saving}
            className="bg-text text-surface-card rounded-lg px-4 py-2.5 text-sm font-medium transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
        {estimatedAnnual == null && (
          <p className="text-text-tertiary mt-2 text-[11px]">
            Enter your estimated gross income for the year to see tax computation.
          </p>
        )}
      </div>

      {estimatedAnnual != null && estimatedAnnual > 0 && (
        <>
          {/* 44ADA indicator */}
          {tax.is44ADA && (
            <div className="border-thin border-accent-green/30 bg-accent-green/5 mb-5 rounded-xl px-5 py-3">
              <div className="flex items-center gap-2">
                <span className="bg-accent-green/15 text-accent-green rounded-full px-2 py-0.5 text-[11px] font-medium">
                  Sec 44ADA
                </span>
                <span className="text-text text-[13px]">Presumptive taxation applies</span>
                {tax.rebate87A > 0 && (
                  <span className="bg-accent-green/15 text-accent-green rounded-full px-2 py-0.5 text-[11px] font-medium">
                    87A Rebate
                  </span>
                )}
              </div>
              <p className="text-text-tertiary mt-1.5 text-[11px]">
                Gross receipts ≤ ₹75L — only 50% ({formatLakhs(tax.taxableIncome)}) is deemed
                taxable profit.
                {tax.rebate87A > 0
                  ? ` Taxable income ≤ ₹12L — Sec 87A rebate of ${formatINR(tax.rebate87A)} makes tax zero!`
                  : " No books of accounts required."}
              </p>
            </div>
          )}

          {!tax.is44ADA && (
            <div className="border-thin border-border bg-surface-card mb-5 rounded-xl px-5 py-3">
              <div className="flex items-center gap-2">
                <span className="bg-badge-amber text-badge-amber-text rounded-full px-2 py-0.5 text-[11px] font-medium">
                  Regular
                </span>
                <span className="text-text text-[13px]">Full gross is taxable</span>
              </div>
              <p className="text-text-tertiary mt-1.5 text-[11px]">
                Gross receipts &gt; ₹75L — Sec 44ADA not applicable. Tax computed on full gross (
                {formatLakhs(gross)}) under New Regime.
              </p>
            </div>
          )}

          {/* Metric cards */}
          <div className="mb-5 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            <MetricCard
              label="Gross Receipts"
              value={formatLakhs(gross)}
              subtitle={`Estimated for ${fy}`}
            />
            <MetricCard
              label="Taxable Income"
              value={formatLakhs(tax.taxableIncome)}
              subtitle={tax.is44ADA ? "50% under 44ADA" : "Full gross"}
            />
            <MetricCard
              label="Total Tax"
              value={tax.totalTax === 0 ? "₹0" : formatLakhs(tax.totalTax)}
              subtitle={
                tax.rebate87A > 0
                  ? "87A rebate applied"
                  : `Effective: ${tax.effectiveRate.toFixed(1)}%`
              }
              valueColor={tax.totalTax === 0 ? "green" : "red"}
            />
            <MetricCard
              label="Net In Hand"
              value={formatLakhs(netInHand)}
              subtitle="Gross − Tax"
              valueColor="green"
            />
          </div>

          {/* YTD progress */}
          {ytdIncome > 0 && (
            <div className="border-thin border-border bg-surface-card mb-5 rounded-xl px-5 py-4">
              <div className="label-uppercase mb-2">YTD Progress</div>
              <div className="mb-1 flex justify-between text-[13px]">
                <span className="text-text">Earned {formatLakhs(ytdIncome)}</span>
                <span className="text-text-tertiary">of {formatLakhs(gross)}</span>
              </div>
              <div className="bg-surface-muted h-2 overflow-hidden rounded">
                <div
                  className="bg-accent-green h-full rounded"
                  style={{ width: `${Math.min((ytdIncome / gross) * 100, 100)}%` }}
                />
              </div>
              <p className="text-text-tertiary mt-1.5 text-[11px]">
                {((ytdIncome / gross) * 100).toFixed(0)}% of estimated annual earnings
              </p>
            </div>
          )}

          {/* Slab-wise breakdown */}
          <div className="border-thin border-border bg-surface-card mb-5 rounded-xl px-5 py-4">
            <div className="label-uppercase mb-3">
              Slab-wise Tax{" "}
              <span className="bg-badge-amber text-badge-amber-text ml-1 rounded-full px-2 py-0.5 text-[11px] font-medium normal-case">
                New Regime
              </span>
              {tax.is44ADA && (
                <span className="bg-accent-green/15 text-accent-green ml-1 rounded-full px-2 py-0.5 text-[11px] font-medium normal-case">
                  44ADA
                </span>
              )}
            </div>

            {tax.is44ADA && (
              <div className="bg-surface-muted mb-3 flex items-center justify-between rounded-lg px-3 py-2 text-[12px]">
                <span className="text-text-secondary">Gross receipts</span>
                <span className="text-text">{formatINR(gross)}</span>
                <span className="text-text-tertiary">→ 50% =</span>
                <span className="text-text font-medium">
                  Taxable {formatINR(tax.taxableIncome)}
                </span>
              </div>
            )}

            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr>
                  <th className="border-border text-text-secondary border-b py-2 text-left text-[11px] font-medium uppercase tracking-wide">
                    Slab
                  </th>
                  <th className="border-border text-text-secondary border-b py-2 text-left text-[11px] font-medium uppercase tracking-wide">
                    Rate
                  </th>
                  <th className="border-border text-text-secondary border-b py-2 text-right text-[11px] font-medium uppercase tracking-wide">
                    Tax
                  </th>
                </tr>
              </thead>
              <tbody>
                {tax.slabs
                  .filter((s) => s.tax > 0 || s.rate === 0)
                  .map((s, i) => (
                    <tr key={i}>
                      <td className="border-border text-text border-b py-2">
                        {formatSlabRange(s.from, s.to)}
                      </td>
                      <td className="border-border text-text border-b py-2">{s.rate}%</td>
                      <td className="border-border text-text border-b py-2 text-right">
                        {formatINR(Math.round(s.tax))}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>

            <div className="bg-border my-3 h-px" />

            <table className="w-full text-[13px]">
              <tbody>
                <tr>
                  <td className="text-text-secondary py-1.5">Basic tax</td>
                  <td className="text-text py-1.5 text-right">{formatINR(tax.basicTax)}</td>
                </tr>
                {tax.surcharge > 0 && (
                  <tr>
                    <td className="text-text-secondary py-1.5">
                      Surcharge {tax.surchargeRate}%
                      <span className="bg-accent-red/10 text-accent-red ml-1 rounded-full px-1.5 py-0.5 text-[11px]">
                        income &gt;{" "}
                        {tax.taxableIncome > 20000000
                          ? "₹2Cr"
                          : tax.taxableIncome > 10000000
                            ? "₹1Cr"
                            : "₹50L"}
                      </span>
                    </td>
                    <td className="text-text py-1.5 text-right">{formatINR(tax.surcharge)}</td>
                  </tr>
                )}
                <tr>
                  <td className="text-text-secondary py-1.5">Health &amp; education cess 4%</td>
                  <td className="text-text py-1.5 text-right">{formatINR(tax.cess)}</td>
                </tr>
                {tax.rebate87A > 0 && (
                  <tr>
                    <td className="text-accent-green py-1.5">
                      Sec 87A rebate
                      <span className="bg-accent-green/10 ml-1 rounded-full px-1.5 py-0.5 text-[11px]">
                        income ≤ ₹12L
                      </span>
                    </td>
                    <td className="text-accent-green py-1.5 text-right">
                      −{formatINR(tax.rebate87A)}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>

            <div className="bg-border my-3 h-px" />

            <div className="flex items-center justify-between">
              <span className="text-text text-sm font-medium">Total Tax</span>
              <span
                className={`text-lg font-medium ${tax.totalTax === 0 ? "text-accent-green" : "text-accent-red"}`}
              >
                {tax.totalTax === 0 ? "₹0 🎉" : formatINR(tax.totalTax)}
              </span>
            </div>

            <p className="text-text-tertiary mt-2 text-[11px]">
              {tax.rebate87A > 0
                ? `Zero tax! Sec 87A rebate of ${formatINR(tax.rebate87A)} fully offsets the tax liability since taxable income ≤ ₹12L.`
                : `Effective rate: ${tax.effectiveRate.toFixed(1)}% on gross receipts. ${
                    tax.is44ADA
                      ? "50% deemed profit under Sec 44ADA. Tax computed on deemed profit under New Regime."
                      : "Tax on full gross under New Regime (no deductions)."
                  }`}
            </p>
          </div>

          {/* Advance tax schedule */}
          <div className="border-thin border-border bg-surface-card rounded-xl px-5 py-4">
            <div className="label-uppercase mb-3">Advance Tax Schedule</div>

            {deadlines.map((d) => {
              cumulativePct += d.pct;
              const amount = Math.round(tax.totalTax * (d.pct / 100));
              return (
                <div
                  key={d.date}
                  className="border-border flex items-center gap-3 border-b py-2.5 last:border-b-0"
                >
                  <span className="text-text-secondary min-w-[90px] text-xs">{d.date}</span>
                  <div
                    className="bg-surface-muted flex-1 overflow-hidden rounded"
                    style={{ height: 7 }}
                  >
                    <div
                      className="h-full rounded"
                      style={{ width: `${cumulativePct}%`, background: d.color }}
                    />
                  </div>
                  <span className="text-text-tertiary min-w-[28px] text-right text-[11px]">
                    {d.incremental}
                  </span>
                  <span className="text-text min-w-[85px] text-right text-[13px] font-medium">
                    {formatINR(amount)}
                  </span>
                </div>
              );
            })}

            <p className="text-text-tertiary mt-3 text-[11px]">
              Cumulative: 15% → 45% → 75% → 100%. Miss a date = 1% per month interest under Sec
              234B/234C.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
