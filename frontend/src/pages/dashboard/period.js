// Calendar periods for the dashboard and the calendar. Weeks start on Monday
// (Spain). Dates are local calendar days as "YYYY-MM-DD".

export const pad = (n) => String(n).padStart(2, "0");
export const isoDay = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parseDay = (s) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d, 12); // noon: safe from DST edges
};
export const addDays = (d, k) => {
  const x = new Date(d);
  x.setDate(x.getDate() + k);
  return x;
};
export const mondayOf = (d) => addDays(d, -((d.getDay() + 6) % 7));

/** { from, to, days: ["YYYY-MM-DD", ...] } for day / week / month around `anchor`. */
export function periodRange(period, anchor) {
  let start;
  let end;
  if (period === "day") {
    start = new Date(anchor);
    end = new Date(anchor);
  } else if (period === "week") {
    start = mondayOf(anchor);
    end = addDays(start, 6);
  } else {
    start = new Date(anchor.getFullYear(), anchor.getMonth(), 1, 12);
    end = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0, 12);
  }
  const days = [];
  for (let d = new Date(start); d <= end; d = addDays(d, 1)) days.push(isoDay(d));
  return { from: isoDay(start), to: isoDay(end), days };
}

export function shiftAnchor(period, anchor, step) {
  const d = new Date(anchor);
  if (period === "day") d.setDate(d.getDate() + step);
  else if (period === "week") d.setDate(d.getDate() + 7 * step);
  else d.setMonth(d.getMonth() + step, 1);
  return d;
}

/** Same day and month in another year (29 Feb -> 28 Feb). */
export function withYear(anchor, year) {
  const d = new Date(anchor);
  const month = d.getMonth();
  d.setFullYear(year, month, 1);
  const last = new Date(year, month + 1, 0).getDate();
  d.setDate(Math.min(anchor.getDate(), last));
  return d;
}

const fmt = (d, opts, locale = "en-GB") => d.toLocaleDateString(locale, opts);

/** Range label without the year (the year has its own selector). */
export function periodLabel(period, anchor, locale) {
  const r = periodRange(period, anchor);
  const a = parseDay(r.from);
  const b = parseDay(r.to);
  if (period === "day") return fmt(a, { weekday: "short", day: "numeric", month: "short" }, locale);
  if (period === "month") return fmt(a, { month: "long" }, locale);
  return a.getMonth() === b.getMonth()
    ? `${a.getDate()} – ${fmt(b, { day: "numeric", month: "short" }, locale)}`
    : `${fmt(a, { day: "numeric", month: "short" }, locale)} – ${fmt(b, { day: "numeric", month: "short" }, locale)}`;
}

export const weekdayShort = (iso, locale = "en-GB") => fmt(parseDay(iso), { weekday: "short" }, locale);
export const dayMonth = (iso, locale = "en-GB") => fmt(parseDay(iso), { day: "numeric", month: "short" }, locale);
export const fullDay = (iso, locale = "en-GB") =>
  fmt(parseDay(iso), { weekday: "long", day: "numeric", month: "long", year: "numeric" }, locale);
