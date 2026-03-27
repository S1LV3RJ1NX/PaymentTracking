import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { app } from "../lib/hono";
import { hash } from "bcryptjs";

interface JsonBody {
  success: boolean;
  code?: string;
  error?: string;
  data?: {
    token?: string;
    role?: string;
    rows?: Array<{ id: string; values: Record<string, string> }>;
    total?: number;
    months?: Record<string, unknown[]>;
    id?: string;
    updated?: boolean;
    deleted?: boolean;
  };
}

vi.mock("../lib/sheets", () => ({
  getRows: vi.fn(),
  getRow: vi
    .fn()
    .mockResolvedValue([
      "2026-03-15",
      "desc",
      "cat",
      "1000",
      "100",
      "1000",
      "upi",
      "V",
      "FY25-26/Invoices-Received/test.pdf",
      "high",
      "ts",
    ]),
  updateRow: vi.fn().mockResolvedValue(undefined),
  deleteRow: vi.fn().mockResolvedValue(undefined),
  appendRow: vi.fn().mockResolvedValue(5),
  findRowByNetInr: vi.fn().mockResolvedValue(null),
  updateFiraColumns: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../lib/ocr", () => ({
  extractDocument: vi.fn(),
}));

vi.mock("../lib/storage", () => ({
  uploadToR2: vi.fn(),
  deleteFromR2: vi.fn().mockResolvedValue(undefined),
  getFromR2: vi.fn().mockResolvedValue(null),
}));

const TEST_ENV = {
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

let ownerToken: string;
let caToken: string;

beforeAll(async () => {
  TEST_ENV.ADMIN_PASSWORD_HASH = await hash("owner-pass", 10);
  TEST_ENV.CA_PASSWORD_HASH = await hash("ca-pass", 10);

  const ownerLogin = await app.request(
    "/api/auth/login",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "prathamesh", password: "owner-pass" }),
    },
    TEST_ENV,
  );
  const ownerBody = (await ownerLogin.json()) as JsonBody;
  ownerToken = ownerBody.data!.token!;

  const caLogin = await app.request(
    "/api/auth/login",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "kothari_ca", password: "ca-pass" }),
    },
    TEST_ENV,
  );
  const caBody = (await caLogin.json()) as JsonBody;
  caToken = caBody.data!.token!;
});

beforeEach(() => {
  vi.clearAllMocks();
});

function authGet(path: string, token: string) {
  return app.request(
    path,
    { method: "GET", headers: { Authorization: `Bearer ${token}` } },
    TEST_ENV,
  );
}

