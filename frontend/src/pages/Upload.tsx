import { useEffect } from "react";
import { DropZone } from "../components/DropZone";
import { useUpload } from "../hooks/useUpload";
import { ComboInput } from "../components/ComboInput";
import { EXPENSE_CATEGORIES } from "../lib/constants";
import type { UploadType } from "../api/types";

const UPLOAD_TYPES: { value: UploadType; label: string; hint: string }[] = [
  { value: "skydo_invoice", label: "Skydo Invoice", hint: "Income invoice from Skydo" },
  { value: "fira", label: "FIRA / BIRC", hint: "Bank inward remittance certificate" },
  { value: "expense", label: "Expense", hint: "Bill, UPI screenshot, receipt" },
  { value: "other", label: "Other", hint: "Any other financial document" },
];

const PAYMENT_METHODS = ["upi", "card", "bank", "other"] as const;

function FieldInput({
  label,
  value,
  onChange,
  type = "text",
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  disabled?: boolean;
}) {
  return (
    <div>
      <label className="label-uppercase mb-1 block">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="border-thin border-border bg-surface-card text-text placeholder:text-text-tertiary focus:ring-accent-blue/30 w-full rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 disabled:opacity-50"
      />
    </div>
  );
}

function SelectInput({
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  options: readonly string[];
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <div>
      <label className="label-uppercase mb-1 block">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="border-thin border-border bg-surface-card text-text focus:ring-accent-blue/30 w-full rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 disabled:opacity-50"
      >
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt.replace(/_/g, " ")}
          </option>
        ))}
      </select>
    </div>
  );
}

function ExpenseReviewForm({
  fields,
  businessPct,
  onUpdateField,
  onSetBusinessPct,
  disabled,
}: {
  fields: Record<string, unknown>;
  businessPct: number;
  onUpdateField: (key: string, value: unknown) => void;
  onSetBusinessPct: (v: number) => void;
  disabled: boolean;
}) {
  return (
    <div className="space-y-3">
      <FieldInput
        label="Date"
        type="date"
        value={String(fields["date"] ?? "")}
        onChange={(v) => onUpdateField("date", v)}
        disabled={disabled}
      />
      <FieldInput
        label="Amount (INR)"
        type="number"
        value={String(fields["amount_inr"] ?? "")}
        onChange={(v) => onUpdateField("amount_inr", v ? Number(v) : "")}
        disabled={disabled}
      />
      <FieldInput
        label="Vendor"
        value={String(fields["vendor"] ?? "")}
        onChange={(v) => onUpdateField("vendor", v)}
        disabled={disabled}
      />
      <ComboInput
        label="Category"
        id="upload-category"
        value={String(fields["category"] ?? "other")}
        options={[...EXPENSE_CATEGORIES]}
        onChange={(v) => onUpdateField("category", v)}
        disabled={disabled}
        normalize
      />
      <FieldInput
        label="Description"
        value={String(fields["description"] ?? "")}
        onChange={(v) => onUpdateField("description", v)}
        disabled={disabled}
      />
      <SelectInput
        label="Payment method"
        value={String(fields["payment_method"] ?? "other")}
        options={PAYMENT_METHODS}
        onChange={(v) => onUpdateField("payment_method", v)}
        disabled={disabled}
      />
      <div>
        <p className="label-uppercase mb-1">Expense type</p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => onSetBusinessPct(100)}
            disabled={disabled}
            className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
              businessPct === 100
                ? "border-accent-blue bg-accent-blue/5 text-accent-blue"
                : "border-border text-text-secondary hover:border-accent-blue/40"
            }`}
          >
            Business
          </button>
          <button
            type="button"
            onClick={() => onSetBusinessPct(0)}
            disabled={disabled}
            className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
              businessPct === 0
                ? "border-accent-blue bg-accent-blue/5 text-accent-blue"
                : "border-border text-text-secondary hover:border-accent-blue/40"
            }`}
          >
            Non-business
          </button>
        </div>
      </div>
    </div>
  );
}

