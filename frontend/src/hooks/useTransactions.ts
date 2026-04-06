import { useState, useEffect, useCallback } from "react";
import {
  getTransactions,
  updateTransaction,
  deleteTransaction,
  moveTransaction,
  attachFira,
  addExpensePayment,
  replaceBill,
  addManualPayment as apiAddManualPayment,
} from "../api/transactions";
import type { TransactionRow, ManualPaymentData } from "../api/transactions";
import { maybeCompressImage } from "../lib/compressImage";

export function useTransactions(fy: string) {
  const [tab, setTab] = useState<"Income" | "Expenses">("Expenses");
  const [businessFilter, setBusinessFilter] = useState<string | undefined>("true");
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<TransactionRow[]>([]);
  const [months, setMonths] = useState<Record<string, TransactionRow[]>>({});
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const opts: { business?: string; q?: string } = {};
      if (tab === "Expenses" && businessFilter !== undefined) {
        opts.business = businessFilter;
      }
      if (search.trim()) opts.q = search.trim();
      const data = await getTransactions(tab, fy, opts);
      setRows(data.rows);
      setMonths(data.months);
      setTotal(data.total);
    } catch {
      setRows([]);
      setMonths({});
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [tab, fy, businessFilter, search]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const update = useCallback(
    async (id: string, values: string[]) => {
      await updateTransaction(id, values);
      await fetchData();
    },
    [fetchData],
  );

  const remove = useCallback(
    async (id: string) => {
      await deleteTransaction(id);
      await fetchData();
    },
    [fetchData],
  );

  const move = useCallback(
    async (id: string) => {
      await moveTransaction(id);
      await fetchData();
    },
    [fetchData],
  );

  const addPayment = useCallback(
    async (rowNum: number, file: File, amountOverride?: string) => {
      setUploading(true);
      setUploadError(null);
      try {
        await addExpensePayment(rowNum, await maybeCompressImage(file), amountOverride);
        await fetchData();
      } catch (e) {
        setUploadError(e instanceof Error ? e.message : "Upload failed");
        throw e;
      } finally {
        setUploading(false);
      }
    },
    [fetchData],
  );

  const swapBill = useCallback(
    async (rowNum: number, file: File) => {
      setUploading(true);
      setUploadError(null);
      try {
        await replaceBill(rowNum, await maybeCompressImage(file));
        await fetchData();
      } catch (e) {
        setUploadError(e instanceof Error ? e.message : "Upload failed");
        throw e;
      } finally {
        setUploading(false);
      }
    },
    [fetchData],
  );

  const addManualPaymentRef = useCallback(
    async (rowNum: number, data: ManualPaymentData) => {
      setUploading(true);
      setUploadError(null);
      try {
        await apiAddManualPayment(rowNum, data);
        await fetchData();
      } catch (e) {
        setUploadError(e instanceof Error ? e.message : "Failed to add reference");
        throw e;
      } finally {
        setUploading(false);
      }
    },
    [fetchData],
  );

  const addBatchManualPayment = useCallback(
    async (
      entries: { rowNum: number; data: ManualPaymentData }[],
      onProgress?: (done: number, total: number) => void,
    ) => {
      setUploading(true);
      setUploadError(null);
      try {
        for (let i = 0; i < entries.length; i++) {
          await apiAddManualPayment(entries[i]!.rowNum, entries[i]!.data);
          onProgress?.(i + 1, entries.length);
        }
        await fetchData();
      } catch (e) {
        setUploadError(e instanceof Error ? e.message : "Batch reference failed");
        throw e;
      } finally {
        setUploading(false);
      }
    },
    [fetchData],
  );

  const addFira = useCallback(
    async (id: string, file: File) => {
      setUploading(true);
      setUploadError(null);
      try {
        await attachFira(id, await maybeCompressImage(file));
        await fetchData();
      } catch (e) {
        setUploadError(e instanceof Error ? e.message : "Upload failed");
        throw e;
      } finally {
        setUploading(false);
      }
    },
    [fetchData],
  );

  return {
    tab,
    setTab,
    businessFilter,
    setBusinessFilter,
    search,
    setSearch,
    fy,
    rows,
    months,
    total,
    loading,
    error,
    update,
    remove,
    move,
    addPayment,
    swapBill,
    addFira,
    addManualPaymentRef,
    addBatchManualPayment,
    uploading,
    uploadError,
    refetch: fetchData,
  };
}
