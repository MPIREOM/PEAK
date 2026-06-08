import { useState, useRef, useEffect } from "react";
import * as XLSX from "xlsx";

// Brand colors
const B = {
  forest:"#1e3d2f", gold:"#c8952a", goldL:"#e4b44a", teal:"#1a8080",
  cream:"#f5f0e8", white:"#ffffff", cream2:"#ede8df", cream3:"#e4ddd1",
  bord:"#d0c8b8", bordL:"#e4ddd1", txtD:"#1a1a16", txtM:"#7a6e5e", txtDim:"#a89e8e",
  sGreen:"#2d6e4e", sGreenBg:"#e8f4ed", sGreenBd:"#b8d8c4",
  sRed:"#c0392b",   sRedBg:"#fdf0ee",   sRedBd:"#e8c4be",
  sYell:"#8a6518",  sYellBg:"#fef8ec",  sYellBd:"#e8d8a0",
};

// ── HISTORICAL SALES DATA (2021–2026) ────────────────────────────────
const HISTORICAL_SALES = {
  2021: {9:1577.7, 10:789.25, 11:876.3, 12:969.4},
  2022: {1:798.58, 2:663.28, 3:927.2, 4:551.08, 5:2049.0, 6:1749.16, 7:3467.01, 8:2129.61, 9:1245.36, 10:1179.63, 11:1213.54, 12:1495.69},
  2023: {1:1168.48, 2:1081.7, 3:1084.23, 4:1276.97, 5:1196.09, 6:2318.01, 7:2184.83, 8:1791.34, 9:1281.66, 10:880.18, 11:1379.31, 12:1226.7},
  2024: {1:898.02, 2:821.75, 3:401.8, 4:1264.22, 5:1363.5, 6:2460.7, 7:2068.61, 8:1681.14, 9:1108.34, 10:891.44, 11:1173.94, 12:927.5},
  2025: {1:743.18, 2:752.2, 3:606.44, 4:2025.73, 5:1417.58, 6:2460.01, 7:2281.3, 8:2036.56, 9:1357.93, 10:1328.76, 11:1976.71, 12:1575.02},
  2026: {1:2043.34, 2:1372.7, 3:1427.78},
};
const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const YEARS = [2022,2023,2024,2025,2026];
const YEAR_COLORS = ["#1a8080","#c8952a","#1a3d4f","#2d6e4e","#1e3d2f"];

// Helpers
const n = v => { if(!v&&v!==0) return 0; const x=parseFloat(String(v).replace(/[^0-9.\-]/g,"")); return isNaN(x)?0:x; };
const f = v => n(v).toFixed(3);
const excelDate = v => {
  if(!v) return null;
  if(v instanceof Date) return v.toISOString().split("T")[0];
  if(typeof v==="number"&&v>40000) return new Date(Date.UTC(1899,11,30)+v*86400000).toISOString().split("T")[0];
  const s=String(v).trim();
  const iso=s.match(/^(\d{4})-(\d{2})-(\d{2})/); if(iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dmy=s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/); if(dmy) return `${dmy[3]}-${dmy[2].padStart(2,"0")}-${dmy[1].padStart(2,"0")}`;
  return null;
};

// ── PDF GENERATOR ────────────────────────────────────────────────────
function generatePDF(aiReport, rec, posData, bankTxns, acctSheet, acctIssues, baristaData) {
  const deb = bankTxns ? bankTxns.filter(t=>t.type==="debit") : [];
  const totExp = deb.reduce((s,t)=>s+t.amount, 0);
  const profit = totExp > 0 ? (rec.acctNet - totExp).toFixed(3) : null;
  const top5 = posData.menuItems.slice(0,5);

  // YoY from historical
  const MONS = ["JANUARY","FEBRUARY","MARCH","APRIL","MAY","JUNE","JULY","AUGUST","SEPTEMBER","OCTOBER","NOVEMBER","DECEMBER"];
  const mo = acctSheet ? MONS.findIndex(m=>acctSheet.toUpperCase().includes(m))+1 : null;
  const yrM = acctSheet ? acctSheet.match(/20(\d{2})/) : null;
  const yr = yrM ? parseInt("20"+yrM[1]) : new Date().getFullYear();
  const prevSales = mo ? (HISTORICAL_SALES[yr-1]?.[mo]||null) : null;
  const currSales = posData.summary.totalSales;
  const growth = prevSales ? parseFloat(((currSales-prevSales)/prevSales*100).toFixed(1)) : null;

  // Format the AI report text as HTML
  const mdToHtml = (text) => {
    if(!text) return "";
    return text.split("\n").map(line => {
      if(line.startsWith("### ")) return `<h3>${line.slice(4)}</h3>`;
      if(line.startsWith("## "))  return `<h2>${line.slice(3)}</h2>`;
      if(line.startsWith("# "))   return `<h1>${line.slice(2)}</h1>`;
      if(line.trim()==="---")     return `<hr/>`;
      if(line.trim()==="")        return `<br/>`;
      if(line.startsWith("- ")||line.startsWith("• ")) return `<li>${line.slice(2).replace(/\*\*([^*]+)\*\*/g,"<strong>$1</strong>")}</li>`;
      const numMatch = line.match(/^(\d+)\.\s+(.+)/);
      if(numMatch) return `<li class="num"><span class="num-marker">${numMatch[1]}.</span>${numMatch[2].replace(/\*\*([^*]+)\*\*/g,"<strong>$1</strong>")}</li>`;
      return `<p>${line.replace(/\*\*([^*]+)\*\*/g,"<strong>$1</strong>")}</p>`;
    }).join("\n");
  };

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
      <div style="font-size:10px;color:rgba(255,255,255,.4);font-weight:400;margin-top:2px">Generated ${new Date().toLocaleDateString("en-GB",{day:"numeric",month:"long",year:"numeric"})}</div>
    </div>
  </div>
</div>

<div class="body">

  <!-- YoY Banner -->
  ${growth!==null?`
  <div class="yoy">
    <div class="yoy-left">
      <div class="label">Year-on-Year Sales Comparison</div>
      <div class="growth">${growth>=0?"▲":"▼"} ${growth}% growth vs same month last year</div>
    </div>
    <div class="yoy-boxes">
      <div class="yoy-box">
        <div class="yr">${yr-1}</div>
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
  </div>`:""}

  <!-- Key Stats -->
  <div class="stats-row">
    <div class="stat"><div class="val">${(rec.acctTotal).toFixed(3)}</div><div class="sub">OMR</div><div class="lbl">Accountant Total</div></div>
    <div class="stat"><div class="val">${currSales.toFixed(3)}</div><div class="sub">OMR</div><div class="lbl">POS Total</div></div>
    <div class="stat"><div class="val">${(rec.acctNet).toFixed(3)}</div><div class="sub">OMR</div><div class="lbl">Net Sales</div></div>
    <div class="stat" style="border-top-color:#8a6518"><div class="val" style="color:#8a6518">${(rec.acctPurchase).toFixed(3)}</div><div class="sub">OMR</div><div class="lbl">Purchases</div></div>
    <div class="stat" style="border-top-color:${profit?'#2d6e4e':'#a89e8e'}"><div class="val" style="color:${profit?'#2d6e4e':'#a89e8e'}">${profit||"N/A"}</div><div class="sub">${profit?"OMR":""}</div><div class="lbl">Est. Profit</div></div>
  </div>

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
        ].map(([lbl,a,p,v])=>`
        <tr>
          <td class="l">${lbl}</td>
          <td>${a.toFixed(3)}</td>
          <td>${p.toFixed(3)}</td>
          <td style="color:${Math.abs(v)>10?'#c0392b':Math.abs(v)>2?'#8a6518':'#7a6e5e'};font-weight:${Math.abs(v)>2?700:400}">${v>=0?"+":""}${v.toFixed(3)}</td>
          <td><span class="tag ${Math.abs(v)>10?'tag-bad':Math.abs(v)>2?'tag-warn':'tag-ok'}">${Math.abs(v)>10?"⚠ Flag":Math.abs(v)>2?"△ Minor":"✓ Clear"}</span></td>
        </tr>`).join("")}
        <tr style="opacity:.6"><td class="l">Net Sales <small>(POS is gross)</small></td><td>${rec.acctNet.toFixed(3)}</td><td>${posData.summary.netSales.toFixed(3)}</td><td>—</td><td>—</td></tr>
      </tbody>
    </table>
  </div>

  <!-- Expenses Table -->
  ${deb.length>0?`
  <div class="card no-break">
    <div class="card-title">💸 Expenses (Bank Debits)</div>
    <table>
      <thead><tr><th class="l">Date</th><th class="l">Description</th><th>Amount (OMR)</th></tr></thead>
      <tbody>${deb.map(t=>`<tr><td class="l">${t.date}</td><td class="l">${t.desc}</td><td style="color:#c0392b;font-weight:600">${t.amount.toFixed(3)}</td></tr>`).join("")}</tbody>
      <tfoot><tr><td class="l" colspan="2">TOTAL EXPENSES</td><td style="color:#c0392b">${totExp.toFixed(3)}</td></tr></tfoot>
    </table>
  </div>`:""}

  <!-- Top Menu Items -->
  <div class="card no-break">
    <div class="card-title">☕ Top Menu Items by Revenue</div>
    <table>
      <thead><tr><th class="l">Rank</th><th class="l">Item</th><th>Qty Sold</th><th>Revenue (OMR)</th><th>% of Sales</th></tr></thead>
      <tbody>${top5.map((item,i)=>`
        <tr style="background:${i<3?'rgba(200,149,42,.05)':'transparent'}">
          <td class="l" style="font-family:Montserrat,sans-serif;font-weight:700;color:#c8952a">${i<3?["🥇","🥈","🥉"][i]:"#"+(i+1)}</td>
          <td class="l" style="font-weight:${i<3?700:400}">${item.name}</td>
          <td>${item.qty}</td>
          <td style="font-weight:${i<3?700:400};color:${i<3?'#1e3d2f':'#1a1a16'}">${item.amount.toFixed(3)}</td>
          <td>${((item.amount/currSales)*100).toFixed(1)}%</td>
        </tr>`).join("")}
      </tbody>
    </table>
  </div>

  <!-- Spoilage if available -->
  ${baristaData?.spoilage?.length?`
  <div class="card no-break">
    <div class="card-title">⚠️ Spoilage Report</div>
    <table>
      <thead><tr><th class="l">Item</th><th>Qty</th></tr></thead>
      <tbody>${baristaData.spoilage.map(r=>`<tr><td class="l" style="color:#c0392b">${r.item}</td><td style="color:#c0392b;font-weight:700">${r.qty}</td></tr>`).join("")}</tbody>
    </table>
  </div>`:""}

  <!-- Data Issues -->
  ${acctIssues.length?`
  <div class="card no-break" style="border-color:#e8d8a0;border-left:4px solid #c8952a">
    <div class="card-title" style="color:#8a6518">△ Data Issues in Accountant File</div>
    ${acctIssues.map(i=>`<p style="color:#8a6518;margin-bottom:4px">• ${i.date}: ${i.issue}</p>`).join("")}
  </div>`:""}

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
    <div>${acctSheet} • Generated ${new Date().toLocaleDateString("en-GB",{day:"numeric",month:"long",year:"numeric"})}</div>
  </div>

</div>

