import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { fetchClients, fetchMasters, fetchServices } from "../api/api";
import { getDashboard } from "../api/dashboardApi";
import CreateAppointmentModal from "./components/CreateAppointmentModal";
import FilterMenu from "./dashboard/FilterMenu";
import Gauge from "./dashboard/Gauge";
import RevenueChart from "./dashboard/RevenueChart";
import { CustomersPanel, Heatmap, MastersPanel, ServicesDonut, Upcoming } from "./dashboard/Panels";
import { count, euro, pct } from "./dashboard/format";
import { dayMonth, periodLabel, periodRange, shiftAnchor, withYear } from "./dashboard/period";
import "./dashboard/dashboard.css";

function decodeToken(token) {
  try {
    return JSON.parse(atob(token.split(".")[1]));
  } catch {
    return null;
  }
}

const sumBy = (rows, k) => rows.reduce((s, r) => s + (r[k] || 0), 0);

export default function Dashboard() {
  const navigate = useNavigate();
  const token = localStorage.getItem("token");
  const role = useMemo(() => decodeToken(token)?.role, [token]);
  const isAdmin = role === "admin";

  const [period, setPeriod] = useState("week");
  const [anchor, setAnchor] = useState(() => new Date());
  const range = useMemo(() => periodRange(period, anchor), [period, anchor]);

  // filters: [] = all
  const [lists, setLists] = useState({ masters: [], services: [], clients: [] });
  const [fMasters, setFMasters] = useState([]);
  const [fServices, setFServices] = useState([]);
  const [fClients, setFClients] = useState([]);

  // what the user clicked on
  const [selDay, setSelDay] = useState(null);
  const [selMaster, setSelMaster] = useState(null);

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (!token) navigate("/login", { replace: true });
  }, [token, navigate]);

  // filter lists
  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const [clients, services, masters] = await Promise.all([
          fetchClients(token),
          fetchServices(token),
          isAdmin ? fetchMasters(token) : Promise.resolve([]),
        ]);
        setLists({
          clients: (clients || []).filter((c) => (c.type || "customer") === "customer").map((c) => ({ id: c.id, name: c.name })),
          services: (services || []).map((s) => ({ id: s.id, name: s.name })),
          masters: (masters || []).map((m) => ({ id: m.id, name: m.name, color: m.color })),
        });
      } catch (e) {
        setError(e.message || "Failed to load filters");
      }
    })();
  }, [token, isAdmin]);

  // dashboard figures
  useEffect(() => {
    if (!token) return;
    let stale = false;
    setLoading(true);
    getDashboard({
      from: range.from,
      to: range.to,
      masters: fMasters.length ? fMasters : undefined,
      services: fServices.length ? fServices : undefined,
      clients: fClients.length ? fClients : undefined,
    })
      .then((d) => {
        if (stale) return;
        setData(d);
        setError("");
      })
      .catch((e) => !stale && setError(e.message || "Failed to load the dashboard"))
      .finally(() => !stale && setLoading(false));
    return () => {
      stale = true;
    };
  }, [token, range.from, range.to, fMasters, fServices, fClients, reload]);

  // a selection that is no longer visible is dropped
  useEffect(() => {
    if (selDay && !range.days.includes(selDay)) setSelDay(null);
  }, [range, selDay]);
  useEffect(() => {
    if (selMaster && data && !data.masters.some((m) => m.id === selMaster)) setSelMaster(null);
  }, [data, selMaster]);

  const go = useCallback((step) => setAnchor((a) => shiftAnchor(period, a, step)), [period]);

  // ---- figures for whatever is selected -------------------------------------------------
  const view = useMemo(() => {
    if (!data) return null;
    const masterOf = new Map(data.masters.map((m) => [m.id, m]));
    const serviceOf = new Map(data.services.map((s) => [s.id, s]));
    const inScope = (c) => (!selDay || c.day === selDay) && (!selMaster || c.master_id === selMaster);
    const cells = data.cells.filter(inScope);
    const svcCells = data.svc_cells.filter(inScope);

    // per day, for the chart (master selection only highlights)
    const byDay = {};
    for (const d of range.days) byDay[d] = { income: 0, booked: 0, masterIncome: 0, completed: 0, ahead: 0, unpaid: 0, unpaidCount: 0, open: false };
    const mIncome = {};
    for (const c of data.cells) {
      const x = byDay[c.day];
      if (!x) continue;
      x.income += c.income;
      x.booked += c.booked_value;
      x.completed += c.completed;
      x.ahead += c.ahead;
      x.unpaid += c.unpaid;
      x.unpaidCount += c.unpaid_count;
      if (c.available_min > 0) x.open = true;
      if (selMaster && c.master_id === selMaster) x.masterIncome += c.income;
      if (c.master_id) {
        const k = `${c.day}|${c.master_id}`;
        mIncome[k] = (mIncome[k] || 0) + c.income;
      }
    }
    for (const [k, v] of Object.entries(mIncome)) {
      const [day, id] = k.split("|");
      const x = byDay[day];
      if (v > 0 && (!x.topMaster || v > x.topMaster.value)) x.topMaster = { name: masterOf.get(id)?.name || "—", value: v };
    }
    const sByDay = {};
    for (const c of data.svc_cells) {
      const k = `${c.day}|${c.service_id}`;
      sByDay[k] = (sByDay[k] || 0) + c.completed;
    }
    for (const [k, v] of Object.entries(sByDay)) {
      const [day, id] = k.split("|");
      const x = byDay[day];
      if (x && (!x.topService || v > x.topService.count)) x.topService = { name: serviceOf.get(id)?.name || "—", count: v };
    }
    // previous period, same position in the period
    data.previous_days.forEach((p) => {
      const offset = Math.round((new Date(`${p.day}T12:00:00`) - new Date(`${data.period.previous.from}T12:00:00`)) / 86400000);
      const d = range.days[offset];
      if (d && byDay[d]) byDay[d].prevIncome = p.income;
    });

    // masters panel (follows the selected day)
    const dayCells = selDay ? data.cells.filter((c) => c.day === selDay) : data.cells;
    const masters = data.masters.map((m) => {
      const mine = dayCells.filter((c) => c.master_id === m.id);
      const avail = sumBy(mine, "available_min");
      return {
        ...m,
        income: sumBy(mine, "income"),
        occupancy: avail > 0 ? (sumBy(mine, "booked_min") / avail) * 100 : null,
      };
    }).filter((m) => m.is_active || m.income > 0);

    // services (follow day and master)
    const sv = {};
    for (const c of svcCells) {
      const s = (sv[c.service_id] ||= { id: c.service_id, name: serviceOf.get(c.service_id)?.name || "—", rendered: 0, completed: 0 });
      s.rendered += c.rendered;
      s.completed += c.completed;
    }

    // gauges
    const income = sumBy(cells, "income");
    const completed = sumBy(cells, "completed");
    const due = sumBy(cells, "due");
    const rendered = sumBy(cells, "rendered");
    const unpaid = sumBy(cells, "unpaid");
    const bookedMin = sumBy(cells, "booked_min");
    const availMin = sumBy(cells, "available_min");
    const ahead = sumBy(cells, "ahead");
    const bookedValue = sumBy(cells, "booked_value");

    // goal: monthly goal (or last year) for the period, narrowed to the selection
    let goal = data.goal.amount || 0;
    let goalNote = data.goal.source === "goal" ? "goal" : "same dates last year";
    if (!goal) {
      goal = sumBy(data.previous_days, "income");
      goalNote = "previous period";
    }
    if (selDay) {
      const openDays = range.days.filter((d) => byDay[d].open).length || 1;
      goal = byDay[selDay].open ? goal / openDays : 0;
    }
    if (selMaster) {
      const activeMasters = data.masters.filter((m) => m.is_active).length || 1;
      goal /= activeMasters;
    }

    return { byDay, masters, services: Object.values(sv), income, completed, due, rendered, unpaid, bookedMin, availMin, ahead, bookedValue, goal, goalNote };
  }, [data, range.days, selDay, selMaster]);

  const selMasterObj = data?.masters.find((m) => m.id === selMaster);
  const scopeLabel = [selDay ? dayMonth(selDay) : period === "day" ? "this day" : `this ${period}`, selMasterObj?.name]
    .filter(Boolean)
    .join(", ");
  const years = useMemo(() => {
    const y = new Date().getFullYear();
    return [y - 2, y - 1, y, y + 1];
  }, []);

  const occupancy = view && view.availMin > 0 ? (view.bookedMin / view.availMin) * 100 : 0;

  return (
    <div className="db">
      {/* ---- top bar --------------------------------------------------------- */}
      <div className="db-bar db-card">
        <div className="db-bar__nav">
          <button type="button" className="db-icon-btn" aria-label={`Previous ${period}`} onClick={() => go(-1)}>‹</button>
          <button type="button" className="db-today" onClick={() => setAnchor(new Date())}>Today</button>
          <button type="button" className="db-icon-btn" aria-label={`Next ${period}`} onClick={() => go(1)}>›</button>
          <span className="db-bar__range">{periodLabel(period, anchor)}</span>
        </div>
        <label className="db-year">
          Year
          <select value={anchor.getFullYear()} onChange={(e) => setAnchor((a) => withYear(a, Number(e.target.value)))}>
            {years.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </label>
        <div className="db-seg" role="group" aria-label="Period">
          {["day", "week", "month"].map((p) => (
            <button
              key={p}
              type="button"
              className={period === p ? "is-on" : ""}
              aria-pressed={period === p}
              onClick={() => {
                setPeriod(p);
                setSelDay(null);
              }}
            >
              {p[0].toUpperCase() + p.slice(1)}
            </button>
          ))}
        </div>
        <div className="db-bar__filters">
          {isAdmin && <FilterMenu label="Masters" items={lists.masters} selected={fMasters} onChange={setFMasters} />}
          <FilterMenu label="Customers" items={lists.clients} selected={fClients} onChange={setFClients} searchable />
          <FilterMenu label="Services" items={lists.services} selected={fServices} onChange={setFServices} searchable />
        </div>
      </div>

      {error && <p className="db-error" role="alert">{error}</p>}

      {view && (
        <div className={`db-body ${loading ? "is-loading" : ""}`} aria-busy={loading}>
          {/* ---- gauges -------------------------------------------------------- */}
          <div className="db-gauges">
            <Gauge
              label="Revenue"
              value={view.income}
              max={view.goal}
              format={euro}
              note={[
                view.goal ? `${view.goalNote === "goal" ? "Goal" : `Target (${view.goalNote})`} for ${scopeLabel}` : "No goal set",
                view.bookedValue ? `${euro(view.bookedValue)} more booked` : "",
              ].filter(Boolean).join(" · ")}
              color="#4f9e8f"
            />
            <Gauge
              label="Visits done"
              value={view.completed}
              max={view.due}
              format={count}
              note={view.due ? `of ${count(view.due)} due so far · ${count(view.due - view.completed)} cancelled or not closed` : "No visits due yet"}
            />
            <Gauge
              label="Occupancy"
              value={view.bookedMin / 60}
              max={view.availMin / 60}
              format={(v) => `${count(v)} h`}
              warn={view.availMin > 0 && occupancy < 60}
              color="#005067"
              note={view.availMin ? "Hours booked of masters' working hours" : "Closed"}
            />
            <Gauge
              label="Paid"
              value={view.rendered - view.unpaid}
              max={view.rendered}
              format={euro}
              color="#6fb7c4"
              note={view.unpaid > 0 ? `Unpaid: ${euro(view.unpaid)}` : "Everything done is paid"}
            />
          </div>

          {/* ---- revenue + upcoming ------------------------------------------- */}
          <div className="db-row">
            <section className="db-card db-panel db-row__wide">
              <header className="db-panel__head">
                <h2>Revenue by day</h2>
                <div className="db-keys" aria-hidden="true">
                  <span><i className="db-key db-key--done" />Received</span>
                  <span><i className="db-key db-key--booked" />Booked (forecast)</span>
                  {selMasterObj && <span><i className="db-key" style={{ background: selMasterObj.color || "#b96c86" }} />{selMasterObj.name}</span>}
                </div>
              </header>
              <p className="db-panel__hint">
                {selDay
                  ? `${dayMonth(selDay)} selected: the panels show this day. Click it again for the whole ${period}.`
                  : "Hover a day for details; click it to focus the panels on that day."}
              </p>
              <RevenueChart
                days={range.days}
                data={view.byDay}
                today={data.period.today}
                selectedDay={selDay}
                onSelectDay={setSelDay}
                master={selMasterObj}
              />
            </section>
            <Upcoming rows={data.upcoming} todayCount={data.today_count} onNew={isAdmin ? () => setShowCreate(true) : null} />
          </div>

          {/* ---- masters + customers ------------------------------------------ */}
          {(isAdmin || data.customers) && (
            <div className="db-row">
              {isAdmin && (
                <div className="db-row__wide">
                  <MastersPanel rows={view.masters} selected={selMaster} onSelect={setSelMaster} dayLabel={selDay ? dayMonth(selDay) : `whole ${period}`} />
                </div>
              )}
              {data.customers && <CustomersPanel data={data.customers} />}
            </div>
          )}

          {/* ---- heatmap + services ------------------------------------------- */}
          <div className="db-row">
            <div className="db-row__wide">
              <Heatmap cells={data.heatmap} />
            </div>
            <ServicesDonut rows={view.services} dayLabel={scopeLabel} />
          </div>
        </div>
      )}
      {!view && !error && <p className="db-loading">Loading…</p>}

      {showCreate && (
        <CreateAppointmentModal
          onClose={() => setShowCreate(false)}
          onSuccess={() => {
            setShowCreate(false);
            setReload((r) => r + 1);
          }}
        />
      )}
    </div>
  );
}
