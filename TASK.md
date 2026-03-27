# Finance Tracker — CLAUDE.md

Full implementation spec for a personal finance tracking PWA for a freelance sole proprietor
billing US clients in USD, with automatic OCR via Claude API, Google Drive storage, and
Google Sheets as a live ledger. CA has read-only access. Owner can upload UPI screenshots,
PDFs, invoices from phone or desktop.

---

## Stack

| Layer                | Technology                                         |
| -------------------- | -------------------------------------------------- |
| Frontend             | React 18 + Vite + Tailwind CSS                     |
| Backend / API        | Hono.js (TypeScript) on Cloudflare Pages Functions |
| OCR                  | Anthropic Claude Haiku (claude-haiku-4-5) via API  |
| File storage         | Google Drive API v3                                |
| Ledger               | Google Sheets API v4                               |
| Auth                 | Username + bcrypt password, JWT in KV              |
| Secrets / KV         | Cloudflare KV (credentials + JWT secret)           |
| Hosting              | Cloudflare Pages (frontend + functions together)   |
| Package manager (FE) | npm                                                |
| Package manager (BE) | npm (functions are TypeScript in same repo)        |

No separate backend server. Everything deploys as one Cloudflare Pages project.

---

## Repo Structure

```
finance-tracker/
├── frontend/                        # React app
│   ├── src/
│   │   ├── main.jsx
│   │   ├── App.jsx                  # Routes
│   │   ├── pages/
│   │   │   ├── Login.jsx
│   │   │   ├── Dashboard.jsx
│   │   │   ├── Upload.jsx           # Main upload page (PWA share target)
│   │   │   ├── Transactions.jsx     # Ledger table with edit/confirm
│   │   │   └── TaxBucket.jsx        # Tax timeline + advance tax tracker
│   │   ├── components/
│   │   │   ├── DropZone.jsx         # react-dropzone, supports image + PDF
│   │   │   ├── TransactionRow.jsx   # Single ledger row, inline edit
│   │   │   ├── MetricCard.jsx       # Summary stat card
│   │   │   ├── Charts.jsx           # Recharts wrappers
│   │   │   ├── NavBar.jsx
│   │   │   └── ReviewBadge.jsx      # Flags unconfirmed OCR rows
│   │   ├── api/
│   │   │   ├── client.js            # Axios instance with JWT interceptor
│   │   │   ├── upload.js
│   │   │   ├── transactions.js
│   │   │   └── dashboard.js
│   │   └── hooks/
│   │       ├── useUpload.js
│   │       ├── useTransactions.js
│   │       └── useDashboard.js
│   ├── public/
│   │   ├── manifest.json            # PWA manifest (share_target configured)
│   │   └── sw.js                    # Service worker (vite-plugin-pwa generates)
│   ├── index.html
│   ├── vite.config.js
│   ├── tailwind.config.js
│   └── package.json
│
├── functions/                       # Cloudflare Pages Functions (Hono)
│   ├── api/
│   │   └── [[route]].ts             # Catch-all — mounts Hono app
│   ├── lib/
│   │   ├── hono.ts                  # Hono app setup + middleware
│   │   ├── auth.ts                  # JWT sign/verify, password hash check
│   │   ├── ocr.ts                   # Claude API calls (images + PDFs)
│   │   ├── drive.ts                 # Google Drive upload + folder routing
│   │   ├── sheets.ts                # Google Sheets append + read
│   │   └── types.ts                 # Shared TypeScript interfaces
│   └── package.json                 # Hono, @anthropic-ai/sdk, googleapis
│
├── wrangler.toml                    # Cloudflare config
├── .env.example
└── README.md
```

---

## Environment Variables

Store all in Cloudflare Pages environment variables + KV. Never commit to git.

```
# .env.example

# Anthropic
ANTHROPIC_API_KEY=sk-ant-...

# Google OAuth Service Account (for Drive + Sheets)
GOOGLE_SERVICE_ACCOUNT_EMAIL=finance-tracker@project.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n..."

# Google resource IDs
GOOGLE_DRIVE_ROOT_FOLDER_ID=1abc...          # Root folder ID in Drive
GOOGLE_SHEET_ID=1xyz...                      # The tracker spreadsheet ID

# Auth
JWT_SECRET=a-long-random-string-min-32-chars
ADMIN_PASSWORD_HASH=$2b$10$...               # bcrypt hash of owner password
CA_PASSWORD_HASH=$2b$10$...                  # bcrypt hash of CA password

# Cloudflare KV namespace binding name (configured in wrangler.toml)
KV_NAMESPACE=FINANCE_KV
```

