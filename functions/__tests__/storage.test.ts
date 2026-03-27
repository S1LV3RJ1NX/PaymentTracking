import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildFilename, buildR2Key, uploadToR2, deleteFromR2, getFromR2 } from "../lib/storage";
import type { OcrResult, Env } from "../lib/types";

const mockR2Put = vi.fn().mockResolvedValue(undefined);
const mockR2Delete = vi.fn().mockResolvedValue(undefined);
const mockR2Get = vi.fn().mockResolvedValue(null);

const mockR2 = {
  put: mockR2Put,
  delete: mockR2Delete,
  get: mockR2Get,
} as unknown as R2Bucket;

const mockEnv: Env = {
  FINANCE_KV: {} as KVNamespace,
  FINANCE_R2: mockR2,
  JWT_SECRET: "test-secret",
  ADMIN_PASSWORD_HASH: "hash",
  CA_PASSWORD_HASH: "hash",
  ANTHROPIC_API_KEY: "key",
  GOOGLE_SERVICE_ACCOUNT_EMAIL: "test@test.iam.gserviceaccount.com",
  GOOGLE_PRIVATE_KEY: "fake-key",
  GOOGLE_SHEET_ID: "sheet-123",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("buildFilename", () => {
  it("builds Skydo invoice filename", () => {
    const result: OcrResult = {
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
    };

    const name = buildFilename("skydo_invoice", result, "original.pdf");
    expect(name).toBe("Skydo_Ensemble_Labs_Inc__2026-03_BL26N112779.pdf");
  });

  it("builds FIRA filename", () => {
    const result: OcrResult = {
      type: "fira",
      data: {
        inr_amount: 419355.85,
        fcy_amount: 5000,
        currency: "USD",
        remitter_name: "Test",
        transaction_ref: "TXN001",
        processed_date: "2026-03-16",
        purpose: null,
        confidence: "high",
        review_reason: null,
      },
    };

    const name = buildFilename("fira", result, "fira.pdf");
    expect(name).toBe("FIRA_2026-03_TXN001.pdf");
  });

  it("builds expense filename", () => {
    const result: OcrResult = {
      type: "expense",
      data: {
        vendor: "Shop",
        amount_inr: 2000,
        date: "2026-03-26",
        upi_transaction_id: null,
        category: "internet",
        payment_method: "upi",
        description: "Internet bill",
        business_pct: 100,
        confidence: "high",
        review_reason: null,
      },
    };

    const name = buildFilename("expense", result, "bill.jpg");
    expect(name).toBe("internet_20260326_bill.jpg");
  });

  it("builds 'other' filename", () => {
    const result: OcrResult = {
      type: "other",
      data: { date: "2026-01-05", description: "unknown doc" },
    };

    const name = buildFilename("other", result, "doc.pdf");
    expect(name).toBe("other_20260105_doc.pdf");
  });
});

describe("buildR2Key", () => {
  it("builds a full R2 key with FY/subfolder/filename", () => {
    const result: OcrResult = {
      type: "skydo_invoice",
      data: {
        payer: "Test Co",
        date: "2026-03-15",
        usd_amount: 5000,
        fx_rate: 84.5,
        converted_inr: 422500,
        skydo_charges_inr: 3000,
        net_inr_received: 419500,
        invoice_number: "INV001",
        skydo_prn: "PRN001",
        confidence: "high",
        review_reason: null,
      },
    };

    const key = buildR2Key("skydo_invoice", result, "test.pdf");
    expect(key).toBe("FY25-26/Invoices-Received/Skydo_Test_Co_2026-03_INV001.pdf");
  });

  it("builds expense key with month subfolder", () => {
    const result: OcrResult = {
      type: "expense",
      data: {
        vendor: "ISP",
        amount_inr: 1000,
        date: "2025-07-15",
        upi_transaction_id: null,
        category: "internet",
        payment_method: "upi",
        description: "Net bill",
        business_pct: 100,
        confidence: "high",
        review_reason: null,
      },
    };

    const key = buildR2Key("expense", result, "bill.jpg");
    expect(key).toBe("FY25-26/Expenses/2025-07/internet_20250715_bill.jpg");
  });
});

describe("uploadToR2", () => {
  it("puts the file into R2 and returns the key", async () => {
    const ocrResult: OcrResult = {
      type: "skydo_invoice",
      data: {
        payer: "Test Co",
        date: "2026-03-15",
        usd_amount: 5000,
        fx_rate: 84.5,
        converted_inr: 422500,
        skydo_charges_inr: 3000,
        net_inr_received: 419500,
        invoice_number: "INV001",
        skydo_prn: "PRN001",
        confidence: "high",
        review_reason: null,
      },
    };

    const buf = new ArrayBuffer(8);
    const key = await uploadToR2(
      buf,
      "application/pdf",
      "test.pdf",
      "skydo_invoice",
      ocrResult,
      mockEnv,
    );

    expect(key).toBe("FY25-26/Invoices-Received/Skydo_Test_Co_2026-03_INV001.pdf");
    expect(mockR2Put).toHaveBeenCalledWith(key, buf, {
      httpMetadata: { contentType: "application/pdf" },
      customMetadata: { uploadType: "skydo_invoice", originalName: "test.pdf" },
    });
  });
});

describe("deleteFromR2", () => {
  it("calls R2 delete with the key", async () => {
    await deleteFromR2("FY25-26/Invoices/test.pdf", mockEnv);
    expect(mockR2Delete).toHaveBeenCalledWith("FY25-26/Invoices/test.pdf");
  });
});

describe("getFromR2", () => {
  it("returns null for missing file", async () => {
    const result = await getFromR2("no-such-key", mockEnv);
    expect(result).toBeNull();
  });

  it("returns the object when found", async () => {
    const fakeBody = { body: "blob", httpMetadata: { contentType: "image/jpeg" } };
    mockR2Get.mockResolvedValueOnce(fakeBody);

    const result = await getFromR2("FY25-26/Expenses/file.jpg", mockEnv);
    expect(result).toBe(fakeBody);
  });
});
