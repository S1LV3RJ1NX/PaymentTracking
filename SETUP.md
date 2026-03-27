# Local Setup Guide

You want to upload a Skydo invoice from your phone, see it parsed automatically, and watch a new row appear in your Google Sheet. This guide gets you there in about 15 minutes.

---

## What you'll set up

| Service                | Why                                                            | Free?                      |
| ---------------------- | -------------------------------------------------------------- | -------------------------- |
| Google Cloud project   | Drive + Sheets API access                                      | Yes (within quota)         |
| Google Service Account | Server-to-server auth, no OAuth popups                         | Yes                        |
| Google Sheet           | Your live ledger with Income + Expenses tabs                   | Yes                        |
| Google Drive folder    | Organized file storage by FY and type                          | Yes                        |
| Anthropic API key      | Claude Haiku OCR for invoices/receipts                         | Pay-per-use (~$0.001/page) |
| Cloudflare KV          | Folder ID cache + secrets store (local only needs `--kv` flag) | Yes                        |

---

## Do I need `.env` or `.dev.vars`?

**Only `.dev.vars`.** Wrangler Pages reads `.dev.vars` automatically during local dev. You don't need a separate `.env` file. The `.env.example` in the repo is just a reference — ignore it for local development.

`.dev.vars` is already in `.gitignore`, so your secrets won't be committed.

---

## Step 1: Generate passwords and JWT secret

Open a terminal in the project root:

```bash
# Generate a random JWT secret (32+ characters)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Copy the output. That's your `JWT_SECRET`.

```bash
# Generate bcrypt hash for owner password
node -e "require('bcryptjs').hash('your-owner-password-here', 10).then(console.log)"

# Generate bcrypt hash for CA password
node -e "require('bcryptjs').hash('your-ca-password-here', 10).then(console.log)"
```

Each command prints a hash like `$2a$10$xK3b...`. Copy them.

Create your `.dev.vars` file:

```bash
cp .dev.vars.example .dev.vars
```

Fill in the three values you just generated:

```
JWT_SECRET=<your 64-char hex string>
ADMIN_PASSWORD_HASH=<owner bcrypt hash>
CA_PASSWORD_HASH=<ca bcrypt hash>
```

---

## Step 2: Get an Anthropic API key

1. Go to [console.anthropic.com](https://console.anthropic.com)
2. Sign in or create an account
3. Go to **API Keys** → **Create Key**
4. Copy the key (starts with `sk-ant-api03-...`)

Add to `.dev.vars`:

```
ANTHROPIC_API_KEY=sk-ant-api03-your-key-here
```

---

## Step 3: Create a Google Cloud project + Service Account

### 3a. Create the project

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Click the project dropdown (top-left) → **New Project**
3. Name it `finance-tracker` (or anything you like)
4. Click **Create**

### 3b. Enable APIs

Still in the Google Cloud Console:

1. Go to **APIs & Services → Library**
2. Search for **Google Drive API** → click → **Enable**
3. Search for **Google Sheets API** → click → **Enable**

### 3c. Create a Service Account

1. Go to **IAM & Admin → Service Accounts**
2. Click **Create Service Account**
3. Name: `finance-tracker-sa` (or anything)
4. Click **Create and Continue**
5. Skip the optional role/access steps → **Done**

### 3d. Download the key file

1. Click on the service account you just created
2. Go to the **Keys** tab
3. Click **Add Key → Create New Key → JSON → Create**
4. A `.json` file downloads. Open it in a text editor.

From the JSON file, copy two values:

```
GOOGLE_SERVICE_ACCOUNT_EMAIL=<"client_email" field from JSON>
```

For the private key, copy the entire `"private_key"` value (including the `\n` escape sequences). It looks like:

```
GOOGLE_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKC...many lines...Kg==\n-----END RSA PRIVATE KEY-----\n"
```

**Important:** Keep the double quotes and all `\n` sequences intact. The code handles unescaping.

Add both to `.dev.vars`.

---

## Step 4: Create the Google Sheet

1. Go to [sheets.google.com](https://sheets.google.com) → create a new blank spreadsheet
2. Rename the first tab to **Income** (right-click tab → Rename)
3. Add a second tab named **Expenses** (click the `+` button)

### Income tab — Row 1 (headers):

| A    | B      | C              | D          | E          | F         | G              | H        | I         | J          | K        |
| ---- | ------ | -------------- | ---------- | ---------- | --------- | -------------- | -------- | --------- | ---------- | -------- |
| date | client | invoice_number | usd_amount | inr_amount | skydo_prn | fira_drive_url | fira_ref | drive_url | confidence | added_at |

### Expenses tab — Row 1 (headers):

| A    | B           | C        | D          | E            | F             | G        | H      | I         | J          | K        |
| ---- | ----------- | -------- | ---------- | ------------ | ------------- | -------- | ------ | --------- | ---------- | -------- |
| date | description | category | amount_inr | business_pct | claimable_inr | paid_via | vendor | drive_url | confidence | added_at |

4. **Share with the service account:** Click **Share** → paste the `GOOGLE_SERVICE_ACCOUNT_EMAIL` → set to **Editor** → uncheck "Notify people" → **Share**

5. **Copy the Sheet ID** from the URL:

```
https://docs.google.com/spreadsheets/d/THIS_IS_YOUR_SHEET_ID/edit
```

Add to `.dev.vars`:

```
GOOGLE_SHEET_ID=<your sheet ID>
```

---

## Step 5: Create the Google Drive root folder

1. Go to [drive.google.com](https://drive.google.com)
2. Create a new folder (e.g. `FinanceTracker`)
3. Right-click the folder → **Share** → paste the same `GOOGLE_SERVICE_ACCOUNT_EMAIL` → **Editor** → **Share**
4. Open the folder. Copy the folder ID from the URL:

```
https://drive.google.com/drive/folders/THIS_IS_YOUR_FOLDER_ID
```

Add to `.dev.vars`:

```
GOOGLE_DRIVE_ROOT_FOLDER_ID=<your folder ID>
```

---

## Step 6: Verify your `.dev.vars`

Your complete `.dev.vars` should now look like this (no blank `REPLACE_ME` values):

```
JWT_SECRET=a4f8e2...64 hex chars...
ADMIN_PASSWORD_HASH=$2a$10$xK3bR...
CA_PASSWORD_HASH=$2a$10$yM7pQ...
ANTHROPIC_API_KEY=sk-ant-api03-...
GOOGLE_SERVICE_ACCOUNT_EMAIL=finance-tracker-sa@your-project.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\nMIIE...\n-----END RSA PRIVATE KEY-----\n"
GOOGLE_DRIVE_ROOT_FOLDER_ID=1aBcD...
GOOGLE_SHEET_ID=1xYz...
```

---

## Step 7: Run locally

```bash
npx wrangler pages dev frontend/dist \
  --compatibility-date=2025-07-18 \
  --kv FINANCE_KV
