import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import { n, f, excelDate } from "../lib/format";
import { deriveMonthYear, yoy, HISTORICAL_SALES } from "../lib/sales";
import { parsePOS, parseBarista, reconcile, categorizeExpense } from "../lib/parsers";
import { calcBeans } from "../lib/beans";
import { generatePDF } from "../lib/pdf";

describe("format helpers", () => {
  it("coerces messy values to numbers", () => {
    expect(n("1,234.50 OMR")).toBeCloseTo(1234.5);
    expect(n("")).toBe(0);
    expect(n(null)).toBe(0);
    expect(n("-12.3")).toBeCloseTo(-12.3);
  });
  it("formats to 3 decimals", () => {
    expect(f(2)).toBe("2.000");
    expect(f("3.14159")).toBe("3.142");
  });
  it("normalizes dates", () => {
    expect(excelDate("2026-05-01")).toBe("2026-05-01");
    expect(excelDate("1/5/2026")).toBe("2026-05-01");
    expect(excelDate(45413)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(excelDate("not a date")).toBeNull();
  });
});

describe("deriveMonthYear / yoy", () => {
  it("parses a sheet name like 'MAY 2026'", () => {
    expect(deriveMonthYear("MAY 2026")).toEqual({ mo: 5, yr: 2026 });
  });
  it("returns null month when no month name is present", () => {
    expect(deriveMonthYear("Sheet1").mo).toBeNull();
  });
  it("computes year-on-year growth from historical data", () => {
    const prev = HISTORICAL_SALES[2025][5];
    const r = yoy("MAY 2026", prev * 1.1);
    expect(r.prev).toBeCloseTo(prev);
    expect(r.growth).toBeCloseTo(10, 1);
  });
  it("returns null growth when no prior-year data exists", () => {
    expect(yoy("MAY 2099", 1000).growth).toBeNull();
  });
});

describe("parsePOS", () => {
  const csv = [
    "TOTAL SALES:;;1000",
    "CASH;;400",
    "VISA;;500",
    "MASTERCARD;;100",
    "HOT COFFEE;50;300",
    "COLD COFFEE;30;200",
    "Cappuccino;40;240",
    "Latte;25;180",
    "DINE IN;10;600",
    "TAKEAWAY;5;400",
    "DISCOUNT;;20",
    "#RECEIPTS;;15",
    "#PAX;;20",
  ].join("\n");

  it("reads the summary totals", () => {
    const d = parsePOS(csv);
    expect(d.valid).toBe(true);
    expect(d.summary.totalSales).toBe(1000);
    expect(d.summary.cash).toBe(400);
    expect(d.summary.card).toBe(600);
  });
  it("collects categories and ranks menu items by revenue", () => {
    const d = parsePOS(csv);
    expect(d.categories.map((c) => c.name)).toContain("HOT COFFEE");
    expect(d.menuItems[0].amount).toBeGreaterThanOrEqual(d.menuItems[1].amount);
    expect(d.menuItems.find((m) => m.name === "Cappuccino").avg).toBeCloseTo(6);
  });
  it("reads the same report exported as a binary .xlsx", () => {
    // Build an .xlsx with the label/qty/amount layout the POS exports.
    const aoa = [
      ["Total Sales:", null, 2006.3],
      ["Order type", null, null],
      ["DINE IN", "433", 1727],
      ["TAKEAWAY", "95", 272.02],
      ["Category Summary", null, null],
      ["Hot Coffee", "384.00", 676.5],
      ["Cold Coffee", "256.00", 483.1],
      ["Menu Item", null, null],
      ["Americano", "121.00", 181.5],
      ["Cortado", "37.00", 62.9],
      ["Payment Summary", null, null],
      ["Cash", "30", 58.5],
      ["VISA", "498", 1940.52],
      ["Total", "528", 1999.02],
    ];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Page 1");
    const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" });

    const d = parsePOS(buf);
    expect(d.valid).toBe(true);
    // POS total is the money actually collected (Payment Summary total),
    // not gross Total Sales which still includes no-charge items.
    expect(d.summary.totalSales).toBeCloseTo(1999.02);
    expect(d.summary.grossSales).toBeCloseTo(2006.3);
    expect(d.summary.cash).toBeCloseTo(58.5);
    expect(d.summary.card).toBeCloseTo(1940.52); // VISA + MASTERCARD
    expect(d.categories.map((c) => c.name)).toContain("Hot Coffee");
    expect(d.serviceTypes.find((s) => s.name === "DINE IN").amount).toBeCloseTo(1727);
    expect(d.menuItems.find((m) => m.name === "Americano").qty).toBe(121);
  });
});

describe("parseBarista", () => {
  const msg = [
    "PURCHASED",
    "Milk : 20",
    "REMAINING",
    "Cups : 500",
    "SPOILAGE",
    "Croissant : 3",
    "COFFEE BEANS STOCK",
    "Beginning stock : 1kg",
    "Added mid-month : 1000g",
    "End of month : 200g",
  ].join("\n");

  it("extracts sections and bean stock with unit conversion", () => {
    const b = parseBarista(msg);
    expect(b.purchased).toEqual([{ item: "Milk", qty: 20 }]);
    expect(b.spoilage).toEqual([{ item: "Croissant", qty: 3 }]);
    expect(b.beansBegin).toBe(1000); // 1kg -> 1000g
    expect(b.beansAdded).toBe(1000);
    expect(b.beansEnd).toBe(200);
  });
});

describe("reconcile", () => {
  it("sums accountant rows and computes variances vs POS", () => {
    const acct = [
      { totalSale: 500, cash: 200, creditCard: 300, netSale: 480, purchase: 20 },
      { totalSale: 500, cash: 200, creditCard: 300, netSale: 480, purchase: 20 },
    ];
    const r = reconcile(acct, { totalSales: 1000, cash: 400, card: 600 });
    expect(r.acctTotal).toBe(1000);
    expect(r.salesVar).toBe(0);
    expect(r.cashVar).toBe(0);
    expect(r.cardVar).toBe(0);
  });
  it("computes a non-zero variance from the full parsePOS result shape", () => {
    // The app passes the wrapped { summary, ... } object; variance must still
    // be real numbers, not NaN silently formatted as 0.
    const acct = [{ totalSale: 1928.7, cash: 100, creditCard: 1828.7, netSale: 1740.05, purchase: 188.65 }];
    const pos = { summary: { totalSales: 2006.3, cash: 58.5, card: 1940.52 } };
    const r = reconcile(acct, pos);
    expect(r.salesVar).toBeCloseTo(77.6);
    expect(Number.isNaN(r.salesVar)).toBe(false);
  });
});

describe("categorizeExpense", () => {
  it("buckets common bank narrations", () => {
    expect(categorizeExpense("Monthly Salary transfer")).toBe("Salaries");
    expect(categorizeExpense("Value Added Tax payment")).toBe("Tax (VAT)");
    expect(categorizeExpense("SWIFT CHARGES")).toBe("Bank Charges");
    expect(categorizeExpense("Transfer to supplier")).toBe("Transfers / Suppliers");
    expect(categorizeExpense("ACH Inward")).toBe("Transfers / Suppliers");
    expect(categorizeExpense("Reversal adjustment")).toBe("Adjustments");
    expect(categorizeExpense("Some misc payment")).toBe("Other");
  });
});

describe("calcBeans", () => {
  const posData = {
    categories: [
      { name: "HOT COFFEE", qty: 50 },
      { name: "COLD COFFEE", qty: 30 },
    ],
    menuItems: [{ name: "Matcha Latte", qty: 10 }],
  };

  it("subtracts non-coffee items and flags discrepancy status", () => {
    // 80 coffee-category drinks - 10 matcha = 70 -> 70*20 = 1400g expected.
    const b = calcBeans(posData, { beansBegin: 2000, beansAdded: 0, beansEnd: 600 });
    expect(b.totalCoffeeDrinks).toBe(70);
    expect(b.beansConsumedCalc).toBe(1400);
    expect(b.beansConsumedActual).toBe(1400);
    expect(b.status).toBe("ok");
  });
  it("reports unknown status when stock data is missing", () => {
    const b = calcBeans(posData, null);
    expect(b.discrepancy).toBeNull();
    expect(b.status).toBe("unknown");
  });
});

describe("generatePDF", () => {
  const rec = {
    acctTotal: 1560.5, acctCash: 600, acctCard: 960.5, acctNet: 1400, acctPurchase: 160.5,
    salesVar: 0, cashVar: 0, cardVar: 0,
  };
  const posData = {
    summary: { totalSales: 1560.5, cash: 600, visa: 700, mastercard: 260.5, card: 960.5, discount: 20, tips: 15, receipts: 244, pax: 380, netSales: 1560.5 },
    categories: [ { name: "HOT COFFEE", qty: 300, amount: 900 }, { name: "COLD COFFEE", qty: 200, amount: 660.5 } ],
    serviceTypes: [ { name: "DINE IN", qty: 150, amount: 950 }, { name: "TAKEAWAY", qty: 94, amount: 610.5 } ],
    menuItems: [ { name: "Latte", qty: 120, amount: 480, avg: 4 }, { name: "Espresso", qty: 90, amount: 270, avg: 3 } ],
  };
  const bankTxns = [
    { date: "01/05/2026", desc: "Monthly Salary", raw: "Monthly Salary", amount: 420, type: "debit", balance: 0 },
    { date: "10/05/2026", desc: "VAT Payment", raw: "Value Added Tax", amount: 180, type: "debit", balance: 0 },
    { date: "15/05/2026", desc: "Transfer — Beans Supplier", raw: "Transfer to supplier", amount: 200, type: "debit", balance: 0 },
  ];
  const baristaData = { beansBegin: 1000, beansAdded: 1000, beansEnd: 200, spoilage: [] };

  const html = generatePDF("# Report\nSome analysis.", rec, posData, bankTxns, "MAY 2026", [], baristaData);

  it("renders all new data-representation sections", () => {
    expect(html).toContain("Profit Margin");
    expect(html).toContain("Avg / Receipt");
    expect(html).toContain("Monthly Sales — Year on Year");
    expect(html).toContain("<svg");
    expect(html).toContain("2026 (this year)");
    expect(html).toContain("Revenue by Category");
    expect(html).toContain("Payment Mix");
    expect(html).toContain("Expenses by Category");
    expect(html).toContain("Coffee Beans Analysis");
  });
  it("groups expenses by category with a total", () => {
    expect(html).toContain("Salaries");
    expect(html).toContain("Tax (VAT)");
    expect(html).toContain("Transfers / Suppliers");
    expect(html).toContain("TOTAL EXPENSES");
  });
  it("omits the beans section when no stock data is provided", () => {
    const noBeans = generatePDF("x", rec, posData, bankTxns, "MAY 2026", [], { spoilage: [] });
    expect(noBeans).not.toContain("Coffee Beans Analysis");
  });
  it("renders a markdown table in the report body as an HTML table, not raw pipes", () => {
    const md = [
      "## SALES RECONCILIATION",
      "",
      "| Item | Accountant | POS | Variance |",
      "|---|---|---|---|",
      "| Cash | 52.900 OMR | 58.500 OMR | +5.600 OMR |",
      "| Card | 1,875.800 OMR | 1,940.520 OMR | +64.720 OMR |",
      "| **Total** | 1,928.700 OMR | 1,999.020 OMR | +70.320 OMR |",
    ].join("\n");
    const out = generatePDF(md, rec, posData, bankTxns, "MAY 2026", [], baristaData);
    expect(out).toContain('<table class="md-table">');
    expect(out).toContain("<th>Accountant</th>");
    expect(out).toContain("<td>+5.600 OMR</td>");
    expect(out).toContain('<tr class="total">');
    // the raw markdown row must not survive as a paragraph
    expect(out).not.toContain("<p>| Cash | 52.900");
  });
});
