import { useState, useCallback } from "react";
import axios from "axios";
import { uploadFile } from "../api/upload";
import type { UploadResponse } from "../api/upload";
import type { UploadType } from "../api/types";

export type UploadStatus = "idle" | "uploading" | "success" | "error";

interface UploadState {
  status: UploadStatus;
  file: File | null;
  uploadType: UploadType;
  description: string;
  result: UploadResponse["data"] | null;
  error: string | null;
  progress: number;
}

const INITIAL_STATE: UploadState = {
  status: "idle",
  file: null,
  uploadType: "expense",
  description: "",
  result: null,
  error: null,
  progress: 0,
};

export function useUpload() {
  const [state, setState] = useState<UploadState>(INITIAL_STATE);

  const setFile = useCallback((file: File | null) => {
    setState((s) => ({ ...s, file, status: "idle", result: null, error: null }));
  }, []);

  const setUploadType = useCallback((uploadType: UploadType) => {
    setState((s) => ({ ...s, uploadType }));
  }, []);

  const setDescription = useCallback((description: string) => {
    setState((s) => ({ ...s, description }));
  }, []);

  const submit = useCallback(async () => {
    if (!state.file) return;

    setState((s) => ({ ...s, status: "uploading", error: null, progress: 0 }));

    const progressInterval = setInterval(() => {
      setState((s) => ({
        ...s,
        progress: Math.min(s.progress + 5, 90),
      }));
    }, 500);

    try {
      const res = await uploadFile(state.file, state.uploadType, state.description || undefined);
      clearInterval(progressInterval);
      setState((s) => ({
        ...s,
        status: "success",
        result: res.data,
        progress: 100,
      }));
    } catch (err) {
      clearInterval(progressInterval);
      let message = "Failed to upload document. Please try again.";
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

  const reset = useCallback(() => {
    setState(INITIAL_STATE);
  }, []);

  return { ...state, setFile, setUploadType, setDescription, submit, reset };
}
