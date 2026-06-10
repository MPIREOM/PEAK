// Numeric/date formatting helpers shared across parsers and views.

// Coerce any cell value to a number, stripping currency symbols/spaces.
export const n = (v) => {
  if (!v && v !== 0) return 0;
  const x = parseFloat(String(v).replace(/[^0-9.\-]/g, ""));
  return isNaN(x) ? 0 : x;
};

// Format a value as OMR (3 decimal places).
export const f = (v) => n(v).toFixed(3);

// Normalize various Excel/string date representations to YYYY-MM-DD.
export const excelDate = (v) => {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString().split("T")[0];
  if (typeof v === "number" && v > 40000) {
    return new Date(Date.UTC(1899, 11, 30) + v * 86400000).toISOString().split("T")[0];
  }
  const s = String(v).trim();
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dmy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
  return null;
};
