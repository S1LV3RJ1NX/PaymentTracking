import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { app } from "../lib/hono";
import { runUploadPipeline } from "../lib/upload-pipeline";
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
    driveUrl?: string;
  };
}

vi.mock("../lib/ocr", () => ({
  extractDocument: vi.fn(),
}));

vi.mock("../lib/drive", () => ({
  uploadToDrive: vi.fn().mockResolvedValue("https://drive.google.com/file/d/abc/view"),
  buildFilename: vi.fn().mockReturnValue("test.pdf"),
}));

vi.mock("../lib/sheets", () => ({
  appendRow: vi.fn().mockResolvedValue(5),
  findRowByNetInr: vi.fn().mockResolvedValue(null),
  updateFiraColumns: vi.fn().mockResolvedValue(undefined),
}));

const mockEnv: Env = {
  JWT_SECRET: "test-secret-that-is-at-least-32-characters-long",
  ADMIN_PASSWORD_HASH: "",
  CA_PASSWORD_HASH: "",
  FINANCE_KV: {} as KVNamespace,
  ANTHROPIC_API_KEY: "sk-ant-test",
  GOOGLE_SERVICE_ACCOUNT_EMAIL: "test@test.iam.gserviceaccount.com",
  GOOGLE_PRIVATE_KEY: "fake-key",
  GOOGLE_DRIVE_ROOT_FOLDER_ID: "fake-folder-id",
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

describe("Upload route auth", () => {
  it("returns 401 for unauthenticated requests", async () => {
    const res = await app.request("/api/upload", { method: "POST" }, mockEnv);
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
      "/api/upload",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${caToken}` },
        body: form,
      },
      mockEnv,
    );

    expect(res.status).toBe(403);
  });

  it("returns 400 when no file is provided (FormData file becomes string in miniflare)", async () => {
    const token = await getOwnerToken();

    const form = new FormData();
    form.append("type", "expense");

    const res = await app.request(
      "/api/upload",
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

describe("runUploadPipeline", () => {
  it("processes an expense upload", async () => {
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

    const result = await runUploadPipeline(
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
    expect(result.driveUrl).toBe("https://drive.google.com/file/d/abc/view");
    expect(result.extracted).toMatchObject({
      vendor: "Test Vendor",
      amount_inr: 2000,
    });
    expect(result.rowNum).toBe(5);
  });

  it("applies custom description for expense", async () => {
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

    const result = await runUploadPipeline(
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

  it("processes a Skydo invoice with dual-row write", async () => {
    const { extractDocument } = await import("../lib/ocr");
    const { appendRow } = await import("../lib/sheets");

    vi.mocked(extractDocument).mockResolvedValueOnce({
      type: "skydo_invoice",
      data: {
        payer: "Ensemble Labs Inc.",
        date: "2026-03-15",
        usd_amount: 5000,
        fx_rate: 84.5,
        converted_inr: 422500,
        skydo_charges_inr: 3144.15,
        net_inr_received: 419355.85,
        invoice_number: "BL26N112779",
        skydo_prn: "PRN123",
        confidence: "high",
        review_reason: null,
      },
    });

    vi.mocked(appendRow)
      .mockResolvedValueOnce(10) // Income row
      .mockResolvedValueOnce(15); // Fee expense row

    const result = await runUploadPipeline(
      {
        fileBuffer: new ArrayBuffer(8),
        mimeType: "application/pdf",
        fileName: "skydo.pdf",
        uploadType: "skydo_invoice",
        customDescription: null,
      },
      mockEnv,
    );

    expect(result.status).toBe("confirmed");
    expect(result.incomeRowNum).toBe(10);
    expect(result.feeRowNum).toBe(15);

    // Verify two appendRow calls: Income + Expenses
    expect(appendRow).toHaveBeenCalledTimes(2);
    const incomeCall = vi.mocked(appendRow).mock.calls[0]!;
    expect(incomeCall[0]).toBe("Income");
    expect(incomeCall[1]).toContain("Ensemble Labs Inc.");

    const feeCall = vi.mocked(appendRow).mock.calls[1]!;
    expect(feeCall[0]).toBe("Expenses");
    expect(feeCall[1]).toContain("skydo_fees");
  });

  it("links FIRA to existing Income row", async () => {
    const { extractDocument } = await import("../lib/ocr");
    const { findRowByNetInr, updateFiraColumns } = await import("../lib/sheets");

    vi.mocked(extractDocument).mockResolvedValueOnce({
      type: "fira",
      data: {
        inr_amount: 419355.85,
        fcy_amount: 5000,
        currency: "USD",
        remitter_name: "Ensemble Labs Inc.",
        transaction_ref: "TXN20260315001",
        processed_date: "2026-03-16",
        purpose: "Freelance services",
        confidence: "high",
        review_reason: null,
      },
    });

    vi.mocked(findRowByNetInr).mockResolvedValueOnce({
      rowNum: 10,
      row: ["2026-03-15", "Ensemble Labs Inc.", "BL26N112779", "5000", "419355.85"],
    });

    const result = await runUploadPipeline(
      {
        fileBuffer: new ArrayBuffer(8),
        mimeType: "application/pdf",
        fileName: "fira.pdf",
        uploadType: "fira",
        customDescription: null,
      },
      mockEnv,
    );

    expect(result.linked).toBe(true);
    expect(result.matchedRow).toBe(10);
    expect(updateFiraColumns).toHaveBeenCalledWith(
      10,
      "https://drive.google.com/file/d/abc/view",
      "TXN20260315001",
      mockEnv,
    );
  });

  it("returns unlinked when FIRA has no matching Income row", async () => {
    const { extractDocument } = await import("../lib/ocr");
    const { findRowByNetInr } = await import("../lib/sheets");

    vi.mocked(extractDocument).mockResolvedValueOnce({
      type: "fira",
      data: {
        inr_amount: 999999,
        fcy_amount: 10000,
        currency: "USD",
        remitter_name: "Unknown",
        transaction_ref: "TXN999",
        processed_date: "2026-03-20",
        purpose: null,
        confidence: "medium",
        review_reason: "Amount seems unusual",
      },
    });

    vi.mocked(findRowByNetInr).mockResolvedValueOnce(null);

    const result = await runUploadPipeline(
      {
        fileBuffer: new ArrayBuffer(8),
        mimeType: "application/pdf",
        fileName: "fira2.pdf",
        uploadType: "fira",
        customDescription: null,
      },
      mockEnv,
    );

    expect(result.linked).toBe(false);
    expect(result.status).toBe("review");
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

    const result = await runUploadPipeline(
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
