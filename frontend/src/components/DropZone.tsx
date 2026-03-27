import { useDropzone } from "react-dropzone";
import { useCallback } from "react";

interface DropZoneProps {
  onFileSelected: (file: File) => void;
  currentFile: File | null;
  disabled?: boolean;
}

const ACCEPTED = {
  "application/pdf": [".pdf"],
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/webp": [".webp"],
};

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function DropZone({ onFileSelected, currentFile, disabled }: DropZoneProps) {
  const onDrop = useCallback(
    (accepted: File[]) => {
      if (accepted[0]) onFileSelected(accepted[0]);
    },
    [onFileSelected],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPTED,
    maxFiles: 1,
    maxSize: 10 * 1024 * 1024,
    disabled,
  });

  return (
    <div
      {...getRootProps()}
      className={`flex min-h-[180px] cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-6 text-center transition-colors ${
        isDragActive
          ? "border-accent-blue bg-accent-blue/5"
          : disabled
            ? "border-border bg-surface-muted cursor-not-allowed opacity-60"
            : "border-border bg-surface hover:border-accent-blue/50"
      }`}
    >
      <input {...getInputProps()} />

      {currentFile ? (
        <div className="space-y-1">
          <div className="text-3xl">{currentFile.type === "application/pdf" ? "📄" : "🖼️"}</div>
          <p className="text-text text-sm font-medium">{currentFile.name}</p>
          <p className="text-text-tertiary text-xs">{formatSize(currentFile.size)}</p>
          <p className="text-text-secondary mt-2 text-xs">Tap to change file</p>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="text-3xl">📎</div>
          <p className="text-text text-sm font-medium">
            {isDragActive ? "Drop file here" : "Tap to select or drop file"}
          </p>
          <p className="text-text-tertiary text-xs">PDF, JPEG, PNG, or WebP — up to 10 MB</p>
        </div>
      )}
    </div>
  );
}
