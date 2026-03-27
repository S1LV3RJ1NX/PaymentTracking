import { describe, it, expect, vi, beforeEach } from "vitest";
import { extractDocument } from "../lib/ocr";

const mockCreate = vi.fn();

vi.mock("@anthropic-ai/sdk", () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: { create: mockCreate },
  })),
}));

const sampleSkydo = {
  payer: "Ensemble Labs Inc.",
  date: "2026-03-15",
  usd_amount: 5000,
  fx_rate: 84.5,
  converted_inr: 422500,
  skydo_charges_inr: 3144.15,
  net_inr_received: 419355.85,
  invoice_number: "BL26N112779",
  skydo_prn: "PRN12345",
  confidence: "high",
  review_reason: null,
};

const sampleExpense = {
  vendor: "MALGUDI FARM",
  amount_inr: 2000,
  date: "2026-03-26",
  upi_transaction_id: "608511875642",
  category: "other",
  payment_method: "upi",
  description: "UPI payment to Malgudi Farm",
  business_pct: 100,
  confidence: "high",
  review_reason: null,
};

const sampleFira = {
  inr_amount: 419355.85,
  fcy_amount: 5000,
  currency: "USD",
  remitter_name: "Ensemble Labs Inc.",
  transaction_ref: "TXN20260315001",
  processed_date: "2026-03-16",
  purpose: "Freelance services",
  confidence: "high",
  review_reason: null,
};

function makeClaudeResponse(data: unknown) {
  return {
    content: [{ type: "text", text: JSON.stringify(data) }],
  };
}

const dummyBuffer = new ArrayBuffer(8);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("extractDocument", () => {
  it("parses a Skydo invoice correctly", async () => {
    mockCreate.mockResolvedValueOnce(makeClaudeResponse(sampleSkydo));

    const result = await extractDocument(
      dummyBuffer,
      "application/pdf",
      "skydo_invoice",
      "sk-ant-test",
    );

    expect(result.type).toBe("skydo_invoice");
    expect(result.data).toMatchObject({
      payer: "Ensemble Labs Inc.",
      net_inr_received: 419355.85,
      skydo_charges_inr: 3144.15,
    });
  });

  it("parses an expense (UPI) correctly", async () => {
    mockCreate.mockResolvedValueOnce(makeClaudeResponse(sampleExpense));

    const result = await extractDocument(dummyBuffer, "image/jpeg", "expense", "sk-ant-test");

    expect(result.type).toBe("expense");
    expect(result.data).toMatchObject({
      vendor: "MALGUDI FARM",
      amount_inr: 2000,
      payment_method: "upi",
    });
  });

  it("parses a FIRA correctly", async () => {
    mockCreate.mockResolvedValueOnce(makeClaudeResponse(sampleFira));

    const result = await extractDocument(dummyBuffer, "application/pdf", "fira", "sk-ant-test");

    expect(result.type).toBe("fira");
    expect(result.data).toMatchObject({
      inr_amount: 419355.85,
      transaction_ref: "TXN20260315001",
    });
  });

  it("handles 'other' type as passthrough", async () => {
    const otherData = {
      doc_type: "unknown receipt",
      date: "2026-01-01",
      amount: 500,
      currency: "INR",
      description: "Some receipt",
      vendor_or_client: "Vendor X",
      confidence: "low",
      review_reason: "Unknown format",
    };
    mockCreate.mockResolvedValueOnce(makeClaudeResponse(otherData));

    const result = await extractDocument(dummyBuffer, "image/png", "other", "sk-ant-test");

    expect(result.type).toBe("other");
    expect(result.data).toMatchObject({ doc_type: "unknown receipt" });
  });

  it("throws on Zod validation failure for bad Skydo data", async () => {
    mockCreate.mockResolvedValueOnce(makeClaudeResponse({ payer: "Test", date: "2026-01-01" }));

    await expect(
      extractDocument(dummyBuffer, "application/pdf", "skydo_invoice", "sk-ant-test"),
    ).rejects.toThrow("Skydo OCR validation failed");
  });

  it("throws when Claude returns no text block", async () => {
    mockCreate.mockResolvedValueOnce({ content: [] });

    await expect(
      extractDocument(dummyBuffer, "image/jpeg", "expense", "sk-ant-test"),
    ).rejects.toThrow("No text response from Claude");
  });

  it("sends PDF as document type, image as image type", async () => {
    mockCreate.mockResolvedValueOnce(makeClaudeResponse(sampleExpense));

    await extractDocument(dummyBuffer, "image/jpeg", "expense", "sk-ant-test");

    const call = mockCreate.mock.calls[0]![0] as {
      messages: Array<{ content: Array<{ type: string }> }>;
    };
    expect(call.messages[0]!.content[0]!.type).toBe("image");

    mockCreate.mockResolvedValueOnce(makeClaudeResponse(sampleSkydo));
    await extractDocument(dummyBuffer, "application/pdf", "skydo_invoice", "sk-ant-test");

    const call2 = mockCreate.mock.calls[1]![0] as {
      messages: Array<{ content: Array<{ type: string }> }>;
    };
    expect(call2.messages[0]!.content[0]!.type).toBe("document");
  });
});
