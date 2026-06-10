// Historical sales data and year-on-year helpers.
// Sales figures live in data/historical-sales.json so they can be updated
// without touching application code (see README "Updating Historical Sales Data").
import HISTORICAL_SALES_RAW from "../data/historical-sales.json";

// JSON object keys are strings; normalize to a {year:{month:value}} number map.
export const HISTORICAL_SALES = Object.fromEntries(
  Object.entries(HISTORICAL_SALES_RAW).map(([year, months]) => [
    Number(year),
    Object.fromEntries(Object.entries(months).map(([m, v]) => [Number(m), v])),
  ])
);

export const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
export const MONS = ["JANUARY","FEBRUARY","MARCH","APRIL","MAY","JUNE","JULY","AUGUST","SEPTEMBER","OCTOBER","NOVEMBER","DECEMBER"];
export const YEARS = [2022, 2023, 2024, 2025, 2026];
export const YEAR_COLORS = ["#1a8080", "#c8952a", "#1a3d4f", "#2d6e4e", "#1e3d2f"];

// Derive {month (1-12 or null), year} from an accountant sheet name like "MAY 2026".
export function deriveMonthYear(acctSheet) {
  const up = (acctSheet || "").toUpperCase();
  const idx = MONS.findIndex((m) => up.includes(m));
  const mo = idx >= 0 ? idx + 1 : null;
  const m = up.match(/20(\d{2})/);
  const yr = m ? parseInt("20" + m[1], 10) : new Date().getFullYear();
  return { mo, yr };
}

// Year-on-year comparison for the report month vs the same month last year.
// Returns { mo, yr, prev, curr, growth } where prev/growth are null when unavailable.
export function yoy(acctSheet, currSales) {
  const { mo, yr } = deriveMonthYear(acctSheet);
  const prev = mo ? (HISTORICAL_SALES[yr - 1]?.[mo] ?? null) : null;
  const curr = currSales ?? null;
  const growth =
    prev && curr ? parseFloat((((curr - prev) / prev) * 100).toFixed(1)) : null;
  return { mo, yr, prev, curr, growth };
}
