import type { UploadType, Env, OcrResult } from "./types";
import { getFYFromDate } from "./fy";
import { getAccessToken } from "./google-auth";

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

async function findFolder(token: string, parentId: string, name: string): Promise<string | null> {
  const q = encodeURIComponent(
    `'${parentId}' in parents and name = '${name}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
  );
  const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Drive list failed: ${res.status}`);
  const data = (await res.json()) as { files: Array<{ id: string }> };
  return data.files[0]?.id ?? null;
}

async function createFolder(token: string, parentId: string, name: string): Promise<string> {
  const res = await fetch("https://www.googleapis.com/drive/v3/files", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name,
      mimeType: "application/vnd.google-apps.folder",
      parents: [parentId],
    }),
  });
  if (!res.ok) throw new Error(`Drive create folder failed: ${res.status}`);
  const data = (await res.json()) as { id: string };
  return data.id;
}

async function getOrCreateFolder(
  token: string,
  parentId: string,
  folderName: string,
  kv: KVNamespace,
): Promise<string> {
  const cacheKey = `drive_folder_${parentId}_${folderName}`;
  const cached = await kv.get(cacheKey);
  if (cached) return cached;

  let id = await findFolder(token, parentId, folderName);
  if (!id) {
    id = await createFolder(token, parentId, folderName);
  }

  await kv.put(cacheKey, id);
  return id;
}

async function resolveFolderChain(
  token: string,
  rootId: string,
  pathParts: string[],
  kv: KVNamespace,
): Promise<string> {
  let currentId = rootId;
  for (const part of pathParts) {
    currentId = await getOrCreateFolder(token, currentId, part, kv);
  }
  return currentId;
}

export async function uploadToDrive(
  fileBuffer: ArrayBuffer,
  mimeType: string,
  originalName: string,
  uploadType: UploadType,
  result: OcrResult,
  env: Env,
): Promise<string> {
  const token = await getAccessToken(env);
  const date = getDateFromResult(result);
  const fy = getFYFromDate(date);
  const subfolder = getSubfolder(uploadType, result);
  const pathParts = [fy, ...subfolder.split("/")];

  const folderId = await resolveFolderChain(
    token,
    env.GOOGLE_DRIVE_ROOT_FOLDER_ID,
    pathParts,
    env.FINANCE_KV,
  );

  const filename = buildFilename(uploadType, result, originalName);

  const metadata = JSON.stringify({ name: filename, parents: [folderId] });
  const boundary = "----FinanceTrackerBoundary";
  const body = buildMultipartBody(boundary, metadata, fileBuffer, mimeType);

  const res = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body,
    },
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Drive upload failed: ${res.status} ${text}`);
  }

  const data = (await res.json()) as { id: string; webViewLink?: string };
  return data.webViewLink ?? `https://drive.google.com/file/d/${data.id}/view`;
}

export function extractDriveFileId(url: string): string | null {
  const fileMatch = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (fileMatch) return fileMatch[1]!;
  const idMatch = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (idMatch) return idMatch[1]!;
  return null;
}

export async function deleteFileFromDrive(driveUrl: string, env: Env): Promise<void> {
  const fileId = extractDriveFileId(driveUrl);
  if (!fileId) {
    console.warn("[drive/delete] Could not extract file ID from:", driveUrl);
    return;
  }

  const token = await getAccessToken(env);
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok && res.status !== 404) {
    const text = await res.text();
    console.error("[drive/delete]", res.status, text);
    throw new Error(`Drive delete failed: ${res.status}`);
  }
}

function buildMultipartBody(
  boundary: string,
  metadata: string,
  fileBuffer: ArrayBuffer,
  mimeType: string,
): ArrayBuffer {
  const encoder = new TextEncoder();

  const preamble = encoder.encode(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\nContent-Transfer-Encoding: binary\r\n\r\n`,
  );
  const epilogue = encoder.encode(`\r\n--${boundary}--`);
  const fileBytes = new Uint8Array(fileBuffer);

  const combined = new Uint8Array(preamble.byteLength + fileBytes.byteLength + epilogue.byteLength);
  combined.set(preamble, 0);
  combined.set(fileBytes, preamble.byteLength);
  combined.set(epilogue, preamble.byteLength + fileBytes.byteLength);

  return combined.buffer;
}
