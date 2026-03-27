/**
 * Indian Financial Year runs Apr 1 to Mar 31.
 * "FY26-27" covers Apr 1, 2026 to Mar 31, 2027.
 */

export function getFYFromDate(dateStr: string): string {
  const date = new Date(dateStr);
  const month = date.getMonth(); // 0-indexed
  const year = date.getFullYear();

  // Apr (3) through Dec (11) -> FY starts this calendar year
  // Jan (0) through Mar (2) -> FY started previous calendar year
  const fyStartYear = month >= 3 ? year : year - 1;
  const short1 = fyStartYear % 100;
  const short2 = (fyStartYear + 1) % 100;

  return `FY${String(short1).padStart(2, "0")}-${String(short2).padStart(2, "0")}`;
}

export function getFYDateRange(fy: string): { start: string; end: string } {
  const match = fy.match(/^FY(\d{2})-(\d{2})$/);
  if (!match) throw new Error(`Invalid FY format: ${fy}`);

  const startYear = 2000 + parseInt(match[1]!, 10);
  return {
    start: `${startYear}-04-01`,
    end: `${startYear + 1}-03-31`,
  };
}

export function getCurrentFY(): string {
  return getFYFromDate(new Date().toISOString().slice(0, 10));
}
