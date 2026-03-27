import { api } from "./client";

export interface DashboardSummary {
  fy: string;
  income: { ytd_inr: number; by_client: Record<string, number> };
  expenses: { ytd_claimable: number; by_category: Record<string, number> };
  non_business_expenses: number;
  review_count: number;
}

export interface MonthlyEntry {
  month: string;
  income: number;
  expenses: number;
  businessExpenses: number;
  nonBusinessExpenses: number;
}

export interface MonthlyResponse {
  fy: string;
  months: MonthlyEntry[];
}

export async function getDashboardSummary(fy: string): Promise<DashboardSummary> {
  const res = await api.get<{ success: true; data: DashboardSummary }>(
    `/dashboard/summary?fy=${fy}`,
  );
  return res.data.data;
}

export async function getMonthlyBreakdown(fy: string): Promise<MonthlyResponse> {
  const res = await api.get<{ success: true; data: MonthlyResponse }>(
    `/dashboard/monthly?fy=${fy}`,
  );
  return res.data.data;
}
