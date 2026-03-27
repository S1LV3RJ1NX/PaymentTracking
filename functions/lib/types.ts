import { z } from "zod";

export type Role = "owner" | "ca";

export type UploadType = "skydo_invoice" | "fira" | "expense" | "other";

export interface JwtPayload {
  sub: string;
  role: Role;
  exp: number;
  iat: number;
}

export interface Env {
  FINANCE_KV: KVNamespace;
  FINANCE_R2: R2Bucket;
  JWT_SECRET: string;
  ADMIN_PASSWORD_HASH: string;
  CA_PASSWORD_HASH: string;
  ANTHROPIC_API_KEY: string;
  GOOGLE_SERVICE_ACCOUNT_EMAIL: string;
  GOOGLE_PRIVATE_KEY: string;
  GOOGLE_SHEET_ID: string;
}

export const LoginRequestSchema = z.object({
  username: z.enum(["prathamesh", "kothari_ca"]),
  password: z.string().min(1),
});

export type LoginRequest = z.infer<typeof LoginRequestSchema>;

export const SkyDoResultSchema = z.object({
  payer: z.string(),
  date: z.string(),
  usd_amount: z.number(),
  fx_rate: z.number(),
  converted_inr: z.number(),
  skydo_charges_inr: z.number(),
  net_inr_received: z.number(),
  invoice_number: z.string(),
  skydo_prn: z.string(),
  confidence: z.enum(["high", "medium", "low"]),
  review_reason: z.string().nullable(),
});

export type SkyDoResult = z.infer<typeof SkyDoResultSchema>;

export const FiraResultSchema = z.object({
  inr_amount: z.number(),
  fcy_amount: z.number(),
  currency: z.string(),
  remitter_name: z.string(),
  transaction_ref: z.string(),
  processed_date: z.string(),
  purpose: z.string().nullable(),
  confidence: z.enum(["high", "medium", "low"]),
  review_reason: z.string().nullable(),
});

export type FiraResult = z.infer<typeof FiraResultSchema>;

export const ExpenseResultSchema = z.object({
  vendor: z.string().nullable(),
  amount_inr: z.number(),
  date: z.string(),
  upi_transaction_id: z.string().nullable(),
  category: z.enum([
    "rent",
    "internet",
    "electricity",
    "travel",
    "equipment",
    "skydo_fees",
    "professional_fees",
    "other",
  ]),
  payment_method: z.enum(["upi", "card", "bank", "other"]).nullable(),
  description: z.string().nullable(),
  business_pct: z.number().default(100),
  confidence: z.enum(["high", "medium", "low"]),
  review_reason: z.string().nullable(),
});

export type ExpenseResult = z.infer<typeof ExpenseResultSchema>;

export type OcrResult =
  | { type: "skydo_invoice"; data: SkyDoResult }
  | { type: "fira"; data: FiraResult }
  | { type: "expense"; data: ExpenseResult }
  | { type: "other"; data: Record<string, unknown> };

export type ErrorCode =
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "OCR_FAILED"
  | "STORAGE_ERROR"
  | "SHEET_ERROR"
  | "NOT_FOUND"
  | "VALIDATION_ERROR";

export interface ApiError {
  success: false;
  error: string;
  code: ErrorCode;
}

export interface ApiSuccess<T> {
  success: true;
  data: T;
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;
