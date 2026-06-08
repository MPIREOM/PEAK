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
| `ANTHROPIC_API_KEY` | Your Anthropic API key (from console.anthropic.com) |
| `META_WHATSAPP_TOKEN` | Permanent Meta system user token |
| `META_PHONE_NUMBER_ID` | `1090243240836363` |
| `OWNER_NUMBERS` | Comma-separated WhatsApp numbers |
| `WHATSAPP_TEMPLATE_NAME` | `the_peak_monthly_report` |

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

Each January, add the new year's data to `HISTORICAL_SALES` in `pages/index.jsx`:
```js
2027: {1:xxxx, 2:xxxx, ...}
```

## Coffee Beans Tracking

Add this to the barista's monthly WhatsApp message:
```
COFFEE BEANS STOCK
Beginning stock : 1000g
Added mid-month : 1000g
End of month    : 200g
```
