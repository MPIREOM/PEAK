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

// POS cashier report. Accepts either the semicolon-delimited text/CSV export
// or the same report saved as a binary .xlsx/.xls spreadsheet. Both share the
// same three-column layout: label, quantity, amount.
export function parsePOS(input) {
  const rows = posRows(input);
  const cell = (r, i) => (r && r[i] != null ? r[i] : "");
  const get = (kw) => {
    for (const r of rows) {
      if (String(cell(r, 0)).toUpperCase().includes(kw.toUpperCase())) {
        const v = n(cell(r, 2) || cell(r, 1));
        if (v > 0) return v;
      }
    }
    return 0;
  };
  // Value on the first "Total" row that follows a given section header — used to
  // read the Payment Summary total (what was actually collected) without picking
  // up the many other "Total" lines elsewhere in the report.
  const sectionTotal = (header) => {
    let inSec = false;
    for (const r of rows) {
      const up = String(cell(r, 0)).toUpperCase().trim();
      if (!inSec) { if (up.includes(header)) inSec = true; continue; }
      if (up === "TOTAL") return n(cell(r, 2) || cell(r, 1));
    }
    return 0;
  };
  const cash = get("CASH");
  const visa = get("VISA");
  const mastercard = get("MASTERCARD");
  const card = visa + mastercard;
  // The owner report reconciles money actually collected, so the POS "total" is
  // the Payment Summary total (cash + cards). Gross Total Sales still counts
  // no-charge/complimentary items that were never paid for, so it is kept
  // separately as grossSales rather than used as the headline total.
  const grossSales = get("TOTAL SALES:") || get("NET SALES");
  const collected = sectionTotal("PAYMENT SUMMARY") || (cash + card);
  const summary = {
    totalSales: collected || grossSales,
    grossSales,
    cash,
    visa,
    mastercard,
    card,
    discount: get("DISCOUNT"),
    tips: get("TIP"),
    receipts: get("#RECEIPTS"),
    pax: get("#PAX"),
  };
  summary.netSales = get("NET SALES") || grossSales;
  const CATS = ["COLD COFFEE","MOJITOS","COLD DRINKS","DESSERTS","DISPLAY FRIDGE","DISPLAY ITEMS","HOT COFFEE","HOT DRINKS","ICE CREAM","MILKSHAKES"];
  const SKIP = new Set(["TEXT5","TEXT6","TEXT7","TOTAL","TOTAL SALES:","NET SALES","TOTAL AMOUNT","TOTAL SALES WITHOUT TIP","BALANCE","SETTLED","#PAX","#PAYMENTS","#RECEIPTS","SALES PER PAX","SALES PER RECEIPT","#VOID RECEIPTS","DISCOUNT","EXTRA CHARGE","ROUND OFF","TAX","TIP","-N/A-","DINE IN","TAKEAWAY","NO CHARGE","EMPLOYEE DISCOUNT","LOCALS DISCOUNT","OWNER DISCOUNT","CASH","MASTERCARD","VISA","OWNER 1 AHMED", ...CATS]);
  const serviceTypes = [];
  const categories = [];
  const menuItems = [];
  for (const r of rows) {
    const label = String(cell(r, 0)).trim();
    const up = label.toUpperCase();
    const qtyCell = cell(r, 1);
    const amtCell = cell(r, 2);
    if (["DINE IN", "TAKEAWAY", "NO CHARGE"].includes(up) && n(amtCell) > 0) serviceTypes.push({ name: label, qty: n(qtyCell), amount: n(amtCell) });
    if (CATS.includes(up) && n(qtyCell) > 0) categories.push({ name: label, qty: n(qtyCell), amount: n(amtCell) });
    if (!label || SKIP.has(up)) continue;
    const qty = n(qtyCell);
    const amt = n(amtCell);
    if (qty > 0 && amt > 0) menuItems.push({ name: label, qty, amount: amt, avg: parseFloat((amt / qty).toFixed(3)) });
  }
  menuItems.sort((a, b) => b.amount - a.amount);
  return { summary, serviceTypes, categories, menuItems, valid: summary.totalSales > 0 };
}

// Normalize a POS report into an array of [label, qty, amount] rows, regardless
// of whether it arrived as semicolon text or a binary spreadsheet.
function posRows(input) {
  if (typeof input === "string") {
    return input.trim().split("\n").map((l) => l.replace(/\r/g, "").trim().split(";"));
  }
  // Binary input (ArrayBuffer / typed array). Sniff the magic bytes: a real
  // spreadsheet is a ZIP (.xlsx → "PK") or OLE compound file (.xls). Anything
  // else is treated as a text/CSV export delivered as bytes.
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const isXlsx = bytes[0] === 0x50 && bytes[1] === 0x4b; // PK..
  const isXls = bytes[0] === 0xd0 && bytes[1] === 0xcf;  // legacy OLE
  if (isXlsx || isXls) {
    const wb = XLSX.read(bytes, { type: "array" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    return XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true });
  }
  const text = new TextDecoder().decode(bytes);
  return text.trim().split("\n").map((l) => l.replace(/\r/g, "").trim().split(";"));
}

