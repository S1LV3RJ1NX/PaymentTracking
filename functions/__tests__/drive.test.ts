import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildFilename, uploadToDrive } from "../lib/drive";
import type { OcrResult, Env } from "../lib/types";

vi.mock("../lib/google-auth", () => ({
  getAccessToken: vi.fn().mockResolvedValue("mock-access-token"),
}));

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

const mockKv = {
  get: vi.fn().mockResolvedValue(null),
  put: vi.fn().mockResolvedValue(undefined),
} as unknown as KVNamespace;

const mockEnv: Env = {
  FINANCE_KV: mockKv,
  JWT_SECRET: "test-secret",
  ADMIN_PASSWORD_HASH: "hash",
  CA_PASSWORD_HASH: "hash",
  ANTHROPIC_API_KEY: "key",
  GOOGLE_SERVICE_ACCOUNT_EMAIL: "test@test.iam.gserviceaccount.com",
  GOOGLE_PRIVATE_KEY: "fake-key",
  GOOGLE_DRIVE_ROOT_FOLDER_ID: "root-folder-id",
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

describe("uploadToDrive", () => {
  it("creates folder chain and uploads file", async () => {
    // Folder lookups: FY25-26, Invoices-Received — both not found, so create
    let callCount = 0;
    mockFetch.mockImplementation(async (url: string, options?: RequestInit) => {
      const urlStr = String(url);

      // Folder search (GET with q= parameter)
      if (urlStr.includes("drive/v3/files?q=")) {
        return { ok: true, json: async () => ({ files: [] }) };
      }

      // Folder create (POST without uploadType)
      if (urlStr === "https://www.googleapis.com/drive/v3/files" && options?.method === "POST") {
        callCount++;
        return {
          ok: true,
          json: async () => ({ id: `folder-${callCount}` }),
        };
      }

      // File upload (POST with uploadType=multipart)
      if (urlStr.includes("uploadType=multipart")) {
        return {
          ok: true,
          json: async () => ({
            id: "file-id-123",
            webViewLink: "https://drive.google.com/file/d/file-id-123/view",
          }),
        };
      }

      return { ok: false, status: 404, text: async () => "Not found" };
    });

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

    const url = await uploadToDrive(
      new ArrayBuffer(8),
      "application/pdf",
      "test.pdf",
      "skydo_invoice",
      ocrResult,
      mockEnv,
    );

    expect(url).toBe("https://drive.google.com/file/d/file-id-123/view");
    // Should have KV puts for new folders
    expect(mockKv.put).toHaveBeenCalled();
  });

  it("uses cached folder ID from KV", async () => {
    (mockKv.get as ReturnType<typeof vi.fn>).mockResolvedValue("cached-folder-id");

    mockFetch.mockImplementation(async (url: string) => {
      const urlStr = String(url);
      if (urlStr.includes("uploadType=multipart")) {
        return {
          ok: true,
          json: async () => ({
            id: "file-id",
            webViewLink: "https://drive.google.com/file/d/file-id/view",
          }),
        };
      }
      return { ok: true, json: async () => ({}) };
    });

    const ocrResult: OcrResult = {
      type: "expense",
      data: {
        vendor: "Shop",
        amount_inr: 500,
        date: "2026-03-26",
        upi_transaction_id: null,
        category: "other",
        payment_method: "upi",
        description: "test",
        business_pct: 100,
        confidence: "high",
        review_reason: null,
      },
    };

    await uploadToDrive(
      new ArrayBuffer(8),
      "image/jpeg",
      "test.jpg",
      "expense",
      ocrResult,
      mockEnv,
    );

    // No folder search/create calls since KV returned cached IDs
    const driveCalls = mockFetch.mock.calls.filter((c) =>
      String(c[0]).includes("drive/v3/files?q="),
    );
    expect(driveCalls).toHaveLength(0);
  });
});