```

Open [http://localhost:8788](http://localhost:8788). Wrangler serves the frontend and API together, reads `.dev.vars` automatically, and simulates KV locally.

When you edit frontend or backend files, wrangler detects the change and auto-rebuilds (~2-3 seconds).

> **Optional — faster frontend iteration:** If you want instant hot reload (<100ms) for UI changes, run `cd frontend && npm run dev` in a second terminal and open `http://localhost:5173` instead. Vite proxies API calls to wrangler on port 8788 automatically.

---

### Test the flow

1. **Login** — select `Prathamesh` from the dropdown, enter the password you chose in Step 1
2. **Upload** — go to Upload, select "Skydo Invoice", pick a PDF from `sample-data/`
3. **Check results** — the OCR result and confidence badge should appear
4. **Check Google Sheet** — a new row should appear in the Income tab
5. **Check Google Drive** — a file should appear in `FinanceTracker/FY25-26/Invoices-Received/`

---

## Cleaning up test data

Everything you upload during testing goes into your real Google Sheet and Drive. To clean up:

- **Sheet:** Delete the test rows from the Income and Expenses tabs
- **Drive:** Delete the FY folder (e.g. `FY25-26/`) from the root folder. Folder IDs are cached in KV, but the next upload will recreate them automatically.

You can also create a completely separate "test" Sheet and Drive folder and use those IDs in `.dev.vars` during development. Switch to your real ones when you're ready.

---

## Deploying to Cloudflare Pages

When ready to deploy:

1. Push the repo to GitHub
2. In [Cloudflare Dashboard](https://dash.cloudflare.com) → **Pages** → **Create a project** → connect your repo
3. Set build command: `cd frontend && npm run build`
4. Set build output directory: `frontend/dist`
5. Create a KV namespace in **Workers & Pages → KV** — copy the namespace ID
6. Update `wrangler.toml` with the real KV namespace ID
7. In Pages project **Settings → Environment variables**, add all the same variables from `.dev.vars`
8. Deploy

---

## Troubleshooting

| Symptom                                   | Cause                                 | Fix                                                                             |
| ----------------------------------------- | ------------------------------------- | ------------------------------------------------------------------------------- |
| `Google OAuth token exchange failed: 401` | Wrong private key or email            | Re-download the JSON key, copy values again carefully                           |
| `Sheets append failed: 403`               | Sheet not shared with service account | Share sheet with the service account email as Editor                            |
| `Drive upload failed: 404`                | Wrong folder ID, or folder not shared | Verify the folder ID from the URL, share with service account                   |
| `Invalid credentials` on login            | Wrong password or hash mismatch       | Re-generate the bcrypt hash, make sure you hash the same password you're typing |
| `GOOGLE_PRIVATE_KEY` parsing error        | Missing quotes or mangled `\n`        | Wrap the entire key in double quotes in `.dev.vars`, keep all `\n` sequences    |
| Wrangler can't find `.dev.vars`           | File is in wrong directory            | Must be in the project root (same level as `package.json`)                      |
