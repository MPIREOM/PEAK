// File parsers for the three uploaded sources (accountant Excel, POS CSV,
// bank statement) plus the pasted barista message, and the reconciliation.
//
// NOTE: these parsers rely on fixed column positions in the source files.
// If the accountant/POS/bank export layout changes, the column indices below
// must be updated. Validation flags obvious problems but cannot catch a
// silently shifted column.
// SECURITY: xlsx@0.18.5 (the latest on the public npm registry) has known
// advisories — prototype pollution (CVE-2023-30533) and ReDoS (CVE-2024-22363).
// The patched build is published only via the SheetJS CDN. For production,
// install it explicitly:
//   npm i https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz
import * as XLSX from "xlsx";
import { n, excelDate } from "./format";
import { MONS } from "./sales";

// Accountant Excel: pick the most relevant monthly sheet, then read daily rows.
export function parseAcct(buf) {
  const wb = XLSX.read(buf, { type: "array", cellDates: true, cellNF: false });
  const countD = (ws) =>
    XLSX.utils
      .sheet_to_json(ws, { header: 1, defval: null, raw: true })
      .filter((r) => r && r[3] && (r[3] instanceof Date || (typeof r[3] === "number" && r[3] > 40000)))
      .length;
  const meta = wb.SheetNames.map((name) => {
    const up = name.toUpperCase();
    const yr = up.match(/20(\d{2})/);
    const year = yr ? parseInt("20" + yr[1], 10) : 0;
    const mo = MONS.findIndex((m) => up.includes(m)) + 1;
    return { name, year, mo, named: year > 0 || mo > 0 ? 1 : 0 };
  });
  const pool = meta.filter((s) => s.named).length > 0 ? meta.filter((s) => s.named) : meta;
  pool.sort((a, b) =>
    b.year !== a.year ? b.year - a.year : b.mo !== a.mo ? b.mo - a.mo : countD(wb.Sheets[b.name]) - countD(wb.Sheets[a.name])
  );
  const sn = pool[0]?.name || wb.SheetNames[wb.SheetNames.length - 1];
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, defval: null, raw: true });
  const data = [];
  const issues = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const date = excelDate(row[3]);
    if (!date || !date.match(/\d{4}-\d{2}-\d{2}/)) continue;
    const total = n(row[8]);
    if (total === 0 && n(row[4]) === 0 && n(row[5]) === 0) continue;
    if (!row[17] && !row[16]) issues.push({ date, issue: "Net of Sale missing" });
    const yr = parseInt(date.split("-")[0], 10);
    if (yr < 2025 || yr > 2030) issues.push({ date, issue: `Year looks wrong (${yr})` });
    data.push({
      date,
      cash: n(row[4]),
      creditCard: n(row[5]),
      roomSale: n(row[6]),
      tips: n(row[7]),
      totalSale: total,
      purchase: n(row[16]),
      netSale: n(row[17]),
      cashInHand: n(row[18]),
    });
  }
  return { data, sheetName: sn, issues };
}

