import { useMemo, useState } from "react";
import {
  Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { formatCell, money, plural } from "./format";

/** "+12,3 %" / "−4 %" next to a figure; colour says whether the change is good. */
export function Delta({ value, goodWhenUp = true }) {
  // Nothing in the previous period to compare with: show no arrow at all.
  if (value === null || value === undefined) return null;
  if (value === 0) return <span className="rp-delta rp-delta--flat">±0 %</span>;
  const up = value > 0;
  const good = up === goodWhenUp;
  return (
    <span className={`rp-delta ${good ? "rp-delta--good" : "rp-delta--bad"}`} title="Compared with the previous period of the same length">
      {up ? "▲" : "▼"} {Math.abs(value).toLocaleString("es-ES", { maximumFractionDigits: 1 })} %
    </span>
  );
}

/**
 * The salon's money in one line:
 *   Income − Expenses − Commissions = Result
 * (all without VAT; income with VAT shown underneath).
 */
export function MoneyEquation({ data, currency }) {
  const c = data.current;
  const ch = data.change;
  const terms = [
    { label: "Income", value: c.income.net, sub: `${money(c.income.gross, currency)} incl. VAT`, delta: ch.income_net },
    { op: "−" },
    { label: "Expenses", value: c.expenses.net, sub: plural(c.expenses.payments, "payment"), delta: ch.expenses_net, goodWhenUp: false },
    { op: "−" },
    { label: "Masters' commissions", value: c.margin.commissions, sub: "estimated, from booked prices" },
    { op: "=" },
    { label: "Result", value: c.result, sub: "before taxes", delta: ch.result, result: true },
  ];
  return (
    <section className="rp-equation" aria-label="Income, expenses and result for the period">
      {terms.map((t, k) =>
        t.op ? (
          <span key={k} className="rp-equation__op" aria-hidden="true">{t.op}</span>
        ) : (
          <div key={k} className={`rp-equation__term ${t.result ? (t.value < 0 ? "is-loss" : "is-profit") : ""}`}>
            <span className="rp-equation__label">{t.label}</span>
            <span className="rp-equation__value">{money(t.value, currency)}</span>
            <span className="rp-equation__sub">
              {t.sub}
              {"delta" in t && <> <Delta value={t.delta} goodWhenUp={t.goodWhenUp !== false} /></>}
            </span>
          </div>
        )
      )}
    </section>
  );
}

/** Smaller figures under the equation. */
export function FigureRow({ items }) {
  return (
    <dl className="rp-figures">
      {items.map((it) => (
        <div key={it.label} className={`rp-figure ${it.onClick ? "is-link" : ""}`} onClick={it.onClick}
             role={it.onClick ? "button" : undefined} tabIndex={it.onClick ? 0 : undefined}
             onKeyDown={it.onClick ? (e) => (e.key === "Enter" || e.key === " ") && it.onClick() : undefined}>
          <dt>{it.label}</dt>
          <dd>
            <span className="rp-figure__value">{it.value}</span>
            {"delta" in it && <Delta value={it.delta} goodWhenUp={it.goodWhenUp !== false} />}
          </dd>
          {it.note && <dd className="rp-figure__note">{it.note}</dd>}
        </div>
      ))}
    </dl>
  );
}

const shortDay = (d) => new Date(`${d}T12:00:00`).toLocaleDateString("es-ES", { day: "numeric", month: "short" });

/** Money received per day (bars) and value of services done (line). */
export function DailyChart({ days, currency }) {
  // Long periods are summed per week/month so the chart stays readable.
  const series = useMemo(() => {
    if (!days?.length) return [];
    const step = days.length > 120 ? "month" : days.length > 45 ? "week" : "day";
    if (step === "day") return days.map((d) => ({ ...d, label: shortDay(d.day) }));
    const groups = new Map();
    for (const d of days) {
      const date = new Date(`${d.day}T12:00:00`);
      let key;
      let label;
      if (step === "month") {
        key = d.day.slice(0, 7);
        label = date.toLocaleDateString("es-ES", { month: "short", year: "2-digit" });
      } else {
        const monday = new Date(date);
        monday.setDate(date.getDate() - ((date.getDay() + 6) % 7));
        key = monday.toISOString().slice(0, 10);
        label = shortDay(key);
      }
      const g = groups.get(key) || { label, income_gross: 0, rendered_value: 0 };
      g.income_gross += d.income_gross;
      g.rendered_value += d.rendered_value;
      groups.set(key, g);
    }
    return [...groups.values()];
  }, [days]);

  if (!series.length) return null;
  const empty = series.every((d) => !d.income_gross && !d.rendered_value);

  return (
    <section className="rp-chart" aria-label="Income per day">
      {empty ? (
        <p className="rp-empty">No payments or completed visits in this period yet.</p>
      ) : (
        <ResponsiveContainer width="100%" height={260}>
          <ComposedChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke="#eef0f2" />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "#6b7280" }} minTickGap={16} />
            <YAxis tickLine={false} axisLine={false} width={64} tick={{ fontSize: 12, fill: "#6b7280" }}
                   tickFormatter={(v) => v.toLocaleString("es-ES", { maximumFractionDigits: 0 })} />
            <Tooltip formatter={(v, name) => [money(v, currency), name]} cursor={{ fill: "rgba(3,131,154,0.06)" }} />
            <Legend iconType="circle" wrapperStyle={{ fontSize: 13 }} />
            <Bar dataKey="income_gross" name="Money received" fill="#03839a" radius={[3, 3, 0, 0]} maxBarSize={28} />
            <Line dataKey="rendered_value" name="Services done (value)" stroke="#b96c86" strokeWidth={2} dot={series.length <= 31 ? { r: 2 } : false} type="linear" />
          </ComposedChart>
        </ResponsiveContainer>
      )}
    </section>
  );
}

