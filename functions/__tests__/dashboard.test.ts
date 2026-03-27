import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { app } from "../lib/hono";
import { hash } from "bcryptjs";

interface JsonBody {
  success: boolean;
  data?: {
    token?: string;
    fy?: string;
    income?: { ytd_inr: number; by_client: Record<string, number> };
    expenses?: { ytd_claimable: number; by_category: Record<string, number> };
    review_count?: number;
    months?: Array<{ month: string; income: number; expenses: number }>;
  };
}

vi.mock("../lib/sheets", () => ({
  getRows: vi.fn(),
  updateRow: vi.fn(),
  deleteRow: vi.fn(),
  appendRow: vi.fn(),
  findRowByNetInr: vi.fn(),
  updateFiraColumns: vi.fn(),
}));

vi.mock("../lib/ocr", () => ({ extractDocument: vi.fn() }));
vi.mock("../lib/storage", () => ({ uploadToR2: vi.fn() }));

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

let token: string;

beforeAll(async () => {
  TEST_ENV.ADMIN_PASSWORD_HASH = await hash("owner-pass", 10);
  TEST_ENV.CA_PASSWORD_HASH = await hash("ca-pass", 10);

  const loginRes = await app.request(
    "/api/auth/login",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "prathamesh", password: "owner-pass" }),
    },
    TEST_ENV,
  );
  const body = (await loginRes.json()) as JsonBody;
  token = body.data!.token!;
});

beforeEach(() => {
  vi.clearAllMocks();
});

function authGet(path: string) {
  return app.request(
    path,
    { method: "GET", headers: { Authorization: `Bearer ${token}` } },
    TEST_ENV,
  );
}

const INCOME_HEADER = [
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
];
const EXPENSE_HEADER = [
  "date",
  "description",
  "category",
  "amount_inr",
  "business_pct",
  "claimable_inr",
  "paid_via",
  "vendor",
  "url",
  "confidence",
  "ts",
];

describe("GET /api/dashboard/summary", () => {
  it("computes YTD income and expenses", async () => {
    const { getRows } = await import("../lib/sheets");
    vi.mocked(getRows)
      .mockResolvedValueOnce([
        INCOME_HEADER,
        ["2026-01-15", "Client A", "INV001", "5000", "419000", "PRN1", "", "", "url", "high", "ts"],
        [
          "2026-02-15",
          "Client B",
          "INV002",
          "3000",
          "253000",
          "PRN2",
          "",
          "",
          "url",
          "medium",
          "ts",
        ],
      ])
      .mockResolvedValueOnce([
        EXPENSE_HEADER,
        [
          "2026-01-10",
          "Internet",
          "internet",
          "2000",
          "100",
          "2000",
          "upi",
          "ACT",
          "url",
          "high",
          "ts",
        ],
        [
          "2026-03-01",
          "Travel",
          "travel",
          "5000",
          "100",
          "5000",
          "card",
          "Uber",
          "url",
          "low",
          "ts",
        ],
      ]);

    const res = await authGet("/api/dashboard/summary?fy=FY25-26");
    expect(res.status).toBe(200);

    const body = (await res.json()) as JsonBody;
    expect(body.data!.income!.ytd_inr).toBe(672000);
    expect(body.data!.income!.by_client["Client A"]).toBe(419000);
    expect(body.data!.income!.by_client["Client B"]).toBe(253000);
    expect(body.data!.expenses!.ytd_claimable).toBe(7000);
    expect(body.data!.expenses!.by_category["internet"]).toBe(2000);
    expect(body.data!.review_count).toBe(2);
  });

  it("filters by FY date range", async () => {
    const { getRows } = await import("../lib/sheets");
    vi.mocked(getRows)
      .mockResolvedValueOnce([
        INCOME_HEADER,
        ["2025-03-15", "InFY", "INV", "1000", "84000", "P", "", "", "url", "high", "ts"],
        ["2025-04-15", "NotInFY", "INV", "2000", "168000", "P", "", "", "url", "high", "ts"],
      ])
      .mockResolvedValueOnce([EXPENSE_HEADER]);

    const res = await authGet("/api/dashboard/summary?fy=FY24-25");
    const body = (await res.json()) as JsonBody;
    expect(body.data!.income!.ytd_inr).toBe(84000);
  });
});

describe("GET /api/dashboard/monthly", () => {
  it("returns month-by-month breakdown", async () => {
    const { getRows } = await import("../lib/sheets");
    vi.mocked(getRows)
      .mockResolvedValueOnce([
        INCOME_HEADER,
        ["2026-01-15", "A", "I1", "5000", "419000", "P1", "", "", "url", "high", "ts"],
        ["2026-01-25", "B", "I2", "3000", "253000", "P2", "", "", "url", "high", "ts"],
        ["2026-02-10", "A", "I3", "4000", "336000", "P3", "", "", "url", "high", "ts"],
      ])
      .mockResolvedValueOnce([
        EXPENSE_HEADER,
        [
          "2026-01-10",
          "Bill",
          "internet",
          "2000",
          "100",
          "2000",
          "upi",
          "ACT",
          "url",
          "high",
          "ts",
        ],
        ["2026-02-20", "Rent", "rent", "15000", "100", "15000", "bank", "L", "url", "high", "ts"],
      ]);

    const res = await authGet("/api/dashboard/monthly?fy=FY25-26");
    expect(res.status).toBe(200);

    const body = (await res.json()) as JsonBody;
    const months = body.data!.months!;
    expect(months).toHaveLength(2);
    expect(months[0]!.month).toBe("2026-01");
    expect(months[0]!.income).toBe(672000);
    expect(months[0]!.expenses).toBe(2000);
    expect(months[1]!.month).toBe("2026-02");
    expect(months[1]!.income).toBe(336000);
    expect(months[1]!.expenses).toBe(15000);
  });
});