**wrangler.toml:**

```toml
name = "finance-tracker"
compatibility_date = "2024-01-01"

[[kv_namespaces]]
binding = "FINANCE_KV"
id = "your-kv-namespace-id"

[build]
command = "cd frontend && npm run build"
[build.upload]
format = "directory"
dir = "frontend/dist"
```

---

## Authentication

Simple two-user system: `owner` (full access) and `ca` (read-only).

### POST /api/auth/login

```typescript
// Request
{ username: "owner" | "ca", password: string }

// Response
{ token: string, role: "owner" | "ca" }
```

- Compare password against bcrypt hash stored in env
- Sign JWT with `{ sub: username, role, exp: 7days }`
- Store JWT in localStorage on frontend
- All subsequent requests: `Authorization: Bearer <token>` header
- CA role: all GET endpoints work, POST/PATCH/DELETE return 403

---

## API Endpoints (Hono on Cloudflare Pages Functions)

All routes under `/api/`. Auth middleware on all except `/api/auth/login`.

### Upload + OCR

#### POST /api/upload

Accepts `multipart/form-data` with one or more files.

```typescript
// Each file goes through this pipeline:
// 1. Receive file buffer
// 2. Determine type: image (jpg/png/webp) or PDF
// 3. Send to Claude Haiku with OCR prompt (see OCR section)
// 4. Parse JSON response from Claude
// 5. Determine confidence (if any field missing → mark for review)
// 6. Upload original file to Google Drive (correct subfolder)
// 7. Append extracted row to Google Sheet
// 8. Return extracted data to frontend

// Response
{
  success: true,
  rows: [
    {
      id: "uuid",
      status: "confirmed" | "review",  // review = Claude was unsure
      extracted: TransactionRow,
      driveUrl: "https://drive.google.com/..."
    }
  ]
}
```

Supports batch upload — multiple files in one request. Process sequentially (not parallel) to avoid rate limits.

### Transactions

#### GET /api/transactions

```typescript
// Query params
?tab=income|expenses|tax|investments  // which sheet tab
?month=2026-04                        // optional filter
?status=review                        // optional: only flagged rows

// Response
{ rows: TransactionRow[], total: number }
```

#### PATCH /api/transactions/:id

Owner only. Edit a row (fix OCR error, change category, confirm a review row).

```typescript
// Request: partial TransactionRow
// Response: { success: true, updated: TransactionRow }
```

#### DELETE /api/transactions/:id

Owner only. Removes row from sheet. Does NOT delete file from Drive.

### Dashboard

#### GET /api/dashboard/summary

```typescript
// Response
{
  fy: "2026-27",
  income: {
    ytd_inr: number,
    ytd_usd: number,
    by_client: { Truefoundry: number, LATM: number, Toptal: number }
  },
  expenses: {
    ytd_claimable: number,
    by_category: { rent: number, travel: number, utilities: number, equipment: number }
  },
  tax: {
    estimated_liability: number,
    paid_ytd: number,
    bucket_balance: number,
    next_deadline: { date: string, amount: number }
  },
  investments: {
    us_stocks_ytd: number,
    farm_fund_total: number
  },
  review_count: number   // rows pending confirmation
}
```

#### GET /api/dashboard/monthly

Returns month-by-month breakdown for charts.

```typescript
// Response
{
  months: [
    {
      month: "2026-04",
      income: number,
      expenses: number,
      tax_set_aside: number,
      farm_add: number,
    },
  ];
}
```

---

## OCR — Claude Haiku Prompt

Use model: `claude-haiku-4-5` for all OCR. Send files as:

- Images: base64 encoded with `type: "image"`
- PDFs: base64 encoded with `type: "document"` and `media_type: "application/pdf"`

Claude's API accepts PDFs natively — no PDF-to-image conversion needed.

