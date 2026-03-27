import { useState, useEffect, useCallback } from "react";
import { getDashboardSummary, getMonthlyBreakdown } from "../api/dashboard";
import type { DashboardSummary, MonthlyEntry } from "../api/dashboard";

export function useDashboard(fy: string) {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [monthly, setMonthly] = useState<MonthlyEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [s, m] = await Promise.all([getDashboardSummary(fy), getMonthlyBreakdown(fy)]);
      setSummary(s);
      setMonthly(m.months);
    } catch {
      setSummary(null);
      setMonthly([]);
    } finally {
      setLoading(false);
    }
  }, [fy]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  return { fy, summary, monthly, loading, error };
}