// Barista WhatsApp message: free-text with labelled sections.
export function parseBarista(text) {
  if (!text) return null;
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);

  const extractNum = (line) => {
    const m = line.match(/[:=]\s*([\d.,]+)/);
    return m ? parseFloat(m[1].replace(/,/g, "")) : null;
  };
  // Grams from the amount at the END of a line, converting kg→g (default grams).
  // End-anchored so a colon inside the name (e.g. "Blend 70:30 : 400g") doesn't
  // get mistaken for the quantity separator.
  const extractGrams = (line) => {
    const m = line.match(/([\d.,]+)\s*(kg|kilos?|kilograms?|g|gm|grams?)?\s*$/i);
    if (!m) return null;
    const val = parseFloat(m[1].replace(/,/g, ""));
    if (isNaN(val)) return null;
    return /^k/i.test(m[2] || "") ? val * 1000 : val;
  };
  const extractLabel = (line) =>
    line
      .replace(/[🔹🔸▪️✓✔☑️•]/g, "")
      .replace(/^\s*\d+[.)]\s*/, "") // leading "1." / "2)" list markers
      .replace(/[:=]?\s*[\d.,]+\s*(kg|kilos?|kilograms?|g|gm|grams?)?\s*$/i, "") // trailing quantity
      .trim()
      .replace(/\s+/g, " ");

  let section = "";
  const purchased = [], remaining = [], dairy = [], spoilage = [], sweets = [];
  const beansPurchasedList = [], beansRemainingList = [], beansBeginningList = [];
  let sweetsTotal = null, beansBegin = null, beansAdded = 0, beansEnd = null;

  for (const line of lines) {
    const up = line.toUpperCase();
    // Beans-specific sections (per-type quantity lists) take priority over the
    // generic purchased/remaining sections so "PURCHASED BEANS" and
    // "COFFEE BEANS REMAINING STOCK" are not mistaken for milk/cups lists.
    if (up.includes("BEANS") && (up.includes("PURCHAS") || up.includes("BOUGHT") || up.includes("ADDED"))) { section = "beansPurchased"; continue; }
    if (up.includes("BEANS") && (up.includes("REMAIN") || up.includes("LEFT") || up.includes("CLOSING") || up.includes("END"))) { section = "beansRemaining"; continue; }
    if (up.includes("BEANS") && (up.includes("BEGIN") || up.includes("OPENING") || up.includes("START"))) { section = "beansBeginning"; continue; }
    if (up.includes("COFFEE BEANS") || up.includes("BEANS STOCK") || (up.includes("BEANS") && up.includes("STOCK"))) { section = "beans"; continue; }
    if (up.includes("PURCHASED")) { section = "purchased"; continue; }
    if (up.includes("REMAINING")) { section = "remaining"; continue; }
    if (up.includes("DAIRY")) { section = "dairy"; continue; }
    if (up.includes("SALES")) { section = "sales"; continue; }
    if (up.includes("SWEETS")) { section = "sweets"; continue; }
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
    if (section === "beansPurchased" || section === "beansRemaining" || section === "beansBeginning") {
      const g = extractGrams(line);
      if (g !== null && label) {
        const entry = { item: label, grams: g };
        if (section === "beansPurchased") beansPurchasedList.push(entry);
        else if (section === "beansRemaining") beansRemainingList.push(entry);
        else beansBeginningList.push(entry);
      }
    }
    if (section === "beans") {
      const g = extractGrams(line);
      if (g !== null) {
        if (up.includes("BEGIN") || up.includes("START") || up.includes("OPENING")) beansBegin = g;
        else if (up.includes("ADD") || up.includes("MID") || up.includes("PURCHAS") || up.includes("BOUGHT")) beansAdded += g;
        else if (up.includes("END") || up.includes("CLOSING") || up.includes("REMAIN") || up.includes("LEFT")) beansEnd = g;
      }
    }
  }

  // Sum the per-type lists, then fall back to them when the aggregate
  // begin/added/end keyword figures were not provided.
  const sum = (list) => list.reduce((s, r) => s + r.grams, 0);
  const beansPurchased = sum(beansPurchasedList);
  const beansRemaining = sum(beansRemainingList);
  const beansBeginning = sum(beansBeginningList);
  if (beansBegin === null && beansBeginningList.length) beansBegin = beansBeginning;
  if (beansAdded === 0 && beansPurchasedList.length) beansAdded = beansPurchased;
  if (beansEnd === null && beansRemainingList.length) beansEnd = beansRemaining;

  return {
    purchased, remaining, dairy, spoilage, sweets, sweetsTotal,
    beansBegin, beansAdded, beansEnd,
    beansPurchased, beansRemaining, beansBeginning,
    beansPurchasedList, beansRemainingList, beansBeginningList,
    raw: text,
  };
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
    // Use n() (not raw parseFloat) so amounts exported as formatted strings with
    // thousands separators are read correctly — parseFloat("1,234.500") is 1,
    // which would silently understate every comma-formatted debit/credit.
    const debit = n(row[6]);
    const credit = n(row[7]);
    const balance = n(row[8]);
    const type = debit > 0 ? "debit" : "credit";
    const amount = debit > 0 ? debit : credit;
    txns.push({ date: ds, desc: cleanNarr(narr), raw: narr, amount, type, balance });
  }
  return txns;
}

// Reconcile accountant totals against the POS summary. Accepts either the POS
// summary directly or the full parsePOS() result ({ summary, ... }).
export function reconcile(acct, pos) {
  const p = pos && pos.summary ? pos.summary : pos || {};
  const sm = (fn) => acct.reduce((s, r) => s + fn(r), 0);
  return {
    acctTotal: sm((r) => r.totalSale),
    acctCash: sm((r) => r.cash),
    acctCard: sm((r) => r.creditCard),
    acctNet: sm((r) => r.netSale),
    acctPurchase: sm((r) => r.purchase),
    salesVar: parseFloat((n(p.totalSales) - sm((r) => r.totalSale)).toFixed(3)),
    cashVar: parseFloat((n(p.cash) - sm((r) => r.cash)).toFixed(3)),
    cardVar: parseFloat((n(p.card) - sm((r) => r.creditCard)).toFixed(3)),
  };
}