describe("GET /api/transactions", () => {
  it("returns filtered rows for current FY", async () => {
    const { getRows } = await import("../lib/sheets");
    vi.mocked(getRows).mockResolvedValueOnce([
      [
        "date",
        "description",
        "category",
        "amount_inr",
        "business_pct",
        "claimable_inr",
        "paid_via",
        "vendor",
        "file_key",
        "confidence",
        "added_at",
      ],
      [
        "2026-03-15",
        "Internet bill",
        "internet",
        "2000",
        "100",
        "2000",
        "upi",
        "ACT",
        "FY25-26/Expenses/internet.jpg",
        "high",
        "2026-03-15T00:00:00Z",
      ],
      [
        "2026-03-20",
        "Travel",
        "travel",
        "5000",
        "100",
        "5000",
        "card",
        "Uber",
        "FY25-26/Expenses/travel.jpg",
        "medium",
        "2026-03-20T00:00:00Z",
      ],
      [
        "2025-03-01",
        "Old expense",
        "other",
        "1000",
        "100",
        "1000",
        "upi",
        "X",
        "FY24-25/Expenses/old.jpg",
        "high",
        "2025-03-01T00:00:00Z",
      ],
    ]);

    const res = await authGet("/api/transactions?tab=Expenses&fy=FY25-26", ownerToken);
    expect(res.status).toBe(200);

    const body = (await res.json()) as JsonBody;
    expect(body.success).toBe(true);
    expect(body.data!.total).toBe(2);
    expect(body.data!.rows).toHaveLength(2);
  });

  it("filters by status=review", async () => {
    const { getRows } = await import("../lib/sheets");
    vi.mocked(getRows).mockResolvedValueOnce([
      [
        "date",
        "description",
        "category",
        "amount_inr",
        "business_pct",
        "claimable_inr",
        "paid_via",
        "vendor",
        "file_key",
        "confidence",
        "added_at",
      ],
      ["2026-03-15", "Bill", "internet", "2000", "100", "2000", "upi", "ACT", "key1", "high", "ts"],
      ["2026-03-20", "Unclear", "other", "5000", "100", "5000", "card", "X", "key2", "low", "ts"],
    ]);

    const res = await authGet(
      "/api/transactions?tab=Expenses&fy=FY25-26&status=review",
      ownerToken,
    );
    const body = (await res.json()) as JsonBody;
    expect(body.data!.total).toBe(1);
    expect(body.data!.rows![0]!.values.confidence).toBe("low");
  });

  it("returns 400 for invalid tab", async () => {
    const res = await authGet("/api/transactions?tab=Invalid", ownerToken);
    expect(res.status).toBe(400);
  });

  it("allows CA to read transactions", async () => {
    const { getRows } = await import("../lib/sheets");
    vi.mocked(getRows).mockResolvedValueOnce([
      [
        "date",
        "client",
        "inv",
        "usd",
        "inr",
        "prn",
        "fira_url",
        "fira_ref",
        "url",
        "confidence",
        "ts",
      ],
    ]);

    const res = await authGet("/api/transactions?tab=Income&fy=FY25-26", caToken);
    expect(res.status).toBe(200);
  });

  it("groups rows by month", async () => {
    const { getRows } = await import("../lib/sheets");
    vi.mocked(getRows).mockResolvedValueOnce([
      [
        "date",
        "description",
        "category",
        "amount_inr",
        "business_pct",
        "claimable_inr",
        "paid_via",
        "vendor",
        "file_key",
        "confidence",
        "added_at",
      ],
      [
        "2026-01-15",
        "Jan expense",
        "other",
        "1000",
        "100",
        "1000",
        "upi",
        "V",
        "url",
        "high",
        "ts",
      ],
      [
        "2026-02-10",
        "Feb expense",
        "rent",
        "5000",
        "100",
        "5000",
        "bank",
        "V",
        "url",
        "high",
        "ts",
      ],
      [
        "2026-01-20",
        "Jan expense 2",
        "internet",
        "2000",
        "100",
        "2000",
        "upi",
        "V",
        "url",
        "high",
        "ts",
      ],
    ]);

    const res = await authGet("/api/transactions?tab=Expenses&fy=FY25-26", ownerToken);
    const body = (await res.json()) as JsonBody;
    const months = body.data!.months as Record<string, unknown[]>;
    expect(Object.keys(months)).toHaveLength(2);
    expect(months["2026-01"]).toHaveLength(2);
    expect(months["2026-02"]).toHaveLength(1);
  });
});

describe("PATCH /api/transactions/:id", () => {
  it("updates a row successfully", async () => {
    const res = await app.request(
      "/api/transactions/Expenses-5",
      {
        method: "PATCH",
        headers: { Authorization: `Bearer ${ownerToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          values: [
            "2026-03-15",
            "Updated",
            "internet",
            "2500",
            "100",
            "2500",
            "upi",
            "ACT",
            "url",
            "high",
            "ts",
          ],
        }),
      },
      TEST_ENV,
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as JsonBody;
    expect(body.data!.updated).toBe(true);
  });

  it("returns 400 for invalid id format", async () => {
    const res = await app.request(
      "/api/transactions/bad-id",
      {
        method: "PATCH",
        headers: { Authorization: `Bearer ${ownerToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ values: ["data"] }),
      },
      TEST_ENV,
    );
    expect(res.status).toBe(400);
  });

  it("returns 403 for CA users", async () => {
    const res = await app.request(
      "/api/transactions/Expenses-5",
      {
        method: "PATCH",
        headers: { Authorization: `Bearer ${caToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ values: ["data"] }),
      },
      TEST_ENV,
    );
    expect(res.status).toBe(403);
  });
});

describe("DELETE /api/transactions/:id", () => {
  it("deletes a row and its R2 file successfully", async () => {
    const { getRow, deleteRow } = await import("../lib/sheets");
    const { deleteFromR2 } = await import("../lib/storage");

    const res = await app.request(
      "/api/transactions/Income-10",
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${ownerToken}` },
      },
      TEST_ENV,
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as JsonBody;
    expect(body.data!.deleted).toBe(true);
    expect((body.data as Record<string, unknown>).fileDeleted).toBe(true);
    expect(vi.mocked(getRow)).toHaveBeenCalledWith("Income", 10, TEST_ENV);
    expect(vi.mocked(deleteFromR2)).toHaveBeenCalledWith(
      "FY25-26/Invoices-Received/test.pdf",
      TEST_ENV,
    );
    expect(vi.mocked(deleteRow)).toHaveBeenCalledWith("Income", 10, TEST_ENV);
  });

  it("returns 403 for CA users", async () => {
    const res = await app.request(
      "/api/transactions/Expenses-5",
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${caToken}` },
      },
      TEST_ENV,
    );
    expect(res.status).toBe(403);
  });
});
