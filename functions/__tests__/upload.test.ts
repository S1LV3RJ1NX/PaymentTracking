import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { app } from "../lib/hono";
import { runExtractPipeline, confirmAndWriteToSheets } from "../lib/upload-pipeline";
import { hash } from "bcryptjs";
import type { Env } from "../lib/types";

interface JsonBody {
  success: boolean;
  code?: string;
  error?: string;
  data?: {
    token?: string;
    role?: string;
    status?: string;
    uploadType?: string;
    extracted?: Record<string, unknown>;
    fileKey?: string;
  };
}

vi.mock("../lib/ocr", () => ({
  extractDocument: vi.fn(),
}));

vi.mock("../lib/storage", () => ({
  uploadToR2: vi.fn().mockResolvedValue("FY25-26/Invoices-Received/test.pdf"),
  uploadRawToR2: vi.fn().mockResolvedValue(undefined),
  buildFilename: vi.fn().mockReturnValue("test.pdf"),
  buildR2Key: vi.fn().mockReturnValue("FY25-26/Invoices-Received/test.pdf"),
  deleteFromR2: vi.fn().mockResolvedValue(undefined),
  getFromR2: vi.fn().mockResolvedValue(null),
}));

vi.mock("../lib/sheets", () => ({
  appendRow: vi.fn().mockResolvedValue(5),
  findRowByNetInr: vi.fn().mockResolvedValue(null),
  updateFiraColumns: vi.fn().mockResolvedValue(undefined),
  updateCell: vi.fn().mockResolvedValue(undefined),
}));

const mockEnv: Env = {
  JWT_SECRET: "test-secret-that-is-at-least-32-characters-long",
  ADMIN_PASSWORD_HASH: "",
  CA_PASSWORD_HASH: "",
  FINANCE_KV: {} as KVNamespace,
  FINANCE_R2: {} as R2Bucket,
  ANTHROPIC_API_KEY: "sk-ant-test",
  GOOGLE_SERVICE_ACCOUNT_EMAIL: "test@test.iam.gserviceaccount.com",
  GOOGLE_PRIVATE_KEY: "fake-key",
  GOOGLE_SHEET_ID: "fake-sheet-id",
};

beforeAll(async () => {
  mockEnv.ADMIN_PASSWORD_HASH = await hash("owner-pass", 10);
  mockEnv.CA_PASSWORD_HASH = await hash("ca-pass", 10);
});

beforeEach(() => {
  vi.clearAllMocks();
});

async function getOwnerToken(): Promise<string> {
  const loginRes = await app.request(
    "/api/auth/login",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "prathamesh", password: "owner-pass" }),
    },
    mockEnv,
  );
  const body = (await loginRes.json()) as JsonBody;
  return body.data!.token!;
}

