// Spanish number formatting: 1.234,50 €
const moneyFormatters = new Map();
export function money(v, currency = "EUR") {
  if (!moneyFormatters.has(currency)) {
    moneyFormatters.set(currency, new Intl.NumberFormat("es-ES", { style: "currency", currency, minimumFractionDigits: 2 }));
  }
  return moneyFormatters.get(currency).format(Number(v) || 0);
}
const intF = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 0 });
const decF = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 1 });
export const int = (v) => intF.format(Number(v) || 0);
export const hours = (v) => `${decF.format(Number(v) || 0)} h`;
export const plural = (n, word, many = `${word}s`) => `${int(n)} ${Number(n) === 1 ? word : many}`;
export const pct = (v) => `${decF.format(Number(v) || 0)} %`;

export function formatCell(type, v, currency) {
  if (type === "money") return money(v, currency);
  if (type === "int") return int(v);
  if (type === "hours") return hours(v);
  if (type === "pct") return pct(v);
  return v ?? "—";
}

// --- periods (local calendar dates) -----------------------------------------
const pad = (n) => String(n).padStart(2, "0");
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export const PRESETS = [
  { id: "month", label: "This month" },
  { id: "last-month", label: "Last month" },
  { id: "30d", label: "Last 30 days" },
  { id: "year", label: "This year" },
  { id: "custom", label: "Custom" },
];

export function presetPeriod(id, now = new Date()) {
  const y = now.getFullYear();
  const m = now.getMonth();
  switch (id) {
    case "last-month":
      return { from: ymd(new Date(y, m - 1, 1)), to: ymd(new Date(y, m, 0)) };
    case "30d":
      return { from: ymd(new Date(y, m, now.getDate() - 29)), to: ymd(now) };
    case "year":
      return { from: `${y}-01-01`, to: ymd(now) };
    case "month":
    default:
      return { from: ymd(new Date(y, m, 1)), to: ymd(now) };
  }
}

const dayF = new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short", year: "numeric" });
export function periodLabel({ from, to }) {
  const f = new Date(`${from}T12:00:00`);
  const t = new Date(`${to}T12:00:00`);
  return from === to ? dayF.format(f) : `${dayF.format(f)} – ${dayF.format(t)}`;
}
