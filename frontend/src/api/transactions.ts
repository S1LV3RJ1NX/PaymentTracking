import { api } from "./client";

export interface TransactionRow {
  id: string;
  rowNum: number;
  tab: string;
  values: Record<string, string>;
}

export interface TransactionsResponse {
  rows: TransactionRow[];
  total: number;
  months: Record<string, TransactionRow[]>;
}

export async function getTransactions(
  tab: string,
  fy: string,
  status?: string,
): Promise<TransactionsResponse> {
  const params = new URLSearchParams({ tab, fy });
  if (status) params.set("status", status);

  const res = await api.get<{ success: true; data: TransactionsResponse }>(
    `/transactions?${params}`,
  );
  return res.data.data;
}

export async function updateTransaction(id: string, values: string[]): Promise<void> {
  await api.patch(`/transactions/${id}`, { values });
}

export async function deleteTransaction(id: string): Promise<void> {
  await api.delete(`/transactions/${id}`);
}