// POS cashier report: semicolon-delimited text export.
export function parsePOS(text) {
  const lines = text.trim().split("\n").map((l) => l.replace(/\r/g, "").trim());
  const get = (kw) => {
    for (const l of lines) {
      const c = l.split(";");
      if (c[0].toUpperCase().includes(kw.toUpperCase())) {
        const v = n(c[2] || c[1]);
        if (v > 0) return v;
      }
    }
    return 0;
  };
  const summary = {
    totalSales: get("TOTAL SALES:") || get("NET SALES"),
    cash: get("CASH"),
    visa: get("VISA"),
    mastercard: get("MASTERCARD"),
    discount: get("DISCOUNT"),
    tips: get("TIP"),
    receipts: get("#RECEIPTS"),
    pax: get("#PAX"),
  };
  summary.card = summary.visa + summary.mastercard;
  summary.netSales = get("NET SALES") || summary.totalSales;
  const CATS = ["COLD COFFEE","MOJITOS","COLD DRINKS","DESSERTS","DISPLAY FRIDGE","DISPLAY ITEMS","HOT COFFEE","HOT DRINKS","ICE CREAM","MILKSHAKES"];
  const SKIP = new Set(["TEXT5","TEXT6","TEXT7","TOTAL","TOTAL SALES:","NET SALES","TOTAL AMOUNT","TOTAL SALES WITHOUT TIP","BALANCE","SETTLED","#PAX","#PAYMENTS","#RECEIPTS","SALES PER PAX","SALES PER RECEIPT","#VOID RECEIPTS","DISCOUNT","EXTRA CHARGE","ROUND OFF","TAX","TIP","-N/A-","DINE IN","TAKEAWAY","NO CHARGE","EMPLOYEE DISCOUNT","LOCALS DISCOUNT","OWNER DISCOUNT","CASH","MASTERCARD","VISA","OWNER 1 AHMED", ...CATS]);
  const serviceTypes = [];
  const categories = [];
  const menuItems = [];
  for (const l of lines) {
    const c = l.split(";");
    const label = c[0].trim();
    const up = label.toUpperCase();
    if (["DINE IN", "TAKEAWAY", "NO CHARGE"].includes(up) && n(c[2]) > 0) serviceTypes.push({ name: label, qty: n(c[1]), amount: n(c[2]) });
    if (CATS.includes(up) && n(c[1]) > 0) categories.push({ name: label, qty: n(c[1]), amount: n(c[2]) });
    if (!label || SKIP.has(up)) continue;
    const qty = n(c[1]);
    const amt = n(c[2]);
    if (qty > 0 && amt > 0) menuItems.push({ name: label, qty, amount: amt, avg: parseFloat((amt / qty).toFixed(3)) });
  }
  menuItems.sort((a, b) => b.amount - a.amount);
  return { summary, serviceTypes, categories, menuItems, valid: summary.totalSales > 0 };
}

// Barista WhatsApp message: free-text with labelled sections.
export function parseBarista(text) {
  if (!text) return null;
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);

  const extractNum = (line) => {
    const m = line.match(/[:=]\s*([\d.,]+)/);
    return m ? parseFloat(m[1].replace(/,/g, "")) : null;
  };
  const extractLabel = (line) => line.replace(/[🔹🔸▪️]/g, "").replace(/[:=].*$/, "").trim().replace(/\s+/g, " ");

  let section = "";
  const purchased = [], remaining = [], dairy = [], spoilage = [], sweets = [];
  let sweetsTotal = null, beansBegin = null, beansAdded = 0, beansEnd = null;

  for (const line of lines) {
    const up = line.toUpperCase();
    if (up.includes("PURCHASED")) { section = "purchased"; continue; }
    if (up.includes("REMAINING")) { section = "remaining"; continue; }
    if (up.includes("DAIRY")) { section = "dairy"; continue; }
    if (up.includes("SALES")) { section = "sales"; continue; }
    if (up.includes("SWEETS")) { section = "sweets"; continue; }
    if (up.includes("COFFEE BEANS") || up.includes("BEANS STOCK") || (up.includes("BEANS") && up.includes("STOCK"))) { section = "beans"; continue; }
    if (up.includes("SPOILAGE")) { section = "spoilage"; continue; }

    const num = extractNum(line);
    const label = extractLabel(line);

    if (section === "purchased" && num !== null && label) purchased.push({ item: label, qty: num });
    if (section === "remaining" && num !== null && label) remaining.push({ item: label, qty: num });
    if (section === "dairy" && num !== null && label) dairy.push({ item: label, qty: num });
    if (section === "spoilage" && num !== null && label) spoilage.push({ item: label, qty: num });
    if (section === "sweets") {
      if (up.includes("TOTAL")) sweetsTotal = num;
      else if (num !== null && label) sweets.push({ item: label, qty: num });
    }
    if (section === "beans") {
      const gramsMatch = line.match(/[:=]\s*([\d.]+)\s*(g|kg|grams|kilos?)/i);
      if (gramsMatch) {
        const val = parseFloat(gramsMatch[1]) * (gramsMatch[2].toLowerCase().startsWith("k") ? 1000 : 1);
        if (up.includes("BEGIN") || up.includes("START") || up.includes("OPENING")) beansBegin = val;
        else if (up.includes("ADD") || up.includes("MID") || up.includes("PURCHAS") || up.includes("BOUGHT")) beansAdded += val;
        else if (up.includes("END") || up.includes("CLOSING") || up.includes("REMAIN") || up.includes("LEFT")) beansEnd = val;
      }
    }
  }

  return { purchased, remaining, dairy, spoilage, sweets, sweetsTotal, beansBegin, beansAdded, beansEnd, raw: text };
}

