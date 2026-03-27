import { DropZone } from "../components/DropZone";
import { useUpload } from "../hooks/useUpload";
import type { UploadType } from "../api/types";

const UPLOAD_TYPES: { value: UploadType; label: string; hint: string }[] = [
  { value: "skydo_invoice", label: "Skydo Invoice", hint: "Income invoice from Skydo" },
  { value: "fira", label: "FIRA / BIRC", hint: "Bank inward remittance certificate" },
  { value: "expense", label: "Expense", hint: "Bill, UPI screenshot, receipt" },
  { value: "other", label: "Other", hint: "Any other financial document" },
];

function ResultCard({ data }: { data: NonNullable<ReturnType<typeof useUpload>["result"]> }) {
  const borderColor = data.status === "confirmed" ? "border-accent-green" : "border-accent-amber";

  const extracted = data.extracted;
  const entries = Object.entries(extracted).filter(
    ([k]) => !["confidence", "review_reason", "business_pct"].includes(k),
  );

  return (
    <div className={`rounded-xl border-2 ${borderColor} bg-surface-card px-4 py-4`}>
      <div className="mb-3 flex items-center justify-between">
        <span className="label-uppercase">{data.uploadType.replace("_", " ")}</span>
        <span
          className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
            data.status === "confirmed"
              ? "bg-accent-green/10 text-accent-green"
              : "bg-badge-amber text-badge-amber-text"
          }`}
        >
          {data.status}
        </span>
      </div>

      <div className="space-y-1.5">
        {entries.map(([key, value]) => (
          <div key={key} className="flex justify-between text-sm">
            <span className="text-text-secondary">{key.replace(/_/g, " ")}</span>
            <span className="text-text max-w-[60%] text-right font-medium">
              {String(value ?? "—")}
            </span>
          </div>
        ))}
      </div>

      {data.fileKey && (
        <p className="text-text-tertiary mt-3 text-center text-xs">
          Saved as: {data.fileKey.split("/").pop()}
        </p>
      )}

      {"linked" in data && (
        <p className="text-text-tertiary mt-2 text-center text-xs">
          {data.linked ? `FIRA linked to Income row ${data.matchedRow}` : data.message}
        </p>
      )}
    </div>
  );
}

export function Upload() {
  const {
    status,
    file,
    uploadType,
    description,
    result,
    error,
    progress,
    setFile,
    setUploadType,
    setDescription,
    submit,
    reset,
  } = useUpload();

  const isUploading = status === "uploading";
  const showDescription = uploadType === "expense" || uploadType === "other";

  return (
    <div className="bg-surface mx-auto min-h-screen max-w-lg px-4 pb-8 pt-6">
      <h1 className="label-uppercase mb-6 text-center">Upload Document</h1>

      {status === "success" && result ? (
        <div className="space-y-4">
          <ResultCard data={result} />
          <button
            onClick={reset}
            className="bg-text text-surface-card w-full rounded-lg px-4 py-3 text-sm font-medium transition-opacity hover:opacity-90"
          >
            Upload another
          </button>
        </div>
      ) : (
        <div className="space-y-5">
          {/* Type selector */}
          <div>
            <p className="label-uppercase mb-2">Document type</p>
            <div className="grid grid-cols-2 gap-2">
              {UPLOAD_TYPES.map((t) => (
                <button
                  key={t.value}
                  onClick={() => setUploadType(t.value)}
                  disabled={isUploading}
                  className={`border-thin rounded-lg px-3 py-2.5 text-left transition-colors ${
                    uploadType === t.value
                      ? "border-accent-blue bg-accent-blue/5"
                      : "border-border bg-surface-card hover:border-accent-blue/40"
                  } ${isUploading ? "opacity-60" : ""}`}
                >
                  <span className="text-text block text-sm font-medium">{t.label}</span>
                  <span className="text-text-tertiary block text-[11px]">{t.hint}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Drop zone */}
          <DropZone onFileSelected={setFile} currentFile={file} disabled={isUploading} />

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
                disabled={isUploading}
                className="border-thin border-border bg-surface-card text-text placeholder:text-text-tertiary focus:ring-accent-blue/30 w-full rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2"
              />
            </div>
          )}

          {/* Progress bar */}
          {isUploading && (
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
            disabled={!file || isUploading}
            className="bg-text text-surface-card w-full rounded-lg px-4 py-3 text-sm font-medium transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {isUploading ? "Processing…" : "Upload & Extract"}
          </button>
        </div>
      )}
    </div>
  );
}