function SkydoReviewForm({
  fields,
  onUpdateField,
  disabled,
}: {
  fields: Record<string, unknown>;
  onUpdateField: (key: string, value: unknown) => void;
  disabled: boolean;
}) {
  return (
    <div className="space-y-3">
      <FieldInput
        label="Date"
        type="date"
        value={String(fields["date"] ?? "")}
        onChange={(v) => onUpdateField("date", v)}
        disabled={disabled}
      />
      <FieldInput
        label="Payer"
        value={String(fields["payer"] ?? "")}
        onChange={(v) => onUpdateField("payer", v)}
        disabled={disabled}
      />
      <FieldInput
        label="Invoice number"
        value={String(fields["invoice_number"] ?? "")}
        onChange={(v) => onUpdateField("invoice_number", v)}
        disabled={disabled}
      />
      <FieldInput
        label="USD amount"
        type="number"
        value={String(fields["usd_amount"] ?? "")}
        onChange={(v) => onUpdateField("usd_amount", v ? Number(v) : "")}
        disabled={disabled}
      />
      <FieldInput
        label="Net INR received"
        type="number"
        value={String(fields["net_inr_received"] ?? "")}
        onChange={(v) => onUpdateField("net_inr_received", v ? Number(v) : "")}
        disabled={disabled}
      />
      <FieldInput
        label="Skydo PRN"
        value={String(fields["skydo_prn"] ?? "")}
        onChange={(v) => onUpdateField("skydo_prn", v)}
        disabled={disabled}
      />
      <FieldInput
        label="Skydo charges (INR)"
        type="number"
        value={String(fields["skydo_charges_inr"] ?? "")}
        onChange={(v) => onUpdateField("skydo_charges_inr", v ? Number(v) : "")}
        disabled={disabled}
      />
    </div>
  );
}

function FiraReviewForm({
  fields,
  onUpdateField,
  disabled,
}: {
  fields: Record<string, unknown>;
  onUpdateField: (key: string, value: unknown) => void;
  disabled: boolean;
}) {
  return (
    <div className="space-y-3">
      <FieldInput
        label="Processed date"
        type="date"
        value={String(fields["processed_date"] ?? "")}
        onChange={(v) => onUpdateField("processed_date", v)}
        disabled={disabled}
      />
      <FieldInput
        label="INR amount"
        type="number"
        value={String(fields["inr_amount"] ?? "")}
        onChange={(v) => onUpdateField("inr_amount", v ? Number(v) : "")}
        disabled={disabled}
      />
      <FieldInput
        label="Remitter name"
        value={String(fields["remitter_name"] ?? "")}
        onChange={(v) => onUpdateField("remitter_name", v)}
        disabled={disabled}
      />
      <FieldInput
        label="Transaction ref"
        value={String(fields["transaction_ref"] ?? "")}
        onChange={(v) => onUpdateField("transaction_ref", v)}
        disabled={disabled}
      />
    </div>
  );
}

function OtherReviewForm({
  fields,
  businessPct,
  onUpdateField,
  onSetBusinessPct,
  disabled,
}: {
  fields: Record<string, unknown>;
  businessPct: number;
  onUpdateField: (key: string, value: unknown) => void;
  onSetBusinessPct: (v: number) => void;
  disabled: boolean;
}) {
  return (
    <div className="space-y-3">
      <FieldInput
        label="Date"
        type="date"
        value={String(fields["date"] ?? "")}
        onChange={(v) => onUpdateField("date", v)}
        disabled={disabled}
      />
      <FieldInput
        label="Amount"
        type="number"
        value={String(fields["amount"] ?? fields["amount_inr"] ?? "")}
        onChange={(v) => onUpdateField("amount", v ? Number(v) : "")}
        disabled={disabled}
      />
      <FieldInput
        label="Description"
        value={String(fields["description"] ?? "")}
        onChange={(v) => onUpdateField("description", v)}
        disabled={disabled}
      />
      <FieldInput
        label="Vendor / Client"
        value={String(fields["vendor_or_client"] ?? fields["vendor"] ?? "")}
        onChange={(v) => onUpdateField("vendor_or_client", v)}
        disabled={disabled}
      />
      <div>
        <p className="label-uppercase mb-1">Expense type</p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => onSetBusinessPct(100)}
            disabled={disabled}
            className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
              businessPct === 100
                ? "border-accent-blue bg-accent-blue/5 text-accent-blue"
                : "border-border text-text-secondary hover:border-accent-blue/40"
            }`}
          >
            Business
          </button>
          <button
            type="button"
            onClick={() => onSetBusinessPct(0)}
            disabled={disabled}
            className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
              businessPct === 0
                ? "border-accent-blue bg-accent-blue/5 text-accent-blue"
                : "border-border text-text-secondary hover:border-accent-blue/40"
            }`}
          >
            Non-business
          </button>
        </div>
      </div>
    </div>
  );
}

