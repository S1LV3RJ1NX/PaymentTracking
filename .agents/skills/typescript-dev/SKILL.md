---
name: typescript-dev
description: >-
  Guides TypeScript project setup, testing, linting, and development workflow
  for Hono + React + Vite + Cloudflare Pages projects. Use when scaffolding a
  new TypeScript project, adding tests, configuring ESLint/Prettier, setting up
  CI, or when the user asks about testing patterns, linting, or dev workflow.
---

# TypeScript Development Skill

## Project Bootstrap

### Directory Structure

This project uses a monorepo-like layout with shared types:

```
finance-tracker/
├── frontend/          # React + Vite + Tailwind
│   ├── src/
│   ├── vitest.config.ts
│   ├── tsconfig.json
│   └── package.json
├── functions/         # Hono on Cloudflare Pages Functions
│   ├── api/
│   ├── lib/
│   ├── __tests__/
│   ├── vitest.config.ts
│   ├── tsconfig.json
│   └── package.json
├── eslint.config.mjs  # Shared flat config
├── .prettierrc
├── tsconfig.base.json # Shared compiler options
└── package.json       # Root: scripts, husky, lint-staged
```

### TypeScript Configuration

Use a base `tsconfig.base.json` at root with strict settings. Each sub-project extends it:

- **Root** (`tsconfig.base.json`): `strict: true`, `noUncheckedIndexedAccess`, `moduleResolution: "bundler"`, `noEmit: true`
- **functions/tsconfig.json**: extends base, `target: ES2022`, types: `@cloudflare/workers-types`
- **frontend/tsconfig.json**: extends base, `target: ES2020`, `jsx: "react-jsx"`, types: `vite/client`, DOM libs

See [configs.md](configs.md) for complete file contents.

### Key Dependencies

**Root `package.json`** (devDependencies):

```bash
npm i -D typescript eslint prettier @typescript-eslint/parser \
  @typescript-eslint/eslint-plugin eslint-plugin-react-hooks \
  prettier-plugin-tailwindcss husky lint-staged
```

**functions/package.json**:

```bash
npm i hono @anthropic-ai/sdk googleapis zod
npm i -D vitest @cloudflare/workers-types miniflare
```

**frontend/package.json**:

```bash
npm i react react-dom react-router-dom axios recharts react-dropzone
npm i -D vitest @testing-library/react @testing-library/jest-dom \
  @testing-library/user-event jsdom @vitejs/plugin-react
```

---

## Linting and Formatting

### ESLint Flat Config

Use a single `eslint.config.mjs` at the project root. See [configs.md](configs.md) for the full file.

Key rules to enforce:

- `@typescript-eslint/no-explicit-any` — warn (error in CI)
- `@typescript-eslint/no-unused-vars` — error, ignore `_` prefix
- `react-hooks/rules-of-hooks` — error
- `react-hooks/exhaustive-deps` — warn

### Prettier

`.prettierrc` at root — Tailwind plugin auto-sorts classes:

```json
{
  "semi": true,
  "singleQuote": false,
  "trailingComma": "all",
  "printWidth": 100,
  "tabWidth": 2,
  "plugins": ["prettier-plugin-tailwindcss"]
}
```

### Pre-commit Hooks

Set up Husky + lint-staged in root `package.json`:

```json
{
  "scripts": {
    "prepare": "husky",
    "lint": "eslint .",
    "lint:fix": "eslint . --fix",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "typecheck": "tsc -b frontend functions --noEmit"
  },
  "lint-staged": {
    "*.{ts,tsx,js,jsx}": ["eslint --fix", "prettier --write"],
    "*.{json,md,css}": ["prettier --write"]
  }
}
```

Initialize husky:

```bash
npx husky init
echo "npx lint-staged" > .husky/pre-commit
```

---

## Testing with Vitest

### Why Vitest

- Vite-native: shares the same transform pipeline, no duplicate config
- First-class TypeScript: no `ts-jest` or `babel` needed
- Compatible with Jest's `expect` API — minimal learning curve
- Fast watch mode with HMR-like reloading

### Vitest Config

- **functions**: `environment: "miniflare"` with `kvNamespaces: ["FINANCE_KV"]`, coverage thresholds at 80%
- **frontend**: `environment: "jsdom"`, `setupFiles: ["./src/test-setup.ts"]` (imports `@testing-library/jest-dom/vitest`), coverage thresholds at 70%

See [configs.md](configs.md) for complete vitest config files and package.json scripts.

### npm Scripts

Each sub-project: `test` (vitest run), `test:watch` (vitest), `test:coverage` (vitest run --coverage).
Root orchestrates via workspaces: `test:functions`, `test:frontend`.

