import type { Env } from "./types";
import { getAccessToken } from "./google-auth";

const BASE = "https://sheets.googleapis.com/v4/spreadsheets";

export async function appendRow(tab: string, values: string[], env: Env): Promise<number> {
  const token = await getAccessToken(env);
  const range = encodeURIComponent(`${tab}!A:Z`);

  const res = await fetch(
    `${BASE}/${env.GOOGLE_SHEET_ID}/values/${range}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ values: [values] }),
    },
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Sheets append failed: ${res.status} ${text}`);
  }

  const data = (await res.json()) as {
    updates?: { updatedRange?: string };
  };

  const updatedRange = data.updates?.updatedRange;
  if (updatedRange) {
    const match = updatedRange.match(/!A(\d+):/);
    if (match?.[1]) return parseInt(match[1], 10);
  }

  return -1;
}

export async function getRows(tab: string, env: Env): Promise<string[][]> {
  const token = await getAccessToken(env);
  const range = encodeURIComponent(`${tab}!A:Z`);

  const res = await fetch(
    `${BASE}/${env.GOOGLE_SHEET_ID}/values/${range}?valueRenderOption=FORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING`,
    { headers: { Authorization: `Bearer ${token}` } },
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Sheets get failed: ${res.status} ${text}`);
  }

  const data = (await res.json()) as { values?: string[][] };
  return data.values ?? [];
}

export async function updateRow(
  tab: string,
  rowNum: number,
  values: string[],
  env: Env,
): Promise<void> {
  const token = await getAccessToken(env);
  const range = encodeURIComponent(`${tab}!A${rowNum}:Z${rowNum}`);

  const res = await fetch(
    `${BASE}/${env.GOOGLE_SHEET_ID}/values/${range}?valueInputOption=USER_ENTERED`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ values: [values] }),
    },
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Sheets update failed: ${res.status} ${text}`);
  }
}

export async function getRow(tab: string, rowNum: number, env: Env): Promise<string[]> {
  const token = await getAccessToken(env);
  const range = encodeURIComponent(`${tab}!A${rowNum}:Z${rowNum}`);

  const res = await fetch(
    `${BASE}/${env.GOOGLE_SHEET_ID}/values/${range}?valueRenderOption=FORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING`,
    { headers: { Authorization: `Bearer ${token}` } },
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Sheets getRow failed: ${res.status} ${text}`);
  }

  const data = (await res.json()) as { values?: string[][] };
  return data.values?.[0] ?? [];
}

export async function deleteRow(tab: string, rowNum: number, env: Env): Promise<void> {
  const token = await getAccessToken(env);
  const range = encodeURIComponent(`${tab}!A${rowNum}:Z${rowNum}`);

  const res = await fetch(`${BASE}/${env.GOOGLE_SHEET_ID}/values/${range}:clear`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Sheets delete failed: ${res.status} ${text}`);
  }
}

export async function updateCell(
  tab: string,
  rowNum: number,
  col: string,
  value: string,
  env: Env,
): Promise<void> {
  const token = await getAccessToken(env);
  const range = encodeURIComponent(`${tab}!${col}${rowNum}`);

  const res = await fetch(
    `${BASE}/${env.GOOGLE_SHEET_ID}/values/${range}?valueInputOption=USER_ENTERED`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ values: [[value]] }),
    },
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Sheets updateCell failed: ${res.status} ${text}`);
  }
}

const PAYMENT_COLS = [
  "expense_row",
  "date",
  "amount_inr",
  "payment_method",
  "upi_txn_id",
  "file_key",
  "confidence",
  "added_at",
];

export { PAYMENT_COLS };

export interface PaymentEntry {
  paymentRow: number;
  expense_row: string;
  date: string;
  amount_inr: string;
  payment_method: string;
  upi_txn_id: string;
  file_key: string;
  confidence: string;
  added_at: string;
}

export async function getPaymentsForExpense(
  expenseRowNum: number,
  env: Env,
): Promise<PaymentEntry[]> {
  const rows = await getRows("Payments", env);
  const result: PaymentEntry[] = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || !row[0]) continue;
    if (row[0] === String(expenseRowNum)) {
      const entry: PaymentEntry = {
        paymentRow: i + 1,
        expense_row: row[0] ?? "",
        date: row[1] ?? "",
        amount_inr: row[2] ?? "",
        payment_method: row[3] ?? "",
        upi_txn_id: row[4] ?? "",
        file_key: row[5] ?? "",
        confidence: row[6] ?? "",
        added_at: row[7] ?? "",
      };
      result.push(entry);
    }
  }
  return result;
}

export async function recalcPaymentStatus(
  expenseRowNum: number,
  env: Env,
): Promise<{ status: string; totalPaid: number }> {
  const payments = await getPaymentsForExpense(expenseRowNum, env);
  let totalPaid = 0;
  for (const p of payments) {
    const amt = parseFloat(p.amount_inr.replace(/,/g, ""));
    if (!isNaN(amt)) totalPaid += amt;
  }

  const expRow = await getRow("Expenses", expenseRowNum, env);
  const invoiceAmt = parseFloat((expRow[3] ?? "0").replace(/,/g, ""));

  let status = "unpaid";
  if (payments.length === 0) {
    status = "unpaid";
  } else if (Math.abs(totalPaid - invoiceAmt) < 1) {
    status = "paid";
  } else if (totalPaid < invoiceAmt) {
    status = "partial";
  } else {
    status = "overpaid";
  }

  await updateCell("Expenses", expenseRowNum, "L", status, env);
  await updateCell("Expenses", expenseRowNum, "M", String(Math.round(totalPaid * 100) / 100), env);

  return { status, totalPaid };
}

export async function findRowByNetInr(
  tab: string,
  inrAmount: number,
  env: Env,
): Promise<{ rowNum: number; row: string[] } | null> {
  const rows = await getRows(tab, env);
  const tolerance = 1.0;

  // Income tab column E (index 4) = inr_amount (net received)
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;
    const amountStr = row[4];
    if (!amountStr) continue;
    const amount = parseFloat(amountStr.replace(/,/g, ""));
    if (Math.abs(amount - inrAmount) < tolerance) {
      return { rowNum: i + 1, row };
    }
  }

  return null;
}

export async function updateFiraColumns(
  rowNum: number,
  firaDriveUrl: string,
  firaRef: string,
  env: Env,
): Promise<void> {
  const token = await getAccessToken(env);
  // Income tab: G (index 6) = fira_drive_url, H (index 7) = fira_ref
  const range = encodeURIComponent(`Income!G${rowNum}:H${rowNum}`);

  const res = await fetch(
    `${BASE}/${env.GOOGLE_SHEET_ID}/values/${range}?valueInputOption=USER_ENTERED`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ values: [[firaDriveUrl, firaRef]] }),
    },
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Sheets update FIRA columns failed: ${res.status} ${text}`);
  }
}
