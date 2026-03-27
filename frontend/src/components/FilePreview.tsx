import { useEffect, useState } from "react";
import { api } from "../api/client";

interface FilePreviewProps {
  fileKey: string;
  paymentFileKey?: string;
  tabLabels?: [string, string];
  onClose: () => void;
}

type TabType = "document" | "payment";

function PreviewContent({ fileKey }: { fileKey: string }) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [mimeType, setMimeType] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchFile() {
      try {
        const res = await api.get(`/files/${encodeURIComponent(fileKey)}`, {
          responseType: "blob",
        });
        if (cancelled) return;

        const blob = res.data as Blob;
        setMimeType(blob.type);
        setObjectUrl(URL.createObjectURL(blob));
      } catch {
        if (!cancelled) setError("Failed to load file");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    setLoading(true);
    setError(null);
    setObjectUrl(null);
    void fetchFile();
    return () => {
      cancelled = true;
    };
  }, [fileKey]);

  useEffect(() => {
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [objectUrl]);

  const isImage = mimeType.startsWith("image/");
  const isPdf = mimeType === "application/pdf";
  const fileName = fileKey.split("/").pop() ?? "file";

  return (
    <>
      {loading && (
        <div className="flex h-48 items-center justify-center">
          <div className="border-border border-t-accent-blue h-6 w-6 animate-spin rounded-full border-2" />
        </div>
      )}

      {error && (
        <div className="text-accent-red flex h-48 items-center justify-center text-sm">{error}</div>
      )}

      {!loading && !error && objectUrl && isImage && (
        <img
          src={objectUrl}
          alt={fileName}
          className="mx-auto max-h-[70vh] rounded-lg object-contain"
        />
      )}

      {!loading && !error && objectUrl && isPdf && (
        <iframe src={objectUrl} title={fileName} className="h-[70vh] w-full rounded-lg border-0" />
      )}

      {!loading && !error && objectUrl && !isImage && !isPdf && (
        <div className="text-text-secondary flex h-48 flex-col items-center justify-center gap-3">
          <span className="text-3xl">📄</span>
          <span className="text-sm">Preview not available for this file type</span>
          <a
            href={objectUrl}
            download={fileName}
            className="text-accent-blue text-sm hover:underline"
          >
            Download instead
          </a>
        </div>
      )}

      {!loading && !error && objectUrl && (
        <div className="mt-3 text-center">
          <a
            href={objectUrl}
            download={fileName}
            className="border-thin border-border text-text-secondary hover:bg-surface-muted inline-block rounded-md px-2.5 py-1 text-xs"
          >
            Download
          </a>
        </div>
      )}
    </>
  );
}

export function FilePreview({ fileKey, paymentFileKey, tabLabels, onClose }: FilePreviewProps) {
  const hasTabs = !!paymentFileKey;
  const [docLabel, secLabel] = tabLabels ?? ["Document", "Payment Proof"];
  const [activeTab, setActiveTab] = useState<TabType>("document");
  const currentKey = activeTab === "payment" && paymentFileKey ? paymentFileKey : fileKey;
  const fileName = currentKey.split("/").pop() ?? "file";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
      onClick={onClose}
    >
      <div
        className="border-thin border-border bg-surface-card relative flex max-h-[85vh] w-full max-w-2xl flex-col rounded-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-border flex items-center justify-between border-b px-4 py-3">
          <span className="text-text truncate text-sm font-medium">{fileName}</span>
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

        {hasTabs && (
          <div className="border-border flex gap-1 border-b px-4 py-2">
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
            <button
              onClick={() => setActiveTab("payment")}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                activeTab === "payment"
                  ? "bg-accent-blue/10 text-accent-blue"
                  : "text-text-secondary hover:text-text"
              }`}
            >
              {secLabel}
            </button>
          </div>
        )}

        <div className="flex-1 overflow-auto p-4">
          <PreviewContent key={currentKey} fileKey={currentKey} />
        </div>
      </div>
    </div>
  );
}
