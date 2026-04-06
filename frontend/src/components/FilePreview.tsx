import { useEffect, useState, useCallback } from "react";
import { api } from "../api/client";
import type { PaymentEntry } from "../api/transactions";
import { getExpensePayments, addExpensePayment, deleteExpensePayment } from "../api/transactions";
import { maybeCompressImage } from "../lib/compressImage";

interface FilePreviewProps {
  fileKey: string;
  tabLabels?: [string, string];
  onClose: () => void;
  expenseRowNum?: number;
  invoiceAmount?: number;
  onPaymentsChanged?: () => void;
  firaFileKey?: string;
}

interface BlobState {
  objectUrl: string | null;
  mimeType: string;
  loading: boolean;
  error: string | null;
}

function useFileBlob(fileKey: string): BlobState {
  const [state, setState] = useState<BlobState>({
    objectUrl: null,
    mimeType: "",
    loading: true,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;

    async function fetchFile() {
      try {
        const res = await api.get(`/files/${encodeURIComponent(fileKey)}`, {
          responseType: "blob",
        });
        if (cancelled) return;
        const blob = res.data as Blob;
        setState({
          objectUrl: URL.createObjectURL(blob),
          mimeType: blob.type,
          loading: false,
          error: null,
        });
      } catch {
        if (!cancelled) setState((s) => ({ ...s, loading: false, error: "Failed to load file" }));
      }
    }

    setState({ objectUrl: null, mimeType: "", loading: true, error: null });
    void fetchFile();
    return () => {
      cancelled = true;
    };
  }, [fileKey]);

  useEffect(() => {
    return () => {
      if (state.objectUrl) URL.revokeObjectURL(state.objectUrl);
    };
  }, [state.objectUrl]);

  return state;
}

function PreviewBody({
  objectUrl,
  mimeType,
  fileName,
  loading,
  error,
}: {
  objectUrl: string | null;
  mimeType: string;
  fileName: string;
  loading: boolean;
  error: string | null;
}) {
  const isImage = mimeType.startsWith("image/");
  const isPdf = mimeType === "application/pdf";

  if (loading) {
    return (
      <div className="flex h-48 items-center justify-center">
        <div className="border-border border-t-accent-blue h-6 w-6 animate-spin rounded-full border-2" />
      </div>
    );
  }
  if (error) {
    return (
      <div className="text-accent-red flex h-48 items-center justify-center text-sm">{error}</div>
    );
  }
  if (!objectUrl) return null;

  if (isImage) {
    return (
      <img
        src={objectUrl}
        alt={fileName}
        className="mx-auto max-h-full rounded-lg object-contain"
      />
    );
  }
  if (isPdf) {
    return (
      <iframe src={objectUrl} title={fileName} className="h-full w-full rounded-lg border-0" />
    );
  }
  return (
    <div className="text-text-secondary flex h-48 flex-col items-center justify-center gap-3">
      <span className="text-3xl">📄</span>
      <span className="text-sm">Preview not available for this file type</span>
    </div>
  );
}

function DownloadButton({ objectUrl, fileName }: { objectUrl: string | null; fileName: string }) {
  if (!objectUrl) return null;

  return (
    <div className="border-border shrink-0 border-t px-4 py-3 text-center">
      <a
        href={objectUrl}
        download={fileName}
        className="bg-accent-blue hover:bg-accent-blue/90 inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-medium text-white transition-colors"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
        Download
      </a>
    </div>
  );
}

function FilePane({ fileKey }: { fileKey: string }) {
  const { objectUrl, mimeType, loading, error } = useFileBlob(fileKey);
  const fileName = fileKey.split("/").pop() ?? "file";

  return (
    <>
      <div className="min-h-0 flex-1 overflow-auto p-4">
        <PreviewBody
          objectUrl={objectUrl}
          mimeType={mimeType}
          fileName={fileName}
          loading={loading}
          error={error}
        />
      </div>
      <DownloadButton objectUrl={objectUrl} fileName={fileName} />
    </>
  );
}