---

## Testing Patterns

### Hono API Route Testing

Hono supports direct request testing via `app.request()` — no HTTP server needed:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { app } from "../lib/hono";

describe("POST /api/auth/login", () => {
  it("returns JWT for valid owner credentials", async () => {
    const res = await app.request("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "owner", password: "test-pass" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("token");
    expect(body.role).toBe("owner");
  });

  it("returns 401 for wrong password", async () => {
    const res = await app.request("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "owner", password: "wrong" }),
    });
    expect(res.status).toBe(401);
  });
});
```

### Mocking Cloudflare KV

With miniflare environment, KV is available automatically. For manual mocking:

```typescript
const mockKV = {
  get: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
};

const mockEnv = {
  FINANCE_KV: mockKV,
  JWT_SECRET: "test-secret-min-32-chars-long-here",
  ANTHROPIC_API_KEY: "sk-ant-test",
};
```

### Mocking Claude OCR Responses

Create fixture files under `functions/__tests__/fixtures/`:

```typescript
// functions/__tests__/fixtures/ocr-responses.ts
export const upiScreenshotResponse = {
  doc_type: "upi_payment",
  date: "2026-03-15",
  vendor_or_client: "Amazon",
  amount_original: 1499,
  currency: "INR",
  inr_amount: 1499,
  category: "equipment",
  business_pct: 50,
  claimable_inr: 749.5,
  description: "Amazon purchase - keyboard",
  confidence: "high",
  review_reason: null,
};

// In test file
vi.mock("@anthropic-ai/sdk", () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: {
      create: vi.fn().mockResolvedValue({
        content: [{ type: "text", text: JSON.stringify(upiScreenshotResponse) }],
      }),
    },
  })),
}));
```

### Mocking Google APIs (Drive + Sheets)

```typescript
vi.mock("googleapis", () => ({
  google: {
    auth: {
      GoogleAuth: vi.fn().mockImplementation(() => ({
        getClient: vi.fn().mockResolvedValue({}),
      })),
    },
    drive: vi.fn().mockReturnValue({
      files: {
        create: vi.fn().mockResolvedValue({ data: { id: "file-123", webViewLink: "https://..." } }),
        list: vi.fn().mockResolvedValue({ data: { files: [] } }),
      },
    }),
    sheets: vi.fn().mockReturnValue({
      spreadsheets: {
        values: {
          append: vi.fn().mockResolvedValue({ data: { updates: { updatedRows: 1 } } }),
          get: vi.fn().mockResolvedValue({ data: { values: [] } }),
          update: vi.fn().mockResolvedValue({ data: {} }),
        },
      },
    }),
  },
}));
```

### React Component Testing

```typescript
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect } from "vitest";
import { MetricCard } from "../components/MetricCard";

