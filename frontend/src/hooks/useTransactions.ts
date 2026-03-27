import { useState, useEffect, useCallback } from "react";
import { getTransactions, updateTransaction, deleteTransaction } from "../api/transactions";
import type { TransactionRow } from "../api/transactions";

export function useTransactions(fy: string) {
  const [tab, setTab] = useState<"Income" | "Expenses">("Expenses");
  const [rows, setRows] = useState<TransactionRow[]>([]);
  const [months, setMonths] = useState<Record<string, TransactionRow[]>>({});
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getTransactions(tab, fy);
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
  }, [tab, fy]);

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

  return {
    tab,
    setTab,
    fy,
    rows,
    months,
    total,
    loading,
    error,
    update,
    remove,
    refetch: fetchData,
  };
}
