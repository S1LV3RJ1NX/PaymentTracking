import { api } from "./client";
import type { UploadType } from "./types";

export interface UploadResponse {
  success: true;
  data: {
    status: "confirmed" | "review";
    uploadType: UploadType;
    extracted: Record<string, unknown>;
    fileKey: string;
    paymentFileKey: string | null;
    incomeRowNum?: number;
    feeRowNum?: number;
    rowNum?: number;
    linked?: boolean;
    matchedRow?: number;
    message?: string;
  };
}

export async function uploadFile(
  file: File,
  type: UploadType,
  description?: string,
  paymentFile?: File,
  businessPct?: number,
): Promise<UploadResponse> {
  const form = new FormData();
  form.append("file", file);
  form.append("type", type);
  if (description) {
    form.append("description", description);
  }
  if (paymentFile) {
    form.append("paymentFile", paymentFile);
  }
  if (businessPct !== undefined) {
    form.append("businessPct", String(businessPct));
  }

  const res = await api.post<UploadResponse>("/upload", form, {
    headers: { "Content-Type": "multipart/form-data" },
    timeout: 60_000,
  });

  return res.data;
}
