import { useState, useCallback } from "react";
import axios from "axios";
import { extractFile, confirmUpload } from "../api/upload";
import type { UploadType } from "../api/types";
import { maybeCompressImage } from "../lib/compressImage";

export type BatchItemStatus = "pending" | "extracting" | "review" | "confirming" | "done" | "error";

export interface BatchItem {
  file: File;
  status: BatchItemStatus;
  extractedFields: Record<string, unknown> | null;
  fileKey: string | null;
  ocrStatus: "confirmed" | "review" | null;
  error: string | null;
}

export type BatchStatus = "idle" | "extracting" | "review" | "confirming" | "done";

export function useBatchUpload() {
  const [items, setItems] = useState<BatchItem[]>([]);
  const [batchStatus, setBatchStatus] = useState<BatchStatus>("idle");
  const [businessPct, setBusinessPct] = useState(100);
  const [currentIdx, setCurrentIdx] = useState(0);

  const setFiles = useCallback((files: File[]) => {
    setItems(
      files.map((f) => ({
        file: f,
        status: "pending",
        extractedFields: null,
        fileKey: null,
        ocrStatus: null,
        error: null,
      })),
    );
    setBatchStatus("idle");
    setCurrentIdx(0);
  }, []);

  const submitAll = useCallback(
    async (uploadType: UploadType) => {
      setBatchStatus("extracting");
      const updated = [...items];

      for (let i = 0; i < updated.length; i++) {
        setCurrentIdx(i);
        updated[i] = { ...updated[i]!, status: "extracting" };
        setItems([...updated]);

        try {
          const compressed = await maybeCompressImage(updated[i]!.file);
          const res = await extractFile(compressed, uploadType);
          updated[i] = {
            ...updated[i]!,
            status: "review",
            extractedFields: { ...res.data.extracted },
            fileKey: res.data.fileKey,
            ocrStatus: res.data.status,
            error: null,
          };
        } catch (err) {
          let message = "Failed to process document.";
          if (axios.isAxiosError(err)) {
            const code = err.response?.data?.code as string | undefined;
            if (code === "OCR_FAILED") {
              const detail = err.response?.data?.error;
              message = detail ? `OCR failed: ${detail}` : "Could not read the document.";
            } else if (err.response?.data?.error) {
              message = err.response.data.error;
            }
          }
          updated[i] = { ...updated[i]!, status: "error", error: message };
        }

        setItems([...updated]);
      }

      setBatchStatus("review");
    },
    [items],
  );

  const updateItemField = useCallback((index: number, key: string, value: unknown) => {
    setItems((prev) => {
      const next = [...prev];
      if (next[index]?.extractedFields) {
        next[index] = {
          ...next[index]!,
          extractedFields: { ...next[index]!.extractedFields!, [key]: value },
        };
      }
      return next;
    });
  }, []);

  const confirmAll = useCallback(
    async (uploadType: UploadType) => {
      setBatchStatus("confirming");
      const updated = [...items];
      let doneCount = 0;

      for (let i = 0; i < updated.length; i++) {
        if (updated[i]!.status !== "review") continue;
        setCurrentIdx(i);
        updated[i] = { ...updated[i]!, status: "confirming" };
        setItems([...updated]);

        try {
          await confirmUpload(
            uploadType,
            updated[i]!.fileKey!,
            updated[i]!.extractedFields!,
            businessPct,
          );
          updated[i] = { ...updated[i]!, status: "done" };
          doneCount++;
        } catch (err) {
          let message = "Failed to save.";
          if (axios.isAxiosError(err)) {
            message = err.response?.data?.error ?? message;
          }
          updated[i] = { ...updated[i]!, status: "error", error: message };
        }

        setItems([...updated]);
      }

      setBatchStatus(doneCount > 0 ? "done" : "review");
    },
    [items, businessPct],
  );

  const reset = useCallback(() => {
    setItems([]);
    setBatchStatus("idle");
    setCurrentIdx(0);
  }, []);

  const reviewableCount = items.filter((i) => i.status === "review").length;
  const doneCount = items.filter((i) => i.status === "done").length;
  const errorCount = items.filter((i) => i.status === "error").length;

  return {
    items,
    batchStatus,
    currentIdx,
    businessPct,
    setBusinessPct,
    setFiles,
    submitAll,
    updateItemField,
    confirmAll,
    reset,
    reviewableCount,
    doneCount,
    errorCount,
  };
}