/**
 * Table with sortable columns and a totals row.
 * columns: [{ key, label, type: text|money|int|hours|pct, total?: (rows) => value }]
 */
export function DataTable({ columns, rows, currency, empty = "Nothing to show for this period." }) {
  const [sort, setSort] = useState({ key: null, dir: -1 });
  const sorted = useMemo(() => {
    if (!sort.key) return rows;
    return [...rows].sort((a, b) => {
      const x = a[sort.key];
      const y = b[sort.key];
      if (typeof x === "number" && typeof y === "number") return (x - y) * sort.dir;
      return String(x ?? "").localeCompare(String(y ?? ""), "es") * sort.dir;
    });
  }, [rows, sort]);

  if (!rows.length) return <p className="rp-empty">{empty}</p>;

  const totals = columns.map((c) => {
    if (c.total) return c.total(rows);
    if (["money", "int", "hours"].includes(c.type)) return rows.reduce((s, r) => s + (Number(r[c.key]) || 0), 0);
    return null;
  });

  const toggle = (key) => setSort((s) => (s.key === key ? { key, dir: -s.dir } : { key, dir: -1 }));

  return (
    <div className="rp-table-wrap">
      <table className="rp-table">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} className={c.type && c.type !== "text" ? "is-num" : ""}
                  aria-sort={sort.key === c.key ? (sort.dir > 0 ? "ascending" : "descending") : "none"}>
                <button type="button" onClick={() => toggle(c.key)}>
                  {c.label}
                  {sort.key === c.key && <span aria-hidden="true">{sort.dir > 0 ? " ↑" : " ↓"}</span>}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r, k) => (
            <tr key={r.id ?? k}>
              {columns.map((c) => (
                <td key={c.key} className={c.type && c.type !== "text" ? "is-num" : ""}>
                  {c.render ? c.render(r) : formatCell(c.type, r[c.key], currency)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            {columns.map((c, k) => (
              <td key={c.key} className={c.type && c.type !== "text" ? "is-num" : ""}>
                {k === 0 ? "Total" : totals[k] === null ? "" : formatCell(c.type, totals[k], currency)}
              </td>
            ))}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
