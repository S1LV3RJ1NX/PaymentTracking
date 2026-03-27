import { useState } from "react";
import { useTransactions } from "../hooks/useTransactions";
import { ReviewBadge } from "../components/ReviewBadge";
import { Spinner } from "../components/Spinner";
import { getStoredRole } from "../api/client";
import { useFY } from "../context/FYContext";

const INCOME_FIELDS = ["date", "client", "invoice_number", "inr_amount", "confidence"];
const EXPENSE_FIELDS = ["date", "description", "category", "amount_inr", "confidence"];

function formatMonth(month: string): string {
  const [y, m] = month.split("-");
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
  return `${names[parseInt(m!, 10) - 1]} ${y}`;
}

function formatINR(val: string): string {
  const n = parseFloat(val.replace(/,/g, ""));
  if (isNaN(n)) return val;
  return "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

interface EditModalProps {
  row: { id: string; values: Record<string, string> };
  fields: string[];
  onSave: (id: string, values: string[]) => void;
  onClose: () => void;
}

function EditModal({ row, fields, onSave, onClose }: EditModalProps) {
  const allFields = row.values;
  const [edited, setEdited] = useState<Record<string, string>>({ ...allFields });

  const handleSave = () => {
    const allKeys = Object.keys(allFields);
    const values = allKeys.map((k) => edited[k] ?? "");
    onSave(row.id, values);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4"
      onClick={onClose}
    >
      <div
        className="border-thin border-border bg-surface-card w-full max-w-md rounded-xl p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="label-uppercase mb-4">Edit Transaction</h3>
        <div className="max-h-[60vh] space-y-3 overflow-y-auto">
          {fields
            .filter((f) => f !== "confidence")
            .map((field) => (
              <div key={field}>
                <label className="text-text-secondary mb-1 block text-[11px] font-medium uppercase tracking-wide">
                  {field.replace(/_/g, " ")}
                </label>
                <input
                  type="text"
                  value={edited[field] ?? ""}
                  onChange={(e) => setEdited((s) => ({ ...s, [field]: e.target.value }))}
                  className="border-thin border-border bg-surface text-text focus:ring-accent-blue/30 w-full rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2"
                />
              </div>
            ))}
        </div>
        <div className="mt-4 flex gap-2">
          <button
            onClick={onClose}
            className="border-thin border-border bg-surface text-text flex-1 rounded-lg px-3 py-2 text-sm"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="bg-text text-surface-card flex-1 rounded-lg px-3 py-2 text-sm font-medium"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

export function Transactions() {
  const { fy } = useFY();
  const { tab, setTab, months, total, loading, error, update, remove } = useTransactions(fy);
  const role = getStoredRole();
  const isOwner = role === "owner";
  const [editingRow, setEditingRow] = useState<{
    id: string;
    values: Record<string, string>;
  } | null>(null);
  const fields = tab === "Income" ? INCOME_FIELDS : EXPENSE_FIELDS;
  const allFields =
    tab === "Income"
      ? [
          "date",
          "client",
          "invoice_number",
          "usd_amount",
          "inr_amount",
          "skydo_prn",
          "fira_drive_url",
          "fira_ref",
          "drive_url",
          "confidence",
          "added_at",
        ]
      : [
          "date",
          "description",
          "category",
          "amount_inr",
          "business_pct",
          "claimable_inr",
          "paid_via",
          "vendor",
          "drive_url",
          "confidence",
          "added_at",
        ];

  const sortedMonths = Object.keys(months).sort().reverse();

  return (
    <div className="max-w-container mx-auto px-4 pb-8 pt-6">
      <div className="mb-6">
        <h1 className="label-uppercase">Transactions</h1>
      </div>

      {/* Tab selector */}
      <div className="bg-surface-muted mb-5 flex gap-1 rounded-lg p-1">
        {(["Income", "Expenses"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
              tab === t
                ? "bg-surface-card text-text shadow-sm"
                : "text-text-secondary hover:text-text"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {loading && <Spinner />}

      {error && (
        <div className="bg-accent-red/10 rounded-lg px-3 py-2.5">
          <p className="text-accent-red text-sm">{error}</p>
        </div>
      )}

      {!loading && !error && total === 0 && (
        <div className="text-text-tertiary py-12 text-center text-sm">No transactions for {fy}</div>
      )}

      {!loading &&
        !error &&
        sortedMonths.map((month) => (
          <div key={month} className="mb-6">
            <h2 className="label-uppercase mb-3">{formatMonth(month)}</h2>
            <div className="border-thin border-border bg-surface-card rounded-xl">
              <table className="w-full text-[13px]">
                <thead>
                  <tr>
                    {fields.map((f) => (
                      <th
                        key={f}
                        className="border-border text-text-secondary border-b px-4 py-2 text-left text-[11px] font-medium uppercase tracking-wide last:text-right"
                      >
                        {f.replace(/_/g, " ")}
                      </th>
                    ))}
                    {isOwner && (
                      <th className="border-border text-text-secondary border-b px-4 py-2 text-right text-[11px] font-medium uppercase tracking-wide">
                        Actions
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {months[month]?.map((row) => (
                    <tr key={row.id} className="border-border border-b last:border-b-0">
                      {fields.map((f) => (
                        <td key={f} className="text-text px-4 py-2.5 last:text-right">
                          {f === "confidence" ? (
                            <ReviewBadge confidence={row.values[f] ?? "high"} />
                          ) : f === "inr_amount" || f === "amount_inr" ? (
                            formatINR(row.values[f] ?? "0")
                          ) : (
                            (row.values[f] ?? "")
                          )}
                        </td>
                      ))}
                      {isOwner && (
                        <td className="px-4 py-2.5 text-right">
                          <button
                            onClick={() => setEditingRow({ id: row.id, values: row.values })}
                            className="text-accent-blue mr-2 text-xs hover:underline"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => {
                              if (confirm("Delete this transaction?")) void remove(row.id);
                            }}
                            className="text-accent-red text-xs hover:underline"
                          >
                            Delete
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}

      <div className="text-text-tertiary mt-4 text-center text-xs">
        {total} transaction{total !== 1 ? "s" : ""} in {fy}
      </div>

      {editingRow && (
        <EditModal
          row={editingRow}
          fields={allFields}
          onSave={(id, values) => void update(id, values)}
          onClose={() => setEditingRow(null)}
        />
      )}
    </div>
  );
}
