// Owner-report document generation.
//  - generatePDF: builds the branded, print-ready HTML (used by "View PDF" and
//    as the source for the WhatsApp attachment).
//  - htmlToPdfBase64: rasterizes that HTML into a multi-page A4 PDF (base64) for
//    the WhatsApp document header. Page breaks are chosen on whitespace rows so
//    text/cards are not sliced through the middle.
import { yoy, deriveMonthYear, HISTORICAL_SALES, YEARS, MONTH_NAMES } from "./sales";
import { calcBeans, GRAMS_PER_DRINK } from "./beans";
import { categorizeExpense } from "./parsers";

export function generatePDF(aiReport, rec, posData, bankTxns, acctSheet, acctIssues, baristaData) {
  const deb = bankTxns ? bankTxns.filter((t) => t.type === "debit") : [];
  const totExp = deb.reduce((s, t) => s + t.amount, 0);
  const profit = totExp > 0 ? (rec.acctNet - totExp).toFixed(3) : null;
  const top5 = posData.menuItems.slice(0, 5);

  const currSales = posData.summary.totalSales;
  const { yr, prev: prevSales, growth } = yoy(acctSheet, currSales);

  const mdToHtml = (text) => {
    if (!text) return "";
    return text
      .split("\n")
      .map((line) => {
        if (line.startsWith("### ")) return `<h3>${line.slice(4)}</h3>`;
        if (line.startsWith("## ")) return `<h2>${line.slice(3)}</h2>`;
        if (line.startsWith("# ")) return `<h1>${line.slice(2)}</h1>`;
        if (line.trim() === "---") return `<hr/>`;
        if (line.trim() === "") return `<br/>`;
        if (line.startsWith("- ") || line.startsWith("• ")) return `<li>${line.slice(2).replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")}</li>`;
        const numMatch = line.match(/^(\d+)\.\s+(.+)/);
        if (numMatch) return `<li class="num"><span class="num-marker">${numMatch[1]}.</span>${numMatch[2].replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")}</li>`;
        return `<p>${line.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")}</p>`;
      })
      .join("\n");
  };

  // ── Number formatting (thousands separators for readability) ──────────
  const fx = (v) => (v ?? 0).toLocaleString("en-US", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
  const f2 = (v) => (v ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // Horizontal bar row used by the chart cards.
  const barRow = (label, val, max, color, valText) => `
    <div class="bar-row">
      <div class="bar-label">${label}</div>
      <div class="bar-track"><div class="bar-fill" style="width:${max > 0 ? Math.max(2, (val / max) * 100) : 0}%;background:${color}"></div></div>
      <div class="bar-val">${valText}</div>
    </div>`;

  // ── KPI / margin band ────────────────────────────────────────────────
  const net = rec.acctNet;
  const profitNum = totExp > 0 ? net - totExp : null;
  const margin = profitNum !== null && net > 0 ? (profitNum / net) * 100 : null;
  const expRatio = totExp > 0 && net > 0 ? (totExp / net) * 100 : null;
  const receipts = posData.summary.receipts || 0;
  const pax = posData.summary.pax || 0;
  const avgReceipt = receipts > 0 ? currSales / receipts : null;
  const avgGuest = pax > 0 ? currSales / pax : null;
  const svc = posData.serviceTypes || [];
  const dineIn = svc.find((s) => s.name.toUpperCase().includes("DINE"))?.amount || 0;
  const takeaway = svc.find((s) => s.name.toUpperCase().includes("TAKE"))?.amount || 0;
  const svcTot = dineIn + takeaway;

  const kpiTiles = [
    ["Profit Margin", margin !== null ? margin.toFixed(1) + "%" : "N/A"],
    ["Expense Ratio", expRatio !== null ? expRatio.toFixed(1) + "%" : "N/A"],
    ["Avg / Receipt", avgReceipt !== null ? f2(avgReceipt) + " OMR" : "—"],
    ["Avg / Guest", avgGuest !== null ? f2(avgGuest) + " OMR" : "—"],
  ];
  const kpiBandHtml = `
  <div class="kpi-row">
    ${kpiTiles.map(([l, v]) => `<div class="kpi"><div class="v">${v}</div><div class="l">${l}</div></div>`).join("")}
  </div>
  ${svcTot > 0 ? `
  <div class="kpi-row" style="grid-template-columns:1fr 1fr">
    <div class="kpi"><div class="v">${((dineIn / svcTot) * 100).toFixed(0)}%</div><div class="l">Dine-in · ${f2(dineIn)} OMR</div></div>
    <div class="kpi"><div class="v">${((takeaway / svcTot) * 100).toFixed(0)}%</div><div class="l">Takeaway · ${f2(takeaway)} OMR</div></div>
  </div>` : ""}`;

  // ── Month-across-years chart ─────────────────────────────────────────
  const { mo } = deriveMonthYear(acctSheet);
  let monthChartHtml = "";
  if (mo) {
    const series = YEARS.map((y) => ({ y, v: y === yr ? currSales : HISTORICAL_SALES[y]?.[mo] ?? null })).filter((s) => s.v !== null);
    if (series.length >= 2) {
      const max = Math.max(...series.map((s) => s.v));
      monthChartHtml = `
  <div class="card no-break">
    <div class="card-title">📈 ${MONTH_NAMES[mo - 1]} Sales — Year on Year</div>
    ${series.map((s) => barRow(String(s.y), s.v, max, s.y === yr ? "#1e3d2f" : "#c8952a", f2(s.v) + " OMR")).join("")}
  </div>`;
    }
  }

  // ── Revenue by category chart ────────────────────────────────────────
  const cats = (posData.categories || []).slice().sort((a, b) => b.amount - a.amount);
  let categoryChartHtml = "";
  if (cats.length) {
    const max = Math.max(...cats.map((c) => c.amount));
    categoryChartHtml = `
  <div class="card no-break">
    <div class="card-title">📊 Revenue by Category</div>
    ${cats.map((c) => barRow(c.name, c.amount, max, "#1a8080", `${f2(c.amount)} OMR · ${((c.amount / currSales) * 100).toFixed(0)}%`)).join("")}
  </div>`;
  }

  // ── Payment mix chart ────────────────────────────────────────────────
  const pays = [
    ["Cash", posData.summary.cash, "#8a6518"],
    ["VISA", posData.summary.visa, "#1e3d2f"],
    ["Mastercard", posData.summary.mastercard, "#1a3d4f"],
  ].filter((p) => p[1] > 0);
  let paymentMixHtml = "";
  if (pays.length) {
    const max = Math.max(...pays.map((p) => p[1]));
    paymentMixHtml = `
  <div class="card no-break">
    <div class="card-title">💳 Payment Mix</div>
    ${pays.map(([l, v, c]) => barRow(l, v, max, c, f2(v) + " OMR")).join("")}
    <div style="margin-top:10px;font-size:11px;color:#7a6e5e">Discounts: ${f2(posData.summary.discount)} OMR · Tips: ${f2(posData.summary.tips)} OMR · Net Sales: ${f2(posData.summary.netSales)} OMR</div>
  </div>`;
  }

  // ── Categorized expenses + transaction list ──────────────────────────
  let expensesHtml = "";
  if (deb.length) {
    const groups = {};
    deb.forEach((t) => { const k = categorizeExpense(t.raw || t.desc); groups[k] = (groups[k] || 0) + t.amount; });
    const rows = Object.entries(groups).sort((a, b) => b[1] - a[1]);
    const expToNet = net > 0 ? (totExp / net) * 100 : null;
    expensesHtml = `
  <div class="card no-break">
    <div class="card-title">💸 Expenses by Category</div>
    <table>
      <thead><tr><th class="l">Category</th><th>Amount (OMR)</th><th>Share</th></tr></thead>
      <tbody>${rows.map(([k, v]) => `<tr><td class="l">${k}</td><td style="color:#c0392b;font-weight:600">${fx(v)}</td><td>${((v / totExp) * 100).toFixed(0)}%</td></tr>`).join("")}</tbody>
      <tfoot><tr><td class="l">TOTAL EXPENSES</td><td style="color:#c0392b">${fx(totExp)}</td><td>${expToNet !== null ? expToNet.toFixed(0) + "% of net" : "—"}</td></tr></tfoot>
    </table>
  </div>
  <div class="card no-break">
    <div class="card-title">💸 Expense Transactions (${deb.length})</div>
    <table>
      <thead><tr><th class="l">Date</th><th class="l">Description</th><th class="l">Category</th><th>Amount (OMR)</th></tr></thead>
      <tbody>${deb.map((t) => `<tr><td class="l">${t.date}</td><td class="l">${t.desc}</td><td class="l" style="font-size:10px;color:#7a6e5e">${categorizeExpense(t.raw || t.desc)}</td><td style="color:#c0392b;font-weight:600">${t.amount.toFixed(3)}</td></tr>`).join("")}</tbody>
      <tfoot><tr><td class="l" colspan="3">TOTAL</td><td style="color:#c0392b">${totExp.toFixed(3)}</td></tr></tfoot>
    </table>
  </div>`;
  }

  // ── Coffee beans analysis (only when barista stock data was provided) ─
  const beans = calcBeans(posData, baristaData);
  let beansHtml = "";
  if (beans && baristaData && (baristaData.beansBegin != null || baristaData.beansEnd != null)) {
    const stColors = { ok: "#2d6e4e", warn: "#8a6518", bad: "#c0392b", unknown: "#7a6e5e" };
    const stLabel = { ok: "✓ Within tolerance (±5%)", warn: "△ Minor discrepancy (5–15%)", bad: "⚠ Significant discrepancy (>15%)", unknown: "? Insufficient stock data" };
    const c = stColors[beans.status];
    beansHtml = `
  <div class="card no-break">
    <div class="card-title">☕ Coffee Beans Analysis</div>
    <table>
      <thead><tr><th class="l">Metric</th><th>Value</th></tr></thead>
      <tbody>
        <tr><td class="l">Coffee drinks sold</td><td>${beans.totalCoffeeDrinks}</td></tr>
        <tr><td class="l">Expected consumption (${GRAMS_PER_DRINK}g/drink)</td><td>${beans.beansConsumedCalc} g</td></tr>
        <tr><td class="l">Actual consumption (from stock)</td><td>${beans.beansConsumedActual !== null ? beans.beansConsumedActual + " g" : "—"}</td></tr>
        ${beans.totalAvailable !== null ? `<tr><td class="l">Stock flow (open + added − close)</td><td>${beans.begin} g + ${beans.added} g − ${beans.end} g</td></tr>` : ""}
        <tr><td class="l">Discrepancy</td><td style="color:${c};font-weight:700">${beans.discrepancy !== null ? (beans.discrepancy >= 0 ? "+" : "") + beans.discrepancy + " g" + (beans.discPct !== null ? " (" + beans.discPct + "%)" : "") : "N/A"}</td></tr>
      </tbody>
    </table>
    <div style="margin-top:12px;padding:10px 14px;border-radius:6px;background:#f7f4ee;border-left:4px solid ${c}">
      <span style="font-family:Montserrat,sans-serif;font-weight:700;color:${c};font-size:12px">${stLabel[beans.status]}</span>
      ${beans.status !== "ok" && beans.discrepancy !== null ? `<div style="font-size:11px;color:#7a6e5e;margin-top:3px">${beans.discrepancy > 0 ? Math.abs(beans.discrepancy) + "g more than expected — possible waste, spills, or unrecorded drinks" : Math.abs(beans.discrepancy) + "g less than expected — possible stocktake error or unrecorded stock"}</div>` : ""}
    </div>
  </div>`;
  }

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8"/>
<title>The Peak — ${acctSheet} Owner Report</title>
<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@600;700;800&family=Source+Sans+3:wght@400;600&display=swap" rel="stylesheet"/>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Source Sans 3',sans-serif;font-size:13px;color:#1a1a16;background:#fff;line-height:1.6}
  @page{size:A4;margin:0}
  @media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}

  /* Header */
  .header{background:#1e3d2f;padding:0;page-break-inside:avoid}
  .header-bar{height:5px;background:linear-gradient(90deg,#c8952a,#e4b44a,#c8952a)}
  .header-inner{padding:24px 36px;display:flex;justify-content:space-between;align-items:center}
  .header-left .shop{font-size:10px;letter-spacing:.4em;color:#e4b44a;text-transform:uppercase;font-family:Montserrat,sans-serif;font-weight:600;margin-bottom:5px}
  .header-left h1{font-size:26px;font-weight:800;color:#fff;font-family:Montserrat,sans-serif}
  .header-left .sub{font-size:11px;color:rgba(255,255,255,.5);margin-top:3px}
  .header-right{text-align:right;color:#e4b44a;font-family:Montserrat,sans-serif;font-weight:700;font-size:14px;letter-spacing:.06em}

  /* Body */
  .body{padding:28px 36px}

  /* Stats row */
  .stats-row{display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-bottom:20px}
  .stat{border:1px solid #d0c8b8;border-top:3px solid #c8952a;border-radius:6px;padding:12px 8px;text-align:center;page-break-inside:avoid}
  .stat .val{font-size:16px;font-weight:700;color:#1e3d2f;font-family:Montserrat,sans-serif;margin-bottom:2px}
  .stat .sub{font-size:10px;color:#7a6e5e;margin-bottom:2px}
  .stat .lbl{font-size:8px;color:#7a6e5e;letter-spacing:.1em;text-transform:uppercase;font-family:Montserrat,sans-serif;font-weight:600}

  /* KPI tiles */
  .kpi-row{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:20px}
  .kpi{background:#f7f4ee;border:1px solid #d0c8b8;border-radius:6px;padding:10px 8px;text-align:center;page-break-inside:avoid}
  .kpi .v{font-size:15px;font-weight:700;color:#1e3d2f;font-family:Montserrat,sans-serif}
  .kpi .l{font-size:8px;color:#7a6e5e;letter-spacing:.06em;text-transform:uppercase;font-family:Montserrat,sans-serif;font-weight:600;margin-top:3px}

  /* Bar charts */
  .bar-row{display:flex;align-items:center;gap:10px;margin-bottom:7px}
  .bar-label{width:118px;font-size:10px;color:#1a1a16;text-align:right;font-family:Montserrat,sans-serif;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .bar-track{flex:1;background:#ede8df;border-radius:3px;height:16px;overflow:hidden}
  .bar-fill{height:100%;border-radius:3px}
  .bar-val{width:160px;font-size:10px;color:#1a1a16;text-align:right;font-family:Montserrat,sans-serif;font-weight:600;white-space:nowrap}

  /* YoY banner */
  .yoy{background:#e8f4ed;border:2px solid #b8d8c4;border-radius:8px;padding:16px 20px;margin-bottom:20px;display:flex;justify-content:space-between;align-items:center;page-break-inside:avoid}
  .yoy-left .label{font-size:9px;letter-spacing:.25em;color:#2d6e4e;text-transform:uppercase;font-family:Montserrat,sans-serif;font-weight:700;margin-bottom:4px}
  .yoy-left .growth{font-size:20px;font-weight:800;color:#2d6e4e;font-family:Montserrat,sans-serif}
  .yoy-boxes{display:flex;gap:10px;align-items:center}
  .yoy-box{background:#fff;border-radius:6px;padding:10px 16px;text-align:center;min-width:100px;border:1px solid #d0c8b8}
  .yoy-box.curr{border:2px solid #2d6e4e}
  .yoy-box .yr{font-size:9px;color:#7a6e5e;letter-spacing:.1em;text-transform:uppercase;font-family:Montserrat,sans-serif;font-weight:600;margin-bottom:3px}
  .yoy-box .amount{font-size:17px;font-weight:700;color:#1e3d2f;font-family:Montserrat,sans-serif}
  .yoy-box.curr .amount{color:#2d6e4e}
  .yoy-box .omr{font-size:10px;color:#7a6e5e}
  .arrow{font-size:18px;color:#7a6e5e}

  /* Section card */
  .card{border:1px solid #d0c8b8;border-radius:8px;padding:18px;margin-bottom:16px;page-break-inside:avoid}
  .card-title{font-size:9px;letter-spacing:.3em;color:#1e3d2f;text-transform:uppercase;font-family:Montserrat,sans-serif;font-weight:700;margin-bottom:12px;padding-bottom:8px;border-bottom:2px solid #c8952a}

  /* Table */
  table{width:100%;border-collapse:collapse;margin-bottom:0}
  th{font-size:8px;letter-spacing:.12em;color:#1e3d2f;text-transform:uppercase;padding:8px 10px;font-weight:700;border-bottom:2px solid #c8952a;background:#ede8df;font-family:Montserrat,sans-serif;text-align:right}
  th.l{text-align:left}
  td{padding:7px 10px;font-size:12px;border-bottom:1px solid #e4ddd1;text-align:right;color:#1a1a16}
  td.l{text-align:left}
  tfoot td{font-weight:700;font-family:Montserrat,sans-serif;color:#1e3d2f;border-top:2px solid #c8952a;border-bottom:none;background:#ede8df}

  /* Report text */
  .report-body h1{font-size:18px;font-weight:800;color:#1e3d2f;font-family:Montserrat,sans-serif;margin:16px 0 8px}
  .report-body h2{font-size:15px;font-weight:700;color:#1e3d2f;font-family:Montserrat,sans-serif;margin:14px 0 6px}
  .report-body h3{font-size:10px;letter-spacing:.25em;color:#1e3d2f;text-transform:uppercase;font-family:Montserrat,sans-serif;font-weight:700;margin:20px 0 10px;padding-bottom:6px;border-bottom:2px solid #c8952a}
  .report-body p{font-size:13px;color:#1a1a16;line-height:1.85;margin-bottom:6px}
  .report-body li{font-size:13px;color:#1a1a16;line-height:1.75;margin-bottom:3px;padding-left:16px;list-style:none;position:relative}
  .report-body li::before{content:"•";color:#c8952a;font-weight:700;position:absolute;left:0}
  .report-body li.num::before{content:""}
  .report-body li .num-marker{color:#c8952a;font-weight:700;font-family:Montserrat,sans-serif;margin-right:6px}
  .report-body strong{font-weight:700;color:#1e3d2f;font-family:Montserrat,sans-serif}
  .report-body hr{border:none;border-top:1px solid #d0c8b8;margin:12px 0}
  .report-body br{display:block;margin:4px 0}

  /* Tag */
  .tag{display:inline-block;padding:2px 8px;border-radius:12px;font-size:9px;font-family:Montserrat,sans-serif;font-weight:700}
  .tag-ok{background:#e8f4ed;color:#2d6e4e;border:1px solid #b8d8c4}
  .tag-warn{background:#fef8ec;color:#8a6518;border:1px solid #e8d8a0}
  .tag-bad{background:#fdf0ee;color:#c0392b;border:1px solid #e8c4be}

  /* Footer */
  .footer{margin-top:24px;padding-top:12px;border-top:2px solid #d0c8b8;display:flex;justify-content:space-between;align-items:center;font-size:10px;color:#a89e8e}
  .footer .brand{font-family:Montserrat,sans-serif;font-weight:700;color:#1e3d2f}

  /* Page break helpers */
  .page-break{page-break-before:always}
  .no-break{page-break-inside:avoid}
</style>
</head>
<body>

<div class="header">
  <div class="header-bar"></div>
  <div class="header-inner">
    <div class="header-left">
      <div class="shop">The Peak Coffee Shop</div>
      <h1>Monthly Owner Report</h1>
      <div class="sub">Confidential — For Owners Only</div>
    </div>
    <div class="header-right">
      <svg width="60" height="30" viewBox="0 0 72 36" fill="none"><path d="M4 28 Q14 8 22 20 Q30 32 40 14 Q50 2 58 16 Q64 26 68 24" stroke="#e4b44a" stroke-width="2.5" stroke-linecap="round" fill="none" opacity="0.75"/></svg>
      <div>${acctSheet}</div>
      <div style="font-size:10px;color:rgba(255,255,255,.4);font-weight:400;margin-top:2px">Generated ${new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}</div>
    </div>
  </div>
</div>

<div class="body">

  <!-- YoY Banner -->
  ${growth !== null ? `
  <div class="yoy">
    <div class="yoy-left">
      <div class="label">Year-on-Year Sales Comparison</div>
      <div class="growth">${growth >= 0 ? "▲" : "▼"} ${growth}% growth vs same month last year</div>
    </div>
    <div class="yoy-boxes">
      <div class="yoy-box">
        <div class="yr">${yr - 1}</div>
        <div class="amount">${prevSales.toFixed(2)}</div>
        <div class="omr">OMR</div>
      </div>
      <div class="arrow">→</div>
      <div class="yoy-box curr">
        <div class="yr">${yr}</div>
        <div class="amount">${currSales.toFixed(2)}</div>
        <div class="omr">OMR</div>
      </div>
    </div>
  </div>` : ""}

  <!-- Key Stats -->
  <div class="stats-row">
    <div class="stat"><div class="val">${rec.acctTotal.toFixed(3)}</div><div class="sub">OMR</div><div class="lbl">Accountant Total</div></div>
    <div class="stat"><div class="val">${currSales.toFixed(3)}</div><div class="sub">OMR</div><div class="lbl">POS Total</div></div>
    <div class="stat"><div class="val">${rec.acctNet.toFixed(3)}</div><div class="sub">OMR</div><div class="lbl">Net Sales</div></div>
    <div class="stat" style="border-top-color:#8a6518"><div class="val" style="color:#8a6518">${rec.acctPurchase.toFixed(3)}</div><div class="sub">OMR</div><div class="lbl">Purchases</div></div>
    <div class="stat" style="border-top-color:${profit ? "#2d6e4e" : "#a89e8e"}"><div class="val" style="color:${profit ? "#2d6e4e" : "#a89e8e"}">${profit || "N/A"}</div><div class="sub">${profit ? "OMR" : ""}</div><div class="lbl">Est. Profit</div></div>
  </div>

  <!-- KPI / margin band -->
  ${kpiBandHtml}

  <!-- Month-on-month sales chart -->
  ${monthChartHtml}

  <!-- Reconciliation Table -->
  <div class="card no-break">
    <div class="card-title">⚖ Sales Reconciliation — Accountant vs POS</div>
    <table>
      <thead><tr><th class="l">Metric</th><th>Accountant (OMR)</th><th>POS (OMR)</th><th>Variance</th><th>Status</th></tr></thead>
      <tbody>
        ${[
          ["Total Sales", rec.acctTotal, currSales, rec.salesVar],
          ["Cash", rec.acctCash, posData.summary.cash, rec.cashVar],
          ["Card", rec.acctCard, posData.summary.card, rec.cardVar],
        ]
          .map(
            ([lbl, a, p, v]) => `
        <tr>
          <td class="l">${lbl}</td>
          <td>${a.toFixed(3)}</td>
          <td>${p.toFixed(3)}</td>
          <td style="color:${Math.abs(v) > 10 ? "#c0392b" : Math.abs(v) > 2 ? "#8a6518" : "#7a6e5e"};font-weight:${Math.abs(v) > 2 ? 700 : 400}">${v >= 0 ? "+" : ""}${v.toFixed(3)}</td>
          <td><span class="tag ${Math.abs(v) > 10 ? "tag-bad" : Math.abs(v) > 2 ? "tag-warn" : "tag-ok"}">${Math.abs(v) > 10 ? "⚠ Flag" : Math.abs(v) > 2 ? "△ Minor" : "✓ Clear"}</span></td>
        </tr>`
          )
          .join("")}
        <tr style="opacity:.6"><td class="l">Net Sales <small>(POS is gross)</small></td><td>${rec.acctNet.toFixed(3)}</td><td>${posData.summary.netSales.toFixed(3)}</td><td>—</td><td>—</td></tr>
      </tbody>
    </table>
  </div>

  <!-- Revenue by category + payment mix charts -->
  ${categoryChartHtml}
  ${paymentMixHtml}

  <!-- Categorized expenses -->
  ${expensesHtml}

  <!-- Top Menu Items -->
  <div class="card no-break">
    <div class="card-title">☕ Top Menu Items by Revenue</div>
    <table>
      <thead><tr><th class="l">Rank</th><th class="l">Item</th><th>Qty Sold</th><th>Revenue (OMR)</th><th>% of Sales</th></tr></thead>
      <tbody>${top5
        .map(
          (item, i) => `
        <tr style="background:${i < 3 ? "rgba(200,149,42,.05)" : "transparent"}">
          <td class="l" style="font-family:Montserrat,sans-serif;font-weight:700;color:#c8952a">${i < 3 ? ["🥇", "🥈", "🥉"][i] : "#" + (i + 1)}</td>
          <td class="l" style="font-weight:${i < 3 ? 700 : 400}">${item.name}</td>
          <td>${item.qty}</td>
          <td style="font-weight:${i < 3 ? 700 : 400};color:${i < 3 ? "#1e3d2f" : "#1a1a16"}">${item.amount.toFixed(3)}</td>
          <td>${((item.amount / currSales) * 100).toFixed(1)}%</td>
        </tr>`
        )
        .join("")}
      </tbody>
    </table>
  </div>

  <!-- Coffee beans analysis -->
  ${beansHtml}

  <!-- Spoilage if available -->
  ${baristaData?.spoilage?.length ? `
  <div class="card no-break">
    <div class="card-title">⚠️ Spoilage Report</div>
    <table>
      <thead><tr><th class="l">Item</th><th>Qty</th></tr></thead>
      <tbody>${baristaData.spoilage.map((r) => `<tr><td class="l" style="color:#c0392b">${r.item}</td><td style="color:#c0392b;font-weight:700">${r.qty}</td></tr>`).join("")}</tbody>
    </table>
  </div>` : ""}

  <!-- Data Issues -->
  ${acctIssues.length ? `
  <div class="card no-break" style="border-color:#e8d8a0;border-left:4px solid #c8952a">
    <div class="card-title" style="color:#8a6518">△ Data Issues in Accountant File</div>
    ${acctIssues.map((i) => `<p style="color:#8a6518;margin-bottom:4px">• ${i.date}: ${i.issue}</p>`).join("")}
  </div>` : ""}

  <!-- Page break before AI report -->
  <div class="page-break"></div>

  <!-- AI Report -->
  <div class="card">
    <div class="card-title">📋 Full Analysis</div>
    <div class="report-body">${mdToHtml(aiReport)}</div>
  </div>

  <!-- Footer -->
  <div class="footer">
    <div><span class="brand">The Peak Coffee Shop</span> — Monthly Owner Report</div>
    <div>${acctSheet} • Generated ${new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}</div>
  </div>

</div>

<script>window.onload=()=>window.print();</script>
</body>
</html>`;

  return html;
}

// True if the given canvas row is (near) solid background — a safe place to cut.
function isBlankRow(data, width, y, step = 6) {
  const base = y * width * 4;
  for (let x = 0; x < width; x += step) {
    const i = base + x * 4;
    // Treat anything not near-white as content.
    if (data[i] < 248 || data[i + 1] < 248 || data[i + 2] < 248) return false;
  }
  return true;
}

// Choose a slice height that ends on a blank row, so cards/text are not cut
// mid-line. Falls back to the ideal height if no blank row is found nearby.
function safeSliceHeight(data, width, start, idealH, total) {
  if (start + idealH >= total) return total - start; // last page takes the rest
  const minH = Math.floor(idealH * 0.6); // avoid pages shorter than 60% of a page
  for (let h = idealH; h > minH; h--) {
    if (isBlankRow(data, width, start + h)) return h;
  }
  return idealH;
}

export async function htmlToPdfBase64(html) {
  const [{ jsPDF }, h2cMod] = await Promise.all([import("jspdf"), import("html2canvas")]);
  const html2canvas = h2cMod.default || h2cMod;

  const A4_W = 794; // A4 width at ~96dpi
  const iframe = document.createElement("iframe");
  iframe.style.cssText = `position:fixed;left:-10000px;top:0;width:${A4_W}px;height:1123px;border:0;`;
  document.body.appendChild(iframe);

  try {
    const idoc = iframe.contentDocument || iframe.contentWindow.document;
    idoc.open();
    // Strip the auto-print script so the hidden iframe doesn't open a print dialog.
    idoc.write(html.replace(/<script[\s\S]*?<\/script>/gi, ""));
    idoc.close();

    await new Promise((r) => (idoc.readyState === "complete" ? r() : (iframe.onload = r)));
    if (idoc.fonts?.ready) { try { await idoc.fonts.ready; } catch {} }
    await new Promise((r) => setTimeout(r, 400));

    const canvas = await html2canvas(idoc.body, {
      scale: 2,
      useCORS: true,
      backgroundColor: "#ffffff",
      windowWidth: A4_W,
      width: A4_W,
      height: idoc.body.scrollHeight,
      scrollX: 0,
      scrollY: 0,
    });

    const ctx = canvas.getContext("2d");
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);

    const doc = new jsPDF({ unit: "mm", format: "a4" });
    const imgWmm = 210;
    const pxPerMm = canvas.width / imgWmm;
    const pageHpx = Math.floor(297 * pxPerMm);
    let rendered = 0;
    let page = 0;
    while (rendered < canvas.height) {
      const sliceH = safeSliceHeight(data, canvas.width, rendered, Math.min(pageHpx, canvas.height - rendered), canvas.height);
      const slice = document.createElement("canvas");
      slice.width = canvas.width;
      slice.height = sliceH;
      slice.getContext("2d").drawImage(canvas, 0, rendered, canvas.width, sliceH, 0, 0, canvas.width, sliceH);
      if (page > 0) doc.addPage();
      doc.addImage(slice.toDataURL("image/jpeg", 0.92), "JPEG", 0, 0, imgWmm, sliceH / pxPerMm);
      rendered += sliceH;
      page++;
    }

    return doc.output("datauristring").split(",")[1];
  } finally {
    document.body.removeChild(iframe);
  }
}
