import { useState, useRef, useEffect, useCallback } from "react";
import { useTransactions } from "../hooks/useTransactions";
import { ReviewBadge } from "../components/ReviewBadge";
import { Spinner } from "../components/Spinner";
import { FilePreview } from "../components/FilePreview";
import { Tooltip } from "../components/Tooltip";
import { CategoryPill } from "../components/CategoryPill";
import { ComboInput } from "../components/ComboInput";
import { EXPENSE_CATEGORIES } from "../lib/constants";
import { getStoredRole } from "../api/client";
import { downloadFiles } from "../api/transactions";
import { useFY } from "../context/FYContext";

function PaymentStatusPill({ status }: { status: string }) {
  const styles: Record<string, string> = {
    paid: "bg-green-100 text-green-800",
    partial: "bg-yellow-100 text-yellow-800",
    overpaid: "bg-red-100 text-red-800",
    unpaid: "bg-gray-100 text-gray-500",
  };
  if (!status || status === "unpaid")
    return <span className="text-text-tertiary text-[11px]">—</span>;
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${styles[status] ?? styles.unpaid}`}
    >
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

const INCOME_FIELDS = ["date", "client", "invoice_number", "inr_amount", "confidence"];
const EXPENSE_FIELDS = [
  "date",
  "description",
  "category",
  "amount_inr",
  "payment_status",
  "confidence",
];

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
  categoryOptions?: string[];
  onSave: (id: string, values: string[]) => void;
  onClose: () => void;
}

function EditModal({ row, fields, categoryOptions, onSave, onClose }: EditModalProps) {
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
          {fields.map((field) => (
            <div key={field}>
              {field === "category" && categoryOptions ? (
                <ComboInput
                  label={field.replace(/_/g, " ")}
                  id="edit-category"
                  value={edited[field] ?? ""}
                  options={categoryOptions}
                  onChange={(v) => setEdited((s) => ({ ...s, [field]: v }))}
                  normalize
                />
              ) : (
                <>
                  <label className="text-text-secondary mb-1 block text-[11px] font-medium uppercase tracking-wide">
                    {field.replace(/_/g, " ")}
                  </label>
                  <input
                    type="text"
                    value={edited[field] ?? ""}
                    onChange={(e) => setEdited((s) => ({ ...s, [field]: e.target.value }))}
                    className="border-thin border-border bg-surface text-text focus:ring-accent-blue/30 w-full rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2"
                  />
                </>
              )}
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

function AttachModal({
  attachType,
  hasExistingFile,
  onAttach,
  onClose,
  uploading,
  uploadError,
}: {
  attachType: "payment" | "bill" | "fira";
  hasExistingFile: boolean;
  onAttach: (file: File, type: "payment" | "bill" | "fira") => void;
  onClose: () => void;
  uploading: boolean;
  uploadError: string | null;
}) {
  const [selectedType, setSelectedType] = useState(attachType);
  const showChoice = attachType === "payment" && hasExistingFile;

  const labels: Record<string, string> = {
    payment: "Add Payment Proof",
    bill: "Replace Bill / Invoice",
    fira: "Attach FIRA Certificate",
  };

  const descriptions: Record<string, string> = {
    payment: "Upload a payment screenshot or receipt. OCR will extract the amount automatically.",
    bill: "Replace the main document with the actual bill/invoice. This re-runs OCR and updates the expense amount.",
    fira: "Upload the FIRA certificate for this income transaction.",
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4"
      onClick={uploading ? undefined : onClose}
    >
      <div
        className="border-thin border-border bg-surface-card w-full max-w-sm rounded-xl p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="label-uppercase mb-4">
          {showChoice ? "Attach Document" : labels[attachType]}
        </h3>

        {showChoice ? (
          <div className="mb-4 space-y-2">
            <p className="text-text-secondary mb-3 text-[13px]">What are you attaching?</p>
            {(["payment", "bill"] as const).map((t) => (
              <label
                key={t}
                className={`border-thin flex cursor-pointer items-start gap-3 rounded-lg p-3 transition-colors ${
                  selectedType === t ? "border-accent-blue bg-accent-blue/5" : "border-border"
                }`}
              >
                <input
                  type="radio"
                  name="attach-type"
                  checked={selectedType === t}
                  onChange={() => setSelectedType(t)}
                  className="accent-accent-blue mt-0.5"
                />
                <div>
                  <span className="text-text text-sm font-medium">{labels[t]}</span>
                  <p className="text-text-tertiary text-[12px] leading-snug">{descriptions[t]}</p>
                </div>
              </label>
            ))}
          </div>
        ) : (
          <p className="text-text-secondary mb-3 text-[13px]">{descriptions[attachType]}</p>
        )}

        {uploading ? (
          <div className="mb-4 flex flex-col items-center gap-3 py-4">
            <svg
              className="text-accent-blue h-6 w-6 animate-spin"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
            <p className="text-text-secondary text-sm">Processing with OCR…</p>
          </div>
        ) : (
          <input
            type="file"
            accept="image/*,application/pdf"
            className="text-text mb-4 block w-full text-sm"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onAttach(f, selectedType);
            }}
          />
        )}

        {uploadError && (
          <div className="bg-accent-red/10 mb-4 rounded-lg px-3 py-2">
            <p className="text-accent-red text-sm">{uploadError}</p>
          </div>
        )}

        <button
          onClick={onClose}
          disabled={uploading}
          className="border-thin border-border bg-surface text-text w-full rounded-lg px-3 py-2 text-sm disabled:opacity-40"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

export function Transactions() {
  const { fy } = useFY();
  const {
    tab,
    setTab,
    businessFilter,
    setBusinessFilter,
    search,
    setSearch,
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
    uploading,
    uploadError,
    rows,
    refetch,
  } = useTransactions(fy);
  const role = getStoredRole();
  const isOwner = role === "owner";
  const [editingRow, setEditingRow] = useState<{
    id: string;
    values: Record<string, string>;
  } | null>(null);
  const [previewKey, setPreviewKey] = useState<string | null>(null);
  const [previewExpenseRowNum, setPreviewExpenseRowNum] = useState<number | undefined>(undefined);
  const [previewInvoiceAmount, setPreviewInvoiceAmount] = useState<number | undefined>(undefined);
  const [previewFiraKey, setPreviewFiraKey] = useState<string | undefined>(undefined);
  const [previewTabLabels, setPreviewTabLabels] = useState<[string, string] | undefined>(undefined);
  const [attachingId, setAttachingId] = useState<string | null>(null);
  const [attachingType, setAttachingType] = useState<"payment" | "bill" | "fira">("payment");
  const [attachingRowNum, setAttachingRowNum] = useState<number>(0);
  const [attachingHasFile, setAttachingHasFile] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [downloading, setDownloading] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const handleSearchInput = useCallback(
    (val: string) => {
      setSearchInput(val);
      clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => setSearch(val), 300);
    },
    [setSearch],
  );

  useEffect(() => {
    return () => clearTimeout(debounceRef.current);
  }, []);

  useEffect(() => {
    setSelected(new Set());
  }, [tab, fy, businessFilter, search]);

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
          "file_key",
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
          "file_key",
          "confidence",
          "added_at",
          "payment_status",
          "total_paid",
        ];

  const categoryOptions =
    tab === "Expenses"
      ? [
          ...new Set([
            ...EXPENSE_CATEGORIES,
            ...rows.map((r) => r.values.category).filter((c): c is string => !!c),
          ]),
        ]
      : undefined;

  const sortedMonths = Object.keys(months).sort().reverse();

  const allRowIds = rows.map((r) => r.id);
  const allSelected = allRowIds.length > 0 && allRowIds.every((id) => selected.has(id));

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(allRowIds));
    }
  };

  const handleBulkDownload = async () => {
    const keys = rows
      .filter((r) => selected.has(r.id) && r.values.file_key)
      .map((r) => r.values.file_key!);
    if (keys.length === 0) return;

    setDownloading(true);
    try {
      if (keys.length === 1) {
        const res = await fetch(`/api/files/${encodeURIComponent(keys[0]!)}`, {
          headers: { Authorization: `Bearer ${localStorage.getItem("token") ?? ""}` },
        });
        const blob = await res.blob();
        triggerDownload(blob, keys[0]!.split("/").pop() ?? "file");
      } else {
        const blob = await downloadFiles(keys);
        triggerDownload(blob, "documents.zip");
      }
    } catch {
      /* silently fail */
    } finally {
      setDownloading(false);
    }
  };

  function triggerDownload(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="max-w-container mx-auto px-4 pb-8 pt-6">
      <div className="mb-6">
        <h1 className="label-uppercase">Transactions</h1>
      </div>

      {/* Tab selector */}
      <div className="bg-surface-muted mb-3 flex gap-1 rounded-lg p-1">
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

      {/* Business / Non-business sub-toggle (Expenses only) */}
      {tab === "Expenses" && (
        <div className="bg-surface-muted mb-3 flex gap-1 rounded-lg p-1">
          {[
            { val: "true", label: "Business" },
            { val: "false", label: "Non-business" },
          ].map((opt) => (
            <button
              key={opt.val}
              onClick={() => setBusinessFilter(businessFilter === opt.val ? undefined : opt.val)}
              className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                businessFilter === opt.val
                  ? "bg-surface-card text-text shadow-sm"
                  : "text-text-secondary hover:text-text"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}

      {/* Search bar */}
      <div className="mb-5">
        <input
          type="text"
          placeholder="Search transactions..."
          value={searchInput}
          onChange={(e) => handleSearchInput(e.target.value)}
          className="border-thin border-border bg-surface-card text-text placeholder:text-text-tertiary focus:ring-accent-blue/30 w-full rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2"
        />
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
            <div className="border-thin border-border bg-surface-card overflow-x-auto rounded-xl">
              <table className="w-full text-[13px]">
                <thead>
                  <tr>
                    <th className="border-border border-b px-2 py-2">
                      <input
                        type="checkbox"
                        checked={allSelected}
                        onChange={toggleSelectAll}
                        className="accent-accent-blue"
                      />
                    </th>
                    {fields.map((f) => (
                      <th
                        key={f}
                        className="border-border text-text-secondary border-b px-4 py-2 text-left text-[11px] font-medium uppercase tracking-wide last:text-right"
                      >
                        {f.replace(/_/g, " ")}
                      </th>
                    ))}
                    <th className="border-border text-text-secondary border-b px-4 py-2 text-right text-[11px] font-medium uppercase tracking-wide">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {months[month]?.map((row) => (
                    <tr key={row.id} className="border-border border-b last:border-b-0">
                      <td className="px-2 py-2.5">
                        <input
                          type="checkbox"
                          checked={selected.has(row.id)}
                          onChange={() => toggleSelect(row.id)}
                          className="accent-accent-blue"
                        />
                      </td>
                      {fields.map((f) => (
                        <td key={f} className="text-text px-4 py-2.5 last:text-right">
                          {f === "confidence" ? (
                            <ReviewBadge confidence={row.values[f] ?? "high"} />
                          ) : f === "payment_status" ? (
                            <PaymentStatusPill status={row.values[f] ?? ""} />
                          ) : f === "category" && row.values[f] ? (
                            <CategoryPill category={row.values[f]} />
                          ) : f === "inr_amount" || f === "amount_inr" ? (
                            formatINR(row.values[f] ?? "0")
                          ) : (
                            (row.values[f] ?? "")
                          )}
                        </td>
                      ))}
                      <td className="px-4 py-2.5 text-right">
                        <div className="inline-flex items-center gap-1">
                          {row.values.file_key && (
                            <Tooltip label="View file">
                              <button
                                aria-label="View file"
                                onClick={() => {
                                  setPreviewKey(row.values.file_key!);
                                  if (tab === "Income") {
                                    setPreviewFiraKey(row.values.fira_drive_url || undefined);
                                    setPreviewTabLabels(
                                      row.values.fira_drive_url
                                        ? ["Skydo Invoice", "FIRA"]
                                        : undefined,
                                    );
                                    setPreviewExpenseRowNum(undefined);
                                    setPreviewInvoiceAmount(undefined);
                                  } else {
                                    setPreviewExpenseRowNum(row.rowNum);
                                    const amt = parseFloat(
                                      (row.values.amount_inr ?? "0").replace(/,/g, ""),
                                    );
                                    setPreviewInvoiceAmount(isNaN(amt) ? 0 : amt);
                                    setPreviewFiraKey(undefined);
                                    setPreviewTabLabels(undefined);
                                  }
                                }}
                                className="text-text-secondary hover:bg-accent-blue/10 hover:text-accent-blue rounded-md p-1.5 transition-colors"
                              >
                                <svg
                                  xmlns="http://www.w3.org/2000/svg"
                                  width="15"
                                  height="15"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                >
                                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                                  <circle cx="12" cy="12" r="3" />
                                </svg>
                              </button>
                            </Tooltip>
                          )}

                          {tab === "Income" && isOwner && !row.values.fira_drive_url && (
                            <Tooltip label="Attach FIRA">
                              <button
                                aria-label="Attach FIRA"
                                onClick={() => {
                                  setAttachingId(row.id);
                                  setAttachingType("fira");
                                }}
                                className="text-text-secondary hover:bg-accent-blue/10 hover:text-accent-blue rounded-md p-1.5 transition-colors"
                              >
                                <svg
                                  xmlns="http://www.w3.org/2000/svg"
                                  width="15"
                                  height="15"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                >
                                  <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                                </svg>
                              </button>
                            </Tooltip>
                          )}

                          {tab === "Expenses" && isOwner && (
                            <Tooltip label="Attach document">
                              <button
                                aria-label="Attach document"
                                onClick={() => {
                                  setAttachingId(row.id);
                                  setAttachingRowNum(row.rowNum);
                                  setAttachingType("payment");
                                  setAttachingHasFile(!!row.values.file_key);
                                }}
                                className="text-text-secondary hover:bg-accent-blue/10 hover:text-accent-blue rounded-md p-1.5 transition-colors"
                              >
                                <svg
                                  xmlns="http://www.w3.org/2000/svg"
                                  width="15"
                                  height="15"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                >
                                  <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                                </svg>
                              </button>
                            </Tooltip>
                          )}

                          {tab === "Expenses" && (
                            <Tooltip
                              label={
                                row.values.business_pct === "0"
                                  ? "Move to Business"
                                  : "Move to Non-business"
                              }
                            >
                              <button
                                aria-label={
                                  row.values.business_pct === "0"
                                    ? "Move to Business"
                                    : "Move to Non-business"
                                }
                                onClick={() => void move(row.id)}
                                className="text-text-secondary hover:bg-accent-blue/10 hover:text-accent-blue rounded-md p-1.5 transition-colors"
                              >
                                <svg
                                  xmlns="http://www.w3.org/2000/svg"
                                  width="15"
                                  height="15"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                >
                                  <path d="M8 3 4 7l4 4" />
                                  <path d="M4 7h16" />
                                  <path d="m16 21 4-4-4-4" />
                                  <path d="M20 17H4" />
                                </svg>
                              </button>
                            </Tooltip>
                          )}

                          {isOwner && (
                            <>
                              <Tooltip label="Edit">
                                <button
                                  aria-label="Edit"
                                  onClick={() => setEditingRow({ id: row.id, values: row.values })}
                                  className="text-text-secondary hover:bg-accent-blue/10 hover:text-accent-blue rounded-md p-1.5 transition-colors"
                                >
                                  <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    width="15"
                                    height="15"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                  >
                                    <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                                    <path d="m15 5 4 4" />
                                  </svg>
                                </button>
                              </Tooltip>
                              <Tooltip label="Delete">
                                <button
                                  aria-label="Delete"
                                  onClick={() => setDeletingId(row.id)}
                                  className="text-accent-red hover:bg-accent-red/10 rounded-md p-1.5 transition-colors"
                                >
                                  <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    width="15"
                                    height="15"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                  >
                                    <path d="M3 6h18" />
                                    <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                                    <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                                  </svg>
                                </button>
                              </Tooltip>
                            </>
                          )}
                        </div>
                      </td>
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

      {/* Floating bulk download bar */}
      {selected.size > 0 && (
        <div className="bg-surface-card border-thin border-border fixed bottom-6 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3 rounded-xl px-5 py-3 shadow-lg">
          <span className="text-text text-sm font-medium">{selected.size} selected</span>
          <button
            onClick={() => void handleBulkDownload()}
            disabled={downloading}
            className="bg-accent-blue rounded-lg px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {downloading ? "Downloading…" : `Download (${selected.size})`}
          </button>
          <button
            onClick={() => setSelected(new Set())}
            className="text-text-secondary hover:text-text text-sm"
          >
            Clear
          </button>
        </div>
      )}

      {editingRow && (
        <EditModal
          row={editingRow}
          fields={allFields}
          categoryOptions={categoryOptions}
          onSave={(id, values) => void update(id, values)}
          onClose={() => setEditingRow(null)}
        />
      )}

      {previewKey && (
        <FilePreview
          fileKey={previewKey}
          tabLabels={previewTabLabels}
          firaFileKey={previewFiraKey}
          expenseRowNum={previewExpenseRowNum}
          invoiceAmount={previewInvoiceAmount}
          onPaymentsChanged={() => void refetch()}
          onClose={() => {
            setPreviewKey(null);
            setPreviewExpenseRowNum(undefined);
            setPreviewInvoiceAmount(undefined);
            setPreviewFiraKey(undefined);
            setPreviewTabLabels(undefined);
          }}
        />
      )}

      {attachingId && (
        <AttachModal
          attachType={attachingType}
          hasExistingFile={attachingHasFile}
          uploading={uploading}
          uploadError={uploadError}
          onAttach={async (file, type) => {
            try {
              if (type === "fira") await addFira(attachingId, file);
              else if (type === "bill") await swapBill(attachingRowNum, file);
              else await addPayment(attachingRowNum, file);
              setAttachingId(null);
            } catch {
              /* error is shown in modal via uploadError */
            }
          }}
          onClose={() => setAttachingId(null)}
        />
      )}

      {deletingId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4"
          onClick={() => setDeletingId(null)}
        >
          <div
            className="border-thin border-border bg-surface-card w-full max-w-sm rounded-xl p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-text mb-2 text-sm font-semibold">Delete transaction?</h3>
            <p className="text-text-secondary mb-5 text-[13px] leading-relaxed">
              Are you sure you want to delete this transaction? This will also remove any linked
              files.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setDeletingId(null)}
                className="border-thin border-border bg-surface text-text flex-1 rounded-lg px-3 py-2 text-sm"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  void remove(deletingId);
                  setDeletingId(null);
                }}
                className="bg-accent-red flex-1 rounded-lg px-3 py-2 text-sm font-medium text-white"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
