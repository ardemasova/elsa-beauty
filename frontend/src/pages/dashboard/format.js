// Number formats for the dashboard: euros with thousands separators
// ("12.480 €"), short euros for axes ("12,5 k €"), percentages.
let grouping = "always";
try {
  new Intl.NumberFormat("es-ES", { useGrouping: "always" }).format(1000);
} catch {
  grouping = true;
}

const eur0 = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 0, useGrouping: grouping });
const int = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 0, useGrouping: grouping });
const one = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 1, useGrouping: grouping });

export const euro = (v) => eur0.format(Math.round(Number(v) || 0));
export const count = (v) => int.format(Number(v) || 0);
export const pct = (v) => (v === null || v === undefined || !Number.isFinite(v) ? "—" : `${one.format(v)} %`);
export const euroShort = (v) => {
  const x = Number(v) || 0;
  if (Math.abs(x) >= 1000) return `${one.format(x / 1000)} k €`;
  return `${int.format(x)} €`;
};
export const hours = (min) => `${one.format((Number(min) || 0) / 60)} h`;
