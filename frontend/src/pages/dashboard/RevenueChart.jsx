import { useEffect, useState } from "react";
import { count, euro, euroShort } from "./format";
import { dayMonth, fullDay, weekdayShort } from "./period";

/**
 * Money per day: received (solid) and already booked from now on (dashed,
 * the forecast). A selected master's share shows inside the bars. Hover a
 * bar for details; click it to focus the rest of the dashboard on that day.
 */
export default function RevenueChart({ days, data, today, selectedDay, onSelectDay, master }) {
  const [hover, setHover] = useState(null);
  const [grown, setGrown] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setGrown(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const max = Math.max(1, ...days.map((d) => (data[d]?.income || 0) + (data[d]?.booked || 0)));
  const step = niceStep(max);
  const top = Math.ceil(max / step) * step;
  const ticks = [];
  for (let v = step; v <= top + 0.5; v += step) ticks.push(v);

  const active = hover;
  const many = days.length > 10;
  const labelEvery = days.length > 20 ? 5 : 1;

  return (
    <div className="db-rev">
      <div className="db-rev__plot">
        <div className="db-rev__grid" aria-hidden="true">
          {ticks.map((t) => (
            <div key={t} className="db-rev__tick" style={{ bottom: `${(t / top) * 100}%` }}>
              <span>{euroShort(t)}</span>
            </div>
          ))}
        </div>

        <div className={`db-rev__bars ${many ? "is-dense" : ""}`} onMouseLeave={() => setHover(null)}>
          {days.map((d) => {
            const x = data[d] || {};
            const inc = grown ? x.income || 0 : 0;
            const bk = grown ? x.booked || 0 : 0;
            const part = grown && master ? x.masterIncome || 0 : 0;
            const dim = selectedDay && selectedDay !== d;
            const closed = !x.open && !x.income && !x.booked;
            return (
              <button
                key={d}
                type="button"
                className={`db-rev__col ${selectedDay === d ? "is-selected" : ""} ${dim ? "is-dim" : ""}`}
                aria-pressed={selectedDay === d}
                aria-label={`${fullDay(d)}: received ${euro(x.income)}${x.booked ? `, booked ${euro(x.booked)}` : ""}`}
                onMouseEnter={() => setHover(d)}
                onFocus={() => setHover(d)}
                onBlur={() => setHover(null)}
                onClick={() => onSelectDay(selectedDay === d ? null : d)}
              >
                <span className="db-rev__stack">
                  <span className="db-rev__booked" style={{ height: `${(bk / top) * 100}%` }} />
                  <span className="db-rev__done" style={{ height: `${(inc / top) * 100}%` }}>
                    <span className="db-rev__part" style={{ height: inc ? `${(part / (x.income || 1)) * 100}%` : 0, background: master?.color }} />
                  </span>
                </span>
                {closed && <span className="db-rev__closed">closed</span>}
              </button>
            );
          })}
        </div>

        {active && data[active] && (
          <Tooltip
            day={active}
            x={data[active]}
            today={today}
            left={((days.indexOf(active) + 0.5) / days.length) * 100}
          />
        )}
      </div>

      <div className={`db-rev__labels ${many ? "is-dense" : ""}`} aria-hidden="true">
        {days.map((d, k) => (
          <span key={d} className={d === today ? "is-today" : ""}>
            {k % labelEvery === 0 || d === today ? (many ? dayMonth(d).replace(/\s.*/, "") : `${weekdayShort(d)} ${Number(d.slice(8))}`) : ""}
          </span>
        ))}
      </div>
    </div>
  );
}

function Tooltip({ day, x, today, left }) {
  const side = left > 70 ? "right" : left < 30 ? "left" : "center";
  const delta = x.prevIncome ? Math.round(((x.income - x.prevIncome) / x.prevIncome) * 100) : null;
  return (
    <div className={`db-tip db-tip--${side}`} style={{ left: `${left}%` }} role="status">
      <p className="db-tip__date">
        {fullDay(day)}
        {day === today ? " · today" : day > today ? " · booked" : ""}
      </p>
      <p className="db-tip__value">{euro(x.income)}</p>
      <dl className="db-tip__grid">
        {x.booked > 0 && (
          <>
            <dt>Booked ahead</dt>
            <dd>{euro(x.booked)}</dd>
          </>
        )}
        <dt>Visits done</dt>
        <dd>{count(x.completed)}{x.ahead ? ` · ${count(x.ahead)} ahead` : ""}</dd>
        <dt>Top master</dt>
        <dd>{x.topMaster ? `${x.topMaster.name} · ${euro(x.topMaster.value)}` : "—"}</dd>
        <dt>Top service</dt>
        <dd>{x.topService ? `${x.topService.name} · ${count(x.topService.count)}` : "—"}</dd>
        <dt>Unpaid</dt>
        <dd>{x.unpaid > 0 ? `${count(x.unpaidCount)} · ${euro(x.unpaid)}` : "—"}</dd>
        {delta !== null && (
          <>
            <dt>vs previous period</dt>
            <dd className={delta >= 0 ? "is-up" : "is-down"}>{delta > 0 ? "+" : ""}{delta} %</dd>
          </>
        )}
      </dl>
    </div>
  );
}

function niceStep(max) {
  const raw = max / 4;
  const p = 10 ** Math.floor(Math.log10(raw));
  const m = raw / p;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p;
}
