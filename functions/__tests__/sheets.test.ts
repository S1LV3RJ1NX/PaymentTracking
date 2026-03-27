import { describe, it, expect, vi, beforeEach } from "vitest";
import { appendRow, getRows, updateRow, findRowByNetInr, updateFiraColumns } from "../lib/sheets";
import type { Env } from "../lib/types";

vi.mock("../lib/google-auth", () => ({
  getAccessToken: vi.fn().mockResolvedValue("mock-access-token"),
}));

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

const mockEnv: Env = {
  FINANCE_KV: {} as KVNamespace,
  JWT_SECRET: "test-secret",
  ADMIN_PASSWORD_HASH: "hash",
  CA_PASSWORD_HASH: "hash",
  ANTHROPIC_API_KEY: "key",
  GOOGLE_SERVICE_ACCOUNT_EMAIL: "test@test.iam.gserviceaccount.com",
  GOOGLE_PRIVATE_KEY: "fake-key",
  GOOGLE_DRIVE_ROOT_FOLDER_ID: "root-folder",
  GOOGLE_SHEET_ID: "sheet-123",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("appendRow", () => {
  it("sends values and returns row number", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        updates: { updatedRange: "Income!A5:K5" },
      }),
    });

    const rowNum = await appendRow("Income", ["2026-03-15", "Test Client", "INV001"], mockEnv);

    expect(rowNum).toBe(5);
    expect(mockFetch).toHaveBeenCalledOnce();

    const call = mockFetch.mock.calls[0]!;
    expect(call[0]).toContain("sheet-123");
    expect(call[0]).toContain(":append");
    expect(call[1].method).toBe("POST");
  });

  it("returns -1 when range is missing from response", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    });

    const rowNum = await appendRow("Income", ["data"], mockEnv);
    expect(rowNum).toBe(-1);
  });

  it("throws on API error", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      text: async () => "Forbidden",
    });

    await expect(appendRow("Income", ["data"], mockEnv)).rejects.toThrow(
      "Sheets append failed: 403",
    );
  });
});

describe("getRows", () => {
  it("returns rows from the sheet", async () => {
    const rows = [
      ["date", "client", "amount"],
      ["2026-03-15", "Test", "5000"],
    ];
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ values: rows }),
    });

    const result = await getRows("Income", mockEnv);
    expect(result).toEqual(rows);
  });

  it("returns empty array when no values", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    });

    const result = await getRows("Income", mockEnv);
    expect(result).toEqual([]);
  });
});

describe("updateRow", () => {
  it("sends PUT request to update a row", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) });

    await updateRow("Income", 5, ["updated", "values"], mockEnv);

    const call = mockFetch.mock.calls[0]!;
    expect(call[0]).toContain("A5");
    expect(call[1].method).toBe("PUT");
  });
});

describe("findRowByNetInr", () => {
  it("finds a matching row by INR amount", async () => {
    const rows = [
      ["date", "client", "inv", "usd", "inr"],
      ["2026-03-15", "Client A", "INV001", "5000", "419355.85"],
      ["2026-03-20", "Client B", "INV002", "3000", "253500"],
    ];
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ values: rows }),
    });

    const match = await findRowByNetInr("Income", 419355.85, mockEnv);
    expect(match).not.toBeNull();
    expect(match!.rowNum).toBe(2);
    expect(match!.row[1]).toBe("Client A");
  });

  it("returns null when no match", async () => {
    const rows = [
      ["date", "client", "inv", "usd", "inr"],
      ["2026-03-15", "Client A", "INV001", "5000", "419355.85"],
    ];
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ values: rows }),
    });

    const match = await findRowByNetInr("Income", 999999, mockEnv);
    expect(match).toBeNull();
  });
});

describe("updateFiraColumns", () => {
  it("updates FIRA columns for a specific row", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) });

    await updateFiraColumns(5, "https://drive.google.com/fira-doc", "TXN123", mockEnv);

    const call = mockFetch.mock.calls[0]!;
    expect(call[0]).toContain("G5");
    expect(call[1].method).toBe("PUT");

    const body = JSON.parse(call[1].body as string) as { values: string[][] };
    expect(body.values[0]).toEqual(["https://drive.google.com/fira-doc", "TXN123"]);
  });
});