```typescript
const OCR_PROMPT = `
You are a financial document parser for an Indian freelancer sole proprietor.
Extract ALL fields you can find. Return ONLY valid JSON, no markdown, no explanation.

Return this exact structure:
{
  "doc_type": "income_invoice_raised | income_invoice_received | fira | expense_bill | upi_payment | unknown",
  "date": "YYYY-MM-DD or null",
  "vendor_or_client": "string or null",
  "amount_original": number or null,
  "currency": "INR | USD | SGD | null",
  "inr_amount": number or null,
  "usd_amount": number or null,
  "fx_rate": number or null,
  "invoice_number": "string or null",
  "upi_transaction_id": "string or null",
  "category": "income | rent | internet | electricity | travel | equipment | ns_fees | professional_fees | other | unknown",
  "business_pct": 100,
  "claimable_inr": number or null,
  "description": "short human-readable description, max 10 words",
  "confidence": "high | medium | low",
  "review_reason": "null or explain what is unclear"
}

Rules:
- For UPI screenshots: extract merchant name, amount, transaction ID, date
- For income invoices (raised by user): doc_type = income_invoice_raised
- For Toptal invoices received: doc_type = income_invoice_received
- For Skydo FIRA: doc_type = fira, extract USD amount + INR amount + rate
- business_pct is always 100 EXCEPT projector/personal items = 50
- If date is missing or unclear, set confidence to "low"
- If amount is missing or unclear, set confidence to "low"
- claimable_inr = inr_amount * (business_pct / 100)
- review_reason must explain if confidence is low or medium
`;
```

### Confidence → Sheet tab routing:

- `high` → write directly to correct tab (Income or Expenses)
- `medium` or `low` → write to Review tab, flag in frontend

---

## Google Drive — Folder Routing Logic

```typescript
// functions/lib/drive.ts

const FOLDER_MAP = {
  income_invoice_raised: "Invoices-Raised",
  income_invoice_received: "Invoices-Received",
  fira: "FIRA",
  expense_bill: "Expenses/{YYYY-MM}", // month subfolder
  upi_payment: "Expenses/{YYYY-MM}",
  unknown: "Expenses/Unsorted",
};

// File naming convention
// Income: {CLIENT}_{TYPE}_{YYYYMM}_{originalname}
// Expense: {CATEGORY}_{YYYYMMDD}_{originalname}
// FIRA: Skydo_FIRA_{YYYYMM}.pdf
```

Create subfolders programmatically if they don't exist (Drive API: check → create if missing).
Store folder IDs in KV after first creation to avoid repeated API lookups.

---

## Google Sheets — Tab Structure

Sheet ID stored in env. Six tabs (create these manually once, app reads/writes by tab name).

### Tab: Income

| Column | Key            | Notes                       |
| ------ | -------------- | --------------------------- |
| A      | date           | YYYY-MM-DD                  |
| B      | client         | Truefoundry / LATM / Toptal |
| C      | invoice_number |                             |
| D      | usd_amount     |                             |
| E      | fx_rate        |                             |
| F      | inr_amount     |                             |
| G      | via            | Skydo / SWIFT / Direct      |
| H      | firc_ref       | From FIRA doc               |
| I      | drive_url      | Direct link                 |
| J      | doc_type       | income_invoice_raised etc.  |
| K      | added_at       | ISO timestamp               |

### Tab: Expenses

| Column | Key           | Notes                                      |
| ------ | ------------- | ------------------------------------------ |
| A      | date          | YYYY-MM-DD                                 |
| B      | description   | OCR extracted                              |
| C      | category      | rent / travel / utilities / equipment etc. |
| D      | amount_inr    |                                            |
| E      | business_pct  | 50 or 100                                  |
| F      | claimable_inr | =D\*E/100                                  |
| G      | paid_via      | UPI / Card / Bank                          |
| H      | vendor        |                                            |
| I      | drive_url     |                                            |
| J      | confidence    | high/medium/low                            |
| K      | added_at      | ISO timestamp                              |

### Tab: TaxBucket

| Column | Key              |
| ------ | ---------------- |
| A      | month            |
| B      | set_aside_inr    |
| C      | advance_tax_paid |
| D      | challan_number   |
| E      | bucket_balance   |
| F      | notes            |

### Tab: Investments

