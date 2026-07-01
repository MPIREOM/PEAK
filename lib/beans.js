// Coffee-bean consumption analysis: compare beans implied by POS coffee sales
// against the actual stock movement reported by the barista.
//
// GRAMS_PER_DRINK is a flat per-drink estimate (it does not distinguish single
// vs double shots or cup sizes), so treat the discrepancy as an indicator, not
// an exact figure.
import { deriveMonthYear } from "./sales";

export const COFFEE_CATEGORIES = ["HOT COFFEE", "COLD COFFEE", "HOT DRINKS", "COLD DRINKS"];
export const NON_COFFEE_ITEMS = ["MATCHA", "FRESH MILK", "ROSE FOAM", "HOT CHOCOLATE", "TEA", "CHAI"];
export const GRAMS_PER_DRINK = 20; // estimated grams of beans per coffee drink

// Carry-forward: given a { sheetName: remainingGrams } history and the current
// sheet, return the remaining beans from the most recent EARLIER month, to use
// as this month's beginning stock. Null when no earlier month is recorded.
export function previousMonthRemaining(history, currentSheet) {
  if (!history) return null;
  const cur = deriveMonthYear(currentSheet);
  if (!cur.mo) return null;
  const curKey = cur.yr * 12 + cur.mo;
  let best = null;
  let bestKey = -Infinity;
  for (const [sheet, grams] of Object.entries(history)) {
    if (grams == null) continue;
    const { mo, yr } = deriveMonthYear(sheet);
    if (!mo) continue;
    const key = yr * 12 + mo;
    if (key < curKey && key > bestKey) { bestKey = key; best = grams; }
  }
  return best;
}

export function calcBeans(posData, baristaData) {
  if (!posData) return null;

  const coffeeCategories = posData.categories.filter((c) =>
    COFFEE_CATEGORIES.includes(c.name.toUpperCase())
  );
  const nonCoffeeQty = posData.menuItems
    .filter((item) => NON_COFFEE_ITEMS.some((nc) => item.name.toUpperCase().includes(nc)))
    .reduce((s, item) => s + item.qty, 0);
  const totalCoffeeDrinks = Math.max(0, coffeeCategories.reduce((s, c) => s + c.qty, 0) - nonCoffeeQty);
  const beansConsumedCalc = totalCoffeeDrinks * GRAMS_PER_DRINK; // grams

  const begin = baristaData?.beansBegin ?? null;
  const added = baristaData?.beansAdded ?? 0;
  const end = baristaData?.beansEnd ?? null;

  const totalAvailable = begin !== null ? begin + added : null;
  const beansConsumedActual =
    totalAvailable !== null && end !== null ? totalAvailable - end : null;

  const discrepancy =
    beansConsumedActual !== null ? parseFloat((beansConsumedActual - beansConsumedCalc).toFixed(0)) : null;

  const discPct =
    discrepancy !== null && beansConsumedCalc > 0
      ? parseFloat(((discrepancy / beansConsumedCalc) * 100).toFixed(1))
      : null;

  const status =
    discrepancy === null ? "unknown" : Math.abs(discPct) <= 5 ? "ok" : Math.abs(discPct) <= 15 ? "warn" : "bad";

  // When the analysis can't run, spell out exactly which stock figures are
  // missing so the report can tell the user what to add instead of just
  // "Insufficient data".
  const missing = [];
  if (!baristaData) {
    missing.push("barista report");
  } else {
    if (begin === null) missing.push("beginning beans stock");
    if (end === null) missing.push("ending beans stock");
  }
  const hint =
    status === "unknown" && missing.length
      ? `Add ${missing.join(" and ")} to the barista report (in grams or kg) to enable this analysis.`
      : null;

  return {
    coffeeCategories,
    totalCoffeeDrinks,
    beansConsumedCalc,
    beansConsumedActual,
    discrepancy,
    discPct,
    status,
    missing,
    hint,
    begin,
    added,
    end,
    totalAvailable,
  };
}
