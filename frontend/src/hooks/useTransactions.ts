import { useState, useEffect, useCallback } from "react";
import {
  getTransactions,
  updateTransaction,
  deleteTransaction,
  moveTransaction,
  attachPayment,
  attachBill,
  attachFira,
} from "../api/transactions";
import type { TransactionRow } from "../api/transactions";

export function useTransactions(fy: string) {
  const [tab, setTab] = useState<"Income" | "Expenses">("Expenses");
  const [businessFilter, setBusinessFilter] = useState<string | undefined>("true");
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<TransactionRow[]>([]);
  const [months, setMonths] = useState<Record<string, TransactionRow[]>>({});
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
    async (id: string, file: File) => {
      await attachPayment(id, file);
      await fetchData();
    },
    [fetchData],
  );

  const addBill = useCallback(
    async (id: string, file: File) => {
      await attachBill(id, file);
      await fetchData();
    },
    [fetchData],
  );

  const addFira = useCallback(
    async (id: string, file: File) => {
      await attachFira(id, file);
      await fetchData();
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
    addBill,
    addFira,
    refetch: fetchData,
  };
}
