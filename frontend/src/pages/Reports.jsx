import { useCallback, useEffect, useMemo, useState } from "react";
import { getBranches, getBreakdown, getMyFigures, getOverview, getReceivables } from "../api/analyticsApi";
import { getSession, getTokenPayload } from "../auth/session";
import { exportRowsToExcel } from "../utils/exportExcel";
import { hours, int, money, plural, PRESETS, periodLabel, presetPeriod } from "./reports/format";
import { DailyChart, DataTable, FigureRow, MoneyEquation } from "./reports/parts";
import "./Reports.css";

const ratio = (a, b, mul = 1) => (b ? Math.round((a / b) * mul * 100) / 100 : 0);
const sumOf = (rows, k) => rows.reduce((s, r) => s + (Number(r[k]) || 0), 0);

// Tables shown under the chart. Columns use the API field names directly.
const TABS = {
  masters: {
    label: "Masters",
    load: (p) => getBreakdown("master", p).then((d) => d.rows),
    columns: [
      { key: "name", label: "Master" },
      { key: "completed", label: "Visits", type: "int" },
      { key: "hours", label: "Hours", type: "hours" },
      { key: "income_gross", label: "Money received", type: "money" },
      { key: "rendered_value", label: "Services done", type: "money" },
      { key: "avg_ticket", label: "Avg. ticket", type: "money", total: () => null },
      { key: "revenue_per_hour", label: "Per hour", type: "money", total: (r) => ratio(sumOf(r, "rendered_value"), sumOf(r, "hours")) },
      { key: "commission", label: "Commission", type: "money" },
      { key: "cancelled", label: "Cancelled", type: "int" },
    ],
  },
  services: {
    label: "Services",
    load: (p) => getBreakdown("service", p).then((d) => d.rows),
    columns: [
      { key: "name", label: "Service" },
      { key: "completed", label: "Done", type: "int" },
      { key: "rendered_value", label: "Value", type: "money" },
      { key: "income_gross", label: "Money received", type: "money" },
      { key: "margin", label: "Margin", type: "money" },
      { key: "margin_percent", label: "Margin %", type: "pct", total: (r) => ratio(sumOf(r, "margin"), sumOf(r, "rendered_value"), 100) },
      { key: "cancelled", label: "Cancelled", type: "int" },
    ],
  },
  products: {
    label: "Products",
    load: (p) => getBreakdown("item", p).then((d) => d.rows),
    empty: "No products were sold in this period.",
    columns: [
      { key: "name", label: "Product" },
      { key: "qty", label: "Sold", type: "int" },
      { key: "income_gross", label: "Money received", type: "money" },
      { key: "income_net", label: "Without VAT", type: "money" },
      { key: "cost", label: "Purchase cost", type: "money" },
      { key: "margin", label: "Margin", type: "money" },
      { key: "margin_percent", label: "Margin %", type: "pct", total: (r) => ratio(sumOf(r, "margin"), sumOf(r, "income_net"), 100) },
    ],
  },
  expenses: {
    label: "Expenses",
    load: (p) => getBreakdown("expense", p).then((d) => d.rows),
    empty: "No expenses were paid in this period.",
    columns: [
      { key: "name", label: "Expense" },
      { key: "payments", label: "Payments", type: "int" },
      { key: "gross", label: "Paid", type: "money" },
      { key: "vat", label: "VAT", type: "money" },
      { key: "net", label: "Without VAT", type: "money" },
    ],
  },
  unpaid: {
    label: "Unpaid",
    load: (p) => getReceivables(p).then((d) => d.items.map((x) => ({ ...x, id: x.appointment_id }))),
    empty: "Every completed visit in this period is paid.",
    columns: [
      {
        key: "date",
        label: "Visit",
        render: (r) => new Date(r.date.replace(" ", "T")).toLocaleString("es-ES", { dateStyle: "medium", timeStyle: "short" }),
      },
      { key: "client_name", label: "Client" },
      { key: "client_phone", label: "Phone" },
      { key: "service_name", label: "Service" },
      { key: "master_name", label: "Master" },
      { key: "price", label: "Price", type: "money" },
      { key: "paid", label: "Paid", type: "money" },
      { key: "due", label: "Due", type: "money" },
    ],
  },
  branches: {
    label: "Branches",
    load: (p) =>
      getBranches(p).then((d) =>
        d.branches.map((b) => ({
          id: b.tenant_id,
          name: b.name,
          income_gross: b.income.gross,
          income_net: b.income.net,
          expenses_net: b.expenses.net,
          commissions: b.margin.commissions,
          result: b.result,
          completed: b.services.completed,
          income_services: b.income.services,
          paid_visits: b.paid_visits,
          avg_ticket: b.avg_ticket,
          unpaid: b.unpaid.amount,
        }))
      ),
    columns: [
      { key: "name", label: "Branch" },
      { key: "income_gross", label: "Money received", type: "money" },
      { key: "income_net", label: "Income w/o VAT", type: "money" },
      { key: "expenses_net", label: "Expenses w/o VAT", type: "money" },
      { key: "commissions", label: "Commissions", type: "money" },
      { key: "result", label: "Result", type: "money" },
      { key: "completed", label: "Visits", type: "int" },
      { key: "avg_ticket", label: "Avg. ticket", type: "money", total: (r) => ratio(sumOf(r, "income_services"), sumOf(r, "paid_visits")) },
      { key: "unpaid", label: "Unpaid", type: "money" },
    ],
  },
};

