import { useEffect, useState } from "react";
import { api } from "../api/client";

interface FilePreviewProps {
  fileKey: string;
  paymentFileKey?: string;
  tabLabels?: [string, string];
  onClose: () => void;
}

type TabType = "document" | "payment";

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

export function FilePreview({ fileKey, paymentFileKey, tabLabels, onClose }: FilePreviewProps) {
  const hasTabs = !!paymentFileKey;
  const [docLabel, secLabel] = tabLabels ?? ["Document", "Payment Proof"];
  const [activeTab, setActiveTab] = useState<TabType>("document");
  const currentKey = activeTab === "payment" && paymentFileKey ? paymentFileKey : fileKey;
  const fileName = currentKey.split("/").pop() ?? "file";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 py-4"
      onClick={onClose}
    >
      <div
        className="border-thin border-border bg-surface-card relative flex max-h-[92vh] w-full max-w-2xl flex-col rounded-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="border-border flex shrink-0 items-center justify-between border-b px-4 py-3">
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

        {/* Tabs */}
        {hasTabs && (
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

        {/* Preview + Download (single fetch per key) */}
        <FilePane key={currentKey} fileKey={currentKey} />
      </div>
    </div>
  );
}
