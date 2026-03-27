import { describe, it, expect, vi } from "vitest";
import { signJwt, verifyJwt, verifyPassword } from "../lib/auth";
import { hash } from "bcryptjs";

const TEST_SECRET = "test-secret-that-is-at-least-32-characters-long";

describe("signJwt + verifyJwt", () => {
  it("produces a valid JWT that verifies correctly", async () => {
    const token = await signJwt({ sub: "owner", role: "owner" }, TEST_SECRET);
    expect(token.split(".")).toHaveLength(3);

    const payload = await verifyJwt(token, TEST_SECRET);
    expect(payload).not.toBeNull();
    expect(payload!.sub).toBe("owner");
    expect(payload!.role).toBe("owner");
    expect(payload!.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  it("rejects a token signed with a different secret", async () => {
    const token = await signJwt({ sub: "owner", role: "owner" }, TEST_SECRET);
    const payload = await verifyJwt(token, "wrong-secret-that-is-also-long-enough");
    expect(payload).toBeNull();
  });

  it("rejects a malformed token", async () => {
    expect(await verifyJwt("not.a.valid-token", TEST_SECRET)).toBeNull();
    expect(await verifyJwt("only-one-part", TEST_SECRET)).toBeNull();
    expect(await verifyJwt("", TEST_SECRET)).toBeNull();
  });

  it("rejects an expired token", async () => {
    vi.useFakeTimers();
    const token = await signJwt({ sub: "owner", role: "owner" }, TEST_SECRET);

    // Advance 8 days (past 7-day expiry)
    vi.advanceTimersByTime(8 * 24 * 60 * 60 * 1000);
    const payload = await verifyJwt(token, TEST_SECRET);
    expect(payload).toBeNull();

    vi.useRealTimers();
  });
});

describe("verifyPassword", () => {
  it("returns true for matching password", async () => {
    const hashed = await hash("my-password", 10);
    expect(await verifyPassword("my-password", hashed)).toBe(true);
  });

  it("returns false for wrong password", async () => {
    const hashed = await hash("my-password", 10);
    expect(await verifyPassword("wrong-password", hashed)).toBe(false);
  });
});
