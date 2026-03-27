import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Context, Next } from "hono";
import { ZodError } from "zod";
import type { Env, Role, UploadType } from "./types";
import { LoginRequestSchema } from "./types";
import { verifyJwt, verifyPassword, signJwt } from "./auth";
import { runUploadPipeline } from "./upload-pipeline";
import { getRows, getRow, updateRow, deleteRow } from "./sheets";
import { deleteFileFromDrive } from "./drive";
import { getCurrentFY, getFYDateRange } from "./fy";

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

app.post("/upload", ownerOnly, async (c) => {
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
    const result = await runUploadPipeline(
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
    console.error("[upload]", msg, err instanceof Error ? err.stack : "");
    const code = msg.includes("OCR")
      ? "OCR_FAILED"
      : msg.includes("Drive")
        ? "DRIVE_ERROR"
        : "SHEET_ERROR";
    return c.json({ success: false, error: msg, code }, 500);
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
  "drive_url",
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
  "drive_url",
  "confidence",
  "added_at",
];

function rowToObject(row: string[], cols: string[]): Record<string, string> {
  const obj: Record<string, string> = {};
  for (let i = 0; i < cols.length; i++) {
    obj[cols[i]!] = row[i] ?? "";
  }
  return obj;
}

app.get("/transactions", async (c) => {
  const tab = c.req.query("tab") ?? "Expenses";
  const fy = c.req.query("fy") ?? getCurrentFY();
  const statusFilter = c.req.query("status");

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

      const date = row[0];
      if (date < start || date > end) continue;

      const confidence = row[9] ?? "high";
      if (statusFilter === "review" && confidence === "high") continue;

      const obj = rowToObject(row, cols);
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
    const driveUrl = row[8] ?? "";

    if (driveUrl) {
      try {
        await deleteFileFromDrive(driveUrl, c.env);
      } catch (driveErr) {
        console.error("[transactions/delete] Drive cleanup failed (continuing):", driveErr);
      }
    }

    await deleteRow(tab, rowNum, c.env);
    return c.json({ success: true, data: { id, deleted: true, driveDeleted: !!driveUrl } });
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
      if (row[0] < start || row[0] > end) continue;

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
    const byCategory: Record<string, number> = {};
    let expenseReviewCount = 0;

    for (let i = 1; i < expenseRows.length; i++) {
      const row = expenseRows[i];
      if (!row || !row[0]) continue;
      if (row[0] < start || row[0] > end) continue;

      const claimable = parseFloat((row[5] ?? "0").replace(/,/g, ""));
      if (!isNaN(claimable)) {
        ytdExpenses += claimable;
        const category = row[2] ?? "other";
        byCategory[category] = (byCategory[category] ?? 0) + claimable;
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
    const monthlyExpenses: Record<string, number> = {};

    for (let i = 1; i < incomeRows.length; i++) {
      const row = incomeRows[i];
      if (!row || !row[0]) continue;
      if (row[0] < start || row[0] > end) continue;

      const month = row[0].slice(0, 7);
      const inr = parseFloat((row[4] ?? "0").replace(/,/g, ""));
      if (!isNaN(inr)) monthlyIncome[month] = (monthlyIncome[month] ?? 0) + inr;
    }

    for (let i = 1; i < expenseRows.length; i++) {
      const row = expenseRows[i];
      if (!row || !row[0]) continue;
      if (row[0] < start || row[0] > end) continue;

      const month = row[0].slice(0, 7);
      const claimable = parseFloat((row[5] ?? "0").replace(/,/g, ""));
      if (!isNaN(claimable)) monthlyExpenses[month] = (monthlyExpenses[month] ?? 0) + claimable;
    }

    const allMonths = new Set([...Object.keys(monthlyIncome), ...Object.keys(monthlyExpenses)]);

    const months = [...allMonths].sort().map((month) => ({
      month,
      income: monthlyIncome[month] ?? 0,
      expenses: monthlyExpenses[month] ?? 0,
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