function ReviewForm({
  uploadType,
  fields,
  businessPct,
  ocrStatus,
  onUpdateField,
  onSetBusinessPct,
  onConfirm,
  onCancel,
  isConfirming,
  error,
}: {
  uploadType: UploadType;
  fields: Record<string, unknown>;
  businessPct: number;
  ocrStatus: "confirmed" | "review" | null;
  onUpdateField: (key: string, value: unknown) => void;
  onSetBusinessPct: (v: number) => void;
  onConfirm: () => void;
  onCancel: () => void;
  isConfirming: boolean;
  error: string | null;
}) {
  const borderColor = ocrStatus === "confirmed" ? "border-accent-green" : "border-accent-amber";
  const badgeColor =
    ocrStatus === "confirmed"
      ? "bg-accent-green/10 text-accent-green"
      : "bg-badge-amber text-badge-amber-text";

  return (
    <div className={`rounded-xl border-2 ${borderColor} bg-surface-card px-4 py-4`}>
      <div className="mb-4 flex items-center justify-between">
        <span className="label-uppercase">Review {uploadType.replace(/_/g, " ")}</span>
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${badgeColor}`}>
          {ocrStatus ?? "review"}
        </span>
      </div>

      {uploadType === "expense" && (
        <ExpenseReviewForm
          fields={fields}
          businessPct={businessPct}
          onUpdateField={onUpdateField}
          onSetBusinessPct={onSetBusinessPct}
          disabled={isConfirming}
        />
      )}
      {uploadType === "skydo_invoice" && (
        <SkydoReviewForm fields={fields} onUpdateField={onUpdateField} disabled={isConfirming} />
      )}
      {uploadType === "fira" && (
        <FiraReviewForm fields={fields} onUpdateField={onUpdateField} disabled={isConfirming} />
      )}
      {uploadType === "other" && (
        <OtherReviewForm
          fields={fields}
          businessPct={businessPct}
          onUpdateField={onUpdateField}
          onSetBusinessPct={onSetBusinessPct}
          disabled={isConfirming}
        />
      )}

      {error && (
        <div className="bg-accent-red/10 mt-3 rounded-lg px-3 py-2">
          <p className="text-accent-red text-sm">{error}</p>
        </div>
      )}

      <div className="mt-4 flex gap-3">
        <button
          onClick={onCancel}
          disabled={isConfirming}
          className="border-thin border-border text-text-secondary hover:bg-surface-muted flex-1 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors disabled:opacity-40"
        >
          Cancel
        </button>
        <button
          onClick={onConfirm}
          disabled={isConfirming}
          className="bg-accent-blue flex-1 rounded-lg px-4 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {isConfirming ? "Saving…" : "Confirm & Save"}
        </button>
      </div>
    </div>
  );
}

function SuccessCard({
  uploadType,
  fileKey,
  confirmResult,
  onReset,
}: {
  uploadType: UploadType;
  fileKey: string | null;
  confirmResult: Record<string, unknown> | null;
  onReset: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="border-accent-green bg-surface-card rounded-xl border-2 px-4 py-4">
        <div className="mb-3 flex items-center justify-between">
          <span className="label-uppercase">{uploadType.replace(/_/g, " ")}</span>
          <span className="bg-accent-green/10 text-accent-green rounded-full px-2 py-0.5 text-[11px] font-medium">
            saved
          </span>
        </div>

        {fileKey && (
          <p className="text-text-tertiary text-center text-xs">
            Saved as: {fileKey.split("/").pop()}
          </p>
        )}

        {confirmResult?.["linked"] !== undefined && (
          <p className="text-text-tertiary mt-2 text-center text-xs">
            {confirmResult["linked"]
              ? `FIRA linked to Income row ${confirmResult["matchedRow"]}`
              : String(confirmResult["message"] ?? "")}
          </p>
        )}
      </div>
      <button
        onClick={onReset}
        className="bg-text text-surface-card w-full rounded-lg px-4 py-3 text-sm font-medium transition-opacity hover:opacity-90"
      >
        Upload another
      </button>
    </div>
  );
}

export function Upload() {
  const {
    status,
    file,
    uploadType,
    description,
    businessPct,
    extractedFields,
    fileKey,
    ocrStatus,
    confirmResult,
    error,
    progress,
    setFile,
    setUploadType,
    setDescription,
    setBusinessPct,
    updateField,
    submit,
    confirm,
    cancel,
    reset,
  } = useUpload();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("shared") === "1") {
      (async () => {
        try {
          const cache = await caches.open("share-target");
          const res = await cache.match("shared-file");
          if (res) {
            const blob = await res.blob();
            const name = res.headers.get("X-Filename") ?? "shared-file";
            const f = new File([blob], name, { type: blob.type });
            setFile(f);
            await cache.delete("shared-file");
          }
        } catch {
          /* cache API may not be available */
        }
        window.history.replaceState({}, "", "/upload");
      })();
    }
  }, [setFile]);

  const isExtracting = status === "extracting";
  const isReview = status === "review" || status === "confirming";
  const showDescription = !isReview && (uploadType === "expense" || uploadType === "other");
  const showBusinessToggle = !isReview && (uploadType === "expense" || uploadType === "other");

  if (status === "success") {
    return (
      <div className="bg-surface mx-auto min-h-screen max-w-lg px-4 pb-8 pt-6">
        <h1 className="label-uppercase mb-6 text-center">Upload Document</h1>
        <SuccessCard
          uploadType={uploadType}
          fileKey={fileKey}
          confirmResult={confirmResult as Record<string, unknown> | null}
          onReset={reset}
        />
      </div>
    );
  }

  if (isReview && extractedFields) {
    return (
      <div className="bg-surface mx-auto min-h-screen max-w-lg px-4 pb-8 pt-6">
        <h1 className="label-uppercase mb-6 text-center">Upload Document</h1>
        <ReviewForm
          uploadType={uploadType}
          fields={extractedFields}
          businessPct={businessPct}
          ocrStatus={ocrStatus}
          onUpdateField={updateField}
          onSetBusinessPct={setBusinessPct}
          onConfirm={confirm}
          onCancel={cancel}
          isConfirming={status === "confirming"}
          error={error}
        />
      </div>
    );
  }

  return (
    <div className="bg-surface mx-auto min-h-screen max-w-lg px-4 pb-8 pt-6">
      <h1 className="label-uppercase mb-6 text-center">Upload Document</h1>

      <div className="space-y-5">
        {/* Type selector */}
        <div>
          <p className="label-uppercase mb-2">Document type</p>
          <div className="grid grid-cols-2 gap-2">
            {UPLOAD_TYPES.map((t) => (
              <button
                key={t.value}
                onClick={() => setUploadType(t.value)}
                disabled={isExtracting}
                className={`border-thin rounded-lg px-3 py-2.5 text-left transition-colors ${
                  uploadType === t.value
                    ? "border-accent-blue bg-accent-blue/5"
                    : "border-border bg-surface-card hover:border-accent-blue/40"
                } ${isExtracting ? "opacity-60" : ""}`}
              >
                <span className="text-text block text-sm font-medium">{t.label}</span>
                <span className="text-text-tertiary block text-[11px]">{t.hint}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Main file drop zone */}
        <DropZone onFileSelected={setFile} currentFile={file} disabled={isExtracting} />

        {/* Business / Non-business toggle */}
        {showBusinessToggle && (
          <div>
            <p className="label-uppercase mb-2">Expense type</p>
            <div className="flex gap-2">
              <button
                onClick={() => setBusinessPct(100)}
                disabled={isExtracting}
                className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                  businessPct === 100
                    ? "border-accent-blue bg-accent-blue/5 text-accent-blue"
                    : "border-border text-text-secondary hover:border-accent-blue/40"
                }`}
              >
                Business
              </button>
              <button
                onClick={() => setBusinessPct(0)}
                disabled={isExtracting}
                className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                  businessPct === 0
                    ? "border-accent-blue bg-accent-blue/5 text-accent-blue"
                    : "border-border text-text-secondary hover:border-accent-blue/40"
                }`}
              >
                Non-business
              </button>
            </div>
          </div>
        )}

        {/* Description (expense / other) */}
        {showDescription && (
          <div>
            <label htmlFor="description" className="label-uppercase mb-1.5 block">
              Description (optional)
            </label>
            <input
              id="description"
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Internet bill March 2026"
              disabled={isExtracting}
              className="border-thin border-border bg-surface-card text-text placeholder:text-text-tertiary focus:ring-accent-blue/30 w-full rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2"
            />
          </div>
        )}

        {/* Progress bar */}
        {isExtracting && (
          <div className="space-y-1">
            <div className="bg-surface-muted h-1.5 w-full overflow-hidden rounded-full">
              <div
                className="bg-accent-blue h-full rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-text-tertiary text-center text-xs">Processing with OCR…</p>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="bg-accent-red/10 rounded-lg px-3 py-2.5">
            <p className="text-accent-red text-sm">{error}</p>
          </div>
        )}

        {/* Submit */}
        <button
          onClick={submit}
          disabled={!file || isExtracting}
          className="bg-text text-surface-card w-full rounded-lg px-4 py-3 text-sm font-medium transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {isExtracting ? "Processing…" : "Upload & Extract"}
        </button>
      </div>
    </div>
  );
}
