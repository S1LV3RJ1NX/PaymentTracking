import Anthropic from "@anthropic-ai/sdk";
import type { UploadType } from "./types";
import {
  SkyDoResultSchema,
  FiraResultSchema,
  ExpenseResultSchema,
  PaymentProofResultSchema,
} from "./types";

const SKYDO_PROMPT = `You are a financial document parser. This is a Skydo invoice for an Indian freelancer.
Extract ALL fields. Return ONLY valid JSON, no markdown, no explanation.

{
  "payer": "string — the Payer company name exactly as shown",
  "date": "YYYY-MM-DD — the invoice/processed date",
  "usd_amount": number — Amount received in USD,
  "fx_rate": number — FX rate shown,
  "converted_inr": number — Converted amount in INR (before Skydo charges),
  "skydo_charges_inr": number — Total Skydo charges including GST,
  "net_inr_received": number — 'You received' amount in INR,
  "invoice_number": "string — Skydo invoice number",
  "skydo_prn": "string — Skydo Ref No / PRN",
  "confidence": "high" | "medium" | "low",
  "review_reason": null or "string explaining what is unclear"
}

Rules:
- net_inr_received = converted_inr - skydo_charges_inr
- If any key field is missing, set confidence to "low"
- Dates in DD/MM/YYYY format should be converted to YYYY-MM-DD`;

const FIRA_PROMPT = `You are a financial document parser. This is a FIRA (Foreign Inward Remittance Advice) or BIRC (Bank Inward Remittance Certificate).
Extract ALL fields. Return ONLY valid JSON, no markdown, no explanation.

{
  "inr_amount": number — INR Amount credited,
  "fcy_amount": number — Foreign currency amount,
  "currency": "string — e.g. USD",
  "remitter_name": "string — who sent the money",
  "transaction_ref": "string — Customer Transaction Reference No",
  "processed_date": "YYYY-MM-DD",
  "purpose": "string or null — Purpose of Remittance",
  "confidence": "high" | "medium" | "low",
  "review_reason": null or "string"
}

Rules:
- Dates in DD-MM-YYYY or DD/MM/YYYY format should be converted to YYYY-MM-DD
- If any key field is missing, set confidence to "low"`;

const EXPENSE_PROMPT = `You are a financial document parser for an Indian freelancer sole proprietor.
This is an expense document (UPI payment screenshot, bill, or invoice).
Extract ALL fields. Return ONLY valid JSON, no markdown, no explanation.

{
  "vendor": "string or null — merchant/vendor name",
  "amount_inr": number — total amount in INR,
  "date": "YYYY-MM-DD",
  "upi_transaction_id": "string or null — UPI txn ID if visible",
  "category": "rent" | "internet" | "electricity" | "travel" | "equipment" | "currency_fees" | "professional_fees" | "gym" | "healthcare" | "insurance" | "hotels" | "food" | "software" | "telephone" | "office_supplies" | "transport" | "education" | "investment" | "other",
  "payment_method": "upi" | "card" | "bank" | "other" | null,
  "description": "string — short description, max 10 words",
  "business_pct": 100,
  "confidence": "high" | "medium" | "low",
  "review_reason": null or "string"
}

Rules:
- For UPI screenshots: extract merchant name, amount, transaction ID, date
- business_pct is 100 unless it looks like a personal/non-business expense (then 50)
- If date is missing or unclear, set confidence to "low"
- Dates in DD/MM/YYYY or DD-MM-YYYY format should be converted to YYYY-MM-DD`;

const PAYMENT_PROOF_PROMPT = `You are a financial document parser. This is a payment proof — a UPI screenshot, bank transfer confirmation, or card payment receipt.
Extract ONLY payment details. Return ONLY valid JSON, no markdown, no explanation.

{
  "amount_inr": number — amount paid in INR,
  "date": "YYYY-MM-DD",
  "payment_method": "upi" | "card" | "bank" | "other" | null,
  "upi_transaction_id": "string or null — UPI txn ID / reference number if visible",
  "confidence": "high" | "medium" | "low",
  "review_reason": null or "string"
}

Rules:
- Focus on extracting the payment amount and transaction reference
- Dates in DD/MM/YYYY or DD-MM-YYYY format should be converted to YYYY-MM-DD
- If amount or date is missing, set confidence to "low"`;

const OTHER_PROMPT = `You are a financial document parser. Extract whatever financial information you can find.
Return ONLY valid JSON, no markdown, no explanation.

{
  "doc_type": "string — your best guess at what this document is",
  "date": "YYYY-MM-DD or null",
  "amount": number or null,
  "currency": "string or null",
  "description": "string — short description",
  "vendor_or_client": "string or null",
  "confidence": "low",
  "review_reason": "string — explain what you found"
}`;

function getPrompt(uploadType: UploadType): string {
  switch (uploadType) {
    case "skydo_invoice":
      return SKYDO_PROMPT;
    case "fira":
      return FIRA_PROMPT;
    case "expense":
      return EXPENSE_PROMPT;
    case "payment_proof":
      return PAYMENT_PROOF_PROMPT;
    case "other":
      return OTHER_PROMPT;
  }
}

export async function extractDocument(
  fileBuffer: ArrayBuffer,
  mimeType: string,
  uploadType: UploadType,
  apiKey: string,
) {
  const client = new Anthropic({ apiKey });
  const b64 = arrayBufferToBase64(fileBuffer);
  const isPdf = mimeType === "application/pdf";

  // Anthropic API supports document type for PDFs natively.
  // Using type assertion because SDK types may lag behind API capabilities.
  const contentBlock = isPdf
    ? {
        type: "document" as const,
        source: {
          type: "base64" as const,
          media_type: "application/pdf" as const,
          data: b64,
        },
      }
    : {
        type: "image" as const,
        source: {
          type: "base64" as const,
          media_type: mimeType as "image/jpeg" | "image/png" | "image/webp",
          data: b64,
        },
      };

  const response = await client.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: [
          contentBlock as unknown as Anthropic.Messages.ImageBlockParam,
          { type: "text" as const, text: getPrompt(uploadType) },
        ],
      },
    ],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No text response from Claude");
  }

  let jsonStr = textBlock.text.trim();
  const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) jsonStr = fenceMatch[1]!.trim();

  const raw = JSON.parse(jsonStr) as Record<string, unknown>;
  return validateOcrResult(raw, uploadType);
}

function validateOcrResult(raw: Record<string, unknown>, uploadType: UploadType) {
  switch (uploadType) {
    case "skydo_invoice": {
      const parsed = SkyDoResultSchema.safeParse(raw);
      if (!parsed.success) {
        throw new Error(`Skydo OCR validation failed: ${parsed.error.message}`);
      }
      return { type: "skydo_invoice" as const, data: parsed.data };
    }
    case "fira": {
      const parsed = FiraResultSchema.safeParse(raw);
      if (!parsed.success) {
        throw new Error(`FIRA OCR validation failed: ${parsed.error.message}`);
      }
      return { type: "fira" as const, data: parsed.data };
    }
    case "expense": {
      const parsed = ExpenseResultSchema.safeParse(raw);
      if (!parsed.success) {
        throw new Error(`Expense OCR validation failed: ${parsed.error.message}`);
      }
      return { type: "expense" as const, data: parsed.data };
    }
    case "payment_proof": {
      const parsed = PaymentProofResultSchema.safeParse(raw);
      if (!parsed.success) {
        throw new Error(`Payment proof OCR validation failed: ${parsed.error.message}`);
      }
      return { type: "payment_proof" as const, data: parsed.data };
    }
    case "other":
      return { type: "other" as const, data: raw };
  }
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}