describe("Upload extract route auth", () => {
  it("returns 401 for unauthenticated requests", async () => {
    const res = await app.request("/api/upload/extract", { method: "POST" }, mockEnv);
    expect(res.status).toBe(401);
  });

  it("returns 403 for CA users", async () => {
    const loginRes = await app.request(
      "/api/auth/login",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "kothari_ca", password: "ca-pass" }),
      },
      mockEnv,
    );
    const loginBody = (await loginRes.json()) as JsonBody;
    const caToken = loginBody.data!.token!;

    const form = new FormData();
    form.append("type", "expense");

    const res = await app.request(
      "/api/upload/extract",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${caToken}` },
        body: form,
      },
      mockEnv,
    );

    expect(res.status).toBe(403);
  });

  it("returns 400 when no file is provided", async () => {
    const token = await getOwnerToken();

    const form = new FormData();
    form.append("type", "expense");

    const res = await app.request(
      "/api/upload/extract",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      },
      mockEnv,
    );

    expect(res.status).toBe(400);
    const body = (await res.json()) as JsonBody;
    expect(body.code).toBe("VALIDATION_ERROR");
  });
});

describe("runExtractPipeline", () => {
  it("extracts OCR data and uploads to R2 without writing to sheets", async () => {
    const { extractDocument } = await import("../lib/ocr");
    vi.mocked(extractDocument).mockResolvedValueOnce({
      type: "expense",
      data: {
        vendor: "Test Vendor",
        amount_inr: 2000,
        date: "2026-03-26",
        upi_transaction_id: "TXN123",
        category: "other",
        payment_method: "upi",
        description: "Test expense",
        business_pct: 100,
        confidence: "high",
        review_reason: null,
      },
    });

    const result = await runExtractPipeline(
      {
        fileBuffer: new ArrayBuffer(8),
        mimeType: "application/pdf",
        fileName: "receipt.pdf",
        uploadType: "expense",
        customDescription: null,
      },
      mockEnv,
    );

    expect(result.status).toBe("confirmed");
    expect(result.uploadType).toBe("expense");
    expect(result.fileKey).toBe("FY25-26/Invoices-Received/test.pdf");
    expect(result.extracted).toMatchObject({
      vendor: "Test Vendor",
      amount_inr: 2000,
    });

    const { appendRow } = await import("../lib/sheets");
    expect(appendRow).not.toHaveBeenCalled();
  });

  it("applies custom description for expense during extraction", async () => {
    const { extractDocument } = await import("../lib/ocr");
    vi.mocked(extractDocument).mockResolvedValueOnce({
      type: "expense",
      data: {
        vendor: "Shop",
        amount_inr: 1500,
        date: "2026-03-26",
        upi_transaction_id: null,
        category: "internet",
        payment_method: "upi",
        description: "OCR description",
        business_pct: 100,
        confidence: "high",
        review_reason: null,
      },
    });

    const result = await runExtractPipeline(
      {
        fileBuffer: new ArrayBuffer(8),
        mimeType: "image/jpeg",
        fileName: "bill.jpg",
        uploadType: "expense",
        customDescription: "Internet bill March 2026",
      },
      mockEnv,
    );

    expect(result.extracted.description).toBe("Internet bill March 2026");
  });

  it("marks low-confidence results as review", async () => {
    const { extractDocument } = await import("../lib/ocr");
    vi.mocked(extractDocument).mockResolvedValueOnce({
      type: "expense",
      data: {
        vendor: null,
        amount_inr: 500,
        date: "2026-01-01",
        upi_transaction_id: null,
        category: "other",
        payment_method: null,
        description: "Unclear document",
        business_pct: 100,
        confidence: "low",
        review_reason: "Could not determine vendor or date",
      },
    });

    const result = await runExtractPipeline(
      {
        fileBuffer: new ArrayBuffer(8),
        mimeType: "image/png",
        fileName: "unknown.png",
        uploadType: "expense",
        customDescription: null,
      },
      mockEnv,
    );

    expect(result.status).toBe("review");
  });
});

describe("confirmAndWriteToSheets", () => {
  it("writes an expense to sheets with user-edited fields", async () => {
    const { appendRow } = await import("../lib/sheets");
    vi.mocked(appendRow).mockResolvedValueOnce(5);

    const result = await confirmAndWriteToSheets(
      {
        uploadType: "expense",
        fileKey: "FY25-26/Expenses/2026-03/receipt.pdf",
        fields: {
          date: "2026-04-01",
          description: "Internet bill",
          category: "internet",
          amount_inr: 1500,
          payment_method: "upi",
          vendor: "Jio",
          confidence: "high",
        },
        businessPct: 100,
      },
      mockEnv,
    );

    expect(result.rowNum).toBe(5);
    expect(result.fileKey).toBe("FY25-26/Expenses/2026-03/receipt.pdf");

    const call = vi.mocked(appendRow).mock.calls[0]!;
    expect(call[0]).toBe("Expenses");
    expect(call[1]![0]).toBe("2026-04-01");
    expect(call[1]![1]).toBe("Internet bill");
    expect(call[1]![3]).toBe("1500");
    expect(call[1]![4]).toBe("100");
    expect(call[1]![5]).toBe("1500");
  });

  it("writes a Skydo invoice (Income + fee rows)", async () => {
    const { appendRow } = await import("../lib/sheets");
    vi.mocked(appendRow).mockResolvedValueOnce(10).mockResolvedValueOnce(15);

    const result = await confirmAndWriteToSheets(
      {
        uploadType: "skydo_invoice",
        fileKey: "FY25-26/Invoices-Received/test.pdf",
        fields: {
          date: "2026-03-15",
          payer: "Ensemble Labs Inc.",
          invoice_number: "BL26N112779",
          usd_amount: 5000,
          net_inr_received: 419355.85,
          skydo_prn: "PRN123",
          skydo_charges_inr: 3144.15,
          confidence: "high",
        },
        businessPct: null,
      },
      mockEnv,
    );

    expect(result.incomeRowNum).toBe(10);
    expect(result.feeRowNum).toBe(15);

    expect(appendRow).toHaveBeenCalledTimes(2);
    const incomeCall = vi.mocked(appendRow).mock.calls[0]!;
    expect(incomeCall[0]).toBe("Income");
    expect(incomeCall[1]).toContain("Ensemble Labs Inc.");

    const feeCall = vi.mocked(appendRow).mock.calls[1]!;
    expect(feeCall[0]).toBe("Expenses");
    expect(feeCall[1]).toContain("currency_fees");
  });

  it("links FIRA to existing Income row", async () => {
    const { findRowByNetInr, updateFiraColumns } = await import("../lib/sheets");

    vi.mocked(findRowByNetInr).mockResolvedValueOnce({
      rowNum: 10,
      row: ["2026-03-15", "Ensemble Labs Inc.", "BL26N112779", "5000", "419355.85"],
    });

    const result = await confirmAndWriteToSheets(
      {
        uploadType: "fira",
        fileKey: "FY25-26/FIRA/fira.pdf",
        fields: {
          inr_amount: 419355.85,
          transaction_ref: "TXN20260315001",
        },
        businessPct: null,
      },
      mockEnv,
    );

    expect(result.linked).toBe(true);
    expect(result.matchedRow).toBe(10);
    expect(updateFiraColumns).toHaveBeenCalledWith(
      10,
      "FY25-26/FIRA/fira.pdf",
      "TXN20260315001",
      mockEnv,
    );
  });

  it("returns unlinked when FIRA has no matching Income row", async () => {
    const { findRowByNetInr } = await import("../lib/sheets");
    vi.mocked(findRowByNetInr).mockResolvedValueOnce(null);

    const result = await confirmAndWriteToSheets(
      {
        uploadType: "fira",
        fileKey: "FY25-26/FIRA/fira2.pdf",
        fields: {
          inr_amount: 999999,
          transaction_ref: "TXN999",
        },
        businessPct: null,
      },
      mockEnv,
    );

    expect(result.linked).toBe(false);
  });

  it("respects businessPct override for expenses", async () => {
    const { appendRow } = await import("../lib/sheets");
    vi.mocked(appendRow).mockResolvedValueOnce(7);

    await confirmAndWriteToSheets(
      {
        uploadType: "expense",
        fileKey: "FY25-26/Expenses/personal.jpg",
        fields: {
          date: "2026-03-26",
          description: "Personal",
          category: "other",
          amount_inr: 1000,
          payment_method: "upi",
          vendor: "Shop",
          confidence: "high",
        },
        businessPct: 0,
      },
      mockEnv,
    );

    const expenseCall = vi.mocked(appendRow).mock.calls[0]!;
    expect(expenseCall[1]![4]).toBe("0");
    expect(expenseCall[1]![5]).toBe("0");
  });
});
