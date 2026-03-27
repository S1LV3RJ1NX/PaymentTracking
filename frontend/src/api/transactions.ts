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

export async function attachPayment(id: string, file: File): Promise<{ paymentFileKey: string }> {
  const form = new FormData();
  form.append("file", file);
  const res = await api.post<{
    success: true;
    data: { id: string; paymentFileKey: string };
  }>(`/transactions/${id}/payment`, form, {
    headers: { "Content-Type": "multipart/form-data" },
    timeout: 60_000,
  });
  return res.data.data;
}

export async function attachBill(
  id: string,
  file: File,
): Promise<{ fileKey: string; paymentFileKey: string }> {
  const form = new FormData();
  form.append("file", file);
  const res = await api.post<{
    success: true;
    data: { id: string; fileKey: string; paymentFileKey: string };
  }>(`/transactions/${id}/bill`, form, {
    headers: { "Content-Type": "multipart/form-data" },
    timeout: 60_000,
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
