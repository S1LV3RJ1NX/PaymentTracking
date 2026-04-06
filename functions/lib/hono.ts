import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Context, Next } from "hono";
import { ZodError } from "zod";
import { zipSync } from "fflate";
import type { Env, Role, UploadType } from "./types";
import { LoginRequestSchema } from "./types";
import { verifyJwt, verifyPassword, signJwt } from "./auth";
import { runExtractPipeline, confirmAndWriteToSheets } from "./upload-pipeline";
import {
  getRows,
  getRow,
  updateRow,
  updateCell,
  deleteRow,
  appendRow,
  getPaymentsForExpense,
  recalcPaymentStatus,
} from "./sheets";
import { extractDocument } from "./ocr";
import { deleteFromR2, getFromR2, uploadRawToR2 } from "./storage";
import { getCurrentFY, getFYDateRange, getFYFromDate } from "./fy";

type HonoEnv = { Bindings: Env; Variables: { role: Role; username: string } };

export const app = new Hono<HonoEnv>().basePath("/api");

app.use(
  "*",
  cors({
    origin: (origin) => {
      if (!origin) return "*";
      if (origin.includes("localhost") || origin.includes("127.0.0.1")) return origin;
      if (origin.endsWith(".pages.dev")) return origin;
      return origin;
    },
    allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
  }),
);

async function authMiddleware(c: Context<HonoEnv>, next: Next) {
  if (c.req.path === "/api/auth/login" && c.req.method === "POST") {
    return next();
  }

  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ success: false, error: "Missing token", code: "UNAUTHORIZED" }, 401);
  }

  const token = authHeader.slice(7);
  const payload = await verifyJwt(token, c.env.JWT_SECRET);
  if (!payload) {
    return c.json({ success: false, error: "Invalid or expired token", code: "UNAUTHORIZED" }, 401);
  }

  c.set("role", payload.role as Role);
  c.set("username", payload.sub);
  return next();
}

app.use("*", authMiddleware);

function ownerOnly(c: Context<HonoEnv>, next: Next) {
  if (c.get("role") !== "owner") {
    return c.json({ success: false, error: "Owner access required", code: "FORBIDDEN" }, 403);
  }
  return next();
}

app.post("/auth/login", async (c) => {
  const body = await c.req.json();
  const parsed = LoginRequestSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ success: false, error: "Invalid request body", code: "VALIDATION_ERROR" }, 400);
  }

  const { username, password } = parsed.data;
  const hash = username === "prathamesh" ? c.env.ADMIN_PASSWORD_HASH : c.env.CA_PASSWORD_HASH;

  const valid = await verifyPassword(password, hash);
  if (!valid) {
    return c.json({ success: false, error: "Invalid credentials", code: "UNAUTHORIZED" }, 401);
  }

  const role: Role = username === "prathamesh" ? "owner" : "ca";
  const token = await signJwt({ sub: username, role }, c.env.JWT_SECRET);

  return c.json({ success: true, data: { token, role } });
});

const VALID_UPLOAD_TYPES = new Set<UploadType>(["skydo_invoice", "fira", "expense", "other"]);

const ALLOWED_MIME_TYPES = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);