describe("MetricCard", () => {
  it("renders label and formatted value", () => {
    render(<MetricCard label="YTD Income" value={250000} format="currency-inr" />);
    expect(screen.getByText("YTD Income")).toBeInTheDocument();
    expect(screen.getByText(/2,50,000/)).toBeInTheDocument();
  });
});
```

### React Hook Testing

```typescript
import { renderHook, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { useTransactions } from "../hooks/useTransactions";

vi.mock("../api/transactions", () => ({
  fetchTransactions: vi.fn().mockResolvedValue({ rows: [], total: 0 }),
}));

describe("useTransactions", () => {
  it("fetches transactions on mount", async () => {
    const { result } = renderHook(() => useTransactions("income"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.rows).toEqual([]);
  });
});
```

---

## Code Quality Patterns

### Zod for Runtime Validation

Claude OCR returns JSON that must be validated at runtime. Use Zod:

```typescript
import { z } from "zod";

export const OcrResultSchema = z.object({
  doc_type: z.enum([
    "income_invoice_raised",
    "income_invoice_received",
    "fira",
    "expense_bill",
    "upi_payment",
    "unknown",
  ]),
  date: z.string().nullable(),
  vendor_or_client: z.string().nullable(),
  amount_original: z.number().nullable(),
  currency: z.enum(["INR", "USD", "SGD"]).nullable(),
  inr_amount: z.number().nullable(),
  usd_amount: z.number().nullable(),
  fx_rate: z.number().nullable(),
  confidence: z.enum(["high", "medium", "low"]),
  review_reason: z.string().nullable(),
});

export type OcrResult = z.infer<typeof OcrResultSchema>;
```

Parse in the OCR handler:

```typescript
const raw = JSON.parse(claudeResponse.content[0].text);
const parsed = OcrResultSchema.safeParse(raw);
if (!parsed.success) {
  return { success: false, error: "OCR response invalid", code: "OCR_FAILED" };
}
```

### Typed API Responses

Use discriminated unions for consistent error handling:

```typescript
type ApiResponse<T> =
  | { success: true; data: T }
  | { success: false; error: string; code: ErrorCode };

type ErrorCode =
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "OCR_FAILED"
  | "DRIVE_ERROR"
  | "SHEET_ERROR"
  | "NOT_FOUND"
  | "VALIDATION_ERROR";
```

### Error Handling in Hono

Use Hono's `onError` hook for consistent responses:

```typescript
app.onError((err, c) => {
  if (err instanceof ZodError) {
    return c.json({ success: false, error: err.message, code: "VALIDATION_ERROR" }, 400);
  }
  console.error(err);
  return c.json({ success: false, error: "Internal server error", code: "UNKNOWN" }, 500);
});
```

---

## Development Workflow

### Local Dev Setup

1. **Frontend**: `cd frontend && npm run dev` (Vite on port 5173)
2. **Functions**: `cd functions && npx wrangler pages dev --port 8788`
3. **Proxy**: Configure Vite to proxy `/api` to wrangler:

```typescript
// frontend/vite.config.ts
export default defineConfig({
  server: {
    proxy: {
      "/api": "http://localhost:8788",
    },
  },
});
```

### Local Environment Variables

Wrangler uses `.dev.vars` (gitignored) for local secrets:

```
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_SERVICE_ACCOUNT_EMAIL=...
GOOGLE_PRIVATE_KEY=...
JWT_SECRET=local-dev-secret-at-least-32-chars
```

### Type Checking

Run separately from build — catches errors the bundler ignores:

```bash
npx tsc -b frontend functions --noEmit
```

Add to CI and as a pre-push hook if needed.

### Recommended Workflow

1. Write/modify code
2. Run `npm run typecheck` to catch type errors
3. Run `npm run lint:fix` to auto-fix lint issues
4. Run relevant tests: `npm run test:functions` or `npm run test:frontend`
5. Commit — Husky runs lint-staged automatically

---

## Design System

Reference: [baseline_tax_no_deductions.html](../../baseline_tax_no_deductions.html)

All UI must follow this warm, minimal financial design. Colors and tokens are defined in `tailwind.config.js`.

### Color Tokens

| Token            | Hex       | Usage                                 |
| ---------------- | --------- | ------------------------------------- |
| `surface`        | `#f5f5f0` | Page background                       |
| `surface-card`   | `#ffffff` | Card background                       |
| `surface-muted`  | `#eceae3` | Metric cards, progress bar tracks     |
| `border`         | `#d3d1c7` | All borders (0.5px), dividers         |
| `text`           | `#1a1a18` | Primary text, values                  |
| `text-secondary` | `#888780` | Labels, section titles, table headers |
| `text-tertiary`  | `#b4b2a9` | Subtitles, notes, percentages         |
| `accent-green`   | `#0F6E56` | Positive values, net amounts, success |
| `accent-red`     | `#A32D2D` | Tax, liabilities, errors              |
| `accent-blue`    | `#378ADD` | Progress first step, links            |
| `accent-amber`   | `#EF9F27` | Progress middle steps, warnings       |

### Component Patterns

**Metric card**: `bg-surface-muted rounded-lg p-3.5` with 12px label (secondary) + 21px value (500 weight) + 11px subtitle (tertiary).

**Card**: `bg-surface-card border-thin border-border rounded-xl px-5 py-4` -- white bg, 0.5px border, 12px radius.

**Section title**: `text-[11px] font-medium uppercase tracking-widest text-secondary`.

**Table**: 13px body, 11px uppercase headers, 0.5px bottom borders, right-align last column.

**Badge**: `text-[11px] px-1.5 py-0.5 rounded-full` -- amber variant (`bg-badge-amber text-badge-amber-text`), red variant.

### Responsiveness

- **Upload page**: mobile-first (360px+). Large tap targets, stacked layout, full-width drop zone.
- **Dashboard, Transactions, TaxBucket**: desktop-first (max-w-[820px] centered). Metric grid collapses 3-col -> 2-col on mobile.

### CSS Architecture

- `tailwind.config.js` -- all custom tokens above
- `src/styles/global.css` -- imported in `main.tsx`:
  - Tailwind directives (`@tailwind base/components/utilities`)
  - 0.5px border utility, divider class, base body styles
- Components use Tailwind utility classes -- no component-level CSS files

## Additional Resources

- For complete config file contents, see [configs.md](configs.md)