| Column | Key             |
| ------ | --------------- |
| A      | month           |
| B      | us_stocks_inr   |
| C      | platform        |
| D      | farm_fund_add   |
| E      | farm_fund_total |
| F      | fd_or_fund_ref  |

### Tab: Review

Same columns as Expenses + Income combined, plus:
| Column | Key |
|---|---|
| L | review_reason | Why Claude flagged it |
| M | resolved | FALSE by default |

### Tab: Dashboard

Formula-only tab. No app writes here. Example formulas:

```
=SUMIF(Income!A:A,">="&DATE(2026,4,1),Income!F:F)   // YTD income INR
=SUMIF(Expenses!A:A,">="&DATE(2026,4,1),Expenses!F:F) // YTD claimable
```

---

## Frontend Pages

### Login.jsx

- Simple username + password form
- POST /api/auth/login → store JWT + role in localStorage
- CA role: show read-only badge in NavBar, hide all edit/delete buttons

### Upload.jsx (primary page — PWA share target)

- Large drop zone (react-dropzone): drag-drop or click to select
- Accepts: jpg, png, webp, pdf
- Shows upload progress per file
- After upload: shows extracted fields in a preview card
  - Green border = high confidence (auto-confirmed)
  - Yellow border = medium/low confidence (needs review)
- User can edit any field inline before saving
- "Confirm + Save" button writes to Sheet

### Dashboard.jsx

- 4 metric cards at top: YTD Income · Tax Paid · Farm Fund · Review Queue
- Monthly income vs expense bar chart (Recharts)
- Farm fund cumulative line chart
- Tax bucket progress (how much set aside vs target)
- Review count badge — click navigates to Transactions filtered by review

### Transactions.jsx

- Tabbed: Income | Expenses | Tax | Investments | Review
- Table with all rows from corresponding Sheet tab
- Edit icon on each row (owner only) — inline edit modal
- Delete icon (owner only)
- Review tab has "Confirm" button per row → moves to correct tab

### TaxBucket.jsx

- Shows advance tax schedule (4 deadlines)
- Current bucket balance
- Each deadline: amount due, amount in bucket, status (safe / at risk / paid)
- Form to log a challan payment

---

## PWA Share Target (Android phone UPI screenshot sharing)

In `frontend/public/manifest.json`:

```json
{
  "name": "Finance Tracker",
  "short_name": "FinTrack",
  "start_url": "/upload",
  "display": "standalone",
  "share_target": {
    "action": "/upload",
    "method": "POST",
    "enctype": "multipart/form-data",
    "params": {
      "files": [
        {
          "name": "file",
          "accept": ["image/*", "application/pdf"]
        }
      ]
    }
  }
}
```

In `Upload.jsx`, detect if page was opened via share (check for POST data or URL param `?shared=true`) and auto-trigger the upload flow.

---

## Google Service Account Setup (one-time)

1. Create a Google Cloud project
2. Enable Drive API and Sheets API
3. Create a Service Account, download JSON key
4. Extract `client_email` and `private_key` → set as env vars
5. Share the Drive root folder with the service account email (Editor)
6. Share the Google Sheet with the service account email (Editor)
7. App uses `googleapis` npm package with service account auth — no user OAuth needed

---

## Build Phases

### Phase 1 — Skeleton (Day 1)

- [ ] Init repo: `frontend/` with Vite + React + Tailwind, `functions/` with Hono
- [ ] Configure `wrangler.toml`, Cloudflare Pages project
- [ ] Login page + JWT auth working end to end
- [ ] Deploy to Cloudflare Pages — verify functions route correctly
- [ ] Set all env vars in Cloudflare dashboard

### Phase 2 — OCR Pipeline (Day 2)

- [ ] `functions/lib/ocr.ts` — Claude Haiku call with full prompt
- [ ] Test with one UPI screenshot, one PDF invoice, one Toptal invoice
- [ ] `functions/lib/drive.ts` — upload file to correct Drive subfolder
- [ ] `functions/lib/sheets.ts` — append row to correct Sheet tab
- [ ] `POST /api/upload` wires all three together
- [ ] `Upload.jsx` — drop zone, preview extracted fields, confirm button

### Phase 3 — Transactions + Review (Day 3)

