# Finance Tracker

Personal finance tracking PWA for a freelance sole proprietor. Automatic OCR via Claude API, Google Drive storage, Google Sheets as a live ledger.

## Quick Start

```bash
npm install
cd frontend && npm run dev      # Vite on :5173
cd functions && npm run dev     # Wrangler on :8788
```

## Project Structure

- `frontend/` -- React + Vite + Tailwind
- `functions/` -- Hono.js on Cloudflare Pages Functions
- `wrangler.toml` -- Cloudflare Pages config

## Scripts

| Command                  | Description                           |
| ------------------------ | ------------------------------------- |
| `npm run typecheck`      | TypeScript check across both projects |
| `npm run lint`           | ESLint                                |
| `npm run test`           | Run all tests                         |
| `npm run test:functions` | Functions tests only                  |
| `npm run test:frontend`  | Frontend tests only                   |

## Environment Variables

Copy `.env.example` to `.dev.vars` for local development. See `.env.example` for all required variables.
