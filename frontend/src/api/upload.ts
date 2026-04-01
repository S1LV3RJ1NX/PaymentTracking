import { api } from "./client";
import type { UploadType } from "./types";

export interface ExtractResponse {
  success: true;
  data: {
    status: "confirmed" | "review";
    uploadType: UploadType;
    extracted: Record<string, unknown>;
    fileKey: string;
  };
}

export interface ConfirmResponse {
  success: true;
  data: {
    uploadType: UploadType;
    fileKey: string;
    incomeRowNum?: number;
    feeRowNum?: number;
    rowNum?: number;
    linked?: boolean;
    matchedRow?: number;
    message?: string;
  };
}

export async function extractFile(
  file: File,
  type: UploadType,
  description?: string,
): Promise<ExtractResponse> {
  const form = new FormData();
  form.append("file", file);
  form.append("type", type);
  if (description) {
    form.append("description", description);
  }

  const res = await api.post<ExtractResponse>("/upload/extract", form, {
    headers: { "Content-Type": "multipart/form-data" },
    timeout: 60_000,
  });

  return res.data;
}

export async function confirmUpload(
  uploadType: UploadType,
  fileKey: string,
  fields: Record<string, unknown>,
  businessPct?: number | null,
): Promise<ConfirmResponse> {
  const res = await api.post<ConfirmResponse>("/upload/confirm", {
    uploadType,
    fileKey,
    fields,
    businessPct: businessPct ?? null,
  });

  return res.data;
}

export async function cancelUpload(fileKey: string): Promise<void> {
  await api.delete("/upload/cancel", { data: { fileKey } });
}
