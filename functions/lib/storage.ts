import type { UploadType, Env, OcrResult } from "./types";
import { getFYFromDate } from "./fy";

function getDateFromResult(result: OcrResult): string {
  switch (result.type) {
    case "skydo_invoice":
      return result.data.date;
    case "fira":
      return result.data.processed_date;
    case "expense":
      return result.data.date;
    case "other": {
      const d = result.data["date"];
      return typeof d === "string" ? d : new Date().toISOString().slice(0, 10);
    }
  }
}

function getSubfolder(uploadType: UploadType, result: OcrResult): string {
  const date = getDateFromResult(result);
  switch (uploadType) {
    case "skydo_invoice":
      return "Invoices-Received";
    case "fira":
      return "FIRA";
    case "expense":
      return `Expenses/${date.slice(0, 7)}`;
    case "other":
      return "Expenses/Unsorted";
  }
}

export function buildFilename(
  uploadType: UploadType,
  result: OcrResult,
  originalName: string,
): string {
  const date = getDateFromResult(result);
  switch (uploadType) {
    case "skydo_invoice": {
      const d = result.data as { payer: string; invoice_number: string };
      const client = d.payer.replace(/[^a-zA-Z0-9]/g, "_").slice(0, 30);
      return `Skydo_${client}_${date.slice(0, 7)}_${d.invoice_number}.pdf`;
    }
    case "fira": {
      const d = result.data as { transaction_ref: string };
      return `FIRA_${date.slice(0, 7)}_${d.transaction_ref}.pdf`;
    }
    case "expense": {
      const d = result.data as { category: string };
      return `${d.category}_${date.replace(/-/g, "")}_${originalName}`;
    }
    case "other":
      return `other_${date.replace(/-/g, "")}_${originalName}`;
  }
}

export function buildR2Key(
  uploadType: UploadType,
  result: OcrResult,
  originalName: string,
): string {
  const date = getDateFromResult(result);
  const fy = getFYFromDate(date);
  const subfolder = getSubfolder(uploadType, result);
  const filename = buildFilename(uploadType, result, originalName);
  return `${fy}/${subfolder}/${filename}`;
}

export async function uploadToR2(
  fileBuffer: ArrayBuffer,
  mimeType: string,
  originalName: string,
  uploadType: UploadType,
  result: OcrResult,
  env: Env,
): Promise<string> {
  const key = buildR2Key(uploadType, result, originalName);

  await env.FINANCE_R2.put(key, fileBuffer, {
    httpMetadata: { contentType: mimeType },
    customMetadata: { uploadType, originalName },
  });

  return key;
}

export async function deleteFromR2(key: string, env: Env): Promise<void> {
  await env.FINANCE_R2.delete(key);
}

export async function uploadRawToR2(
  key: string,
  fileBuffer: ArrayBuffer,
  mimeType: string,
  env: Env,
): Promise<void> {
  await env.FINANCE_R2.put(key, fileBuffer, {
    httpMetadata: { contentType: mimeType },
  });
}

export async function getFromR2(key: string, env: Env): Promise<R2ObjectBody | null> {
  return env.FINANCE_R2.get(key);
}