<script>window.onload=()=>window.print();</script>
</body>
</html>`;

  // Return the built HTML so the component can switch into PDF view
  return html;
}

// Build a compact, branded PDF of the owner report and return base64 (no data-URI prefix).
// Used as the document attachment for the WhatsApp template header.
async function buildOwnerReportPdfBase64({ acctSheet, rec, posData, totExp, profit, acctIssues }) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const PW = 210, M = 16;
  let y = 46;

  // Header band
  doc.setFillColor(B.forest); doc.rect(0, 0, PW, 34, "F");
  doc.setTextColor(B.gold); doc.setFont("helvetica", "bold"); doc.setFontSize(22);
  doc.text("THE PEAK", M, 18);
  doc.setTextColor(B.white); doc.setFont("helvetica", "normal"); doc.setFontSize(11);
  doc.text(`Monthly Owner Report — ${acctSheet || ""}`, M, 27);

  const pageGuard = (need = 10) => { if (y + need > 285) { doc.addPage(); y = 22; } };
  const sectionTitle = (t) => {
    pageGuard(16);
    doc.setFillColor(B.cream); doc.rect(M, y - 6, PW - 2 * M, 9, "F");
    doc.setTextColor(B.forest); doc.setFont("helvetica", "bold"); doc.setFontSize(11);
    doc.text(t, M + 3, y); y += 12;
  };
  const row = (label, value, color = B.txtD) => {
    pageGuard();
    doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(B.txtM);
    doc.text(String(label), M + 3, y);
    doc.setFont("helvetica", "bold"); doc.setTextColor(color);
    doc.text(String(value), PW - M - 3, y, { align: "right" }); y += 7;
  };

  sectionTitle("SALES SUMMARY");
  row("Accountant Total", f(rec.acctTotal) + " OMR");
  row("POS Total", f(posData.summary.totalSales) + " OMR");
  row("Net Sales", f(rec.acctNet) + " OMR");
  row("Variance", (rec.salesVar >= 0 ? "+" : "") + f(rec.salesVar) + " OMR", rec.salesVar >= 0 ? B.sGreen : B.sRed);
  y += 4;

  sectionTitle("EXPENSES & PROFIT");
  row("Total Expenses", totExp > 0 ? f(totExp) + " OMR" : "Not provided");
  row("Estimated Profit", profit);
  y += 4;

  sectionTitle("TOP MENU ITEMS");
  (posData.menuItems || []).slice(0, 5).forEach((it, i) => {
    pageGuard();
    doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(B.txtD);
    doc.text(`${i + 1}. ${it.name}`, M + 3, y);
    doc.setFont("helvetica", "bold"); doc.setTextColor(B.forest);
    doc.text(`${it.qty} sold · ${f(it.amount)} OMR`, PW - M - 3, y, { align: "right" }); y += 7;
  });
  y += 4;

  sectionTitle("FLAGS & ACTION ITEMS");
  doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(B.sYell);
  if (acctIssues && acctIssues.length) {
    acctIssues.forEach((it, i) => {
      const txt = `${i + 1}. ${it.issue}${it.date ? "  (" + it.date + ")" : ""}`;
      const lines = doc.splitTextToSize(txt, PW - 2 * M - 6);
      pageGuard(lines.length * 6 + 1);
      doc.text(lines, M + 3, y); y += lines.length * 6 + 1;
    });
  } else {
    doc.text("No issues found.", M + 3, y); y += 7;
  }

  doc.setFont("helvetica", "italic"); doc.setFontSize(9); doc.setTextColor(B.txtDim);
  doc.text("The Peak Coffee Shop — Monthly Report", M, 290);

  return doc.output("datauristring").split(",")[1];
}

// ── BEANS ANALYSIS ───────────────────────────────────────────────────
// Coffee drink categories from POS — all categories that consume beans
// POS categories that contain coffee-bean drinks
// HOT DRINKS = Carbonic V60 (coffee) | COLD DRINKS = Iced rose/saffron latte (coffee)
// Excluded from bean calc: Matcha Latte, Rose Foam Matcha, Fresh Milk (no beans)
const COFFEE_CATEGORIES = ["HOT COFFEE","COLD COFFEE","HOT DRINKS","COLD DRINKS"];
const NON_COFFEE_ITEMS = ["MATCHA","FRESH MILK","ROSE FOAM","HOT CHOCOLATE","TEA","CHAI"];
const GRAMS_PER_DRINK = 20; // 20g per drink

function calcBeans(posData, baristaData) {
  if(!posData) return null;

  // Count all coffee drinks sold from POS categories
  // Use categories for the broad count (POS only gives category totals)
  const coffeeCategories = posData.categories.filter(c =>
    COFFEE_CATEGORIES.includes(c.name.toUpperCase())
  );
  // Also subtract non-coffee items that appear in those categories (from menu items)
  const nonCoffeeQty = posData.menuItems
    .filter(item => NON_COFFEE_ITEMS.some(nc => item.name.toUpperCase().includes(nc)))
    .reduce((s, item) => s + item.qty, 0);
  const totalCoffeeDrinks = Math.max(0, coffeeCategories.reduce((s,c) => s + c.qty, 0) - nonCoffeeQty);
  const beansConsumedCalc = totalCoffeeDrinks * GRAMS_PER_DRINK; // grams

  // From barista stock data
  const begin = baristaData?.beansBegin ?? null;
  const added = baristaData?.beansAdded ?? 0;
  const end   = baristaData?.beansEnd   ?? null;

  const totalAvailable = begin !== null ? begin + added : null;
  const beansConsumedActual = (totalAvailable !== null && end !== null)
    ? totalAvailable - end : null;

  const discrepancy = (beansConsumedCalc !== null && beansConsumedActual !== null)
    ? parseFloat((beansConsumedActual - beansConsumedCalc).toFixed(0)) : null;

  // % variance
  const discPct = (discrepancy !== null && beansConsumedCalc > 0)
    ? parseFloat((discrepancy / beansConsumedCalc * 100).toFixed(1)) : null;

  // Status
  const status = discrepancy === null ? "unknown"
    : Math.abs(discPct) <= 5  ? "ok"
    : Math.abs(discPct) <= 15 ? "warn"
    : "bad";

  return {
    coffeeCategories,
    totalCoffeeDrinks,
    beansConsumedCalc,   // expected consumption (g)
    beansConsumedActual, // actual consumption from stock (g)
    discrepancy,         // actual - expected (g). Positive = more used than expected
    discPct,
    status,
    begin, added, end, totalAvailable,
  };
}

// Simple markdown renderer
function renderMD(text) {
  if(!text) return null;
  const lines = text.split("\n");
  const elements = [];
  let key = 0;

  for(let i=0; i<lines.length; i++){
    const line = lines[i];
    // Skip --- dividers
    if(line.trim()==="---"||line.trim()==="***"||line.trim()==="___") continue;
    // H1
    if(line.startsWith("# ")) { elements.push(<div key={key++} style={{fontSize:20,fontWeight:800,color:B.forest,fontFamily:"Montserrat,sans-serif",marginBottom:8,marginTop:16}}>{line.slice(2)}</div>); continue; }
    // H2
    if(line.startsWith("## ")) { elements.push(<div key={key++} style={{fontSize:16,fontWeight:700,color:B.forest,fontFamily:"Montserrat,sans-serif",marginBottom:6,marginTop:14}}>{line.slice(3)}</div>); continue; }
    // H3 — section headers like ### ☕ MENU PERFORMANCE
    if(line.startsWith("### ")) {
      const txt = line.slice(4);
      elements.push(<div key={key++} style={{fontSize:11,letterSpacing:".25em",color:B.forest,textTransform:"uppercase",fontFamily:"Montserrat,sans-serif",fontWeight:700,marginTop:24,marginBottom:10,paddingBottom:8,borderBottom:`2px solid ${B.gold}`,display:"flex",alignItems:"center",gap:8}}>{txt}</div>);
      continue;
    }
    // Bullet points
    if(line.startsWith("- ")||line.startsWith("• ")) {
      const txt = line.slice(2);
      elements.push(<div key={key++} style={{display:"flex",gap:8,marginBottom:4,paddingLeft:8}}>
        <span style={{color:B.gold,fontWeight:700,flexShrink:0}}>•</span>
        <span style={{fontSize:14,color:B.txtD,lineHeight:1.7}}>{inlineFormat(txt)}</span>
      </div>);
      continue;
    }
    // Numbered list
    const numMatch = line.match(/^(\d+)\.\s+(.+)/);
    if(numMatch) {
      elements.push(<div key={key++} style={{display:"flex",gap:8,marginBottom:4,paddingLeft:8}}>
        <span style={{color:B.gold,fontWeight:700,fontFamily:"Montserrat,sans-serif",flexShrink:0,minWidth:20}}>{numMatch[1]}.</span>
        <span style={{fontSize:14,color:B.txtD,lineHeight:1.7}}>{inlineFormat(numMatch[2])}</span>
      </div>);
      continue;
    }
    // Empty line = spacer
    if(line.trim()==="") { elements.push(<div key={key++} style={{height:10}}/>); continue; }
    // Regular paragraph
    elements.push(<div key={key++} style={{fontSize:14,color:B.txtD,lineHeight:1.85,marginBottom:4}}>{inlineFormat(line)}</div>);
  }
  return <div>{elements}</div>;
}

function inlineFormat(text) {
  // Handle **bold** inline
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if(part.startsWith("**")&&part.endsWith("**")) {
      return <strong key={i} style={{fontWeight:700,color:B.forest,fontFamily:"Montserrat,sans-serif"}}>{part.slice(2,-2)}</strong>;
    }
    return part;
  });
}

// Parsers
function parseAcct(buf) {
  const wb = XLSX.read(buf,{type:"array",cellDates:true,cellNF:false});
  const MONS = ["JANUARY","FEBRUARY","MARCH","APRIL","MAY","JUNE","JULY","AUGUST","SEPTEMBER","OCTOBER","NOVEMBER","DECEMBER"];
  const countD = ws => XLSX.utils.sheet_to_json(ws,{header:1,defval:null,raw:true}).filter(r=>r&&r[3]&&(r[3] instanceof Date||(typeof r[3]==="number"&&r[3]>40000))).length;
  const meta = wb.SheetNames.map(name => {
    const up=name.toUpperCase(); const yr=up.match(/20(\d{2})/); const year=yr?parseInt("20"+yr[1]):0;
    const mo=MONS.findIndex(m=>up.includes(m))+1;
    return {name,year,mo,named:(year>0||mo>0)?1:0};
  });
  const pool = meta.filter(s=>s.named).length>0?meta.filter(s=>s.named):meta;
  pool.sort((a,b)=>b.year!==a.year?b.year-a.year:b.mo!==a.mo?b.mo-a.mo:countD(wb.Sheets[b.name])-countD(wb.Sheets[a.name]));
  const sn = pool[0]?.name||wb.SheetNames[wb.SheetNames.length-1];
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sn],{header:1,defval:null,raw:true});
  const data=[],issues=[];
  for(let i=0;i<rows.length;i++){
    const row=rows[i]; const date=excelDate(row[3]); if(!date||!date.match(/\d{4}-\d{2}-\d{2}/)) continue;
    const total=n(row[8]); if(total===0&&n(row[4])===0&&n(row[5])===0) continue;
    if(!row[17]&&!row[16]) issues.push({date,issue:"Net of Sale missing"});
    const yr=parseInt(date.split("-")[0]); if(yr<2025||yr>2030) issues.push({date,issue:`Year looks wrong (${yr})`});
    data.push({date,cash:n(row[4]),creditCard:n(row[5]),roomSale:n(row[6]),tips:n(row[7]),totalSale:total,purchase:n(row[16]),netSale:n(row[17]),cashInHand:n(row[18])});
  }
  return {data,sheetName:sn,issues};
}

function parsePOS(text) {
  const lines=text.trim().split("\n").map(l=>l.replace(/\r/g,"").trim());
  const get=kw=>{for(const l of lines){const c=l.split(";");if(c[0].toUpperCase().includes(kw.toUpperCase())){const v=n(c[2]||c[1]);if(v>0)return v;}}return 0;};
  const summary={totalSales:get("TOTAL SALES:")||get("NET SALES"),cash:get("CASH"),visa:get("VISA"),mastercard:get("MASTERCARD"),discount:get("DISCOUNT"),tips:get("TIP"),receipts:get("#RECEIPTS"),pax:get("#PAX")};
  summary.card=summary.visa+summary.mastercard; summary.netSales=get("NET SALES")||summary.totalSales;
  const CATS=["COLD COFFEE","MOJITOS","COLD DRINKS","DESSERTS","DISPLAY FRIDGE","DISPLAY ITEMS","HOT COFFEE","HOT DRINKS","ICE CREAM","MILKSHAKES"];
  const SKIP=new Set(["TEXT5","TEXT6","TEXT7","TOTAL","TOTAL SALES:","NET SALES","TOTAL AMOUNT","TOTAL SALES WITHOUT TIP","BALANCE","SETTLED","#PAX","#PAYMENTS","#RECEIPTS","SALES PER PAX","SALES PER RECEIPT","#VOID RECEIPTS","DISCOUNT","EXTRA CHARGE","ROUND OFF","TAX","TIP","-N/A-","DINE IN","TAKEAWAY","NO CHARGE","EMPLOYEE DISCOUNT","LOCALS DISCOUNT","OWNER DISCOUNT","CASH","MASTERCARD","VISA","OWNER 1 AHMED","COLD COFFEE","MOJITOS","COLD DRINKS","DESSERTS","DISPLAY FRIDGE","DISPLAY ITEMS","HOT COFFEE","HOT DRINKS","ICE CREAM","MILKSHAKES"]);
  const serviceTypes=[],categories=[],menuItems=[];
  for(const l of lines){
    const c=l.split(";"); const label=c[0].trim(); const up=label.toUpperCase();
    if(["DINE IN","TAKEAWAY","NO CHARGE"].includes(up)&&n(c[2])>0) serviceTypes.push({name:label,qty:n(c[1]),amount:n(c[2])});
    if(CATS.includes(up)&&n(c[1])>0) categories.push({name:label,qty:n(c[1]),amount:n(c[2])});
    if(!label||SKIP.has(up)) continue;
    const qty=n(c[1]),amt=n(c[2]); if(qty>0&&amt>0) menuItems.push({name:label,qty,amount:amt,avg:parseFloat((amt/qty).toFixed(3))});
  }
  menuItems.sort((a,b)=>b.amount-a.amount);
  return {summary,serviceTypes,categories,menuItems,valid:summary.totalSales>0};
}

function parseBarista(text) {
  if(!text) return null;
  const lines = text.split("\n").map(l=>l.trim()).filter(Boolean);

  // Extract numbers: "item : 123" or "item = 123"
  const extractNum = (line) => {
    const m = line.match(/[:=]\s*([\d.,]+)/);
    return m ? parseFloat(m[1].replace(/,/g,"")) : null;
  };
  const extractLabel = (line) => line.replace(/[🔹🔸▪️]/g,"").replace(/[:=].*$/,"").trim().replace(/\s+/g," ");

  let section = "";
  const purchased=[], remaining=[], dairy=[], spoilage=[], sweets=[];
  let sweetsTotal=null, beansBegin=null, beansAdded=0, beansEnd=null;

  for(const line of lines){
    const up = line.toUpperCase();
    if(up.includes("PURCHASED")) { section="purchased"; continue; }
    if(up.includes("REMAINING")) { section="remaining"; continue; }
    if(up.includes("DAIRY")) { section="dairy"; continue; }
    if(up.includes("SALES")) { section="sales"; continue; }
    if(up.includes("SWEETS")) { section="sweets"; continue; }
    if(up.includes("COFFEE BEANS")||up.includes("BEANS STOCK")||(up.includes("BEANS")&&up.includes("STOCK"))) { section="beans"; continue; }
    if(up.includes("SPOILAGE")) { section="spoilage"; continue; }

    const num = extractNum(line);
    const label = extractLabel(line);

    if(section==="purchased" && num!==null && label) purchased.push({item:label, qty:num});
    if(section==="remaining" && num!==null && label) remaining.push({item:label, qty:num});
    if(section==="dairy" && num!==null && label) dairy.push({item:label, qty:num});
    if(section==="spoilage" && num!==null && label) spoilage.push({item:label, qty:num});
    if(section==="sweets"){
      if(up.includes("TOTAL")) sweetsTotal=num;
      else if(num!==null && label) sweets.push({item:label, qty:num});
    }
    if(section==="beans"){
      // Expect lines like:
      // Beginning stock : 1000g  (or 1kg)
      // Added mid-month : 1000g
      // End of month    : 200g
      const gramsMatch = line.match(/[:=]\s*([\d.]+)\s*(g|kg|grams|kilos?)/i);
      if(gramsMatch){
        const val = parseFloat(gramsMatch[1]) * (gramsMatch[2].toLowerCase().startsWith("k") ? 1000 : 1);
        if(up.includes("BEGIN")||up.includes("START")||up.includes("OPENING")) beansBegin=val;
        else if(up.includes("ADD")||up.includes("MID")||up.includes("PURCHAS")||up.includes("BOUGHT")) beansAdded+=val;
        else if(up.includes("END")||up.includes("CLOSING")||up.includes("REMAIN")||up.includes("LEFT")) beansEnd=val;
      }
    }
    // sales section is noted but figures come from HISTORICAL_SALES, not parsed here
  }

  return { purchased, remaining, dairy, spoilage, sweets, sweetsTotal, beansBegin, beansAdded, beansEnd, raw:text };
}

function cleanNarr(s) {
  const pos=s.match(/POS\s+\d+-(.*?)(?:\s+512\.|\s+\d{6,}|@|$)/); if(pos) return "POS — "+pos[1].trim().replace(/\b\w/g,c=>c.toUpperCase());
  if(s.toLowerCase().includes("transfer")) return "Transfer — "+s.replace(/Transfer\s+/i,"").replace(/\b\d{8,}\b/g,"").replace(/\bLFT\w+\b/g,"").replace(/\s+/g," ").trim().slice(0,50);
  if(s.includes("ACH Inward")||s.includes("ACH Direct Credit")) return "ACH Credit (Sales Deposit)";
  if(s.includes("Value Added Tax")) return "VAT Payment";
  if(s.toUpperCase().includes("SALARY")) return "Monthly Salary";
  if(s.toUpperCase().includes("SWIFT CHARGES")) return "SWIFT Bank Charges";
  if(s.toUpperCase().includes("SWIFT")) return "SWIFT Payment";
  if(s.includes("Reversal")) return "Bank Reversal/Adjustment";
  return s.replace(/\b\d{8,}\b/g,"").replace(/\bFT\w+\b/g,"").replace(/@[\d.]+/g,"").replace(/\s+/g," ").trim().slice(0,50);
}

function parseBank(buf) {
  const wb=XLSX.read(buf,{type:"array"});
  const rows=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{header:1,defval:null});
  const txns=[];
  for(let i=0;i<rows.length;i++){
    const row=rows[i]; if(!row||!row[3]) continue;
    const ds=String(row[3]).trim(); if(!ds.match(/\d{1,2}\/\d{1,2}\/\d{4}/)) continue;
    const narr=row[5]?String(row[5]).trim():""; if(!narr) continue;
    const debit=row[6]?parseFloat(String(row[6]))||0:0;
    const credit=row[7]?parseFloat(String(row[7]))||0:0;
    const balance=row[8]?parseFloat(String(row[8]))||0:0;
    const type=debit>0?"debit":"credit"; const amount=debit>0?debit:credit;
    txns.push({date:ds,desc:cleanNarr(narr),raw:narr,amount,type,balance});
  }
  return txns;
}

function reconcile(acct,pos) {
  const sm=fn=>acct.reduce((s,r)=>s+fn(r),0);
  return {
    acctTotal:sm(r=>r.totalSale), acctCash:sm(r=>r.cash), acctCard:sm(r=>r.creditCard),
    acctNet:sm(r=>r.netSale), acctPurchase:sm(r=>r.purchase),
    salesVar:parseFloat((pos.totalSales-sm(r=>r.totalSale)).toFixed(3)),
    cashVar:parseFloat((pos.cash-sm(r=>r.cash)).toFixed(3)),
    cardVar:parseFloat((pos.card-sm(r=>r.creditCard)).toFixed(3)),
  };
}

// UI primitives
const css = `
  @keyframes spin{to{transform:rotate(360deg)}}
  @keyframes fade{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
  *{box-sizing:border-box}
  body{margin:0}
  ::-webkit-scrollbar{width:5px;height:5px}
  ::-webkit-scrollbar-thumb{background:#c8952a;border-radius:3px}
  table{border-collapse:collapse;width:100%}
  th{font-size:9px;letter-spacing:.15em;color:#1e3d2f;text-transform:uppercase;padding:10px 12px;font-weight:700;border-bottom:2px solid #c8952a;background:#ede8df;font-family:Montserrat,sans-serif;white-space:nowrap}
  th.l{text-align:left} th{text-align:right}
  td{padding:9px 12px;font-size:13px;border-bottom:1px solid #e4ddd1;color:#1a1a16;text-align:right}
  td.l{text-align:left}
  tr:hover>td{background:rgba(30,61,47,.025)!important}
  tfoot td{font-weight:700;font-family:Montserrat,sans-serif;color:#1e3d2f;border-top:2px solid #c8952a;border-bottom:none}
`;

function Tag({v,t=10}) {
  if(v===null||v===undefined) return <span style={{display:"inline-block",padding:"3px 10px",borderRadius:"20px",fontSize:"10px",background:B.cream2,color:B.txtDim,border:`1px solid ${B.bord}`,fontFamily:"Montserrat,sans-serif",fontWeight:700}}>—</span>;
  const abs=Math.abs(v);
  const [bg,col,bd,lbl] = abs>t?[B.sRedBg,B.sRed,B.sRedBd,"⚠ Flag"]:abs>2?[B.sYellBg,B.sYell,B.sYellBd,"△ Minor"]:[B.sGreenBg,B.sGreen,B.sGreenBd,"✓ Clear"];
  return <span style={{display:"inline-block",padding:"3px 10px",borderRadius:"20px",fontSize:"10px",background:bg,color:col,border:`1px solid ${bd}`,fontFamily:"Montserrat,sans-serif",fontWeight:700}}>{lbl}</span>;
}
function VN({v,t=10}) {
  if(v===null||v===undefined) return <span style={{color:B.txtDim}}>—</span>;
  const abs=Math.abs(v); const col=abs>t?B.sRed:abs>2?B.gold:B.txtDim;
  return <span style={{color:col,fontWeight:abs>2?700:400,fontFamily:"Montserrat,sans-serif"}}>{v>=0?"+":""}{v.toFixed(3)}</span>;
}
function Stat({label,value,sub,color,accent}) {
  return <div style={{background:B.white,border:`1px solid ${B.bord}`,borderTop:`3px solid ${accent||B.gold}`,borderRadius:"8px",padding:"14px 10px",textAlign:"center",boxShadow:"0 2px 8px rgba(30,61,47,.06)"}}>
    <div style={{fontSize:"19px",color:color||B.forest,fontWeight:700,fontFamily:"Montserrat,sans-serif",marginBottom:"2px"}}>{value}</div>
    {sub&&<div style={{fontSize:"11px",color:B.txtM,marginBottom:"2px"}}>{sub}</div>}
    <div style={{fontSize:"9px",color:B.txtM,letterSpacing:".12em",textTransform:"uppercase",fontFamily:"Montserrat,sans-serif",fontWeight:600}}>{label}</div>
  </div>;
}
function Card({title,icon,children}) {
  return <div style={{background:B.white,border:`1px solid ${B.bord}`,borderRadius:"8px",padding:"22px",marginBottom:"16px",boxShadow:"0 2px 12px rgba(30,61,47,.06)"}}>
    <div style={{fontSize:"10px",letterSpacing:".3em",color:B.forest,textTransform:"uppercase",marginBottom:"16px",paddingBottom:"10px",borderBottom:`2px solid ${B.gold}`,display:"flex",alignItems:"center",gap:"8px",fontFamily:"Montserrat,sans-serif",fontWeight:700}}>
      {icon&&<span>{icon}</span>}{title}
    </div>
    {children}
  </div>;
}
function UpBox({title,fname,loaded,onFile,mode}) {
  const ref=useRef(); const [drag,setDrag]=useState(false);
  const handle=file=>{
    if(!file) return;
    const r=new FileReader();
    if(mode==="binary"){r.onload=e=>onFile(file,e.target.result);r.readAsArrayBuffer(file);}
    else{r.onload=e=>onFile(file,e.target.result);r.readAsText(file);}
  };
  return <div style={{background:B.white,border:`1px solid ${B.bord}`,borderTop:`3px solid ${loaded?B.gold:B.forest}`,borderRadius:"8px",padding:"18px",boxShadow:"0 2px 8px rgba(30,61,47,.05)"}}>
    <div style={{fontSize:"9px",letterSpacing:".3em",color:B.forest,textTransform:"uppercase",marginBottom:"12px",paddingBottom:"10px",borderBottom:`1px solid ${B.bordL}`,fontFamily:"Montserrat,sans-serif",fontWeight:700}}>{title}</div>
    <div style={{border:`2px dashed ${loaded?B.gold:drag?B.forest:B.bord}`,background:loaded?"rgba(200,149,42,.06)":drag?"rgba(30,61,47,.04)":"transparent",borderRadius:"6px",padding:"20px",textAlign:"center",cursor:"pointer",transition:"all .2s"}}
      onDragOver={e=>{e.preventDefault();setDrag(true);}} onDragLeave={()=>setDrag(false)}
      onDrop={e=>{e.preventDefault();setDrag(false);handle(e.dataTransfer.files[0]);}}
      onClick={()=>ref.current.click()}>
      <input ref={ref} type="file" accept=".xlsx,.xls,.csv,.txt" style={{display:"none"}} onChange={e=>handle(e.target.files[0])}/>
      {loaded
        ?<div><div style={{width:28,height:28,background:B.forest,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 8px",color:B.white,fontSize:14}}>✓</div>
          <div style={{color:B.forest,fontSize:12,fontWeight:600,fontFamily:"Montserrat,sans-serif",marginBottom:2}}>{fname}</div>
          <div style={{fontSize:11,color:B.gold,fontWeight:600}}>Loaded</div></div>
        :<div><div style={{fontSize:22,opacity:.25,marginBottom:8,color:B.forest}}>↑</div><div style={{fontSize:12,color:B.txtDim}}>{title.split("—")[1]?.trim()||"Upload file"}</div></div>}
    </div>
  </div>;
}

// Main App
export default function App() {
  const [acctFile,setAcctFile]=useState(null); const [posFile,setPosFile]=useState(null); const [bankFile,setBankFile]=useState(null);
  const [acctData,setAcctData]=useState(null); const [acctSheet,setAcctSheet]=useState(""); const [acctIssues,setAcctIssues]=useState([]);
  const [posData,setPosData]=useState(null); const [bankTxns,setBankTxns]=useState(null);
  const [rec,setRec]=useState(null); const [tab,setTab]=useState("overview");
  const [aiReport,setAiReport]=useState(""); const [aiLoad,setAiLoad]=useState(false);
  const [approved,setApproved]=useState(false);
  const [pdfMode,setPdfMode]=useState(false);
  const [pdfHtml,setPdfHtml]=useState("");
  const [baristaText,setBaristaText]=useState("");
  const [baristaData,setBaristaData]=useState(null);
  const [waSending,setWaSending]=useState(false);
  const [waSent,setWaSent]=useState([]);
  const [waError,setWaError]=useState("");

  // ── PERSISTENT STORAGE ──────────────────────────────────────────────
  // Load saved data on mount
  useEffect(() => {
    const load = async () => {
      try {
        const raw = localStorage.getItem("peak_report_data");
        if (raw) {
          const d = JSON.parse(raw);
          if (d.acctData)   { setAcctData(d.acctData); setAcctSheet(d.acctSheet||""); setAcctIssues(d.acctIssues||[]); setAcctFile({name: d.acctFileName||"Saved"}); }
          if (d.posData)    { setPosData(d.posData); setPosFile({name: d.posFileName||"Saved"}); }
          if (d.bankTxns)   { setBankTxns(d.bankTxns); setBankFile({name: d.bankFileName||"Saved"}); }
          if (d.baristaData){ setBaristaData(d.baristaData); setBaristaText(d.baristaText||""); }
        }
      } catch(e) { /* no saved data */ }
    };
    load();
  }, []);

  // Save whenever data changes
  useEffect(() => {
    const save = async () => {
      if (!acctData && !posData) return;
      try {
        const payload = {
          acctData, acctSheet, acctIssues, acctFileName: acctFile?.name,
          posData, posFileName: posFile?.name,
          bankTxns, bankFileName: bankFile?.name,
          baristaData, baristaText,
        };
        localStorage.setItem("peak_report_data", JSON.stringify(payload));
      } catch(e) { /* storage error */ }
    };
    save();
  }, [acctData, posData, bankTxns, baristaData]);

  const clearSaved = async () => {
    try { localStorage.removeItem("peak_report_data"); } catch {}
    setAcctData(null); setAcctFile(null); setAcctSheet(""); setAcctIssues([]);
    setPosData(null); setPosFile(null);
    setBankTxns(null); setBankFile(null);
    setBaristaData(null); setBaristaText("");
    setRec(null); setAiReport(""); setApproved(false);
  };

  const canRun = !!(acctData&&posData);

  const handleAcct=(file,buf)=>{
    try{
      const{data,sheetName,issues}=parseAcct(buf);
      if(!data.length){alert("No date rows found.");return;}
      setAcctData(data);setAcctSheet(sheetName);setAcctIssues(issues);setAcctFile(file);setRec(null);setAiReport("");
    }catch(e){alert("Cannot read Excel: "+e.message);}
  };
  const handlePos=(file,text)=>{
    const d=parsePOS(text);
    if(!d.valid){alert("Cannot read POS totals.");return;}
    setPosData(d);setPosFile(file);setRec(null);setAiReport("");
  };
  const handleBank=(file,buf)=>{
    try{setBankTxns(parseBank(buf));}catch{setBankTxns([]);}
    setBankFile(file);
  };

  const handleBaristaText = (text) => {
    const parsed = parseBarista(text);
    setBaristaData(parsed);
    setBaristaText(text);
  };

  const analyse=async()=>{
    const r=reconcile(acctData,posData);
    setRec(r);setTab("overview");setAiReport("");setApproved(false);
    setAiLoad(true);
    const deb=bankTxns?bankTxns.filter(t=>t.type==="debit"):[];
    const cred=bankTxns?bankTxns.filter(t=>t.type==="credit"):[];
    const totExp=deb.reduce((s,t)=>s+t.amount,0);
    const totCred=cred.reduce((s,t)=>s+t.amount,0);
    const bankCredVar=parseFloat((totCred-posData.summary.visa).toFixed(3));
    const expStr=deb.length?deb.map(t=>`${t.date} | ${t.desc} | ${t.amount.toFixed(3)} OMR`).join("\n"):"Not provided";
    const topItems=posData.menuItems.slice(0,10).map(i=>`${i.name}: ${i.qty} sold, ${i.amount.toFixed(3)} OMR`).join("\n");
    const bottomItems=posData.menuItems.slice(-5).map(i=>`${i.name}: ${i.qty} sold, ${i.amount.toFixed(3)} OMR`).join("\n");
    const catBreakdown=posData.categories.map(c=>`${c.name}: ${c.qty} qty, ${c.amount.toFixed(3)} OMR`).join("\n");
    const prompt=`You are preparing a MONTHLY OWNER REPORT for THE PEAK COFFEE SHOP for ${acctSheet}. This goes to the two business owners via WhatsApp. Be direct, factual, and concise. Use OMR currency.

DATA:
SALES: Accountant Total: ${r.acctTotal.toFixed(3)} OMR | POS Total: ${posData.summary.totalSales.toFixed(3)} OMR | Variance: ${r.salesVar>=0?"+":""}${r.salesVar.toFixed(3)} OMR
Cash: Accountant ${r.acctCash.toFixed(3)} vs POS ${posData.summary.cash.toFixed(3)} | Variance: ${r.cashVar>=0?"+":""}${r.cashVar.toFixed(3)} OMR
Card: Accountant ${r.acctCard.toFixed(3)} vs POS ${posData.summary.card.toFixed(3)} | Variance: ${r.cardVar>=0?"+":""}${r.cardVar.toFixed(3)} OMR
Net Sales: ${r.acctNet.toFixed(3)} OMR | Purchases deducted: ${r.acctPurchase.toFixed(3)} OMR
Bank Credits vs VISA: ${totCred.toFixed(3)} vs ${posData.summary.visa.toFixed(3)} OMR | Variance: ${bankCredVar>=0?"+":""}${bankCredVar.toFixed(3)} OMR
Data issues in Excel: ${acctIssues.length?acctIssues.map(i=>i.date+": "+i.issue).join("; "):"None"}

EXPENSES (Bank Debits):
${expStr}
Total Expenses: ${totExp>0?totExp.toFixed(3)+" OMR":"Not provided"}
Estimated Profit: ${totExp>0?(r.acctNet-totExp).toFixed(3)+" OMR":"N/A"}

MENU (POS): Receipts: ${posData.summary.receipts} | Guests: ${posData.summary.pax}
Dine In: ${(posData.serviceTypes.find(s=>s.name.toUpperCase().includes("DINE"))?.amount||0).toFixed(3)} OMR | Takeaway: ${(posData.serviceTypes.find(s=>s.name.toUpperCase().includes("TAKE"))?.amount||0).toFixed(3)} OMR
Discounts: ${posData.summary.discount.toFixed(3)} OMR
Categories: ${catBreakdown}
Top 10 by Revenue: ${topItems}
Bottom 5 Slowest: ${bottomItems}

STOCK & SPOILAGE (Barista Report):
${(()=>{
      const MONS=["JANUARY","FEBRUARY","MARCH","APRIL","MAY","JUNE","JULY","AUGUST","SEPTEMBER","OCTOBER","NOVEMBER","DECEMBER"];
      const mo=acctSheet?MONS.findIndex(m=>acctSheet.toUpperCase().includes(m))+1:null;
      const yrM=acctSheet?acctSheet.match(/20(\d{2})/):[null];
      const yr=yrM?parseInt("20"+yrM[1]):new Date().getFullYear();
      const curr=posData?.summary?.totalSales||null;
      const prev=mo?HISTORICAL_SALES[yr-1]?.[mo]||null:null;
      const growth=prev&&curr?parseFloat(((curr-prev)/prev*100).toFixed(1)):null;
      return growth!==null?`Year-on-Year Growth: ${growth}% vs same month last year\nPrevious Year Same Month (${yr-1}): ${prev.toFixed(3)} OMR (from annual files)`:"Year-on-Year: No historical data for this month";
    })()}
${(()=>{
      if(!posData) return "";
      const beans = calcBeans(posData, baristaData);
      if(!beans) return "";
      return `
COFFEE BEANS ANALYSIS:
Coffee drinks sold: ${beans.totalCoffeeDrinks}
Expected beans consumed (${GRAMS_PER_DRINK}g/drink): ${beans.beansConsumedCalc}g
Actual beans consumed (from stock): ${beans.beansConsumedActual!==null?beans.beansConsumedActual+"g":"Not provided"}
Discrepancy: ${beans.discrepancy!==null?(beans.discrepancy>=0?"+":"")+beans.discrepancy+"g ("+beans.discPct+"%)":"N/A"}
Status: ${beans.status.toUpperCase()}
${beans.status!=="ok"&&beans.discrepancy!==null?beans.discrepancy>0?"MORE beans used than expected — possible waste, spillage, or unrecorded drinks":"FEWER beans used than expected — possible stocktake error or stock not recorded":""}`;
    })()}
${baristaData?`
Purchased Items: ${baristaData.purchased.map(r=>r.item+" ("+r.qty+")").join(", ")||"None"}
Remaining Stock: ${baristaData.remaining.map(r=>r.item+" ("+r.qty+")").join(", ")||"None"}
Spoilage: ${baristaData.spoilage.length?baristaData.spoilage.map(r=>r.item+" x"+r.qty).join(", "):"None reported"}
Sweets from Zahil: ${baristaData.sweets.length?baristaData.sweets.map(r=>r.item+" x"+r.qty).join(", ")+" = "+baristaData.sweetsTotal+" OMR":"N/A"}`:"Not provided this month"}

Write EXACTLY these 6 sections — do not skip any:
📊 MONTHLY OVERVIEW — ${acctSheet}
One paragraph summary including year-on-year sales comparison if available.
✅ SALES RECONCILIATION
Accountant vs POS. Cash risk. Data errors.
💰 EXPENSES & PROFIT
Categorized expenses. Profit calculation.
☕ MENU PERFORMANCE
• Top 5 by revenue (name, qty, OMR)
• Top 5 by quantity sold
• Bottom 3 slowest items
• Best category
• One recommendation
📦 STOCK & SPOILAGE
Summarize purchased items, remaining stock, spoilage, and sweets cost. Flag any spoilage concerns or stock issues.
⚠️ FLAGS & ACTION ITEMS
Numbered list of issues requiring attention.`;
    try{
      const res=await fetch("/api/generate",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({prompt})});
      const d=await res.json();
      setAiReport(d.text||d.error||"Could not generate report.");
    }catch(e){setAiReport("Error: "+e.message);}
    setAiLoad(false);
  };

  const sendWhatsApp = async () => {
    setWaSending(true); setWaSent([]); setWaError("");
    const MONS = ["JANUARY","FEBRUARY","MARCH","APRIL","MAY","JUNE","JULY","AUGUST","SEPTEMBER","OCTOBER","NOVEMBER","DECEMBER"];
    const mo = acctSheet ? MONS.findIndex(m=>acctSheet.toUpperCase().includes(m))+1 : null;
    const yrM = acctSheet ? acctSheet.match(/20(\d{2})/) : null;
    const yr = yrM ? parseInt("20"+yrM[1]) : new Date().getFullYear();
    const prev = mo ? HISTORICAL_SALES[yr-1]?.[mo]||null : null;
    const curr = posData?.summary?.totalSales||0;
    const growth = prev&&curr ? parseFloat(((curr-prev)/prev*100).toFixed(1)) : null;
    const deb2 = bankTxns?bankTxns.filter(t=>t.type==="debit"):[];
    const totExp2 = deb2.reduce((s,t)=>s+t.amount,0);
    const profit = totExp2>0 ? (rec.acctNet-totExp2).toFixed(3)+" OMR" : "N/A";
    const top3 = posData.menuItems.slice(0,3).map((i,idx)=>`${idx+1}. ${i.name} (${f(i.amount)} OMR)`).join(", ");
    const flags = acctIssues.length>0 ? acctIssues.map(i=>i.issue).join("; ") : "No issues found";

    const variables = [
      acctSheet,
      f(rec.acctTotal),
      f(posData.summary.totalSales),
      f(rec.acctNet),
      (rec.salesVar>=0?"+":"")+f(rec.salesVar),
      totExp2>0?f(totExp2)+" OMR":"Not provided",
      profit,
      top3,
      flags,
    ];

    let pdfBase64;
    try {
      pdfBase64 = await buildOwnerReportPdfBase64({ acctSheet, rec, posData, totExp: totExp2, profit, acctIssues });
    } catch(e) {
      setWaError("Could not generate the report PDF: "+e.message);
      setWaSending(false);
      return;
    }
    const filename = (`The Peak - ${acctSheet||"Monthly Report"}.pdf`).replace(/[^\w.\- ]/g,"");

    try {
      const res = await fetch("/api/whatsapp", {
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({variables, pdfBase64, filename}),
      });
      const d = await res.json();
      const sent = d.results?.filter(r=>r.status==="sent").map(r=>r.number)||[];
      const failed = d.results?.filter(r=>r.status==="failed")||[];
      setWaSent(sent);
      if(failed.length) setWaError(failed.map(r=>r.number+": "+r.error).join(" | "));
    } catch(e) {
      setWaError("Network error: "+e.message);
    }
    setWaSending(false);
  };

    const TABS=[{id:"overview",lbl:"Overview"},{id:"history",lbl:"Sales History"},{id:"daily",lbl:"Daily Breakdown"},{id:"menu",lbl:"Menu Analysis"},{id:"bank",lbl:"Expenses"},{id:"stock",lbl:"Stock & Spoilage"},{id:"beans",lbl:"☕ Beans"},{id:"report",lbl:"Owner Report"}];

  const deb=bankTxns?bankTxns.filter(t=>t.type==="debit"):[];
  const cred=bankTxns?bankTxns.filter(t=>t.type==="credit"):[];
  const totExp=deb.reduce((s,t)=>s+t.amount,0);
  const totCred=cred.reduce((s,t)=>s+t.amount,0);

  // Expose setPdfMode to generatePDF function


  // PDF view mode — renders the branded report for printing
  if(pdfMode && pdfHtml) {
    return <div style={{minHeight:"100vh",background:"#f0f0f0",display:"flex",flexDirection:"column",alignItems:"center",padding:"20px 0"}}>
      <div style={{display:"flex",gap:12,marginBottom:16,position:"sticky",top:0,zIndex:100,background:"#f0f0f0",padding:"12px 20px",borderRadius:8,boxShadow:"0 2px 12px rgba(0,0,0,.15)"}}>
        <button onClick={()=>window.print()} style={{background:B.forest,color:B.white,border:`2px solid ${B.gold}`,padding:"10px 24px",fontFamily:"Montserrat,sans-serif",fontSize:12,letterSpacing:".15em",textTransform:"uppercase",cursor:"pointer",borderRadius:6,fontWeight:700}}>🖨 Print / Save as PDF</button>
        <button onClick={()=>setPdfMode(false)} style={{background:B.white,color:B.forest,border:`2px solid ${B.bord}`,padding:"10px 20px",fontFamily:"Montserrat,sans-serif",fontSize:12,letterSpacing:".15em",textTransform:"uppercase",cursor:"pointer",borderRadius:6,fontWeight:700}}>← Back to Report</button>
      </div>
      <style>{`@media print { .no-print { display:none!important; } body { margin:0; } } @page { size:A4; margin:15mm; }`}</style>
      <div className="no-print" style={{fontSize:12,color:"#666",marginBottom:8,textAlign:"center"}}>Click "Print / Save as PDF" → choose your printer or "Save as PDF"</div>
      <iframe srcDoc={pdfHtml} style={{width:"210mm",minHeight:"297mm",border:"none",boxShadow:"0 4px 24px rgba(0,0,0,.2)",background:"#fff"}} title="PDF Preview"/>
    </div>;
  }

  return <div style={{minHeight:"100vh",background:B.cream,color:B.txtD,fontFamily:"Source Sans 3,sans-serif"}}>
    <style>{css}</style>
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Montserrat:wght@600;700;800&family=Source+Sans+3:wght@400;600&display=swap"/>

    {/* Header */}
    <div style={{background:B.forest}}>
      <div style={{height:4,background:`linear-gradient(90deg,${B.gold},${B.goldL},${B.gold})`}}/>
      <div style={{padding:"18px 32px 22px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div>
          <div style={{fontSize:10,letterSpacing:".45em",color:B.goldL,textTransform:"uppercase",marginBottom:4,fontFamily:"Montserrat,sans-serif",fontWeight:600}}>The Peak Coffee Shop</div>
          <div style={{fontSize:22,fontWeight:800,color:B.white,fontFamily:"Montserrat,sans-serif"}}>Monthly Owner Report</div>
          <div style={{fontSize:11,color:"rgba(255,255,255,.4)",marginTop:3}}>3 files → 1 report → send to owners</div>
        </div>
        <div style={{textAlign:"right"}}>
          <svg width="72" height="36" viewBox="0 0 72 36" fill="none"><path d="M4 28 Q14 8 22 20 Q30 32 40 14 Q50 2 58 16 Q64 26 68 24" stroke={B.goldL} strokeWidth="2.5" strokeLinecap="round" fill="none" opacity="0.75"/></svg>
          {acctSheet&&<div style={{fontSize:12,color:B.goldL,letterSpacing:".08em",fontFamily:"Montserrat,sans-serif",fontWeight:600,marginTop:4}}>{acctSheet}</div>}
        </div>
      </div>
    </div>

    <div style={{maxWidth:1060,margin:"0 auto",padding:"24px 20px"}}>
      {/* Notice */}
      <div style={{background:B.white,border:`1px solid ${B.bord}`,borderLeft:`4px solid ${B.gold}`,borderRadius:6,padding:"12px 16px",marginBottom:18,fontSize:12,color:B.txtM,lineHeight:1.75}}>
        <strong style={{color:B.forest,fontFamily:"Montserrat,sans-serif",fontSize:11,letterSpacing:".05em"}}>FILE REQUIREMENTS</strong><br/>
        • <strong style={{color:B.forest}}>Accountant file:</strong> Upload .xlsx directly (no conversion)<br/>
        • <strong style={{color:B.forest}}>POS file:</strong> Upload Cashier_Sales_Report.csv as exported<br/>
        • <strong style={{color:B.forest}}>Bank statement:</strong> Upload .xls from bank (optional)
      </div>

      {/* Clear saved data */}
      {(acctData||posData)&&<div style={{display:"flex",justifyContent:"flex-end",marginBottom:8}}>
        <button onClick={clearSaved} style={{background:"transparent",border:`1px solid ${B.sRedBd}`,color:B.sRed,padding:"5px 14px",fontFamily:"Montserrat,sans-serif",fontSize:10,letterSpacing:".1em",textTransform:"uppercase",cursor:"pointer",borderRadius:4,fontWeight:700}}>
          ✕ Clear All Saved Data
        </button>
      </div>}

      {/* Uploads */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:12,marginBottom:14}}>
        <UpBox title="1 — Accountant Excel" fname={acctFile?.name} loaded={!!acctFile} onFile={handleAcct} mode="binary"/>
        <UpBox title="2 — POS Cashier Report" fname={posFile?.name} loaded={!!posFile} onFile={handlePos} mode="text"/>
        <UpBox title="3 — Bank Statement" fname={bankFile?.name} loaded={!!bankFile} onFile={handleBank} mode="binary"/>
        <UpBox title="4 — Barista Stock Report" fname={baristaData?"Loaded":"Paste text below"} loaded={!!baristaData} onFile={()=>{}} mode="text"/>
      </div>
      {/* Barista paste box */}
      {!baristaData&&<div style={{marginBottom:14}}>
        <textarea placeholder="Paste the barista WhatsApp stock message here (stock list, sales, spoilage)..." rows={5}
          onChange={e=>e.target.value.length>20&&handleBaristaText(e.target.value)}
          style={{width:"100%",padding:"10px 14px",fontFamily:"Source Sans 3,sans-serif",fontSize:12,color:B.txtD,background:B.white,border:`1px solid ${B.bord}`,borderLeft:`4px solid ${B.forest}`,borderRadius:6,resize:"vertical",outline:"none",lineHeight:1.6}}/>
      </div>}
      {baristaData&&<div style={{marginBottom:14,padding:"10px 16px",background:B.sGreenBg,border:`1px solid ${B.sGreenBd}`,borderRadius:6,fontSize:11,color:B.sGreen,fontFamily:"Montserrat,sans-serif",fontWeight:600,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        ✓ Barista report loaded — {baristaData.purchased.length} purchased items, {baristaData.remaining.length} remaining, {baristaData.spoilage.length} spoilage items
        <button onClick={()=>{setBaristaData(null);setBaristaText("");}} style={{background:"transparent",border:`1px solid ${B.sGreenBd}`,color:B.sGreen,cursor:"pointer",padding:"3px 10px",borderRadius:4,fontFamily:"Montserrat,sans-serif",fontSize:10,fontWeight:700}}>✕ Clear</button>
      </div>}

      {/* Status */}
      <div style={{display:"flex",gap:16,flexWrap:"wrap",fontSize:11,fontFamily:"Montserrat,sans-serif",fontWeight:600,marginBottom:14,minHeight:18}}>
        {acctData&&<span style={{color:B.sGreen}}>✓ Accountant: {acctData.length} days from "{acctSheet}"</span>}
        {acctIssues.length>0&&<span style={{color:B.gold}}>△ {acctIssues.length} data issue(s)</span>}
        {posData&&<span style={{color:B.sGreen}}>✓ POS: {f(posData.summary.totalSales)} OMR | {posData.menuItems.length} items</span>}
        {bankTxns&&<span style={{color:B.sGreen}}>✓ Bank: {bankTxns.length} transactions</span>}
        {baristaData&&<span style={{color:B.sGreen}}>✓ Barista: stock + {baristaData.spoilage.length} spoilage items</span>}
      </div>

      {/* Button */}
      <button onClick={analyse} disabled={!canRun} style={{background:canRun?B.forest:B.cream3,color:canRun?B.white:B.txtDim,border:`2px solid ${canRun?B.gold:"transparent"}`,padding:"14px 0",width:"100%",fontFamily:"Montserrat,sans-serif",fontSize:12,letterSpacing:".2em",textTransform:"uppercase",cursor:canRun?"pointer":"not-allowed",borderRadius:6,fontWeight:700,marginBottom:22,boxShadow:canRun?"0 4px 16px rgba(30,61,47,.18)":"none",transition:"all .2s"}}>
        {canRun?"⛰  Generate Full Month Report":"Upload files above to begin"}
      </button>

      {/* Tabs */}
      {rec&&<>
        <div style={{display:"flex",gap:2,borderBottom:`2px solid ${B.bord}`,marginBottom:20}}>
          {TABS.map(t=><button key={t.id} onClick={()=>setTab(t.id)} style={{background:tab===t.id?B.forest:"transparent",border:"none",padding:"10px 18px",fontFamily:"Montserrat,sans-serif",fontSize:10,letterSpacing:".12em",textTransform:"uppercase",fontWeight:700,cursor:"pointer",color:tab===t.id?B.white:B.txtM,borderBottom:`3px solid ${tab===t.id?B.gold:"transparent"}`,borderRadius:"4px 4px 0 0",transition:"all .18s",marginBottom:-2}}>
            {t.lbl}
          </button>)}
        </div>

        {/* Overview Tab */}
        {tab==="overview"&&<div style={{animation:"fade .3s ease"}}>

          {/* YoY Comparison — always from historical files */}
          {(()=>{
            // Derive month and year from acctSheet (e.g. "MAY 2026")
            const MONS = ["JANUARY","FEBRUARY","MARCH","APRIL","MAY","JUNE","JULY","AUGUST","SEPTEMBER","OCTOBER","NOVEMBER","DECEMBER"];
            const mo = acctSheet ? MONS.findIndex(m=>acctSheet.toUpperCase().includes(m))+1 : null;
            const yrMatch = acctSheet ? acctSheet.match(/20(\d{2})/) : null;
            const yr = yrMatch ? parseInt("20"+yrMatch[1]) : new Date().getFullYear();
            const curr = posData?.summary?.totalSales || null;
            const prev = mo ? (HISTORICAL_SALES[yr-1]?.[mo] || null) : null;
            if(!prev||!curr) return null;
            const growth = parseFloat(((curr-prev)/prev*100).toFixed(1));
            const diff=parseFloat((curr-prev).toFixed(3));
            const isUp=growth>=0;
            const prevYrLabel=yr-1;
            return <div style={{background:isUp?B.sGreenBg:B.sRedBg,border:`2px solid ${isUp?B.sGreenBd:B.sRedBd}`,borderRadius:8,padding:"18px 22px",marginBottom:16,display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:12}}>
              <div>
                <div style={{fontSize:10,letterSpacing:".3em",color:isUp?B.sGreen:B.sRed,textTransform:"uppercase",fontFamily:"Montserrat,sans-serif",fontWeight:700,marginBottom:4}}>Year-on-Year Sales Comparison</div>
                <div style={{fontSize:22,fontWeight:800,fontFamily:"Montserrat,sans-serif",color:isUp?B.sGreen:B.sRed}}>{isUp?"▲":"▼"} {growth}% growth vs same month last year</div>
                <div style={{fontSize:13,color:B.txtM,marginTop:4}}>The Peak generated <strong style={{color:B.forest}}>{diff>=0?"+":""}{diff.toFixed(3)} OMR more</strong> than the same month last year</div>
              </div>
              <div style={{display:"flex",gap:12,flexWrap:"wrap"}}>
                <div style={{background:B.white,borderRadius:6,padding:"12px 20px",textAlign:"center",minWidth:120,border:`1px solid ${B.bord}`}}>
                  <div style={{fontSize:11,color:B.txtDim,letterSpacing:".1em",textTransform:"uppercase",fontFamily:"Montserrat,sans-serif",fontWeight:600,marginBottom:4}}>Last Year</div>
                  <div style={{fontSize:20,fontWeight:700,color:B.txtM,fontFamily:"Montserrat,sans-serif"}}>{prev.toFixed(3)}</div>
                  <div style={{fontSize:11,color:B.txtDim}}>OMR</div>
                </div>
                <div style={{display:"flex",alignItems:"center",fontSize:20,color:B.txtDim,fontWeight:700}}>{isUp?"→":"→"}</div>
                <div style={{background:B.white,borderRadius:6,padding:"12px 20px",textAlign:"center",minWidth:120,border:`2px solid ${isUp?B.sGreen:B.sRed}`}}>
                  <div style={{fontSize:11,color:isUp?B.sGreen:B.sRed,letterSpacing:".1em",textTransform:"uppercase",fontFamily:"Montserrat,sans-serif",fontWeight:600,marginBottom:4}}>This Year</div>
                  <div style={{fontSize:20,fontWeight:800,color:isUp?B.sGreen:B.sRed,fontFamily:"Montserrat,sans-serif"}}>{curr.toFixed(3)}</div>
                  <div style={{fontSize:11,color:isUp?B.sGreen:B.sRed}}>OMR</div>
                </div>
              </div>
            </div>;
          })()}

          <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:10,marginBottom:16}}>
            <Stat label="Accountant Total" value={f(rec.acctTotal)} sub="OMR"/>
            <Stat label="POS Total" value={f(posData.summary.totalSales)} sub="OMR"/>
            <Stat label="Net Sales" value={f(rec.acctNet)} sub="OMR"/>
            <Stat label="Purchases" value={f(rec.acctPurchase)} sub="OMR" color={B.sYell} accent={B.sYell}/>
            <Stat label="Sales Variance" value={(rec.salesVar>=0?"+":"")+f(rec.salesVar)} sub="OMR" color={Math.abs(rec.salesVar)>10?B.sRed:Math.abs(rec.salesVar)>2?B.gold:B.sGreen} accent={Math.abs(rec.salesVar)>10?B.sRed:Math.abs(rec.salesVar)>2?B.gold:B.sGreen}/>
          </div>
          <Card title="Accountant vs POS Reconciliation" icon="⚖">
            <div style={{overflowX:"auto"}}><table>
              <thead><tr><th className="l">Metric</th><th>Accountant (OMR)</th><th>POS (OMR)</th><th>Variance</th><th>Status</th></tr></thead>
              <tbody>
                {[["Total Sales",rec.acctTotal,posData.summary.totalSales,rec.salesVar,false],["Cash",rec.acctCash,posData.summary.cash,rec.cashVar,false],["Card",rec.acctCard,posData.summary.card,rec.cardVar,false],["Net Sales",rec.acctNet,posData.summary.netSales,null,true]].map(([lbl,a,p,v,isNet])=>{
                  const bg=!isNet&&v!==null&&Math.abs(v)>10?"rgba(192,57,43,.05)":!isNet&&v!==null&&Math.abs(v)>2?"rgba(200,149,42,.05)":"transparent";
                  return <tr key={lbl} style={{background:bg}}>
                    <td className="l">{lbl}{isNet&&<span style={{fontSize:10,color:B.txtDim,marginLeft:8}}>(POS is gross — expenses not deducted)</span>}</td>
                    <td>{f(a)}</td><td>{f(p)}</td>
                    <td>{isNet?<span style={{color:B.txtDim}}>—</span>:<VN v={v}/>}</td>
                    <td>{isNet?<span style={{fontSize:10,color:B.txtDim}}>—</span>:<Tag v={v}/>}</td>
                  </tr>;
                })}
              </tbody>
            </table></div>
          </Card>
          {bankTxns&&bankTxns.length>0&&(()=>{
            const totBC=totCred; const visaT=posData.summary.visa;
            const bv=parseFloat((totBC-visaT).toFixed(3)); const p5=visaT*0.05;
            const bv2=parseFloat((totBC-rec.acctCard).toFixed(3)); const p5c=rec.acctCard*0.05;
            return <Card title="Bank Credits vs Card Sales" icon="🏦">
              <p style={{fontSize:12,color:B.txtM,marginBottom:14,lineHeight:1.7}}>Bank ACH deposits should match VISA settlements. A gap may indicate timing differences or unaccounted transactions.</p>
              <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginBottom:16}}>
                <Stat label="Bank Credits" value={f(totBC)} sub="OMR" color={B.sGreen} accent={B.sGreen}/>
                <Stat label="POS VISA" value={f(visaT)} sub="OMR" color={B.forest} accent={B.forest}/>
                <Stat label="Credits vs VISA" value={(bv>=0?"+":"")+f(bv)} sub="OMR" color={Math.abs(bv)>p5?B.sRed:B.sGreen} accent={Math.abs(bv)>p5?B.sRed:B.sGreen}/>
                <Stat label="Deposits" value={cred.length} sub="transactions"/>
              </div>
              <div style={{overflowX:"auto"}}><table>
                <thead><tr><th className="l">Source</th><th>Amount (OMR)</th><th>Variance vs Bank Credits</th><th>Status</th></tr></thead>
                <tbody>
                  <tr><td className="l">Bank Credits (ACH)</td><td style={{color:B.sGreen,fontWeight:700}}>{f(totBC)}</td><td>—</td><td>—</td></tr>
                  <tr><td className="l">POS VISA Sales</td><td>{f(visaT)}</td><td><VN v={bv} t={p5}/></td><td><Tag v={bv} t={p5}/></td></tr>
                  <tr><td className="l">Accountant Card Total</td><td>{f(rec.acctCard)}</td><td><VN v={bv2} t={p5c}/></td><td><Tag v={bv2} t={p5c}/></td></tr>
                </tbody>
              </table></div>
            </Card>;
          })()}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
            <Card title="POS Payment Breakdown" icon="💳">
              {[["Cash",posData.summary.cash,B.sYell],["VISA",posData.summary.visa,B.forest],["Mastercard",posData.summary.mastercard,B.forest],["Discounts",posData.summary.discount,B.sRed],["Tips",posData.summary.tips,B.sGreen]].map(([l,v,c])=>(
                <div key={l} style={{display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:`1px solid ${B.bordL}`}}>
                  <span style={{fontSize:13,color:B.txtM}}>{l}</span>
                  <span style={{fontSize:14,color:c,fontWeight:600,fontFamily:"Montserrat,sans-serif"}}>{f(v)} <span style={{fontSize:11,color:B.txtDim,fontWeight:400}}>OMR</span></span>
                </div>
              ))}
            </Card>
            <Card title="Service Type Split" icon="🏠">
              {posData.serviceTypes.map(s=>(
                <div key={s.name} style={{display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:`1px solid ${B.bordL}`}}>
                  <span style={{fontSize:13,color:B.txtM}}>{s.name}</span>
                  <div style={{textAlign:"right"}}>
                    <div style={{fontSize:14,color:B.forest,fontWeight:600,fontFamily:"Montserrat,sans-serif"}}>{f(s.amount)} <span style={{fontSize:11,color:B.txtDim,fontWeight:400}}>OMR</span></div>
                    <div style={{fontSize:11,color:B.txtDim}}>{s.qty} receipts</div>
                  </div>
                </div>
              ))}
              {acctIssues.length>0&&<div style={{marginTop:12,padding:"10px 12px",background:B.sYellBg,border:`1px solid ${B.sYellBd}`,borderRadius:5}}>
                <div style={{fontSize:9,color:B.sYell,letterSpacing:".15em",fontFamily:"Montserrat,sans-serif",fontWeight:700,marginBottom:6}}>DATA ISSUES</div>
                {acctIssues.map((iss,i)=><div key={i} style={{fontSize:11,color:B.sYell}}>• {iss.date}: {iss.issue}</div>)}
              </div>}
            </Card>
          </div>
        </div>}

        {/* Daily Tab */}
        {tab==="daily"&&<div style={{animation:"fade .3s ease"}}>
          <Card title={`Daily Breakdown — ${acctData.length} Days`} icon="📅">
            <div style={{overflowX:"auto"}}><table>
              <thead><tr><th className="l">Date</th><th>Cash</th><th>Card</th><th>Total Sale</th><th>Purchase</th><th>Net Sale</th><th>Cash In Hand</th></tr></thead>
              <tbody>
                {acctData.map(r=>{
                  const bad=r.cashInHand<0||r.netSale<0;
                  return <tr key={r.date} style={{background:bad?"rgba(192,57,43,.04)":"transparent"}}>
                    <td className="l">{r.date}</td>
                    <td>{r.cash>0?f(r.cash):<span style={{color:B.txtDim}}>—</span>}</td>
                    <td>{r.creditCard>0?f(r.creditCard):<span style={{color:B.txtDim}}>—</span>}</td>
                    <td>{f(r.totalSale)}</td>
                    <td>{r.purchase>0?<span style={{color:B.sYell,fontWeight:600}}>{f(r.purchase)}</span>:<span style={{color:B.txtDim}}>—</span>}</td>
                    <td>{r.netSale!==0?f(r.netSale):<span style={{color:B.txtDim}}>—</span>}</td>
                    <td>{r.cashInHand<0?<span style={{color:B.sRed,fontWeight:700}}>{f(r.cashInHand)}</span>:r.cashInHand>0?f(r.cashInHand):<span style={{color:B.txtDim}}>—</span>}</td>
                  </tr>;
                })}
              </tbody>
              <tfoot><tr>
                <td className="l">TOTAL</td><td>{f(rec.acctCash)}</td><td>{f(rec.acctCard)}</td><td>{f(rec.acctTotal)}</td>
                <td style={{color:B.sYell}}>{f(rec.acctPurchase)}</td><td>{f(rec.acctNet)}</td><td>—</td>
              </tr></tfoot>
            </table></div>
          </Card>
        </div>}

        {/* Menu Tab */}
        {tab==="menu"&&<div style={{animation:"fade .3s ease"}}>
          <Card title="Category Breakdown" icon="☕">
            <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:10}}>
              {posData.categories.map(c=><Stat key={c.name} label={c.name} value={f(c.amount)} sub={`${c.qty} sold`}/>)}
            </div>
          </Card>
          <Card title="All Menu Items — Ranked by Revenue" icon="🏆">
            <div style={{overflowX:"auto"}}><table>
              <thead><tr><th className="l">Rank</th><th className="l">Item</th><th>Qty Sold</th><th>Revenue (OMR)</th><th>Avg Price</th><th>% of Sales</th></tr></thead>
              <tbody>
                {posData.menuItems.map((item,i)=>{
                  const pct=((item.amount/posData.summary.totalSales)*100).toFixed(1);
                  const isTop=i<5,isSlow=i>=posData.menuItems.length-5;
                  return <tr key={item.name} style={{background:isTop?"rgba(200,149,42,.05)":isSlow?"rgba(192,57,43,.03)":"transparent"}}>
                    <td className="l" style={{fontSize:11,fontFamily:"Montserrat,sans-serif",fontWeight:700,color:isTop?B.gold:B.txtDim}}>{i<3?["🥇","🥈","🥉"][i]:`#${i+1}`}</td>
                    <td className="l">{item.name}</td>
                    <td>{item.qty}</td>
                    <td style={{color:isTop?B.forest:B.txtD,fontWeight:isTop?700:400}}>{f(item.amount)}</td>
                    <td>{f(item.avg)}</td>
                    <td style={{color:parseFloat(pct)>5?B.gold:B.txtDim,fontWeight:parseFloat(pct)>5?700:400}}>{pct}%</td>
                  </tr>;
                })}
              </tbody>
            </table></div>
          </Card>
        </div>}

        {/* Bank Tab */}
        {tab==="bank"&&<div style={{animation:"fade .3s ease"}}>
          {bankTxns&&bankTxns.length>0?<>
            <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginBottom:16}}>
              <Stat label="Total Expenses" value={f(totExp)} sub="OMR" color={B.sRed} accent={B.sRed}/>
              <Stat label="Credits Received" value={f(totCred)} sub="OMR" color={B.sGreen} accent={B.sGreen}/>
              <Stat label="Net Sales" value={f(rec.acctNet)} sub="OMR"/>
              <Stat label="Est. Profit" value={(rec.acctNet-totExp>=0?"+":"")+f(rec.acctNet-totExp)} sub="Net − Expenses" color={rec.acctNet-totExp>=0?B.sGreen:B.sRed} accent={rec.acctNet-totExp>=0?B.sGreen:B.sRed}/>
            </div>
            <Card title={`Expenses — Debits (${deb.length})`} icon="💸">
              <div style={{overflowX:"auto"}}><table>
                <thead><tr><th className="l">Date</th><th className="l">Description</th><th className="l">Raw Narration</th><th>Amount (OMR)</th></tr></thead>
                <tbody>{deb.map((t,i)=><tr key={i}><td className="l">{t.date}</td><td className="l">{t.desc}</td><td className="l" style={{fontSize:11,color:B.txtDim}}>{t.raw.slice(0,45)}</td><td style={{color:B.sRed,fontWeight:700}}>{f(t.amount)}</td></tr>)}</tbody>
                <tfoot><tr><td className="l" colSpan={3}>TOTAL EXPENSES</td><td style={{color:B.sRed}}>{f(totExp)}</td></tr></tfoot>
              </table></div>
            </Card>
            <Card title={`Income Credits (${cred.length})`} icon="💰">
              <div style={{overflowX:"auto"}}><table>
                <thead><tr><th className="l">Date</th><th className="l">Description</th><th>Amount (OMR)</th><th>Balance</th></tr></thead>
                <tbody>{cred.map((t,i)=><tr key={i}><td className="l">{t.date}</td><td className="l" style={{color:B.txtM}}>{t.desc}</td><td style={{color:B.sGreen}}>{f(t.amount)}</td><td style={{color:B.txtDim}}>{t.balance>0?f(t.balance):"—"}</td></tr>)}</tbody>
              </table></div>
            </Card>
          </>:<Card title="Bank Statement" icon="🏦">
            <div style={{textAlign:"center",padding:36,color:B.txtDim}}>
              <div style={{fontSize:32,opacity:.3,marginBottom:12}}>🏦</div>
              <div style={{fontSize:13}}>Upload your bank .xls file above to see expense analysis here.</div>
            </div>
          </Card>}
        </div>}

        {/* History Tab */}
        {tab==="history"&&(()=>{
          // Determine current month from acctSheet or posData
          const mo = acctSheet ? (["JANUARY","FEBRUARY","MARCH","APRIL","MAY","JUNE","JULY","AUGUST","SEPTEMBER","OCTOBER","NOVEMBER","DECEMBER"].findIndex(m=>acctSheet.toUpperCase().includes(m))+1) : null;
          const yr = acctSheet ? (acctSheet.match(/20(\d{2})/) ? parseInt("20"+acctSheet.match(/20(\d{2})/)[1]) : new Date().getFullYear()) : new Date().getFullYear();
          const currentMonthSales = posData?.summary?.totalSales || null;

          // Build enriched data with current month injected
          const enriched = JSON.parse(JSON.stringify(HISTORICAL_SALES));
          if(mo && currentMonthSales) {
            if(!enriched[yr]) enriched[yr] = {};
            enriched[yr][mo] = currentMonthSales;
          }

          // Annual totals
          const annualTotals = YEARS.map(y => ({year:y, total:Object.values(enriched[y]||{}).reduce((s,v)=>s+v,0)}));

          // Month comparison for current month across all years
          const monthComparison = mo ? YEARS.map(y => ({year:y, val:enriched[y]?.[mo]||null})) : [];

          // Bar chart helper
          const maxAnnual = Math.max(...annualTotals.map(r=>r.total));
          const maxMonth = monthComparison.length ? Math.max(...monthComparison.filter(r=>r.val).map(r=>r.val)) : 0;

          return <div style={{animation:"fade .3s ease"}}>

            {/* This month across all years */}
            {mo&&<Card title={`${MONTH_NAMES[mo-1]} — Year-on-Year Comparison`} icon="📅">
              <div style={{display:"grid",gridTemplateColumns:`repeat(${YEARS.length},1fr)`,gap:10,marginBottom:20}}>
                {monthComparison.map(({year,val},i)=>{
                  const isCurrentYear = year===yr;
                  const prevVal = monthComparison[i-1]?.val;
                  const growth = val&&prevVal ? parseFloat(((val-prevVal)/prevVal*100).toFixed(1)) : null;
                  return <div key={year} style={{background:isCurrentYear?B.forest:B.white,border:`2px solid ${isCurrentYear?B.gold:B.bord}`,borderRadius:8,padding:"14px 10px",textAlign:"center",boxShadow:isCurrentYear?"0 4px 16px rgba(30,61,47,.2)":"none"}}>
                    <div style={{fontSize:10,letterSpacing:".15em",color:isCurrentYear?B.goldL:B.txtDim,textTransform:"uppercase",fontFamily:"Montserrat,sans-serif",fontWeight:700,marginBottom:6}}>{year}</div>
                    <div style={{fontSize:val?20:14,color:isCurrentYear?B.white:val?B.forest:B.txtDim,fontWeight:700,fontFamily:"Montserrat,sans-serif",marginBottom:4}}>{val?val.toFixed(2):"—"}</div>
                    <div style={{fontSize:10,color:isCurrentYear?"rgba(255,255,255,.6)":B.txtDim,marginBottom:6}}>OMR</div>
                    {growth!==null&&<div style={{fontSize:11,fontFamily:"Montserrat,sans-serif",fontWeight:700,color:isCurrentYear?(growth>=0?B.goldL:"#f87171"):growth>=0?B.sGreen:B.sRed}}>{growth>=0?"▲":"▼"} {Math.abs(growth)}%</div>}
                  </div>;
                })}
              </div>
              {/* Bar chart */}
              <div style={{marginTop:8}}>
                {monthComparison.filter(r=>r.val).map(({year,val},i)=>{
                  const pct = (val/maxMonth*100).toFixed(1);
                  const isCurrentYear = year===yr;
                  return <div key={year} style={{display:"flex",alignItems:"center",gap:12,marginBottom:8}}>
                    <div style={{width:40,fontSize:11,color:isCurrentYear?B.forest:B.txtM,fontFamily:"Montserrat,sans-serif",fontWeight:isCurrentYear?700:400,textAlign:"right"}}>{year}</div>
                    <div style={{flex:1,background:B.cream2,borderRadius:4,height:28,overflow:"hidden"}}>
                      <div style={{width:pct+"%",height:"100%",background:isCurrentYear?B.forest:YEAR_COLORS[i],borderRadius:4,display:"flex",alignItems:"center",paddingLeft:10,transition:"width .6s ease"}}>
                        <span style={{fontSize:11,color:B.white,fontFamily:"Montserrat,sans-serif",fontWeight:700,whiteSpace:"nowrap"}}>{val.toFixed(2)} OMR</span>
                      </div>
                    </div>
                  </div>;
                })}
              </div>
            </Card>}

            {/* Annual totals */}
            <Card title="Annual Sales Totals" icon="📊">
              <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:10,marginBottom:20}}>
                {annualTotals.filter(r=>r.total>0).map(({year,total},i)=>{
                  const isCurrentYear = year===yr;
                  const prev = annualTotals.find(r=>r.year===year-1)?.total;
                  const growth = prev&&total ? parseFloat(((total-prev)/prev*100).toFixed(1)) : null;
                  return <Stat key={year} label={String(year)+(isCurrentYear?" (current)":"")} value={total.toFixed(0)} sub={growth!==null?(growth>=0?"▲ +"+growth+"%":"▼ "+growth+"%"):"OMR"} color={isCurrentYear?B.forest:B.txtM} accent={isCurrentYear?B.gold:B.bord}/>;
                })}
              </div>
              {/* Annual bar chart */}
              {annualTotals.filter(r=>r.total>0).map(({year,total},i)=>{
                const pct = (total/maxAnnual*100).toFixed(1);
                const isCurrentYear = year===yr;
                return <div key={year} style={{display:"flex",alignItems:"center",gap:12,marginBottom:8}}>
                  <div style={{width:40,fontSize:11,color:isCurrentYear?B.forest:B.txtM,fontFamily:"Montserrat,sans-serif",fontWeight:isCurrentYear?700:400,textAlign:"right"}}>{year}</div>
                  <div style={{flex:1,background:B.cream2,borderRadius:4,height:32,overflow:"hidden"}}>
                    <div style={{width:pct+"%",height:"100%",background:isCurrentYear?B.forest:YEAR_COLORS[i],borderRadius:4,display:"flex",alignItems:"center",paddingLeft:12,transition:"width .6s ease"}}>
                      <span style={{fontSize:12,color:B.white,fontFamily:"Montserrat,sans-serif",fontWeight:700}}>{total.toFixed(0)} OMR</span>
                    </div>
                  </div>
                </div>;
              })}
            </Card>

            {/* Full monthly table */}
            <Card title="Monthly Breakdown — All Years" icon="📋">
              <div style={{overflowX:"auto"}}><table>
                <thead><tr>
                  <th className="l">Month</th>
                  {YEARS.filter(y=>Object.keys(enriched[y]||{}).length>0).map(y=><th key={y} style={{...{},color:y===yr?B.gold:B.forest}}>{y}</th>)}
                  <th>YoY vs {yr-1}</th>
                </tr></thead>
                <tbody>
                  {MONTH_NAMES.map((mn,idx)=>{
                    const m=idx+1;
                    const activeYears=YEARS.filter(y=>Object.keys(enriched[y]||{}).length>0);
                    const curr=enriched[yr]?.[m];
                    const prev=enriched[yr-1]?.[m];
                    const growth=curr&&prev?parseFloat(((curr-prev)/prev*100).toFixed(1)):null;
                    const isCurrentMo=m===mo;
                    return <tr key={m} style={{background:isCurrentMo?"rgba(200,149,42,.06)":"transparent",fontWeight:isCurrentMo?700:400}}>
                      <td className="l" style={{color:isCurrentMo?B.forest:B.txtD,fontFamily:isCurrentMo?"Montserrat,sans-serif":"inherit"}}>{mn}{isCurrentMo?" ←":""}</td>
                      {activeYears.map(y=>{
                        const v=enriched[y]?.[m];
                        return <td key={y} style={{color:y===yr?(v?B.forest:B.txtDim):B.txtD,fontWeight:y===yr&&v?700:400}}>{v?v.toFixed(2):<span style={{color:B.txtDim}}>—</span>}</td>;
                      })}
                      <td>{growth!==null?<span style={{color:growth>=0?B.sGreen:B.sRed,fontWeight:700,fontFamily:"Montserrat,sans-serif"}}>{growth>=0?"▲":""}{growth}%</span>:<span style={{color:B.txtDim}}>—</span>}</td>
                    </tr>;
                  })}
                </tbody>
                <tfoot><tr>
                  <td className="l" style={{fontFamily:"Montserrat,sans-serif"}}>TOTAL</td>
                  {YEARS.filter(y=>Object.keys(enriched[y]||{}).length>0).map(y=>{
                    const t=Object.values(enriched[y]).reduce((s,v)=>s+v,0);
                    return <td key={y} style={{color:y===yr?B.gold:B.forest}}>{t.toFixed(0)}</td>;
                  })}
                  <td>—</td>
                </tr></tfoot>
              </table></div>
            </Card>
          </div>;
        })()}

        {/* Stock Tab */}
        {tab==="stock"&&<div style={{animation:"fade .3s ease"}}>
          {baristaData?<>
            {/* YoY Sales Comparison */}
            {(()=>{
              const MONS=["JANUARY","FEBRUARY","MARCH","APRIL","MAY","JUNE","JULY","AUGUST","SEPTEMBER","OCTOBER","NOVEMBER","DECEMBER"];
              const mo=acctSheet?MONS.findIndex(m=>acctSheet.toUpperCase().includes(m))+1:null;
              const yrM=acctSheet?acctSheet.match(/20(\d{2})/):[null];
              const yr=yrM?parseInt("20"+yrM[1]):new Date().getFullYear();
              const curr=posData?.summary?.totalSales||null;
              const prev=mo?HISTORICAL_SALES[yr-1]?.[mo]||null:null;
              if(!prev||!curr) return null;
              const growth=parseFloat(((curr-prev)/prev*100).toFixed(1));
              return <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,marginBottom:16}}>
                <Stat label={`${yr-1} Same Month`} value={prev.toFixed(3)} sub="OMR (from annual files)" color={B.txtM} accent={B.txtM}/>
                <Stat label={`${yr} This Month`} value={curr.toFixed(3)} sub="OMR (from POS)" color={B.forest} accent={B.forest}/>
                <Stat label="Year-on-Year Growth" value={(growth>=0?"+":"")+growth+"%"} sub="vs same month last year" color={growth>=0?B.sGreen:B.sRed} accent={growth>=0?B.sGreen:B.sRed}/>
              </div>;
            })()}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
              {/* Purchased */}
              <Card title="Purchased Items" icon="🛒">
                <table><thead><tr><th className="l">Item</th><th>Qty</th></tr></thead>
                <tbody>{baristaData.purchased.map((r,i)=><tr key={i}><td className="l">{r.item}</td><td>{r.qty}</td></tr>)}</tbody></table>
              </Card>
              {/* Remaining */}
              <Card title="Remaining Stock" icon="📦">
                <table><thead><tr><th className="l">Item</th><th>Qty</th></tr></thead>
                <tbody>{baristaData.remaining.map((r,i)=><tr key={i}><td className="l">{r.item}</td><td>{r.qty}</td></tr>)}</tbody></table>
              </Card>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:14}}>
              {/* Dairy */}
              <Card title="Dairy & Milk" icon="🥛">
                <table><thead><tr><th className="l">Item</th><th>Qty</th></tr></thead>
                <tbody>{baristaData.dairy.map((r,i)=><tr key={i}><td className="l">{r.item}</td><td>{r.qty}</td></tr>)}</tbody></table>
              </Card>
              {/* Spoilage */}
              <Card title="Spoilage" icon="⚠️">
                {baristaData.spoilage.length>0
                  ?<table><thead><tr><th className="l">Item</th><th>Qty</th></tr></thead>
                    <tbody>{baristaData.spoilage.map((r,i)=><tr key={i} style={{background:"rgba(192,57,43,.04)"}}><td className="l" style={{color:B.sRed}}>{r.item}</td><td style={{color:B.sRed,fontWeight:700}}>{r.qty}</td></tr>)}</tbody>
                  </table>
                  :<div style={{textAlign:"center",padding:16,color:B.sGreen,fontSize:12}}>✓ No spoilage reported</div>}
              </Card>
              {/* Sweets */}
              <Card title="Sweets from Zahil" icon="🍰">
                {baristaData.sweets.length>0?<>
                  <table><thead><tr><th className="l">Item</th><th>Qty</th></tr></thead>
                  <tbody>{baristaData.sweets.map((r,i)=><tr key={i}><td className="l">{r.item}</td><td>{r.qty}</td></tr>)}</tbody></table>
                  {baristaData.sweetsTotal&&<div style={{marginTop:10,padding:"8px 12px",background:B.cream2,borderRadius:4,display:"flex",justifyContent:"space-between"}}>
                    <span style={{fontSize:12,color:B.txtM,fontFamily:"Montserrat,sans-serif",fontWeight:600}}>Total Cost</span>
                    <span style={{fontSize:14,color:B.forest,fontWeight:700,fontFamily:"Montserrat,sans-serif"}}>{baristaData.sweetsTotal.toFixed(3)} OMR</span>
                  </div>}
                </>:<div style={{textAlign:"center",padding:16,color:B.txtDim,fontSize:12}}>No sweets data</div>}
              </Card>
            </div>
            {/* Raw message */}
            <Card title="Original Barista Message" icon="📱">
              <pre style={{fontSize:12,lineHeight:1.7,color:B.txtM,whiteSpace:"pre-wrap",margin:0,fontFamily:"Source Sans 3,sans-serif"}}>{baristaData.raw}</pre>
            </Card>
          </>:<Card title="Stock & Spoilage" icon="📦">
            <div style={{textAlign:"center",padding:36,color:B.txtDim}}>
              <div style={{fontSize:32,opacity:.3,marginBottom:12}}>📱</div>
              <div style={{fontSize:13}}>Paste the barista WhatsApp stock message in the text box above to see analysis here.</div>
            </div>
          </Card>}
        </div>}

        {/* Beans Tab */}
        {tab==="beans"&&(()=>{
          const beans = rec ? calcBeans(posData, baristaData) : null;
          const statusColors = {ok:B.sGreen, warn:B.gold, bad:B.sRed, unknown:B.txtDim};
          const statusBgs    = {ok:B.sGreenBg, warn:B.sYellBg, bad:B.sRedBg, unknown:B.cream2};
          const statusBds    = {ok:B.sGreenBd, warn:B.sYellBd, bad:B.sRedBd, unknown:B.bord};
          const statusLabels = {ok:"✓ Within tolerance (±5%)", warn:"△ Minor discrepancy (5–15%)", bad:"⚠ Significant discrepancy (>15%)", unknown:"? Insufficient data"};

          return <div style={{animation:"fade .3s ease"}}>

            {/* Beans notice */}
            {(!baristaData?.beansBegin && !baristaData?.beansEnd) && <div style={{background:B.sYellBg,border:`1px solid ${B.sYellBd}`,borderLeft:`4px solid ${B.gold}`,borderRadius:6,padding:"12px 16px",marginBottom:16,fontSize:12,color:B.sYell,lineHeight:1.75}}>
              <strong style={{fontFamily:"Montserrat,sans-serif",fontSize:11}}>BEANS STOCK DATA MISSING</strong><br/>
              Add the following to your barista WhatsApp message each month:<br/><br/>
              <code style={{background:"rgba(0,0,0,.06)",padding:"8px 12px",borderRadius:4,display:"block",fontSize:12,lineHeight:2,fontFamily:"monospace"}}>
                COFFEE BEANS STOCK<br/>
                Beginning stock : 1000g<br/>
                Added mid-month : 1000g<br/>
                End of month    : 200g
              </code>
            </div>}

            {/* Stats */}
            {beans&&<>
              <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginBottom:16}}>
                <Stat label="Total Available" value={beans.totalAvailable!==null?beans.totalAvailable+"g":"—"} sub={beans.begin!==null?`${beans.begin}g + ${beans.added}g added`:"No stock data"} color={B.forest} accent={B.forest}/>
                <Stat label="Expected Consumed" value={beans.beansConsumedCalc+"g"} sub={`${beans.totalCoffeeDrinks} drinks × ${GRAMS_PER_DRINK}g`} color={B.midBlue||B.teal} accent={B.teal}/>
                <Stat label="Actual Consumed" value={beans.beansConsumedActual!==null?beans.beansConsumedActual+"g":"—"} sub={beans.end!==null?`${beans.begin+beans.added}g − ${beans.end}g remaining`:"No end stock data"} color={beans.status==="ok"?B.sGreen:beans.status==="bad"?B.sRed:B.gold} accent={beans.status==="ok"?B.sGreen:beans.status==="bad"?B.sRed:B.gold}/>
                <Stat label="Discrepancy" value={beans.discrepancy!==null?(beans.discrepancy>=0?"+":"")+beans.discrepancy+"g":"—"} sub={beans.discPct!==null?Math.abs(beans.discPct)+"% variance":"—"} color={statusColors[beans.status]} accent={statusColors[beans.status]}/>
              </div>

              {/* Status banner */}
              <div style={{background:statusBgs[beans.status],border:`2px solid ${statusBds[beans.status]}`,borderRadius:8,padding:"14px 20px",marginBottom:16,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                <div>
                  <div style={{fontSize:10,letterSpacing:".25em",color:statusColors[beans.status],textTransform:"uppercase",fontFamily:"Montserrat,sans-serif",fontWeight:700,marginBottom:4}}>Beans Analysis Status</div>
                  <div style={{fontSize:18,fontWeight:800,color:statusColors[beans.status],fontFamily:"Montserrat,sans-serif"}}>{statusLabels[beans.status]}</div>
                  {beans.discrepancy!==null&&beans.status!=="ok"&&<div style={{fontSize:12,color:B.txtM,marginTop:4}}>
                    {beans.discrepancy>0
                      ? `${Math.abs(beans.discrepancy)}g more beans consumed than expected — possible waste, spills, or unrecorded drinks`
                      : `${Math.abs(beans.discrepancy)}g fewer beans consumed than expected — possible stocktake error or unrecorded stock`}
                  </div>}
                </div>
                <div style={{fontSize:32}}>{beans.status==="ok"?"✅":beans.status==="warn"?"⚠️":"🚨"}</div>
              </div>

              {/* Coffee drinks breakdown */}
              <Card title="Coffee Drinks Breakdown — Beans Consumption" icon="☕">
                <table>
                  <thead><tr>
                    <th className="l">Category</th>
                    <th>Drinks Sold</th>
                    <th>Beans Used ({GRAMS_PER_DRINK}g each)</th>
                    <th>% of Total Beans</th>
                  </tr></thead>
                  <tbody>
                    {beans.coffeeCategories.map((c,i)=>{
                      const beansUsed = c.qty * GRAMS_PER_DRINK;
                      const pct = beans.beansConsumedCalc>0 ? ((beansUsed/beans.beansConsumedCalc)*100).toFixed(1) : "—";
                      return <tr key={c.name}>
                        <td className="l" style={{fontWeight:600}}>{c.name}</td>
                        <td>{c.qty}</td>
                        <td style={{color:B.forest,fontWeight:600}}>{beansUsed}g</td>
                        <td>
                          <div style={{display:"flex",alignItems:"center",gap:8,justifyContent:"flex-end"}}>
                            <div style={{width:80,background:B.cream2,borderRadius:3,height:8,overflow:"hidden"}}>
                              <div style={{width:pct+"%",height:"100%",background:B.gold,borderRadius:3}}/>
                            </div>
                            <span style={{color:B.gold,fontWeight:700,fontFamily:"Montserrat,sans-serif",fontSize:11}}>{pct}%</span>
                          </div>
                        </td>
                      </tr>;
                    })}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td className="l">TOTAL</td>
                      <td>{beans.totalCoffeeDrinks}</td>
                      <td style={{color:B.forest}}>{beans.beansConsumedCalc}g ({(beans.beansConsumedCalc/1000).toFixed(2)}kg)</td>
                      <td>100%</td>
                    </tr>
                  </tfoot>
                </table>
              </Card>

              {/* Stock flow */}
              <Card title="Beans Stock Flow" icon="📦">
                <div style={{display:"grid",gridTemplateColumns:"1fr auto 1fr auto 1fr auto 1fr",gap:8,alignItems:"center",padding:"8px 0"}}>
                  {[
                    ["Opening Stock", beans.begin!==null?beans.begin+"g":"—", B.forest],
                    ["+", null, B.gold],
                    ["Added", beans.added>0?beans.added+"g":"0g", B.teal],
                    ["=", null, B.gold],
                    ["Total Available", beans.totalAvailable!==null?beans.totalAvailable+"g":"—", B.forest],
                    ["−", null, B.sRed],
                    ["Closing Stock", beans.end!==null?beans.end+"g":"—", B.sYell],
                  ].map(([label,val,color],i)=>(
                    val===null
                      ? <div key={i} style={{textAlign:"center",fontSize:24,color,fontWeight:800,fontFamily:"Montserrat,sans-serif"}}>{label}</div>
                      : <div key={i} style={{background:B.cream2,border:`1px solid ${B.bord}`,borderRadius:6,padding:"12px",textAlign:"center"}}>
                          <div style={{fontSize:16,fontWeight:700,color,fontFamily:"Montserrat,sans-serif"}}>{val}</div>
                          <div style={{fontSize:9,color:B.txtDim,letterSpacing:".1em",textTransform:"uppercase",fontFamily:"Montserrat,sans-serif",fontWeight:600,marginTop:3}}>{label}</div>
                        </div>
                  ))}
                </div>
                {beans.end!==null&&<div style={{marginTop:12,padding:"10px 14px",background:B.cream2,borderRadius:6,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <span style={{fontSize:12,color:B.txtM}}>Actual consumed (from stock): <strong style={{color:B.forest,fontFamily:"Montserrat,sans-serif"}}>{beans.beansConsumedActual}g</strong></span>
                  <span style={{fontSize:12,color:B.txtM}}>Expected from POS: <strong style={{color:B.teal,fontFamily:"Montserrat,sans-serif"}}>{beans.beansConsumedCalc}g</strong></span>
                  {beans.discrepancy!==null&&<span style={{fontSize:13,fontWeight:700,fontFamily:"Montserrat,sans-serif",color:statusColors[beans.status]}}>{beans.discrepancy>=0?"+":""}{beans.discrepancy}g discrepancy</span>}
                </div>}
              </Card>


            </>}
          </div>;
        })()}

        {/* Report Tab */}
        {tab==="report"&&<div style={{animation:"fade .3s ease"}}>
          <Card title="Monthly Owner Report" icon="📋">
            {aiLoad?<div style={{textAlign:"center",padding:32,color:B.txtM}}>
              <span style={{display:"inline-block",width:16,height:16,border:`2px solid ${B.gold}`,borderTopColor:B.forest,borderRadius:"50%",animation:"spin .8s linear infinite",marginRight:10,verticalAlign:"middle"}}/>
              Writing your monthly owner report...
            </div>:aiReport?<>
              <div style={{marginBottom:20}}>{renderMD(aiReport)}</div>
              <div style={{borderTop:`1px solid ${B.bordL}`,paddingTop:16}}>
                {!approved
                  ?<div style={{display:"flex",gap:10,justifyContent:"flex-end",alignItems:"center"}}>
                    <span style={{fontSize:12,color:B.txtM}}>Review above, then approve to send</span>
                    <button onClick={()=>setApproved(true)} style={{background:B.forest,color:B.white,border:`2px solid ${B.gold}`,padding:"10px 24px",fontFamily:"Montserrat,sans-serif",fontSize:11,letterSpacing:".15em",textTransform:"uppercase",cursor:"pointer",borderRadius:4,fontWeight:700}}>✓ Approve Report</button>
                  </div>
                  :<div style={{background:"rgba(30,61,47,.05)",border:`2px solid ${B.gold}`,borderRadius:6,padding:16}}>
                    <div style={{fontSize:10,color:B.forest,letterSpacing:".2em",fontFamily:"Montserrat,sans-serif",fontWeight:700,marginBottom:12}}>✓ REPORT APPROVED — READY TO SEND</div>
                    <div style={{display:"flex",gap:10,flexWrap:"wrap",marginBottom:10}}>
                      <button onClick={()=>{
                        const txt="THE PEAK COFFEE SHOP\nMONTHLY OWNER REPORT — "+acctSheet+"\n"+"=".repeat(50)+"\n\n"+aiReport;
                        navigator.clipboard.writeText(txt).then(()=>alert("✓ Report copied to clipboard!")).catch(()=>alert("Could not copy. Please select the report text manually."));
                      }} style={{background:B.forest,color:B.white,border:`2px solid ${B.gold}`,padding:"10px 20px",fontFamily:"Montserrat,sans-serif",fontSize:11,letterSpacing:".15em",textTransform:"uppercase",cursor:"pointer",borderRadius:4,fontWeight:700}}>📋 Copy Report</button>
                      <button onClick={()=>{const html=generatePDF(aiReport,rec,posData,bankTxns,acctSheet,acctIssues,baristaData); setPdfHtml(html); setPdfMode(true);}} style={{background:B.gold,color:"#12100a",border:"none",padding:"10px 20px",fontFamily:"Montserrat,sans-serif",fontSize:11,letterSpacing:".15em",textTransform:"uppercase",cursor:"pointer",borderRadius:4,fontWeight:700}}>📄 View PDF</button>
                      <button onClick={sendWhatsApp} disabled={waSending} style={{background:waSending?"#7a9e90":B.teal,color:B.white,border:"none",padding:"10px 20px",fontFamily:"Montserrat,sans-serif",fontSize:11,letterSpacing:".15em",textTransform:"uppercase",cursor:waSending?"not-allowed":"pointer",borderRadius:4,fontWeight:700}}>
                        {waSending?"📱 Sending...":"📱 Send via WhatsApp"}
                      </button>
                    </div>
                    {waSent.length>0&&<div style={{marginTop:10,padding:"8px 12px",background:B.sGreenBg,border:`1px solid ${B.sGreenBd}`,borderRadius:4}}>
                      {waSent.map((r,i)=><div key={i} style={{fontSize:11,color:B.sGreen,fontFamily:"Montserrat,sans-serif",fontWeight:600}}>✓ Sent to {r}</div>)}
                    </div>}
                    {waError&&<div style={{marginTop:10,padding:"8px 12px",background:B.sRedBg,border:`1px solid ${B.sRedBd}`,borderRadius:4,fontSize:11,color:B.sRed}}>{waError}</div>}
                    <div style={{fontSize:11,color:B.txtM,marginTop:8}}>Sending to: +968 92114333, +968 96378879, +968 99107107</div>
                  </div>}
              </div>
            </>:<div style={{textAlign:"center",padding:32,color:B.txtDim,fontSize:13}}>Click "Generate Full Month Report" above to create the owner report.</div>}
          </Card>
        </div>}
      </>}
    </div>
  </div>;
}