// Tidy a raw bank narration into a short human-readable description.
export function cleanNarr(s) {
  const pos = s.match(/POS\s+\d+-(.*?)(?:\s+512\.|\s+\d{6,}|@|$)/);
  if (pos) return "POS — " + pos[1].trim().replace(/\b\w/g, (c) => c.toUpperCase());
  if (s.toLowerCase().includes("transfer")) return "Transfer — " + s.replace(/Transfer\s+/i, "").replace(/\b\d{8,}\b/g, "").replace(/\bLFT\w+\b/g, "").replace(/\s+/g, " ").trim().slice(0, 50);
  if (s.includes("ACH Inward") || s.includes("ACH Direct Credit")) return "ACH Credit (Sales Deposit)";
  if (s.includes("Value Added Tax")) return "VAT Payment";
  if (s.toUpperCase().includes("SALARY")) return "Monthly Salary";
  if (s.toUpperCase().includes("SWIFT CHARGES")) return "SWIFT Bank Charges";
  if (s.toUpperCase().includes("SWIFT")) return "SWIFT Payment";
  if (s.includes("Reversal")) return "Bank Reversal/Adjustment";
  return s.replace(/\b\d{8,}\b/g, "").replace(/\bFT\w+\b/g, "").replace(/@[\d.]+/g, "").replace(/\s+/g, " ").trim().slice(0, 50);
}

// Bucket a raw bank narration into a small set of expense categories so the
// report can show subtotals instead of a flat list.
export function categorizeExpense(raw) {
  const s = String(raw || "");
  const up = s.toUpperCase();
  if (up.includes("SALARY") || up.includes("WAGE") || up.includes("PAYROLL")) return "Salaries";
  if (s.includes("Value Added Tax") || up.includes("VAT")) return "Tax (VAT)";
  if (up.includes("SWIFT CHARGE") || up.includes("BANK CHARGE") || up.includes("SERVICE CHARGE") || up.includes("COMMISSION")) return "Bank Charges";
  if (up.includes("REVERSAL") || up.includes("ADJUST")) return "Adjustments";
  if (up.includes("TRANSFER") || up.includes("ACH") || up.includes("SWIFT")) return "Transfers / Suppliers";
  return "Other";
}

// Bank statement Excel: rows with date/narration/debit/credit/balance.
export function parseBank(buf) {
  const wb = XLSX.read(buf, { type: "array" });
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: null });
  const txns = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row || !row[3]) continue;
    const ds = String(row[3]).trim();
    if (!ds.match(/\d{1,2}\/\d{1,2}\/\d{4}/)) continue;
    const narr = row[5] ? String(row[5]).trim() : "";
    if (!narr) continue;
    const debit = row[6] ? parseFloat(String(row[6])) || 0 : 0;
    const credit = row[7] ? parseFloat(String(row[7])) || 0 : 0;
    const balance = row[8] ? parseFloat(String(row[8])) || 0 : 0;
    const type = debit > 0 ? "debit" : "credit";
    const amount = debit > 0 ? debit : credit;
    txns.push({ date: ds, desc: cleanNarr(narr), raw: narr, amount, type, balance });
  }
  return txns;
}

// Reconcile accountant totals against the POS summary.
export function reconcile(acct, pos) {
  const sm = (fn) => acct.reduce((s, r) => s + fn(r), 0);
  return {
    acctTotal: sm((r) => r.totalSale),
    acctCash: sm((r) => r.cash),
    acctCard: sm((r) => r.creditCard),
    acctNet: sm((r) => r.netSale),
    acctPurchase: sm((r) => r.purchase),
    salesVar: parseFloat((pos.totalSales - sm((r) => r.totalSale)).toFixed(3)),
    cashVar: parseFloat((pos.cash - sm((r) => r.cash)).toFixed(3)),
    cardVar: parseFloat((pos.card - sm((r) => r.creditCard)).toFixed(3)),
  };
}
