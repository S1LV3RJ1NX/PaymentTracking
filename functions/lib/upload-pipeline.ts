import type { UploadType, Env, OcrResult } from "./types";
import { extractDocument } from "./ocr";
import { uploadToR2 } from "./storage";
import { appendRow, findRowByNetInr, updateFiraColumns } from "./sheets";

export interface UploadInput {
  fileBuffer: ArrayBuffer;
  mimeType: string;
  fileName: string;
  uploadType: UploadType;
  customDescription: string | null;
  businessPct: number | null;
}

export interface UploadOutput {
  status: "confirmed" | "review";
  uploadType: UploadType;
  extracted: Record<string, unknown>;
  fileKey: string;
  [key: string]: unknown;
}

export async function runUploadPipeline(input: UploadInput, env: Env): Promise<UploadOutput> {
  const ocrResult = await extractDocument(
    input.fileBuffer,
    input.mimeType,
    input.uploadType,
    env.ANTHROPIC_API_KEY,
  );

  if (input.customDescription && ocrResult.type === "expense") {
    ocrResult.data.description = input.customDescription;
  }

  const fileKey = await uploadToR2(
    input.fileBuffer,
    input.mimeType,
    input.fileName,
    input.uploadType,
    ocrResult,
    env,
  );

  const confidence = ocrResult.type !== "other" ? ocrResult.data.confidence : "low";
  const status = confidence === "high" ? "confirmed" : "review";

  const now = new Date().toISOString();
  const sheetResult = await writeToSheets(
    input.uploadType,
    ocrResult,
    fileKey,
    input.businessPct,
    now,
    env,
  );

  return {
    status,
    uploadType: input.uploadType,
    extracted: ocrResult.data as Record<string, unknown>,
    fileKey,
    ...sheetResult,
  };
}

async function writeToSheets(
  uploadType: UploadType,
  ocrResult: OcrResult,
  fileKey: string,
  businessPctOverride: number | null,
  now: string,
  env: Env,
): Promise<Record<string, unknown>> {
  switch (uploadType) {
    case "skydo_invoice": {
      if (ocrResult.type !== "skydo_invoice") throw new Error("Type mismatch");
      const d = ocrResult.data;
      const incomeRow = [
        d.date,
        d.payer,
        d.invoice_number,
        String(d.usd_amount),
        String(d.net_inr_received),
        d.skydo_prn,
        "",
        "",
        fileKey,
        d.confidence,
        now,
      ];
      const incomeRowNum = await appendRow("Income", incomeRow, env);

      const feeRow = [
        d.date,
        `Skydo fee – ${d.payer}`,
        "skydo_fees",
        String(d.skydo_charges_inr),
        "100",
        String(d.skydo_charges_inr),
        "bank",
        "Skydo",
        fileKey,
        "high",
        now,
        "unpaid",
        "0",
      ];
      const feeRowNum = await appendRow("Expenses", feeRow, env);

      return { incomeRowNum, feeRowNum };
    }

    case "fira": {
      if (ocrResult.type !== "fira") throw new Error("Type mismatch");
      const d = ocrResult.data;

      const match = await findRowByNetInr("Income", d.inr_amount, env);
      if (match) {
        await updateFiraColumns(match.rowNum, fileKey, d.transaction_ref, env);
        return { linked: true, matchedRow: match.rowNum };
      }

      return { linked: false, message: "No matching Income row found for FIRA amount" };
    }

    case "expense": {
      if (ocrResult.type !== "expense") throw new Error("Type mismatch");
      const d = ocrResult.data;
      const bpct = businessPctOverride ?? d.business_pct;
      const claimable = d.amount_inr * (bpct / 100);
      const row = [
        d.date,
        d.description ?? "",
        d.category,
        String(d.amount_inr),
        String(bpct),
        String(claimable),
        d.payment_method ?? "",
        d.vendor ?? "",
        fileKey,
        d.confidence,
        now,
        "unpaid",
        "0",
      ];
      const rowNum = await appendRow("Expenses", row, env);
      return { rowNum };
    }

    case "payment_proof":
      throw new Error("payment_proof should not be used as a direct upload type");

    case "other": {
      const d = ocrResult.data as Record<string, unknown>;
      const bpct = businessPctOverride ?? 100;
      const amount = String(d["amount"] ?? "");
      const claimable = amount ? String(parseFloat(amount) * (bpct / 100)) : amount;
      const row = [
        String(d["date"] ?? ""),
        String(d["description"] ?? ""),
        "other",
        amount,
        String(bpct),
        claimable,
        "",
        String(d["vendor_or_client"] ?? ""),
        fileKey,
        "low",
        now,
        "unpaid",
        "0",
      ];
      const rowNum = await appendRow("Expenses", row, env);
      return { rowNum };
    }
  }
}
