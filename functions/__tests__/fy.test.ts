import { describe, it, expect } from "vitest";
import { getFYFromDate, getFYDateRange, getCurrentFY } from "../lib/fy";

describe("getFYFromDate", () => {
  it("maps April dates to the FY starting that year", () => {
    expect(getFYFromDate("2026-04-15")).toBe("FY26-27");
  });

  it("maps March dates to the FY that started the previous year", () => {
    expect(getFYFromDate("2026-03-11")).toBe("FY25-26");
  });

  it("maps January to previous FY", () => {
    expect(getFYFromDate("2027-01-01")).toBe("FY26-27");
  });

  it("maps December to current FY", () => {
    expect(getFYFromDate("2026-12-31")).toBe("FY26-27");
  });
});

describe("getFYDateRange", () => {
  it("returns correct range for FY26-27", () => {
    const range = getFYDateRange("FY26-27");
    expect(range.start).toBe("2026-04-01");
    expect(range.end).toBe("2027-03-31");
  });

  it("throws on invalid format", () => {
    expect(() => getFYDateRange("2026-27")).toThrow("Invalid FY format");
  });
});

describe("getCurrentFY", () => {
  it("returns a valid FY string", () => {
    const fy = getCurrentFY();
    expect(fy).toMatch(/^FY\d{2}-\d{2}$/);
  });
});
