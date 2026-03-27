import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { app } from "../lib/hono";
import { hash } from "bcryptjs";

interface JsonBody {
  success: boolean;
  data?: {
    token?: string;
    fy?: string;
    estimated_annual?: number | null;
  };
  error?: string;
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

const kvStore: Record<string, string> = {};

const TEST_ENV = {
  JWT_SECRET: "test-secret-that-is-at-least-32-characters-long",
  ADMIN_PASSWORD_HASH: "",
  CA_PASSWORD_HASH: "",
  FINANCE_KV: {
    get: vi.fn(async (key: string) => kvStore[key] ?? null),
    put: vi.fn(async (key: string, value: string) => {
      kvStore[key] = value;
    }),
  } as unknown as KVNamespace,
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
  ownerToken = ((await ownerLogin.json()) as JsonBody).data!.token!;

  const caLogin = await app.request(
    "/api/auth/login",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "kothari_ca", password: "ca-pass" }),
    },
    TEST_ENV,
  );
  caToken = ((await caLogin.json()) as JsonBody).data!.token!;
});

beforeEach(() => {
  vi.clearAllMocks();
  for (const key of Object.keys(kvStore)) delete kvStore[key];
});

function authGet(path: string, token: string) {
  return app.request(
    path,
    { method: "GET", headers: { Authorization: `Bearer ${token}` } },
    TEST_ENV,
  );
}

function authPut(path: string, body: object, token: string) {
  return app.request(
    path,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    },
    TEST_ENV,
  );
}

describe("GET /api/tax/estimate", () => {
  it("returns null when no estimate stored", async () => {
    const res = await authGet("/api/tax/estimate?fy=FY25-26", ownerToken);
    expect(res.status).toBe(200);

    const body = (await res.json()) as JsonBody;
    expect(body.success).toBe(true);
    expect(body.data!.estimated_annual).toBeNull();
    expect(body.data!.fy).toBe("FY25-26");
  });

  it("returns stored estimate", async () => {
    kvStore["tax_estimate_FY25-26"] = "2500000";
    const res = await authGet("/api/tax/estimate?fy=FY25-26", ownerToken);
    const body = (await res.json()) as JsonBody;
    expect(body.data!.estimated_annual).toBe(2500000);
  });

  it("CA can also read the estimate", async () => {
    kvStore["tax_estimate_FY25-26"] = "3000000";
    const res = await authGet("/api/tax/estimate?fy=FY25-26", caToken);
    expect(res.status).toBe(200);
    const body = (await res.json()) as JsonBody;
    expect(body.data!.estimated_annual).toBe(3000000);
  });
});

describe("PUT /api/tax/estimate", () => {
  it("saves estimate as owner", async () => {
    const res = await authPut(
      "/api/tax/estimate",
      { fy: "FY25-26", estimated_annual: 2500000 },
      ownerToken,
    );
    expect(res.status).toBe(200);

    const body = (await res.json()) as JsonBody;
    expect(body.success).toBe(true);
    expect(body.data!.estimated_annual).toBe(2500000);
    expect(kvStore["tax_estimate_FY25-26"]).toBe("2500000");
  });

  it("CA can also save estimate", async () => {
    const res = await authPut(
      "/api/tax/estimate",
      { fy: "FY25-26", estimated_annual: 4000000 },
      caToken,
    );
    expect(res.status).toBe(200);
    expect(kvStore["tax_estimate_FY25-26"]).toBe("4000000");
  });

  it("rejects missing fy", async () => {
    const res = await authPut("/api/tax/estimate", { estimated_annual: 2500000 }, ownerToken);
    expect(res.status).toBe(400);
  });

  it("rejects negative amount", async () => {
    const res = await authPut(
      "/api/tax/estimate",
      { fy: "FY25-26", estimated_annual: -100 },
      ownerToken,
    );
    expect(res.status).toBe(400);
  });

  it("rejects missing estimated_annual", async () => {
    const res = await authPut("/api/tax/estimate", { fy: "FY25-26" }, ownerToken);
    expect(res.status).toBe(400);
  });

  it("rejects unauthenticated request", async () => {
    const res = await app.request(
      "/api/tax/estimate",
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fy: "FY25-26", estimated_annual: 100 }),
      },
      TEST_ENV,
    );
    expect(res.status).toBe(401);
  });
});