- [ ] `GET /api/transactions` — read from Sheet tabs
- [ ] `PATCH /api/transactions/:id` — edit row in Sheet
- [ ] `DELETE /api/transactions/:id` — delete row from Sheet
- [ ] `Transactions.jsx` — tabbed table, inline edit, review queue

### Phase 4 — Dashboard (Day 4)

- [ ] `GET /api/dashboard/summary` + `/monthly`
- [ ] `Dashboard.jsx` — metric cards + charts
- [ ] `TaxBucket.jsx` — advance tax tracker

### Phase 5 — PWA + Polish (Day 5)

- [ ] `vite-plugin-pwa` setup, manifest share_target
- [ ] Test share from Android (UPI screenshot → app)
- [ ] CA login test — verify read-only enforcement
- [ ] Error handling: failed OCR, Drive quota, Sheet API errors
- [ ] Loading states on all async operations

---

## Key Implementation Notes

**Sheets row addressing:**
Sheets API uses A1 notation. To append: use `spreadsheets.values.append` with `valueInputOption: "USER_ENTERED"`. To read all rows: `spreadsheets.values.get` with range `TabName!A:Z`.

To edit a specific row, you need the row number. Store it as a hidden column (column Z = `sheet_row`) when appending, so PATCH knows which row to update.

**Drive folder IDs:**
After creating a subfolder, store its ID in Cloudflare KV with key `drive_folder_{name}`. Check KV before every upload — avoids a Drive API list call on every upload.

**Claude API — PDF handling:**

```typescript
// PDFs sent directly as document type
{
  type: "document",
  source: {
    type: "base64",
    media_type: "application/pdf",
    data: base64String
  }
}
// Images sent as image type
{
  type: "image",
  source: {
    type: "base64",
    media_type: "image/jpeg" | "image/png" | "image/webp",
    data: base64String
  }
}
```

**File size limits:**
Cloudflare Workers request body limit: 100MB (Pages Functions). Claude API: 32MB per file, 100MB total per request. Most invoices and screenshots are under 5MB.

**CORS:**
Hono CORS middleware — allow origin from your Pages domain only. During dev allow `http://localhost:5173`.

**Error response format (consistent across all endpoints):**

```typescript
{ success: false, error: string, code: "UNAUTHORIZED" | "OCR_FAILED" | "DRIVE_ERROR" | "SHEET_ERROR" | "NOT_FOUND" }
```

---

## Testing the OCR Before Full Build

Before wiring everything up, test OCR in isolation:

```typescript
// Quick test script: functions/test-ocr.ts
// Run with: npx tsx functions/test-ocr.ts path/to/file.pdf
import Anthropic from "@anthropic-ai/sdk";
import fs from "fs";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const file = fs.readFileSync(process.argv[2]);
const b64 = file.toString("base64");
const isPdf = process.argv[2].endsWith(".pdf");

const msg = await client.messages.create({
  model: "claude-haiku-4-5",
  max_tokens: 1024,
  messages: [
    {
      role: "user",
      content: [
        {
          type: isPdf ? "document" : "image",
          source: {
            type: "base64",
            media_type: isPdf ? "application/pdf" : "image/jpeg",
            data: b64,
          },
        },
        { type: "text", text: OCR_PROMPT },
      ],
    },
  ],
});
console.log(msg.content[0].text);
```

Run this on your old invoices and UPI screenshots to validate extraction quality before building the full pipeline.

---

## Deployment Checklist

- [ ] `wrangler.toml` configured with correct KV namespace ID
- [ ] All env vars set in Cloudflare Pages dashboard (Settings → Environment Variables)
- [ ] Google Service Account has Editor access to Drive folder + Sheet
- [ ] Drive root folder ID noted and set in env
- [ ] Sheet ID noted and set in env
- [ ] Six Sheet tabs created manually with correct names: Income, Expenses, TaxBucket, Investments, Review, Dashboard
- [ ] `wrangler kv:key put ADMIN_PASSWORD_HASH "$(echo -n 'yourpassword' | npx bcryptjs)"`
- [ ] `wrangler kv:key put CA_PASSWORD_HASH "..."`
- [ ] Cloudflare Pages connected to GitHub repo, auto-deploy on push to main

---
