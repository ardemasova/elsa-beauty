import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { count, euro, pct } from "./format";

/** Small tab switch used by several panels. */
export function Tabs({ value, onChange, options, label }) {
  return (
    <div className="db-tabs" role="tablist" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={value === o.value}
          className={value === o.value ? "is-on" : ""}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Values grow from zero after the first paint, so bars animate in. */
function useGrown() {
  const [grown, setGrown] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setGrown(true));
    return () => cancelAnimationFrame(id);
  }, []);
  return grown;
}

// ---------------------------------------------------------------------------
export function MastersPanel({ rows, selected, onSelect, dayLabel }) {
  const [mode, setMode] = useState("revenue");
  const grown = useGrown();
  const sorted = useMemo(() => {
    const key = mode === "revenue" ? "income" : "occupancy";
    return [...rows].sort((a, b) => (b[key] ?? -1) - (a[key] ?? -1) || a.name.localeCompare(b.name));
  }, [rows, mode]);
  const max = Math.max(1, ...rows.map((r) => r.income));

  return (
    <section className="db-card db-panel">
      <header className="db-panel__head">
        <h2>Masters</h2>
        <Tabs
          label="Masters measure"
          value={mode}
          onChange={setMode}
          options={[
            { value: "revenue", label: "Revenue" },
            { value: "occupancy", label: "Occupancy" },
          ]}
        />
      </header>
      <p className="db-panel__hint">
        {mode === "revenue" ? "Money received" : "Share of working hours booked"}, {dayLabel}.
        {" "}Click a master to see their part everywhere{mode === "occupancy" ? "; pink = under 60 %" : ""}.
      </p>
      {!rows.length && <p className="db-empty">No masters with working hours in this period.</p>}
      <ul className="db-masters">
        {sorted.map((r) => {
          const w = mode === "revenue" ? (r.income / max) * 100 : (r.occupancy ?? 0);
          const low = mode === "occupancy" && r.occupancy !== null && r.occupancy < 60;
          const sel = selected === r.id;
          return (
            <li key={r.id}>
              <button
                type="button"
                className={`db-mrow ${sel ? "is-selected" : ""} ${selected && !sel ? "is-dim" : ""}`}
                aria-pressed={sel}
                onClick={() => onSelect(sel ? null : r.id)}
              >
                <span className="db-mrow__name">
                  <span className="db-dot" style={{ background: r.color || "#03839a" }} aria-hidden="true" />
                  {r.name}
                </span>
                <span className="db-mrow__track" aria-hidden="true">
                  <span
                    className={`db-mrow__bar ${low ? "is-low" : ""}`}
                    style={{ width: `${grown ? Math.min(100, w) : 0}%`, background: sel ? r.color || "#b96c86" : undefined }}
                  />
                </span>
                <span className="db-mrow__value">
                  {mode === "revenue" ? euro(r.income) : r.occupancy === null ? "day off" : pct(r.occupancy)}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// ---------------------------------------------------------------------------
const SLICE_COLORS = ["#005067", "#03839a", "#6fb7c4", "#b96c86", "#dcaabd", "#9aa8ad", "#c9d3d6"];
const C = 2 * Math.PI * 64;

export function ServicesDonut({ rows, dayLabel }) {
  const [mode, setMode] = useState("revenue");
  const [picked, setPicked] = useState(null);
  const grown = useGrown();
  const key = mode === "revenue" ? "rendered" : "completed";

  const slices = useMemo(() => {
    const sorted = [...rows].filter((r) => r[key] > 0).sort((a, b) => b[key] - a[key]);
    const head = sorted.slice(0, 6);
    const rest = sorted.slice(6);
    if (rest.length) {
      head.push({
        id: "other",
        name: `Other (${rest.length})`,
        rendered: rest.reduce((s, r) => s + r.rendered, 0),
        completed: rest.reduce((s, r) => s + r.completed, 0),
      });
    }
    return head;
  }, [rows, key]);
  const total = slices.reduce((s, r) => s + r[key], 0);
  const sel = slices.find((s) => s.id === picked);
  // start of each slice along the ring
  const starts = slices.reduce((out, s, k) => [...out, k ? out[k - 1] + (grown ? (slices[k - 1][key] / total) * C : 0) : 0], []);

  return (
    <section className="db-card db-panel">
      <header className="db-panel__head">
        <h2>Top services</h2>
        <Tabs
          label="Services measure"
          value={mode}
          onChange={setMode}
          options={[
            { value: "revenue", label: "By value" },
            { value: "count", label: "By visits" },
          ]}
        />
      </header>
      {!total ? (
        <p className="db-empty">No completed visits {dayLabel}.</p>
      ) : (
        <div className="db-donut">
          <div className="db-donut__chart">
            <svg viewBox="0 0 180 180" role="img" aria-label={`Services by ${mode === "revenue" ? "value" : "visits"}, ${dayLabel}`}>
              <g transform="rotate(-90 90 90)">
                {slices.map((s, k) => {
                  const len = grown ? (s[key] / total) * C : 0;
                  const gap = slices.length > 1 ? Math.min(2, len) : 0;
                  return (
                    <circle
                      key={s.id}
                      cx="90"
                      cy="90"
                      r="64"
                      className="db-donut__slice"
                      stroke={SLICE_COLORS[k % SLICE_COLORS.length]}
                      strokeWidth={picked === s.id ? 34 : 26}
                      strokeDasharray={`${Math.max(0, len - gap).toFixed(2)} ${C.toFixed(2)}`}
                      strokeDashoffset={(-starts[k]).toFixed(2)}
                      opacity={picked && picked !== s.id ? 0.3 : 1}
                    />
                  );
                })}
              </g>
            </svg>
            <div className="db-donut__center">
              <strong>{mode === "revenue" ? euro(sel ? sel.rendered : total) : `${count(sel ? sel.completed : total)} visits`}</strong>
              <span>{sel ? sel.name : dayLabel}</span>
            </div>
          </div>
          <ul className="db-legend">
            {slices.map((s, k) => (
              <li key={s.id}>
                <button
                  type="button"
                  className={`db-mrow db-legend__row ${picked === s.id ? "is-selected" : ""} ${picked && picked !== s.id ? "is-dim" : ""}`}
                  aria-pressed={picked === s.id}
                  onClick={() => setPicked(picked === s.id ? null : s.id)}
                >
                  <span className="db-swatch" style={{ background: SLICE_COLORS[k % SLICE_COLORS.length] }} aria-hidden="true" />
                  <span className="db-legend__name">{s.name}</span>
                  <span className="db-mrow__value">
                    {mode === "revenue" ? euro(s.rendered) : count(s.completed)} · {pct((s[key] / total) * 100)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
export function CustomersPanel({ data }) {
  const [tab, setTab] = useState("loyal");
  const [all, setAll] = useState(false);
  if (!data) return null;
  const list = tab === "loyal" ? data.loyal : data.lapsed;
  const shown = all ? list : list.slice(0, 5);
  const short = (iso) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

  return (
    <section className="db-card db-panel">
      <header className="db-panel__head">
        <h2>Customers</h2>
      </header>
      <div className="db-stats">
        <div>
          <span>New</span>
          <strong>{count(data.new_clients)}</strong>
        </div>
        <div>
          <span>Returning</span>
          <strong>{pct(data.returning_share)}</strong>
        </div>
        <div>
          <span>Cancelled</span>
          <strong className={data.cancel_rate > 10 ? "is-warn" : ""}>{pct(data.cancel_rate)}</strong>
        </div>
      </div>
      <Tabs
        label="Customer lists"
        value={tab}
        onChange={(v) => {
          setTab(v);
          setAll(false);
        }}
        options={[
          { value: "loyal", label: `Most loyal in ${data.year}` },
          { value: "lapsed", label: `Not seen for ${data.lapsed_days}+ days (${data.lapsed.length}${data.lapsed.length === 50 ? "+" : ""})` },
        ]}
      />
      <ul className={`db-people ${all ? "is-all" : ""}`}>
        {shown.map((c) => (
          <li key={c.id}>
            <div className="db-people__who">
              <span className="db-people__name">{c.name}</span>
              <span className="db-people__sub">
                {tab === "loyal"
                  ? `${count(c.visits)} visits${c.last_visit ? ` · last ${short(c.last_visit)}` : ""}`
                  : `Last: ${short(c.last_visit)} · ${c.service}`}
                {c.phone && (
                  <>
                    {" · "}
                    <a href={`tel:${c.phone.replace(/\s/g, "")}`}>{c.phone}</a>
                  </>
                )}
              </span>
            </div>
            <span className="db-people__value">{tab === "loyal" ? euro(c.spent) : `${count(c.days_away)} days`}</span>
          </li>
        ))}
        {!list.length && (
          <li className="db-empty">{tab === "loyal" ? "No payments from customers this year yet." : "Everyone has been back recently."}</li>
        )}
      </ul>
      {list.length > 5 && (
        <button type="button" className="db-link" onClick={() => setAll((a) => !a)}>
          {all ? "Show fewer" : `Show all ${list.length}`}
        </button>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
const DOW = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function Heatmap({ cells }) {
  const grown = useGrown();
  const days = [...new Set(cells.map((c) => c.dow))];
  const hrs = [...new Set(cells.map((c) => c.hour))];
  const get = (d, h) => cells.find((c) => c.dow === d && c.hour === h)?.share ?? 0;

  // quietest and busiest two-hour windows, for a one-line hint
  const windows = [];
  for (const d of days) for (let k = 0; k < hrs.length - 1; k++) windows.push({ d, h: hrs[k], v: (get(d, hrs[k]) + get(d, hrs[k + 1])) / 2 });
  windows.sort((a, b) => a.v - b.v);
  const q = windows[0];
  const b = windows[windows.length - 1];
  const hh = (h) => `${String(h).padStart(2, "0")}:00`;

  return (
    <section className="db-card db-panel">
      <header className="db-panel__head">
        <h2>When the salon is busy</h2>
      </header>
      <p className="db-panel__hint">Share of masters' time booked, by weekday and hour, last 8 weeks.</p>
      {!cells.length ? (
        <p className="db-empty">Set opening hours and working days in Settings.</p>
      ) : (
        <>
          <div className="db-heat" style={{ gridTemplateColumns: `44px repeat(${hrs.length}, minmax(0, 1fr))` }}>
            <span />
            {hrs.map((h) => (
              <span key={h} className="db-heat__h">{h}</span>
            ))}
            {days.map((d) => (
              <HeatRow key={d} d={d} hrs={hrs} get={get} grown={grown} />
            ))}
          </div>
          <div className="db-heat__foot">
            <div className="db-heat__legend" aria-hidden="true">
              <span>Quiet</span>
              {[0.08, 0.3, 0.55, 0.85].map((a) => (
                <i key={a} style={{ background: `rgba(0,80,103,${a})` }} />
              ))}
              <span>Full</span>
            </div>
            {q && b && b.v > 0 && (
              <p>
                Quietest: {DOW[q.d]} {hh(q.h)}–{hh(q.h + 2)} ({pct(q.v * 100)}). Busiest: {DOW[b.d]} {hh(b.h)}–{hh(b.h + 2)} ({pct(b.v * 100)}).
              </p>
            )}
          </div>
        </>
      )}
    </section>
  );
}

function HeatRow({ d, hrs, get, grown }) {
  return (
    <>
      <span className="db-heat__d">{DOW[d]}</span>
      {hrs.map((h) => {
        const v = get(d, h);
        return (
          <span
            key={h}
            className="db-heat__cell"
            title={`${DOW[d]} ${h}:00 · ${Math.round(v * 100)} % booked`}
            style={{ background: `rgba(0,80,103,${grown ? (0.06 + v * 0.84).toFixed(2) : 0.04})` }}
          />
        );
      })}
    </>
  );
}

// ---------------------------------------------------------------------------
export function Upcoming({ rows, todayCount, onNew }) {
  const when = (a) => {
    const s = new Date(a.start_time);
    const e = new Date(a.end_time);
    const t = (d) => d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
    const isToday = s.toDateString() === new Date().toDateString();
    const day = isToday ? "Today" : s.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
    return `${day}, ${t(s)} – ${t(e)}`;
  };
  return (
    <section className="db-card db-panel db-upcoming">
      <header className="db-panel__head">
        <h2>Upcoming</h2>
        {onNew && (
          <button type="button" className="db-btn-accent" onClick={onNew}>
            + New appointment
          </button>
        )}
      </header>
      <ul className="db-up">
        {rows.map((a) => (
          <li key={a.id}>
            <span className="db-dot db-dot--lg" style={{ background: a.master_color || "#03839a" }} aria-hidden="true" />
            <div>
              <span className="db-up__when">{when(a)}</span>
              <span className="db-up__what">{a.client_name || "—"} · {a.service_name}</span>
              <span className="db-up__who">with {a.master_name}</span>
            </div>
          </li>
        ))}
        {!rows.length && <li className="db-empty">Nothing booked ahead for these filters.</li>}
      </ul>
      <Link to="/appointments" className="db-link">
        {todayCount ? `All appointments today (${todayCount})` : "Open the calendar"}
      </Link>
    </section>
  );
}
