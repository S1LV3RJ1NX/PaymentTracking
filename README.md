# Business Expense Tracker

PWA for freelance sole proprietors to track income, expenses, and tax obligations. Upload invoices/receipts, get automatic OCR via Claude API, store files in Cloudflare R2, and keep a live ledger in Google Sheets.

## Features

- **Upload & OCR** — Drag-and-drop invoices, FIRA certificates, and expense receipts. Claude extracts structured data automatically.
- **Google Sheets ledger** — Income and Expenses tabs updated in real time. Share with your CA for instant visibility.
- **Cloudflare R2 storage** — Uploaded files stored in R2 with inline preview (images & PDFs).
- **Dashboard** — YTD income, expenses, monthly chart, and client/category breakdowns.
- **Tax calculator** — Section 44ADA presumptive taxation, New Regime slabs, Section 87A rebate, advance tax schedule.
- **Financial Year selector** — Global FY filter in the navbar, applies across all pages.
- **Role-based access** — Owner (full access) and CA (read-only, no upload/delete).
- **Mobile-friendly** — Responsive layout with hamburger menu, optimised for on-the-go uploads.

## Tech Stack

| Layer    | Technology                                    |
| -------- | --------------------------------------------- |
| Frontend | React 18, Vite, Tailwind CSS, Recharts        |
| Backend  | Hono.js on Cloudflare Pages Functions         |
| Storage  | Cloudflare R2 (files), Google Sheets (ledger) |
| OCR      | Anthropic Claude Haiku                        |
| Auth     | JWT + bcrypt, role-based middleware           |
| Testing  | Vitest (132 tests — 78 backend, 54 frontend)  |
| CI       | Husky + lint-staged (lint, typecheck, tests)  |

## Project Structure

```
frontend/          React + Vite + Tailwind
  src/
    components/    NavBar, FilePreview, FYSelector, etc.
    pages/         Dashboard, Transactions, Upload, TaxBucket, Login
    hooks/         useDashboard, useTransactions, useUpload
    context/       FYContext (global financial year state)
functions/         Hono.js API on Cloudflare Pages Functions
  lib/             Core logic (auth, storage, sheets, ocr, tax)
  __tests__/       Backend test suite
wrangler.toml      Cloudflare Pages config (KV + R2 bindings)
SETUP.md           Detailed local setup guide
```

## Quick Start

See [SETUP.md](SETUP.md) for full environment setup (Google Sheets, API keys, R2, passwords).

## Scripts

| Command             | Description                           |
| ------------------- | ------------------------------------- |
| `npm run typecheck` | TypeScript check across both projects |
| `npm run lint`      | ESLint                                |
| `npm run format`    | Prettier                              |
| `npm run test`      | Run all tests                         |

## Environment Variables

Copy `.dev.vars.example` to `.dev.vars` for local development. Required variables:

- `JWT_SECRET` — signing key for auth tokens
- `ADMIN_PASSWORD_HASH` / `CA_PASSWORD_HASH` — bcrypt hashes
- `ANTHROPIC_API_KEY` — Claude API key for OCR
- `GOOGLE_SERVICE_ACCOUNT_EMAIL` / `GOOGLE_PRIVATE_KEY` — for Sheets API
- `GOOGLE_SHEET_ID` — your Google Sheet ID

R2 storage is handled via Wrangler's `--r2 FINANCE_R2` flag locally and R2 bindings in production.

## Deploying

Push to GitHub, connect to Cloudflare Pages, and configure bindings. Full instructions in [SETUP.md → Deploying to Cloudflare Pages](SETUP.md#deploying-to-cloudflare-pages).
