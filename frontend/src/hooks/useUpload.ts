import { useState, useCallback } from "react";
import axios from "axios";
import { extractFile, confirmUpload, cancelUpload } from "../api/upload";
import type { ConfirmResponse } from "../api/upload";
import type { UploadType } from "../api/types";
import { maybeCompressImage } from "../lib/compressImage";

export type UploadStatus = "idle" | "extracting" | "review" | "confirming" | "success" | "error";

interface UploadState {
  status: UploadStatus;
  file: File | null;
  uploadType: UploadType;
  description: string;
  businessPct: number;
  extractedFields: Record<string, unknown> | null;
  fileKey: string | null;
  ocrStatus: "confirmed" | "review" | null;
  confirmResult: ConfirmResponse["data"] | null;
  error: string | null;
  progress: number;
}

const INITIAL_STATE: UploadState = {
  status: "idle",
  file: null,
  uploadType: "expense",
  description: "",
  businessPct: 100,
  extractedFields: null,
  fileKey: null,
  ocrStatus: null,
  confirmResult: null,
  error: null,
  progress: 0,
};

export function useUpload() {
  const [state, setState] = useState<UploadState>(INITIAL_STATE);

  const setFile = useCallback((file: File | null) => {
    setState((s) => ({
      ...s,
      file,
      status: "idle",
      extractedFields: null,
      fileKey: null,
      error: null,
    }));
  }, []);

  const setUploadType = useCallback((uploadType: UploadType) => {
    setState((s) => ({ ...s, uploadType }));
  }, []);

  const setDescription = useCallback((description: string) => {
    setState((s) => ({ ...s, description }));
  }, []);

  const setBusinessPct = useCallback((businessPct: number) => {
    setState((s) => ({ ...s, businessPct }));
  }, []);

  const updateField = useCallback((key: string, value: unknown) => {
    setState((s) => ({
      ...s,
      extractedFields: s.extractedFields ? { ...s.extractedFields, [key]: value } : null,
    }));
  }, []);

  const submit = useCallback(async () => {
    if (!state.file) return;

    setState((s) => ({ ...s, status: "extracting", error: null, progress: 0 }));

    const progressInterval = setInterval(() => {
      setState((s) => ({
        ...s,
        progress: Math.min(s.progress + 5, 90),
      }));
    }, 500);

    try {
      const compressed = await maybeCompressImage(state.file);
      const res = await extractFile(compressed, state.uploadType, state.description || undefined);
      clearInterval(progressInterval);

      const fields = { ...res.data.extracted };
      if (state.description && !fields["description"]) {
        fields["description"] = state.description;
      }

      setState((s) => ({
        ...s,
        status: "review",
        extractedFields: fields,
        fileKey: res.data.fileKey,
        ocrStatus: res.data.status,
        progress: 100,
      }));
    } catch (err) {
      clearInterval(progressInterval);
      let message = "Failed to process document. Please try again.";
      if (axios.isAxiosError(err)) {
        const code = err.response?.data?.code as string | undefined;
        if (code === "VALIDATION_ERROR") {
          message = err.response?.data?.error ?? message;
        } else if (code === "OCR_FAILED") {
          message = "Could not read the document. Try a clearer image or PDF.";
        } else if (code === "STORAGE_ERROR") {
          message = "Failed to save file. Please try again.";
        } else if (err.code === "ECONNABORTED") {
          message = "Upload timed out. Check your connection and try again.";
        }
      }
      setState((s) => ({ ...s, status: "error", error: message, progress: 0 }));
    }
  }, [state.file, state.uploadType, state.description]);

  const confirm = useCallback(async () => {
    if (!state.fileKey || !state.extractedFields) return;

    setState((s) => ({ ...s, status: "confirming", error: null }));

    try {
      const res = await confirmUpload(
        state.uploadType,
        state.fileKey,
        state.extractedFields,
        state.businessPct,
      );

      setState((s) => ({
        ...s,
        status: "success",
        confirmResult: res.data,
      }));
    } catch (err) {
      let message = "Failed to save transaction. Please try again.";
      if (axios.isAxiosError(err)) {
        message = err.response?.data?.error ?? message;
      }
      setState((s) => ({ ...s, status: "review", error: message }));
    }
  }, [state.fileKey, state.extractedFields, state.uploadType, state.businessPct]);

  const cancel = useCallback(async () => {
    if (state.fileKey) {
      try {
        await cancelUpload(state.fileKey);
      } catch {
        /* best-effort cleanup */
      }
    }
    setState(INITIAL_STATE);
  }, [state.fileKey]);

  const reset = useCallback(() => {
    setState(INITIAL_STATE);
  }, []);

  return {
    ...state,
    setFile,
    setUploadType,
    setDescription,
    setBusinessPct,
    updateField,
    submit,
    confirm,
    cancel,
    reset,
  };
}
