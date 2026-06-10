# The Peak — Monthly Owner Report

Internal tool for The Peak Coffee Shop owners.

## Setup

### 1. Install dependencies
```bash
npm install
```

### 2. Configure environment variables
Copy `.env.example` to `.env.local` and fill in:

```bash
cp .env.example .env.local
```

| Variable | Description |
|---|---|
| `APP_PASSWORD` | **Required.** Shared password that gates the app and its API routes. Without it the API routes refuse to run. |
| `ANTHROPIC_API_KEY` | Your Anthropic API key (from console.anthropic.com) |
| `ANTHROPIC_MODEL` | Optional model override (defaults to `claude-sonnet-4-6`) |
| `META_WHATSAPP_TOKEN` | Permanent Meta system user token |
| `META_PHONE_NUMBER_ID` | Your Meta phone number ID |
| `OWNER_NUMBERS` | Comma-separated WhatsApp numbers in international format |
| `WHATSAPP_TEMPLATE_NAME` | `the_peak_monthly_report` |

> Security note: the app is protected only by `APP_PASSWORD`. For a public
> deployment, also enable Vercel's project-level password/access protection.

### 3. Run locally
```bash
npm run dev
```
Open http://localhost:3000

## Deploy to Vercel

### Option A — Vercel CLI
```bash
npm install -g vercel
vercel
```

### Option B — GitHub + Vercel Dashboard
1. Push this folder to a GitHub repo
2. Go to vercel.com → New Project → Import repo
3. Add all environment variables in Vercel project settings
4. Deploy

## Monthly Workflow

1. Open the app
2. Upload 3 files:
   - Accountant Excel (.xlsx)
   - POS Cashier Report (.csv)
   - Bank Statement (.xls)
3. Paste barista WhatsApp message (stock + beans data)
4. Click **Generate Full Month Report**
5. Review all 8 tabs
6. Go to **Owner Report** tab → Approve → Send via WhatsApp

## Updating Historical Sales Data

Sales history lives in `data/historical-sales.json` (no code change needed).
Each January, add the new year's data:
```json
"2027": { "1": 1234.56, "2": 789.01 }
```
Then add the year to `YEARS` in `lib/sales.js` so it appears in the history charts.

## Security

- **Access control.** The app and its API routes (`/api/generate`, `/api/whatsapp`)
  are gated by `APP_PASSWORD`. If it is unset, the API routes refuse to run, so an
  accidentally-public deployment cannot be used as a free Anthropic/WhatsApp proxy.
  For public deployments, also enable Vercel project-level protection.
- **`xlsx` dependency.** The public npm build (`0.18.5`) has known advisories
  (CVE-2023-30533, CVE-2024-22363). The patched build is on the SheetJS CDN only.
  For production install it explicitly:
  ```bash
  npm i https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz
  ```
- **Local data.** Uploaded financial data is cached in the browser's
  `localStorage` so a refresh doesn't lose work. Use **Clear All Saved Data** /
  **Sign Out** on shared machines.

## Development

```bash
npm run lint   # ESLint (next/core-web-vitals)
npm test       # Vitest unit tests for the parsers and helpers
npm run build  # Production build
```

## Coffee Beans Tracking

Add this to the barista's monthly WhatsApp message:
```
COFFEE BEANS STOCK
Beginning stock : 1000g
Added mid-month : 1000g
End of month    : 200g
```