function PeriodPicker({ preset, period, onChange }) {
  return (
    <div className="rp-period">
      <div className="rp-period__presets" role="group" aria-label="Period">
        {PRESETS.map((p) => (
          <button key={p.id} type="button" className={preset === p.id ? "is-active" : ""} aria-pressed={preset === p.id}
                  onClick={() => onChange(p.id, p.id === "custom" ? period : presetPeriod(p.id))}>
            {p.label}
          </button>
        ))}
      </div>
      {preset === "custom" && (
        <div className="rp-period__custom">
          <label>
            From
            <input type="date" value={period.from} max={period.to} onChange={(e) => e.target.value && onChange("custom", { ...period, from: e.target.value })} />
          </label>
          <label>
            To
            <input type="date" value={period.to} min={period.from} onChange={(e) => e.target.value && onChange("custom", { ...period, to: e.target.value })} />
          </label>
        </div>
      )}
    </div>
  );
}

/** Loads data whenever `key` changes; keeps the last result visible while reloading. */
function useAsync(fn, key) {
  const [state, setState] = useState({ key: null, error: "", data: null });
  useEffect(() => {
    let alive = true;
    fn()
      .then((data) => alive && setState({ key, error: "", data }))
      .catch((e) => alive && setState({ key, error: e.message || "Could not load the report", data: null }));
    return () => {
      alive = false;
    };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return { ...state, loading: state.key !== key };
}

function Header({ title, subtitle, preset, period, onPeriod, onExcel, exportLabel }) {
  return (
    <header className="rp-header">
      <div className="rp-header__title">
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
      <PeriodPicker preset={preset} period={period} onChange={onPeriod} />
      <div className="rp-header__actions">
        {onExcel && (
          <button type="button" className="rp-btn" onClick={onExcel}>
            Download {exportLabel} (Excel)
          </button>
        )}
        <button type="button" className="rp-btn rp-btn--quiet" onClick={() => window.print()}>
          Print / PDF
        </button>
      </div>
    </header>
  );
}

// ---------------------------------------------------------------------------

function AdminReports({ session }) {
  const [preset, setPreset] = useState("month");
  const [period, setPeriod] = useState(() => presetPeriod("month"));
  const [tab, setTab] = useState("masters");
  const multiBranch = (session?.tenants?.length || 0) > 1;
  const tabs = useMemo(() => Object.keys(TABS).filter((k) => k !== "branches" || multiBranch), [multiBranch]);

  const onPeriod = useCallback((id, p) => {
    setPreset(id);
    setPeriod(p);
  }, []);

  const pkey = `${period.from}|${period.to}`;
  const overview = useAsync(() => getOverview(period), pkey);
  const days = useAsync(() => getBreakdown("day", period).then((d) => d.rows), pkey);
  const table = useAsync(() => TABS[tab].load(period), `${tab}|${pkey}`);

  const currency = overview.data?.period?.currency || "EUR";
  const branchName = session?.currentTenant?.name;

  const exportExcel = () => {
    const cols = TABS[tab].columns;
    const rows = (table.data || []).map((r) => Object.fromEntries(cols.map((c) => [c.label, r[c.key]])));
    exportRowsToExcel(rows, TABS[tab].label, `${TABS[tab].label.toLowerCase()}_${period.from}_${period.to}.xlsx`)
      .catch((e) => alert(`Export failed: ${e.message}`));
  };

  const o = overview.data;
  const c = o?.current;

  return (
    <div className="rp">
      <Header
        title="Reports"
        subtitle={`${branchName ? `${branchName}, ` : ""}${periodLabel(period)}`}
        preset={preset}
        period={period}
        onPeriod={onPeriod}
        onExcel={table.data?.length ? exportExcel : null}
        exportLabel={TABS[tab].label.toLowerCase()}
      />

      {overview.error && <p className="rp-error" role="alert">{overview.error}</p>}

      {c && (
        <div className={overview.loading ? "rp-stale" : ""}>
          <MoneyEquation data={o} currency={currency} />
          <FigureRow
            items={[
              { label: "Visits completed", value: int(c.services.completed), delta: o.change.completed, note: `${hours(c.services.hours)} of work` },
              { label: "Services done (value)", value: money(c.services.rendered_value, currency), delta: o.change.rendered_value },
              { label: "Average ticket", value: money(c.avg_ticket, currency), delta: o.change.avg_ticket, note: plural(c.paid_visits, "paid visit") },
              { label: "VAT collected", value: money(c.income.vat, currency), note: `products: ${money(c.income.items, currency)}` },
              {
                label: "Unpaid visits",
                value: money(c.unpaid.amount, currency),
                note: c.unpaid.count ? `${plural(c.unpaid.count, "visit")} (see list)` : "all paid",
                onClick: c.unpaid.count ? () => setTab("unpaid") : undefined,
              },
              { label: "Cancelled", value: int(c.services.cancelled), delta: o.change.cancelled, goodWhenUp: false, note: `${money(c.services.cancelled_value, currency)} not earned` },
            ]}
          />
        </div>
      )}

      {days.data && <DailyChart days={days.data} currency={currency} />}

      <nav className="rp-tabs" role="tablist" aria-label="Report details">
        {tabs.map((k) => (
          <button key={k} role="tab" type="button" aria-selected={tab === k} className={tab === k ? "is-active" : ""} onClick={() => setTab(k)}>
            {TABS[k].label}
          </button>
        ))}
      </nav>

      <section role="tabpanel" className={table.loading ? "rp-stale" : ""}>
        {table.error && <p className="rp-error" role="alert">{table.error}</p>}
        {table.data && <DataTable columns={TABS[tab].columns} rows={table.data} currency={currency} empty={TABS[tab].empty} />}
      </section>

      <p className="rp-footnote">
        Money received counts payments by the date they were paid. Services done counts completed visits by the visit date,
        at the price set when the visit was booked. Amounts without VAT exclude the VAT contained in each payment.
      </p>
    </div>
  );
}

function MasterReports() {
  const [preset, setPreset] = useState("month");
  const [period, setPeriod] = useState(() => presetPeriod("month"));
  const me = useAsync(() => getMyFigures(period), `${period.from}|${period.to}`);
  const d = me.data;
  const c = d?.current;
  const currency = d?.period?.currency || "EUR";

  return (
    <div className="rp">
      <Header
        title="My results"
        subtitle={periodLabel(period)}
        preset={preset}
        period={period}
        onPeriod={(id, p) => {
          setPreset(id);
          setPeriod(p);
        }}
      />
      {me.error && <p className="rp-error" role="alert">{me.error}</p>}
      {c && (
        <div className={me.loading ? "rp-stale" : ""}>
          <FigureRow
            items={[
              { label: "Money received", value: money(c.income.gross, currency), delta: d.change.income_gross },
              { label: "Visits completed", value: int(c.services.completed), delta: d.change.completed, note: `${hours(c.services.hours)} of work` },
              { label: "Services done (value)", value: money(c.services.rendered_value, currency), delta: d.change.rendered_value },
              { label: "Average ticket", value: money(c.avg_ticket, currency), delta: d.change.avg_ticket },
              { label: "My commission", value: money(c.margin.commissions, currency), note: "estimated" },
              { label: "Cancelled", value: int(c.services.cancelled), delta: d.change.cancelled, goodWhenUp: false },
            ]}
          />
          <DailyChart days={d.days} currency={currency} />
        </div>
      )}
    </div>
  );
}

export default function Reports() {
  const payload = getTokenPayload();
  const session = getSession();
  return payload?.role === "admin" ? <AdminReports session={session} /> : <MasterReports />;
}
