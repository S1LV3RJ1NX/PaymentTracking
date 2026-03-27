import { describe, it, expect, beforeAll } from "vitest";
import { app } from "../lib/hono";
import { hash } from "bcryptjs";

interface JsonBody {
  success: boolean;
  code?: string;
  data?: { token: string; role: string };
}

let ownerHash: string;
let caHash: string;

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

beforeAll(async () => {
  ownerHash = await hash("owner-pass", 10);
  caHash = await hash("ca-pass", 10);
  TEST_ENV.ADMIN_PASSWORD_HASH = ownerHash;
  TEST_ENV.CA_PASSWORD_HASH = caHash;
});

function loginRequest(body: unknown) {
  return app.request(
    "/api/auth/login",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
    TEST_ENV,
  );
}

describe("POST /api/auth/login", () => {
  it("returns 200 + token for valid owner credentials", async () => {
    const res = await loginRequest({ username: "prathamesh", password: "owner-pass" });
    expect(res.status).toBe(200);

    const body = (await res.json()) as JsonBody;
    expect(body.success).toBe(true);
    expect(body.data?.token).toBeDefined();
    expect(body.data?.role).toBe("owner");
  });

  it("returns 200 + token for valid CA credentials", async () => {
    const res = await loginRequest({ username: "kothari_ca", password: "ca-pass" });
    expect(res.status).toBe(200);

    const body = (await res.json()) as JsonBody;
    expect(body.success).toBe(true);
    expect(body.data?.role).toBe("ca");
  });

  it("returns 401 for wrong password", async () => {
    const res = await loginRequest({ username: "prathamesh", password: "wrong" });
    expect(res.status).toBe(401);

    const body = (await res.json()) as JsonBody;
    expect(body.success).toBe(false);
    expect(body.code).toBe("UNAUTHORIZED");
  });

  it("returns 400 for missing fields", async () => {
    const res = await loginRequest({ username: "prathamesh" });
    expect(res.status).toBe(400);

    const body = (await res.json()) as JsonBody;
    expect(body.code).toBe("VALIDATION_ERROR");
  });

  it("returns 400 for invalid username", async () => {
    const res = await loginRequest({ username: "admin", password: "test" });
    expect(res.status).toBe(400);

    const body = (await res.json()) as JsonBody;
    expect(body.code).toBe("VALIDATION_ERROR");
  });
});

describe("Auth middleware", () => {
  it("returns 401 for unauthenticated requests", async () => {
    const res = await app.request("/api/transactions", { method: "GET" }, TEST_ENV);
    expect(res.status).toBe(401);
  });

  it("returns 403 for CA on owner-only routes", async () => {
    const loginRes = await loginRequest({ username: "kothari_ca", password: "ca-pass" });
    const loginBody = (await loginRes.json()) as JsonBody;
    const token = loginBody.data!.token;

    const res = await app.request(
      "/api/upload",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: "{}",
      },
      TEST_ENV,
    );
    expect(res.status).toBe(403);
  });

  it("allows owner to access owner-only routes", async () => {
    const loginRes = await loginRequest({ username: "prathamesh", password: "owner-pass" });
    const loginBody = (await loginRes.json()) as JsonBody;
    const token = loginBody.data!.token;

    const res = await app.request(
      "/api/transactions",
      {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
      },
      TEST_ENV,
    );
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
  });
});