app.post("/upload/extract", ownerOnly, async (c) => {
  const formData = await c.req.formData();
  const rawFile = formData.get("file") as unknown;
  const uploadType = formData.get("type") as UploadType | null;
  const customDescription = formData.get("description") as string | null;

  if (!rawFile || typeof rawFile === "string") {
    return c.json({ success: false, error: "No file provided", code: "VALIDATION_ERROR" }, 400);
  }

  const file = rawFile as File;

  if (!uploadType || !VALID_UPLOAD_TYPES.has(uploadType)) {
    return c.json(
      {
        success: false,
        error: "Invalid upload type. Must be one of: skydo_invoice, fira, expense, other",
        code: "VALIDATION_ERROR",
      },
      400,
    );
  }

  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    return c.json(
      {
        success: false,
        error: "Unsupported file type. Accepted: PDF, JPEG, PNG, WebP",
        code: "VALIDATION_ERROR",
      },
      400,
    );
  }

  try {
    const result = await runExtractPipeline(
      {
        fileBuffer: await file.arrayBuffer(),
        mimeType: file.type,
        fileName: file.name,
        uploadType,
        customDescription,
      },
      c.env,
    );

    return c.json({ success: true, data: result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Upload processing failed";
    console.error("[upload/extract]", msg, err instanceof Error ? err.stack : "");
    const code = msg.includes("OCR") ? "OCR_FAILED" : "STORAGE_ERROR";
    return c.json({ success: false, error: msg, code }, 500);
  }
});

app.post("/upload/confirm", ownerOnly, async (c) => {
  const body = (await c.req.json()) as {
    uploadType?: UploadType;
    fileKey?: string;
    fields?: Record<string, unknown>;
    businessPct?: number | null;
  };

  if (!body.uploadType || !body.fileKey || !body.fields) {
    return c.json(
      {
        success: false,
        error: "uploadType, fileKey, and fields are required",
        code: "VALIDATION_ERROR",
      },
      400,
    );
  }

  if (!VALID_UPLOAD_TYPES.has(body.uploadType)) {
    return c.json(
      {
        success: false,
        error: "Invalid upload type",
        code: "VALIDATION_ERROR",
      },
      400,
    );
  }

  try {
    const result = await confirmAndWriteToSheets(
      {
        uploadType: body.uploadType,
        fileKey: body.fileKey,
        fields: body.fields,
        businessPct: body.businessPct ?? null,
      },
      c.env,
    );

    return c.json({ success: true, data: result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to save transaction";
    console.error("[upload/confirm]", msg, err instanceof Error ? err.stack : "");
    return c.json({ success: false, error: msg, code: "SHEET_ERROR" }, 500);
  }
});

app.delete("/upload/cancel", ownerOnly, async (c) => {
  const body = (await c.req.json()) as { fileKey?: string };

  if (!body.fileKey) {
    return c.json({ success: false, error: "fileKey is required", code: "VALIDATION_ERROR" }, 400);
  }

  try {
    await deleteFromR2(body.fileKey, c.env);
    return c.json({ success: true, data: { deleted: true } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to cancel upload";
    console.error("[upload/cancel]", msg);
    return c.json({ success: false, error: msg, code: "STORAGE_ERROR" }, 500);
  }
});

app.get("/files/*", async (c) => {
  const key = c.req.path.replace("/api/files/", "");
  if (!key) {
    return c.json({ success: false, error: "File key is required", code: "VALIDATION_ERROR" }, 400);
  }

  try {
    const object = await getFromR2(decodeURIComponent(key), c.env);
    if (!object) {
      return c.json({ success: false, error: "File not found", code: "NOT_FOUND" }, 404);
    }

    const headers = new Headers();
    headers.set("Content-Type", object.httpMetadata?.contentType ?? "application/octet-stream");
    headers.set("Cache-Control", "private, max-age=3600");
    headers.set("Content-Disposition", "inline");

    return new Response(object.body, { headers });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to fetch file";
    console.error("[files]", msg);
    return c.json({ success: false, error: msg, code: "STORAGE_ERROR" }, 500);
  }
});

app.post("/files/download", async (c) => {
  const body = (await c.req.json()) as { keys: string[] };
  if (!body.keys || !Array.isArray(body.keys) || body.keys.length === 0) {
    return c.json(
      { success: false, error: "keys array is required", code: "VALIDATION_ERROR" },
      400,
    );
  }

  try {
    const files: Record<string, Uint8Array> = {};
    const usedNames = new Set<string>();

    for (const key of body.keys) {
      const obj = await getFromR2(key, c.env);
      if (!obj) continue;
      const buf = await obj.arrayBuffer();
      let name = key.split("/").pop() ?? key;
      while (usedNames.has(name)) {
        name = `_${name}`;
      }
      usedNames.add(name);
      files[name] = new Uint8Array(buf);
    }

    const zipped = zipSync(files);

    return new Response(zipped, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": "attachment; filename=documents.zip",
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to create ZIP";
    console.error("[files/download]", msg);
    return c.json({ success: false, error: msg, code: "STORAGE_ERROR" }, 500);
  }
});

const VALID_TABS = new Set(["Income", "Expenses"]);

interface TransactionRow {
  id: string;
  rowNum: number;
  tab: string;
  values: Record<string, string>;
}

const INCOME_COLS = [
  "date",
  "client",
  "invoice_number",
  "usd_amount",
  "inr_amount",
  "skydo_prn",
  "fira_drive_url",
  "fira_ref",
  "file_key",
  "confidence",
  "added_at",
];

const EXPENSE_COLS = [
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
  "payment_status",
  "total_paid",
];

/**
 * Google Sheets may return dates as serial numbers (e.g. "46097") when the
 * column format is Automatic/Number, or in locale formats like "3/27/2026".
 * Normalise to ISO YYYY-MM-DD for reliable string comparison.
 */
function normalizeDate(raw: string): string {
  if (!raw) return raw;

  // Already ISO formatted
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

  // Serial number (Excel/Sheets epoch = 1899-12-30)
  const num = Number(raw);
  if (!isNaN(num) && num > 40000 && num < 60000) {
    const epoch = new Date(1899, 11, 30);
    epoch.setDate(epoch.getDate() + num);
    return epoch.toISOString().slice(0, 10);
  }

  // Locale formats like "3/27/2026" or "03/27/2026"
  const slashMatch = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashMatch) {
    const [, m, d, y] = slashMatch;
    return `${y}-${m!.padStart(2, "0")}-${d!.padStart(2, "0")}`;
  }

  return raw;
}

function rowToObject(row: string[], cols: string[]): Record<string, string> {
  const obj: Record<string, string> = {};
  for (let i = 0; i < cols.length; i++) {
    obj[cols[i]!] = row[i] ?? "";
  }
  if (obj.date) obj.date = normalizeDate(obj.date);
  return obj;
}

app.get("/transactions", async (c) => {
  const tab = c.req.query("tab") ?? "Expenses";
  const fy = c.req.query("fy") ?? getCurrentFY();
  const statusFilter = c.req.query("status");
  const businessFilter = c.req.query("business");
  const searchQuery = c.req.query("q")?.toLowerCase();

  if (!VALID_TABS.has(tab)) {
    return c.json(
      {
        success: false,
        error: "Invalid tab. Must be Income or Expenses",
        code: "VALIDATION_ERROR",
      },
      400,
    );
  }

  try {
    const { start, end } = getFYDateRange(fy);
    const allRows = await getRows(tab, c.env);
    const cols = tab === "Income" ? INCOME_COLS : EXPENSE_COLS;

    const transactions: TransactionRow[] = [];

    for (let i = 1; i < allRows.length; i++) {
      const row = allRows[i];
      if (!row || !row[0]) continue;

      const date = normalizeDate(row[0]);
      row[0] = date;
      if (date < start || date > end) continue;

      const confidence = row[9] ?? "high";
      if (statusFilter === "review" && confidence === "high") continue;

      if (tab === "Expenses" && businessFilter !== undefined) {
        const bpct = row[4] ?? "100";
        if (businessFilter === "true" && bpct === "0") continue;
        if (businessFilter === "false" && bpct !== "0") continue;
      }

      const obj = rowToObject(row, cols);

      if (searchQuery) {
        const matches = Object.values(obj).some((v) => v.toLowerCase().includes(searchQuery));
        if (!matches) continue;
      }

      transactions.push({
        id: `${tab}-${i + 1}`,
        rowNum: i + 1,
        tab,
        values: obj,
      });
    }

    transactions.sort((a, b) => (b.values.date ?? "").localeCompare(a.values.date ?? ""));

    const months: Record<string, TransactionRow[]> = {};
    for (const t of transactions) {
      const month = (t.values.date ?? "").slice(0, 7);
      if (!months[month]) months[month] = [];
      months[month]!.push(t);
    }

    return c.json({
      success: true,
      data: { rows: transactions, total: transactions.length, months },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to fetch transactions";
    console.error("[transactions]", msg);
    return c.json({ success: false, error: msg, code: "SHEET_ERROR" }, 500);
  }
});

app.post("/transactions/:id/fira", ownerOnly, async (c) => {
  const id = c.req.param("id") ?? "";
  const match = id.match(/^Income-(\d+)$/);
  if (!match) {
    return c.json(
      {
        success: false,
        error: "Invalid id format. Must be Income-RowNum",
        code: "VALIDATION_ERROR",
      },
      400,
    );
  }
  const rowNum = parseInt(match[1]!, 10);

  const formData = await c.req.formData();
  const rawFile = formData.get("file") as unknown;
  if (!rawFile || typeof rawFile === "string") {
    return c.json({ success: false, error: "No file provided", code: "VALIDATION_ERROR" }, 400);
  }
  const file = rawFile as File;
  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    return c.json(
      { success: false, error: "Unsupported file type", code: "VALIDATION_ERROR" },
      400,
    );
  }

  try {
    const row = await getRow("Income", rowNum, c.env);
    const date = normalizeDate(row[0] ?? new Date().toISOString().slice(0, 10));
    const fy = getFYFromDate(date);
    const firaKey = `${fy}/FIRA/${Date.now()}_${file.name}`;

    await uploadRawToR2(firaKey, await file.arrayBuffer(), file.type, c.env);

    const existing = (row[6] ?? "").trim();
    const updated = existing ? `${existing},${firaKey}` : firaKey;
    await updateCell("Income", rowNum, "G", updated, c.env);

    return c.json({ success: true, data: { id, firaFileKey: firaKey, allFiraKeys: updated } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to attach FIRA";
    console.error("[transactions/fira]", msg);
    return c.json({ success: false, error: msg, code: "SHEET_ERROR" }, 500);
  }
});

app.post("/expenses/:rowNum/bill", ownerOnly, async (c) => {
  const rowNum = parseInt(c.req.param("rowNum") ?? "", 10);
  if (isNaN(rowNum)) {
    return c.json({ success: false, error: "Invalid row number", code: "VALIDATION_ERROR" }, 400);
  }

  const formData = await c.req.formData();
  const rawFile = formData.get("file") as unknown;
  if (!rawFile || typeof rawFile === "string") {
    return c.json({ success: false, error: "No file provided", code: "VALIDATION_ERROR" }, 400);
  }
  const file = rawFile as File;
  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    return c.json(
      { success: false, error: "Unsupported file type", code: "VALIDATION_ERROR" },
      400,
    );
  }

  try {
    const existingRow = await getRow("Expenses", rowNum, c.env);
    const date = normalizeDate(existingRow[0] ?? new Date().toISOString().slice(0, 10));
    const fy = getFYFromDate(date);
    const billKey = `${fy}/Expenses/${Date.now()}_${file.name}`;

    const fileBuffer = await file.arrayBuffer();
    await uploadRawToR2(billKey, fileBuffer, file.type, c.env);

    let ocrData: Record<string, unknown> = {};
    try {
      const ocr = await extractDocument(fileBuffer, file.type, "expense", c.env.ANTHROPIC_API_KEY);
      if (ocr.type === "expense") ocrData = ocr.data as unknown as Record<string, unknown>;
    } catch (ocrErr) {
      console.error("[expenses/bill] OCR failed (continuing):", ocrErr);
    }

    const oldFileKey = existingRow[8] ?? "";
    const bpct = existingRow[4] ?? "100";
    const newAmount = ocrData["amount_inr"] != null ? Number(ocrData["amount_inr"]) : null;
    const updated = [...existingRow];

    updated[8] = billKey;

    if (newAmount != null && !isNaN(newAmount)) {
      updated[3] = String(newAmount);
      const pct = parseInt(bpct) || 100;
      updated[5] = String(newAmount * (pct / 100));
    }
    if (ocrData["vendor"]) updated[7] = String(ocrData["vendor"]);
    if (ocrData["category"]) updated[2] = String(ocrData["category"]);
    if (ocrData["date"]) updated[0] = String(ocrData["date"]);
    if (ocrData["description"]) updated[1] = String(ocrData["description"]);
    if (ocrData["payment_method"]) updated[6] = String(ocrData["payment_method"]);
    if (ocrData["confidence"]) updated[9] = String(ocrData["confidence"]);

    await updateRow("Expenses", rowNum, updated, c.env);

    if (oldFileKey && oldFileKey !== billKey) {
      try {
        await deleteFromR2(oldFileKey, c.env);
      } catch {
        /* continue */
      }
    }

    const { status, totalPaid } = await recalcPaymentStatus(rowNum, c.env);

    return c.json({
      success: true,
      data: {
        fileKey: billKey,
        amount_inr: updated[3],
        ocrData,
        status,
        totalPaid,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to replace bill";
    console.error("[expenses/bill]", msg);
    return c.json({ success: false, error: msg, code: "SHEET_ERROR" }, 500);
  }
});

app.get("/expenses/:rowNum/payments", async (c) => {
  const rowNum = parseInt(c.req.param("rowNum") ?? "", 10);
  if (isNaN(rowNum)) {
    return c.json({ success: false, error: "Invalid row number", code: "VALIDATION_ERROR" }, 400);
  }

  try {
    const payments = await getPaymentsForExpense(rowNum, c.env);
    return c.json({ success: true, data: { payments } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to fetch payments";
    console.error("[expenses/payments]", msg);
    return c.json({ success: false, error: msg, code: "SHEET_ERROR" }, 500);
  }
});

app.post("/expenses/:rowNum/payments", ownerOnly, async (c) => {
  const rowNum = parseInt(c.req.param("rowNum") ?? "", 10);
  if (isNaN(rowNum)) {
    return c.json({ success: false, error: "Invalid row number", code: "VALIDATION_ERROR" }, 400);
  }

  const formData = await c.req.formData();
  const rawFile = formData.get("file") as unknown;
  if (!rawFile || typeof rawFile === "string") {
    return c.json({ success: false, error: "No file provided", code: "VALIDATION_ERROR" }, 400);
  }
  const file = rawFile as File;
  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    return c.json(
      { success: false, error: "Unsupported file type", code: "VALIDATION_ERROR" },
      400,
    );
  }

  try {
    const expRow = await getRow("Expenses", rowNum, c.env);
    const date = normalizeDate(expRow[0] ?? new Date().toISOString().slice(0, 10));
    const fy = getFYFromDate(date);
    const paymentKey = `${fy}/Payments/${Date.now()}_${file.name}`;

    const fileBuffer = await file.arrayBuffer();
    await uploadRawToR2(paymentKey, fileBuffer, file.type, c.env);

    let ocrData: Record<string, unknown> = {};
    try {
      const ocr = await extractDocument(
        fileBuffer,
        file.type,
        "payment_proof",
        c.env.ANTHROPIC_API_KEY,
      );
      if (ocr.type === "payment_proof") ocrData = ocr.data as unknown as Record<string, unknown>;
    } catch (ocrErr) {
      console.error("[expenses/payments] OCR failed (continuing):", ocrErr);
    }

    const amountOverride = formData.get("amount_override");
    const amount = amountOverride ? String(amountOverride) : String(ocrData["amount_inr"] ?? "");

    const now = new Date().toISOString();
    const paymentRow = [
      String(rowNum),
      String(ocrData["date"] ?? date),
      amount,
      String(ocrData["payment_method"] ?? ""),
      String(ocrData["upi_transaction_id"] ?? ""),
      paymentKey,
      String(ocrData["confidence"] ?? "low"),
      now,
    ];
    const paymentRowNum = await appendRow("Payments", paymentRow, c.env);

    const paymentStatus = expRow[11] ?? "unpaid";
    const paymentDate = ocrData["date"] ? String(ocrData["date"]) : null;
    if (paymentDate && paymentStatus === "unpaid") {
      await updateCell("Expenses", rowNum, "A", paymentDate, c.env);
    }

    const { status, totalPaid } = await recalcPaymentStatus(rowNum, c.env);

    return c.json({
      success: true,
      data: { paymentRowNum, paymentKey, ocrData, status, totalPaid },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to add payment";
    console.error("[expenses/payments]", msg);
    return c.json({ success: false, error: msg, code: "SHEET_ERROR" }, 500);
  }
});

app.post("/expenses/:rowNum/payments/manual", ownerOnly, async (c) => {
  const rowNum = parseInt(c.req.param("rowNum") ?? "", 10);
  if (isNaN(rowNum)) {
    return c.json({ success: false, error: "Invalid row number", code: "VALIDATION_ERROR" }, 400);
  }

  const body = (await c.req.json()) as {
    amount?: string;
    date?: string;
    payment_method?: string;
    reference?: string;
  };

  if (!body.amount || !body.reference) {
    return c.json(
      { success: false, error: "amount and reference are required", code: "VALIDATION_ERROR" },
      400,
    );
  }

  try {
    const expRow = await getRow("Expenses", rowNum, c.env);
    const expDate = normalizeDate(expRow[0] ?? new Date().toISOString().slice(0, 10));
    const paymentDate = body.date || expDate;

    const now = new Date().toISOString();
    const paymentRow = [
      String(rowNum),
      paymentDate,
      body.amount,
      body.payment_method ?? "upi",
      body.reference,
      "",
      "manual",
      now,
    ];
    const paymentRowNum = await appendRow("Payments", paymentRow, c.env);

    const { status, totalPaid } = await recalcPaymentStatus(rowNum, c.env);

    return c.json({
      success: true,
      data: { paymentRowNum, paymentKey: "", status, totalPaid },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to add manual payment";
    console.error("[expenses/payments/manual]", msg);
    return c.json({ success: false, error: msg, code: "SHEET_ERROR" }, 500);
  }
});

app.delete("/expenses/:rowNum/payments/:paymentRow", ownerOnly, async (c) => {
  const expRowNum = parseInt(c.req.param("rowNum") ?? "", 10);
  const paymentRowNum = parseInt(c.req.param("paymentRow") ?? "", 10);
  if (isNaN(expRowNum) || isNaN(paymentRowNum)) {
    return c.json({ success: false, error: "Invalid row numbers", code: "VALIDATION_ERROR" }, 400);
  }

  try {
    const payRow = await getRow("Payments", paymentRowNum, c.env);
    const fileKey = payRow[5] ?? "";
    if (fileKey) {
      try {
        await deleteFromR2(fileKey, c.env);
      } catch (r2Err) {
        console.error("[expenses/payments/delete] R2 cleanup failed:", r2Err);
      }
    }

    await deleteRow("Payments", paymentRowNum, c.env);
    const { status, totalPaid } = await recalcPaymentStatus(expRowNum, c.env);

    return c.json({ success: true, data: { deleted: true, status, totalPaid } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to delete payment";
    console.error("[expenses/payments/delete]", msg);
    return c.json({ success: false, error: msg, code: "SHEET_ERROR" }, 500);
  }
});

app.patch("/transactions/:id/move", async (c) => {
  const id = c.req.param("id") ?? "";
  const match = id.match(/^Expenses-(\d+)$/);
  if (!match) {
    return c.json(
      {
        success: false,
        error: "Invalid id format. Must be Expenses-RowNum",
        code: "VALIDATION_ERROR",
      },
      400,
    );
  }
  const rowNum = parseInt(match[1]!, 10);

  try {
    const row = await getRow("Expenses", rowNum, c.env);
    const currentPct = row[4] ?? "100";
    const newPct = currentPct === "0" ? "100" : "0";
    const amount = parseFloat((row[3] ?? "0").replace(/,/g, ""));
    const newClaimable = String(amount * (parseInt(newPct) / 100));

    const updated = [...row];
    updated[4] = newPct;
    updated[5] = newClaimable;
    await updateRow("Expenses", rowNum, updated, c.env);

    return c.json({
      success: true,
      data: { id, business_pct: newPct, claimable_inr: newClaimable },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to move transaction";
    console.error("[transactions/move]", msg);
    return c.json({ success: false, error: msg, code: "SHEET_ERROR" }, 500);
  }
});

app.patch("/transactions/:id", ownerOnly, async (c) => {
  const id = c.req.param("id") ?? "";
  const match = id.match(/^(Income|Expenses)-(\d+)$/);
  if (!match) {
    return c.json(
      {
        success: false,
        error: "Invalid id format. Expected: Tab-RowNum",
        code: "VALIDATION_ERROR",
      },
      400,
    );
  }

  const tab = match[1]!;
  const rowNum = parseInt(match[2]!, 10);

  try {
    const body = (await c.req.json()) as { values: string[] };
    if (!body.values || !Array.isArray(body.values)) {
      return c.json(
        {
          success: false,
          error: "Request body must include values array",
          code: "VALIDATION_ERROR",
        },
        400,
      );
    }

    await updateRow(tab, rowNum, body.values, c.env);
    return c.json({ success: true, data: { id, updated: true } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to update transaction";
    console.error("[transactions/patch]", msg);
    return c.json({ success: false, error: msg, code: "SHEET_ERROR" }, 500);
  }
});

app.delete("/transactions/:id", ownerOnly, async (c) => {
  const id = c.req.param("id") ?? "";
  const match = id.match(/^(Income|Expenses)-(\d+)$/);
  if (!match) {
    return c.json(
      {
        success: false,
        error: "Invalid id format. Expected: Tab-RowNum",
        code: "VALIDATION_ERROR",
      },
      400,
    );
  }

  const tab = match[1]!;
  const rowNum = parseInt(match[2]!, 10);

  try {
    const row = await getRow(tab, rowNum, c.env);
    const fileKey = row[8] ?? "";

    if (fileKey) {
      try {
        await deleteFromR2(fileKey, c.env);
      } catch (r2Err) {
        console.error("[transactions/delete] R2 cleanup failed (continuing):", r2Err);
      }
    }

    if (tab === "Expenses") {
      try {
        const payments = await getPaymentsForExpense(rowNum, c.env);
        for (const p of payments) {
          if (p.file_key) {
            try {
              await deleteFromR2(p.file_key, c.env);
            } catch {
              /* continue */
            }
          }
          await deleteRow("Payments", p.paymentRow, c.env);
        }
      } catch (payErr) {
        console.error("[transactions/delete] Payment cleanup failed (continuing):", payErr);
      }
    }

    await deleteRow(tab, rowNum, c.env);
    return c.json({ success: true, data: { id, deleted: true, fileDeleted: !!fileKey } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to delete transaction";
    console.error("[transactions/delete]", msg);
    return c.json({ success: false, error: msg, code: "SHEET_ERROR" }, 500);
  }
});

app.get("/dashboard/summary", async (c) => {
  const fy = c.req.query("fy") ?? getCurrentFY();

  try {
    const { start, end } = getFYDateRange(fy);
    const [incomeRows, expenseRows] = await Promise.all([
      getRows("Income", c.env),
      getRows("Expenses", c.env),
    ]);

    let ytdIncomeInr = 0;
    const byClient: Record<string, number> = {};
    let incomeReviewCount = 0;

    for (let i = 1; i < incomeRows.length; i++) {
      const row = incomeRows[i];
      if (!row || !row[0]) continue;
      const d = normalizeDate(row[0]);
      if (d < start || d > end) continue;

      const inr = parseFloat((row[4] ?? "0").replace(/,/g, ""));
      if (!isNaN(inr)) {
        ytdIncomeInr += inr;
        const client = row[1] ?? "Unknown";
        byClient[client] = (byClient[client] ?? 0) + inr;
      }

      const confidence = row[9] ?? "high";
      if (confidence !== "high") incomeReviewCount++;
    }

    let ytdExpenses = 0;
    let nonBusinessExpenses = 0;
    const byCategory: Record<string, number> = {};
    const nonBusinessByCategory: Record<string, number> = {};
    let expenseReviewCount = 0;

    for (let i = 1; i < expenseRows.length; i++) {
      const row = expenseRows[i];
      if (!row || !row[0]) continue;
      const d2 = normalizeDate(row[0]);
      if (d2 < start || d2 > end) continue;

      const amountInr = parseFloat((row[3] ?? "0").replace(/,/g, ""));
      const bpct = row[4] ?? "100";
      const claimable = parseFloat((row[5] ?? "0").replace(/,/g, ""));

      if (bpct === "0") {
        if (!isNaN(amountInr)) {
          nonBusinessExpenses += amountInr;
          const category = row[2] ?? "other";
          nonBusinessByCategory[category] = (nonBusinessByCategory[category] ?? 0) + amountInr;
        }
      } else {
        if (!isNaN(claimable)) {
          ytdExpenses += claimable;
          const category = row[2] ?? "other";
          byCategory[category] = (byCategory[category] ?? 0) + claimable;
        }
      }

      const confidence = row[9] ?? "high";
      if (confidence !== "high") expenseReviewCount++;
    }

    return c.json({
      success: true,
      data: {
        fy,
        income: { ytd_inr: ytdIncomeInr, by_client: byClient },
        expenses: { ytd_claimable: ytdExpenses, by_category: byCategory },
        non_business_expenses: nonBusinessExpenses,
        non_business_by_category: nonBusinessByCategory,
        review_count: incomeReviewCount + expenseReviewCount,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to compute summary";
    console.error("[dashboard/summary]", msg);
    return c.json({ success: false, error: msg, code: "SHEET_ERROR" }, 500);
  }
});

app.get("/dashboard/monthly", async (c) => {
  const fy = c.req.query("fy") ?? getCurrentFY();

  try {
    const { start, end } = getFYDateRange(fy);
    const [incomeRows, expenseRows] = await Promise.all([
      getRows("Income", c.env),
      getRows("Expenses", c.env),
    ]);

    const monthlyIncome: Record<string, number> = {};
    const monthlyBizExp: Record<string, number> = {};
    const monthlyNonBizExp: Record<string, number> = {};

    for (let i = 1; i < incomeRows.length; i++) {
      const row = incomeRows[i];
      if (!row || !row[0]) continue;
      const iDate = normalizeDate(row[0]);
      if (iDate < start || iDate > end) continue;

      const month = iDate.slice(0, 7);
      const inr = parseFloat((row[4] ?? "0").replace(/,/g, ""));
      if (!isNaN(inr)) monthlyIncome[month] = (monthlyIncome[month] ?? 0) + inr;
    }

    for (let i = 1; i < expenseRows.length; i++) {
      const row = expenseRows[i];
      if (!row || !row[0]) continue;
      const eDate = normalizeDate(row[0]);
      if (eDate < start || eDate > end) continue;

      const month = eDate.slice(0, 7);
      const bpct = row[4] ?? "100";
      const amount = parseFloat((row[3] ?? "0").replace(/,/g, ""));
      if (isNaN(amount)) continue;

      if (bpct === "0") {
        monthlyNonBizExp[month] = (monthlyNonBizExp[month] ?? 0) + amount;
      } else {
        const claimable = parseFloat((row[5] ?? "0").replace(/,/g, ""));
        monthlyBizExp[month] =
          (monthlyBizExp[month] ?? 0) + (isNaN(claimable) ? amount : claimable);
      }
    }

    const allMonths = new Set([
      ...Object.keys(monthlyIncome),
      ...Object.keys(monthlyBizExp),
      ...Object.keys(monthlyNonBizExp),
    ]);

    const months = [...allMonths].sort().map((month) => ({
      month,
      income: monthlyIncome[month] ?? 0,
      expenses: (monthlyBizExp[month] ?? 0) + (monthlyNonBizExp[month] ?? 0),
      businessExpenses: monthlyBizExp[month] ?? 0,
      nonBusinessExpenses: monthlyNonBizExp[month] ?? 0,
    }));

    return c.json({ success: true, data: { fy, months } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to compute monthly data";
    console.error("[dashboard/monthly]", msg);
    return c.json({ success: false, error: msg, code: "SHEET_ERROR" }, 500);
  }
});

app.get("/tax/estimate", async (c) => {
  const fy = c.req.query("fy") ?? getCurrentFY();

  try {
    const stored = await c.env.FINANCE_KV.get(`tax_estimate_${fy}`);
    const estimated_annual = stored ? parseFloat(stored) : null;
    return c.json({ success: true, data: { fy, estimated_annual } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to read estimate";
    return c.json({ success: false, error: msg, code: "SHEET_ERROR" }, 500);
  }
});

app.put("/tax/estimate", async (c) => {
  const body = (await c.req.json()) as { fy?: string; estimated_annual?: number };

  if (!body.fy || typeof body.estimated_annual !== "number" || body.estimated_annual < 0) {
    return c.json(
      {
        success: false,
        error: "fy (string) and estimated_annual (non-negative number) are required",
        code: "VALIDATION_ERROR",
      },
      400,
    );
  }

  try {
    await c.env.FINANCE_KV.put(`tax_estimate_${body.fy}`, String(body.estimated_annual));
    return c.json({
      success: true,
      data: { fy: body.fy, estimated_annual: body.estimated_annual },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to save estimate";
    return c.json({ success: false, error: msg, code: "SHEET_ERROR" }, 500);
  }
});

app.onError((err, c) => {
  if (err instanceof ZodError) {
    return c.json({ success: false, error: err.message, code: "VALIDATION_ERROR" }, 400);
  }
  console.error(err);
  return c.json({ success: false, error: "Internal server error", code: "UNAUTHORIZED" }, 500);
});