function formatINR(val: number): string {
  return "₹" + val.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

function PaymentStatusBadge({
  status,
  totalPaid,
  invoiceAmount,
}: {
  status: string;
  totalPaid: number;
  invoiceAmount: number;
}) {
  const diff = totalPaid - invoiceAmount;
  const colorMap: Record<string, string> = {
    paid: "bg-green-100 text-green-800",
    partial: "bg-yellow-100 text-yellow-800",
    overpaid: "bg-red-100 text-red-800",
    unpaid: "bg-gray-100 text-gray-600",
  };

  return (
    <div className="flex items-center gap-2 px-4 py-2 text-xs">
      <span
        className={`rounded-full px-2 py-0.5 font-medium ${colorMap[status] ?? colorMap.unpaid}`}
      >
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
      <span className="text-text-secondary">
        {formatINR(totalPaid)} / {formatINR(invoiceAmount)}
      </span>
      {status === "partial" && (
        <span className="text-yellow-700">({formatINR(invoiceAmount - totalPaid)} remaining)</span>
      )}
      {status === "overpaid" && <span className="text-accent-red">({formatINR(diff)} over)</span>}
    </div>
  );
}

export function FilePreview({
  fileKey,
  tabLabels,
  onClose,
  expenseRowNum,
  invoiceAmount,
  onPaymentsChanged,
  firaFileKey,
}: FilePreviewProps) {
  const [docLabel] = tabLabels ?? ["Document", "Payments"];
  const isExpenseWithPayments = expenseRowNum !== undefined;

  const [activeTab, setActiveTab] = useState<"document" | "payments" | "fira">("document");
  const [payments, setPayments] = useState<PaymentEntry[]>([]);
  const [loadingPayments, setLoadingPayments] = useState(false);
  const [selectedPaymentIdx, setSelectedPaymentIdx] = useState(0);
  const [adding, setAdding] = useState(false);

  const fetchPayments = useCallback(async () => {
    if (!expenseRowNum) return;
    setLoadingPayments(true);
    try {
      const data = await getExpensePayments(expenseRowNum);
      setPayments(data);
    } catch {
      setPayments([]);
    } finally {
      setLoadingPayments(false);
    }
  }, [expenseRowNum]);

  useEffect(() => {
    if (isExpenseWithPayments) void fetchPayments();
  }, [isExpenseWithPayments, fetchPayments]);

  const totalPaid = payments.reduce((sum, p) => {
    const amt = parseFloat(p.amount_inr?.replace(/,/g, "") ?? "0");
    return sum + (isNaN(amt) ? 0 : amt);
  }, 0);

  const paymentStatus =
    payments.length === 0
      ? "unpaid"
      : Math.abs(totalPaid - (invoiceAmount ?? 0)) < 1
        ? "paid"
        : totalPaid < (invoiceAmount ?? 0)
          ? "partial"
          : "overpaid";

  const [paymentAmountInput, setPaymentAmountInput] = useState("");

  const handleAddPayment = async (file: File) => {
    if (!expenseRowNum) return;
    setAdding(true);
    try {
      const compressed = await maybeCompressImage(file);
      await addExpensePayment(expenseRowNum, compressed, paymentAmountInput || undefined);
      setPaymentAmountInput("");
      await fetchPayments();
      onPaymentsChanged?.();
    } catch {
      // silent
    } finally {
      setAdding(false);
    }
  };

  const handleDeletePayment = async (paymentRow: number) => {
    if (!expenseRowNum) return;
    try {
      await deleteExpensePayment(expenseRowNum, paymentRow);
      await fetchPayments();
      setSelectedPaymentIdx(0);
      onPaymentsChanged?.();
    } catch {
      // silent
    }
  };

  const firaKeys = firaFileKey ? firaFileKey.split(",").filter(Boolean) : [];
  const hasFira = firaKeys.length > 0;
  const [selectedFiraIdx, setSelectedFiraIdx] = useState(0);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 py-4"
      onClick={onClose}
    >
      <div
        className="border-thin border-border bg-surface-card relative flex h-[92vh] w-full max-w-2xl flex-col rounded-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="border-border flex shrink-0 items-center justify-between border-b px-4 py-3">
          <span className="text-text truncate text-sm font-medium">
            {fileKey.split("/").pop() ?? "file"}
          </span>
          <button
            onClick={onClose}
            className="text-text-secondary hover:bg-surface-muted rounded-md p-1"
            aria-label="Close preview"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        {(isExpenseWithPayments || hasFira) && (
          <div className="border-border flex shrink-0 gap-1 border-b px-4 py-2">
            <button
              onClick={() => setActiveTab("document")}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                activeTab === "document"
                  ? "bg-accent-blue/10 text-accent-blue"
                  : "text-text-secondary hover:text-text"
              }`}
            >
              {docLabel}
            </button>
            {isExpenseWithPayments && (
              <button
                onClick={() => setActiveTab("payments")}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  activeTab === "payments"
                    ? "bg-accent-blue/10 text-accent-blue"
                    : "text-text-secondary hover:text-text"
                }`}
              >
                Payments
                {payments.length > 0 && (
                  <span className="bg-accent-blue/20 text-accent-blue ml-1.5 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[10px] font-semibold">
                    {payments.length}
                  </span>
                )}
              </button>
            )}
            {hasFira && (
              <button
                onClick={() => setActiveTab("fira")}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  activeTab === "fira"
                    ? "bg-accent-blue/10 text-accent-blue"
                    : "text-text-secondary hover:text-text"
                }`}
              >
                FIRA
                {firaKeys.length > 1 && (
                  <span className="bg-accent-blue/20 text-accent-blue ml-1.5 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[10px] font-semibold">
                    {firaKeys.length}
                  </span>
                )}
              </button>
            )}
          </div>
        )}

        {/* Content */}
        {activeTab === "document" && <FilePane key={fileKey} fileKey={fileKey} />}

        {activeTab === "fira" && hasFira && (
          <div className="flex min-h-0 flex-1 flex-col">
            {firaKeys.length > 1 && (
              <div className="flex flex-wrap items-center gap-1.5 px-4 py-2">
                {firaKeys.map((_, idx) => (
                  <button
                    key={idx}
                    onClick={() => setSelectedFiraIdx(idx)}
                    className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
                      selectedFiraIdx === idx
                        ? "bg-accent-blue text-white"
                        : "bg-surface-muted text-text-secondary hover:text-text"
                    }`}
                  >
                    FIRA #{idx + 1}
                  </button>
                ))}
              </div>
            )}
            {firaKeys[selectedFiraIdx] && (
              <FilePane key={firaKeys[selectedFiraIdx]} fileKey={firaKeys[selectedFiraIdx]!} />
            )}
          </div>
        )}

        {activeTab === "payments" && isExpenseWithPayments && (
          <div className="flex min-h-0 flex-1 flex-col">
            {/* Payment status bar */}
            {invoiceAmount !== undefined && invoiceAmount > 0 && (
              <PaymentStatusBadge
                status={paymentStatus}
                totalPaid={totalPaid}
                invoiceAmount={invoiceAmount}
              />
            )}

            {loadingPayments ? (
              <div className="flex h-48 items-center justify-center">
                <div className="border-border border-t-accent-blue h-6 w-6 animate-spin rounded-full border-2" />
              </div>
            ) : payments.length === 0 ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8">
                <span className="text-text-tertiary text-sm">No payment proofs yet</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={paymentAmountInput}
                  onChange={(e) => setPaymentAmountInput(e.target.value)}
                  placeholder="Amount (blank = OCR)"
                  className="border-thin border-border bg-surface-card text-text placeholder:text-text-tertiary focus:ring-accent-blue/30 w-48 rounded-lg px-3 py-1.5 text-center text-sm focus:outline-none focus:ring-2"
                />
                <label className="bg-accent-blue hover:bg-accent-blue/90 cursor-pointer rounded-lg px-4 py-2 text-xs font-medium text-white transition-colors">
                  {adding ? "Uploading..." : "Add Payment Proof"}
                  <input
                    type="file"
                    accept="image/*,application/pdf"
                    className="hidden"
                    disabled={adding}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void handleAddPayment(f);
                    }}
                  />
                </label>
              </div>
            ) : (
              <>
                {/* Payment pills */}
                <div className="flex flex-wrap items-center gap-1.5 px-4 py-2">
                  {payments.map((p, idx) => {
                    const amt = parseFloat(p.amount_inr?.replace(/,/g, "") ?? "0");
                    return (
                      <button
                        key={p.paymentRow}
                        onClick={() => setSelectedPaymentIdx(idx)}
                        className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
                          selectedPaymentIdx === idx
                            ? "bg-accent-blue text-white"
                            : "bg-surface-muted text-text-secondary hover:text-text"
                        }`}
                      >
                        #{idx + 1}
                        {!isNaN(amt) && amt > 0 && (
                          <span className="opacity-80">{formatINR(amt)}</span>
                        )}
                      </button>
                    );
                  })}
                  <label className="bg-surface-muted text-text-secondary hover:text-text flex cursor-pointer items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors">
                    {adding ? "..." : "+ Add"}
                    <input
                      type="file"
                      accept="image/*,application/pdf"
                      className="hidden"
                      disabled={adding}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) void handleAddPayment(f);
                      }}
                    />
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={paymentAmountInput}
                    onChange={(e) => setPaymentAmountInput(e.target.value)}
                    placeholder="Amt (blank = OCR)"
                    className="border-thin border-border bg-surface-card text-text placeholder:text-text-tertiary focus:ring-accent-blue/30 ml-auto w-32 rounded-full px-2.5 py-1 text-[11px] focus:outline-none focus:ring-2"
                  />
                </div>

                {/* Selected payment preview */}
                {payments[selectedPaymentIdx] && (
                  <div className="flex min-h-0 flex-1 flex-col">
                    <div className="border-border flex items-center justify-between border-t px-4 py-1.5 text-[11px]">
                      <span className="text-text-secondary">
                        {payments[selectedPaymentIdx]!.date}
                        {payments[selectedPaymentIdx]!.payment_method &&
                          ` · ${payments[selectedPaymentIdx]!.payment_method}`}
                        {payments[selectedPaymentIdx]!.upi_txn_id &&
                          ` · ${payments[selectedPaymentIdx]!.upi_txn_id}`}
                      </span>
                      <button
                        onClick={() =>
                          void handleDeletePayment(payments[selectedPaymentIdx]!.paymentRow)
                        }
                        className="text-accent-red hover:bg-accent-red/10 rounded px-2 py-0.5 text-[11px] transition-colors"
                      >
                        Remove
                      </button>
                    </div>
                    <FilePane
                      key={payments[selectedPaymentIdx]!.file_key}
                      fileKey={payments[selectedPaymentIdx]!.file_key}
                    />
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
