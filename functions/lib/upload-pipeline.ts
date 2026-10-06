import type { UploadType, Env } from "./types";
import { extractDocument } from "./ocr";
import { uploadToR2 } from "./storage";
import { appendRow, findRowByNetInr, updateFiraColumns, recalcPaymentStatus } from "./sheets";

export interface ExtractInput {
  fileBuffer: ArrayBuffer;
  mimeType: string;
  fileName: string;
  uploadType: UploadType;
  customDescription: string | null;
}

export interface ExtractOutput {
  status: "confirmed" | "review";
  uploadType: UploadType;
  extracted: Record<string, unknown>;
  fileKey: string;
}

export async function runExtractPipeline(input: ExtractInput, env: Env): Promise<ExtractOutput> {
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

  return {
    status,
    uploadType: input.uploadType,
    extracted: ocrResult.data as Record<string, unknown>,
    fileKey,
  };
}

export interface ConfirmInput {
  uploadType: UploadType;
  fileKey: string;
  fields: Record<string, unknown>;
  businessPct: number | null;
}

export interface ConfirmOutput {
  uploadType: UploadType;
  fileKey: string;
  [key: string]: unknown;
}

export async function confirmAndWriteToSheets(
  input: ConfirmInput,
  env: Env,
): Promise<ConfirmOutput> {
  const now = new Date().toISOString();
  const result = await writeToSheets(
    input.uploadType,
    input.fields,
    input.fileKey,
    input.businessPct,
    now,
    env,
  );

  return { uploadType: input.uploadType, fileKey: input.fileKey, ...result };
}

export interface ManualExpenseInput {
  date: string;
  amount: number;
  description: string;
  reference: string;
  category: string;
  vendor: string;
  paymentMethod: string;
  businessPct: number;
}

export interface ManualExpenseOutput {
  rowNum: number;
  paymentRowNum: number;
  status: string;
  totalPaid: number;
}

/**
 * Record an expense that was debited directly from the bank with no supporting
 * document (invoice / screenshot). The user supplies the amount, description and
 * a transaction reference number. Since the money has already left the account,
 * the expense is also marked as paid by recording a matching payment row that
 * carries the reference number (the Expenses sheet has no reference column, but
 * the Payments sheet does).
 */
export async function writeManualExpense(
  input: ManualExpenseInput,
  env: Env,
): Promise<ManualExpenseOutput> {
  const now = new Date().toISOString();
  const bpct = input.businessPct;
  const claimable = input.amount * (bpct / 100);
  const paymentMethod = input.paymentMethod || "bank";

  const expenseRow = [
    input.date,
    input.description,
    input.category || "other",
    String(input.amount),
    String(bpct),
    String(claimable),
    paymentMethod,
    input.vendor,
    "", // file_key — no document for a manual entry
    "manual", // confidence
    now,
    "unpaid", // payment_status (recalculated below once the payment is recorded)
    "0", // total_paid
  ];
  const rowNum = await appendRow("Expenses", expenseRow, env);

  // A bank debit is money that has already left the account, so record it as a
  // paid payment. This also gives the reference number a home and surfaces it in
  // the transaction's payment history.
  const paymentRow = [
    String(rowNum),
    input.date,
    String(input.amount),
    paymentMethod,
    input.reference,
    "", // file_key — no proof document
    "manual",
    now,
  ];
  const paymentRowNum = await appendRow("Payments", paymentRow, env);

  const { status, totalPaid } = await recalcPaymentStatus(rowNum, env);

  return { rowNum, paymentRowNum, status, totalPaid };
}

async function writeToSheets(
  uploadType: UploadType,
  fields: Record<string, unknown>,
  fileKey: string,
  businessPctOverride: number | null,
  now: string,
  env: Env,
): Promise<Record<string, unknown>> {
  switch (uploadType) {
    case "skydo_invoice": {
      const f = fields;
      const confidence = String(f["confidence"] ?? "low");
      const incomeRow = [
        String(f["date"] ?? ""),
        String(f["payer"] ?? ""),
        String(f["invoice_number"] ?? ""),
        String(f["usd_amount"] ?? ""),
        String(f["net_inr_received"] ?? ""),
        String(f["skydo_prn"] ?? ""),
        "",
        "",
        fileKey,
        confidence,
        now,
      ];
      const incomeRowNum = await appendRow("Income", incomeRow, env);

      const skydoCharges = String(f["skydo_charges_inr"] ?? "");
      const feeRow = [
        String(f["date"] ?? ""),
        `Skydo fee – ${String(f["payer"] ?? "")}`,
        "currency_fees",
        skydoCharges,
        "100",
        skydoCharges,
        "bank",
        "Skydo",
        fileKey,
        "high",
        now,
        "paid",
        skydoCharges,
      ];
      const feeRowNum = await appendRow("Expenses", feeRow, env);

      return { incomeRowNum, feeRowNum };
    }

    case "fira": {
      const f = fields;
      const inrAmount = Number(f["inr_amount"] ?? 0);

      const match = await findRowByNetInr("Income", inrAmount, env);
      if (match) {
        await updateFiraColumns(match.rowNum, fileKey, String(f["transaction_ref"] ?? ""), env);
        return { linked: true, matchedRow: match.rowNum };
      }

      return { linked: false, message: "No matching Income row found for FIRA amount" };
    }

    case "expense": {
      const f = fields;
      const amount = Number(f["amount_inr"] ?? 0);
      const bpct = businessPctOverride ?? Number(f["business_pct"] ?? 100);
      const claimable = amount * (bpct / 100);
      const confidence = String(f["confidence"] ?? "low");
      const row = [
        String(f["date"] ?? ""),
        String(f["description"] ?? ""),
        String(f["category"] ?? "other"),
        String(amount),
        String(bpct),
        String(claimable),
        String(f["payment_method"] ?? ""),
        String(f["vendor"] ?? ""),
        fileKey,
        confidence,
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
      const f = fields;
      const bpct = businessPctOverride ?? 100;
      const amount = String(f["amount"] ?? f["amount_inr"] ?? "");
      const claimable = amount ? String(parseFloat(amount) * (bpct / 100)) : amount;
      const row = [
        String(f["date"] ?? ""),
        String(f["description"] ?? ""),
        "other",
        amount,
        String(bpct),
        claimable,
        "",
        String(f["vendor_or_client"] ?? f["vendor"] ?? ""),
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
