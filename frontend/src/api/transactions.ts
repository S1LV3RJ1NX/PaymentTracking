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
  opts?: { status?: string; business?: string; q?: string },
): Promise<TransactionsResponse> {
  const params = new URLSearchParams({ tab, fy });
  if (opts?.status) params.set("status", opts.status);
  if (opts?.business !== undefined) params.set("business", opts.business);
  if (opts?.q) params.set("q", opts.q);

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

export async function moveTransaction(
  id: string,
): Promise<{ business_pct: string; claimable_inr: string }> {
  const res = await api.patch<{
    success: true;
    data: { id: string; business_pct: string; claimable_inr: string };
  }>(`/transactions/${id}/move`);
  return res.data.data;
}

export interface PaymentEntry {
  paymentRow: number;
  expense_row: string;
  date: string;
  amount_inr: string;
  payment_method: string;
  upi_txn_id: string;
  file_key: string;
  confidence: string;
  added_at: string;
}

export async function getExpensePayments(expenseRowNum: number): Promise<PaymentEntry[]> {
  const res = await api.get<{
    success: true;
    data: { payments: PaymentEntry[] };
  }>(`/expenses/${expenseRowNum}/payments`);
  return res.data.data.payments;
}

export async function addExpensePayment(
  expenseRowNum: number,
  file: File,
  amountOverride?: string,
): Promise<{ paymentRowNum: number; paymentKey: string; status: string; totalPaid: number }> {
  const form = new FormData();
  form.append("file", file);
  if (amountOverride) form.append("amount_override", amountOverride);
  const res = await api.post<{
    success: true;
    data: { paymentRowNum: number; paymentKey: string; status: string; totalPaid: number };
  }>(`/expenses/${expenseRowNum}/payments`, form, {
    headers: { "Content-Type": "multipart/form-data" },
    timeout: 120_000,
  });
  return res.data.data;
}

export async function deleteExpensePayment(
  expenseRowNum: number,
  paymentRowNum: number,
): Promise<{ status: string; totalPaid: number }> {
  const res = await api.delete<{
    success: true;
    data: { deleted: boolean; status: string; totalPaid: number };
  }>(`/expenses/${expenseRowNum}/payments/${paymentRowNum}`);
  return res.data.data;
}

export async function replaceBill(
  expenseRowNum: number,
  file: File,
): Promise<{ fileKey: string; amount_inr: string; status: string; totalPaid: number }> {
  const form = new FormData();
  form.append("file", file);
  const res = await api.post<{
    success: true;
    data: { fileKey: string; amount_inr: string; status: string; totalPaid: number };
  }>(`/expenses/${expenseRowNum}/bill`, form, {
    headers: { "Content-Type": "multipart/form-data" },
    timeout: 120_000,
  });
  return res.data.data;
}

export async function attachFira(id: string, file: File): Promise<{ firaFileKey: string }> {
  const form = new FormData();
  form.append("file", file);
  const res = await api.post<{
    success: true;
    data: { id: string; firaFileKey: string };
  }>(`/transactions/${id}/fira`, form, {
    headers: { "Content-Type": "multipart/form-data" },
    timeout: 60_000,
  });
  return res.data.data;
}

export async function downloadFiles(keys: string[]): Promise<Blob> {
  const res = await api.post("/files/download", { keys }, { responseType: "blob" });
  return res.data as Blob;
}
