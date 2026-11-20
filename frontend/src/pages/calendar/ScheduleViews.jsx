import { useEffect, useMemo, useRef, useState } from "react";
import { count, euro, pct } from "../dashboard/format";
import { addDays, isoDay, mondayOf, parseDay } from "../dashboard/period";
import { hexToRgba } from "./util";

/*
 * Calendar views built for a salon:
 *   DayView    one column per master (like Fresha / Booksy / Treatwell)
 *   WeekView   one master, Monday to Sunday; or a per-day summary for all
 *   MonthView  a day grid with visits, value and how full each day is
 * Cards are coloured by master. Times are shown in the browser's zone,
 * which for a salon is the salon's own.
 */

const HOUR_PX = 64;
const MIN_PX = HOUR_PX / 60;

const toMin = (hhmm) => {
  const [h, m] = String(hhmm || "0:0").split(":").map(Number);
  return h * 60 + (m || 0);
};
const minutesOfDay = (d) => d.getHours() * 60 + d.getMinutes();
const timeText = (d) => d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
const isDayOff = (a) => !a.client_id && !a.client_name && /day ?off/i.test(a.service_name || "");

/** Visible hours: opening hours, widened to fit anything booked outside them. */
function hourRange(settings, appts) {
  let from = toMin(settings?.work_start || "10:00");
  let to = toMin(settings?.work_end || "20:00");
  for (const a of appts) {
    const s = new Date(a.start_time);
    const e = new Date(a.end_time);
    from = Math.min(from, minutesOfDay(s));
    to = Math.max(to, s.toDateString() === e.toDateString() ? minutesOfDay(e) : 24 * 60);
  }
  from = Math.max(0, Math.floor(from / 60) * 60);
  to = Math.min(24 * 60, Math.ceil(to / 60) * 60);
  return { from, to };
}

/** Side-by-side lanes for overlapping visits in one column. */
function layout(appts) {
  const items = appts
    .map((a) => ({ a, s: +new Date(a.start_time), e: +new Date(a.end_time) }))
    .sort((x, y) => x.s - y.s || y.e - x.e);
  const out = [];
  let group = [];
  let groupEnd = -Infinity;
  const flush = () => {
    const lanes = [];
    for (const it of group) {
      let k = lanes.findIndex((end) => end <= it.s);
      if (k === -1) {
        k = lanes.length;
        lanes.push(it.e);
      } else lanes[k] = it.e;
      it.lane = k;
    }
    for (const it of group) out.push({ ...it, lanes: lanes.length });
    group = [];
  };
  for (const it of items) {
    if (group.length && it.s >= groupEnd) {
      flush();
      groupEnd = -Infinity;
    }
    group.push(it);
    groupEnd = Math.max(groupEnd, it.e);
  }
  if (group.length) flush();
  return out;
}

function useNow() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(id);
  }, []);
  return now;
}

// ---------------------------------------------------------------------------
function Card({ it, color, range, onOpen, showMaster }) {
  const a = it.a;
  const s = new Date(a.start_time);
  const e = new Date(a.end_time);
  const top = (minutesOfDay(s) - range.from) * MIN_PX;
  const height = Math.max(18, ((it.e - it.s) / 60000) * MIN_PX - 2);
  const off = isDayOff(a);
  const status = a.status;
  const short = height < 36;
  const style = {
    top,
    height,
    left: `calc(${(it.lane / it.lanes) * 100}% + 2px)`,
    width: `calc(${100 / it.lanes}% - 4px)`,
    "--card": color,
    background: off ? undefined : hexToRgba(color, status === "cancelled" ? 0.06 : 0.16),
  };
  return (
    <button
      type="button"
      className={`sc-card ${off ? "is-off" : ""} is-${status} ${short ? "is-short" : ""}`}
      style={style}
      onClick={() => onOpen(a)}
      title={`${timeText(s)}–${timeText(e)} · ${a.client_name || (off ? "Day off" : "—")} · ${a.service_name}${showMaster ? ` · ${a.master_name}` : ""}`}
    >
      <span className="sc-card__time">
        {timeText(s)}
        {!short && `–${timeText(e)}`}
      </span>
      <span className="sc-card__who">{off ? "Day off" : a.client_name || "Busy"}</span>
      {!off && <span className="sc-card__what">{a.service_name}</span>}
      {showMaster && !short && <span className="sc-card__what">{a.master_name}</span>}
    </button>
  );
}

function TimeAxis({ range }) {
  const rows = [];
  for (let m = range.from; m < range.to; m += 60) rows.push(m);
  return (
    <div className="sc-axis" aria-hidden="true">
      {rows.map((m) => (
        <span key={m} style={{ height: HOUR_PX }}>{`${String(m / 60).padStart(2, "0")}:00`}</span>
      ))}
    </div>
  );
}

function Column({ appts, colorOf, range, closed, now, isToday, onOpen, onSlot, showMaster, workFrom, workTo }) {
  const placed = useMemo(() => layout(appts), [appts]);
  const height = (range.to - range.from) * MIN_PX;
  const nowTop = (minutesOfDay(now) - range.from) * MIN_PX;
  const click = (e) => {
    if (e.target !== e.currentTarget || !onSlot) return;
    const y = e.nativeEvent.offsetY;
    const min = range.from + Math.floor(y / MIN_PX / 15) * 15;
    onSlot(min);
  };
  return (
    <div className={`sc-col ${closed ? "is-closed" : ""}`} style={{ height }} onClick={click}>
      {!closed && workFrom > range.from && (
        <div className="sc-col__shade" style={{ top: 0, height: (workFrom - range.from) * MIN_PX }} />
      )}
      {!closed && workTo < range.to && (
        <div className="sc-col__shade" style={{ top: (workTo - range.from) * MIN_PX, bottom: 0 }} />
      )}
      {placed.map((it) => (
        <Card key={it.a.id} it={it} color={colorOf(it.a)} range={range} onOpen={onOpen} showMaster={showMaster} />
      ))}
      {isToday && nowTop > 0 && nowTop < height && <div className="sc-now" style={{ top: nowTop }} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
export function DayView({ day, masters, appts, settings, onOpen, onSlot }) {
  const now = useNow();
  const scroller = useRef(null);
  const dayAppts = appts.filter((a) => isoDay(new Date(a.start_time)) === day);
  const range = hourRange(settings, dayAppts);
  const isToday = day === isoDay(now);
  const dow = ((parseDay(day).getDay() + 6) % 7) + 1;
  const closed = settings && !settings.work_days?.includes(dow);
  const byMaster = useMemo(() => {
    const m = new Map(masters.map((x) => [x.id, []]));
    for (const a of dayAppts) m.get(a.master_id)?.push(a);
    return m;
  }, [masters, dayAppts]);

  useEffect(() => {
    // open on the current hour today, otherwise on opening time
    if (!scroller.current) return;
    const target = isToday ? Math.max(0, (minutesOfDay(now) - range.from - 60) * MIN_PX) : 0;
    scroller.current.scrollTop = target;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day]);

  if (!masters.length) return <p className="sc-empty">No masters selected.</p>;

  return (
    <div className="sc-grid" ref={scroller} style={{ "--cols": masters.length }}>
      <div className="sc-head">
        <span className="sc-head__corner" />
        {masters.map((m) => {
          const list = byMaster.get(m.id) || [];
          const visits = list.filter((a) => !isDayOff(a) && a.status !== "cancelled").length;
          const off = list.some(isDayOff);
          return (
            <div key={m.id} className="sc-head__cell">
              <span className="sc-avatar" style={{ background: m.color || "#03839a" }}>
                {m.photo_url ? <img src={m.photo_url} alt="" /> : m.name.slice(0, 1)}
              </span>
              <span className="sc-head__name">{m.name}</span>
              <span className="sc-head__sub">{off && !visits ? "day off" : `${count(visits)} visit${visits === 1 ? "" : "s"}`}</span>
            </div>
          );
        })}
      </div>
      <div className="sc-body">
        <TimeAxis range={range} />
        {masters.map((m) => (
          <Column
            key={m.id}
            appts={byMaster.get(m.id) || []}
            colorOf={() => m.color || "#03839a"}
            range={range}
            closed={closed}
            now={now}
            isToday={isToday}
            onOpen={onOpen}
            onSlot={onSlot ? (min) => onSlot(m.id, day, min) : null}
            workFrom={toMin(settings?.work_start || "10:00")}
            workTo={toMin(settings?.work_end || "20:00")}
          />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
export function WeekView({ days, master, masters, appts, settings, onOpen, onSlot, onPickDay }) {
  const now = useNow();
  const today = isoDay(now);
  const workDays = settings?.work_days || [1, 2, 3, 4, 5, 6];
  const byDay = useMemo(() => {
    const m = new Map(days.map((d) => [d, []]));
    for (const a of appts) m.get(isoDay(new Date(a.start_time)))?.push(a);
    return m;
  }, [days, appts]);

  if (!master) {
    // all masters: a summary per day
    const open = toMin(settings?.work_end || "20:00") - toMin(settings?.work_start || "10:00");
    return (
      <div className="sc-week-sum">
        {days.map((d) => {
          const list = byDay.get(d) || [];
          const visits = list.filter((a) => !isDayOff(a) && a.status !== "cancelled");
          const offMin = list.filter(isDayOff).reduce((s, a) => s + (new Date(a.end_time) - new Date(a.start_time)) / 60000, 0);
          const bookedMin = visits.reduce((s, a) => s + (new Date(a.end_time) - new Date(a.start_time)) / 60000, 0);
          const dow = ((parseDay(d).getDay() + 6) % 7) + 1;
          const isOpen = workDays.includes(dow);
          const cap = isOpen ? open * masters.length - offMin : 0;
          const share = cap > 0 ? Math.min(100, (bookedMin / cap) * 100) : 0;
          const value = visits.reduce((s, a) => s + Number(a.price || 0), 0);
          const busiest = Object.entries(visits.reduce((o, a) => ({ ...o, [a.master_name]: (o[a.master_name] || 0) + 1 }), {}))
            .sort((x, y) => y[1] - x[1])[0];
          return (
            <button key={d} type="button" className={`sc-sum ${d === today ? "is-today" : ""} ${isOpen ? "" : "is-closed"}`} onClick={() => onPickDay(d)}>
              <span className="sc-sum__day">
                {parseDay(d).toLocaleDateString("en-GB", { weekday: "long" })}
                <b>{parseDay(d).getDate()}</b>
              </span>
              {isOpen || visits.length ? (
                <>
                  <span className="sc-sum__big">{count(visits.length)} visits</span>
                  <span className="sc-sum__line">{euro(value)} booked value</span>
                  <span className="sc-sum__bar" aria-label={`${pct(share)} of working hours booked`}>
                    <i style={{ width: `${share}%` }} />
                  </span>
                  <span className="sc-sum__line">{pct(share)} of hours booked</span>
                  {busiest && <span className="sc-sum__line">Busiest: {busiest[0]} ({busiest[1]})</span>}
                </>
              ) : (
                <span className="sc-sum__line">Closed</span>
              )}
              <span className="sc-sum__open">Open day →</span>
            </button>
          );
        })}
      </div>
    );
  }

  const mine = appts.filter((a) => a.master_id === master.id);
  const range = hourRange(settings, mine);
  return (
    <div className="sc-grid" style={{ "--cols": days.length }}>
      <div className="sc-head">
        <span className="sc-head__corner" />
        {days.map((d) => {
          const list = (byDay.get(d) || []).filter((a) => a.master_id === master.id);
          const visits = list.filter((a) => !isDayOff(a) && a.status !== "cancelled").length;
          return (
            <button key={d} type="button" className={`sc-head__cell sc-head__day ${d === today ? "is-today" : ""}`} onClick={() => onPickDay(d)}>
              <span className="sc-head__dow">{parseDay(d).toLocaleDateString("en-GB", { weekday: "short" })}</span>
              <span className="sc-head__date">{parseDay(d).getDate()}</span>
              <span className="sc-head__sub">{list.some(isDayOff) && !visits ? "day off" : `${count(visits)} visits`}</span>
            </button>
          );
        })}
      </div>
      <div className="sc-body">
        <TimeAxis range={range} />
        {days.map((d) => {
          const dow = ((parseDay(d).getDay() + 6) % 7) + 1;
          return (
            <Column
              key={d}
              appts={(byDay.get(d) || []).filter((a) => a.master_id === master.id)}
              colorOf={() => master.color || "#03839a"}
              range={range}
              closed={!workDays.includes(dow)}
              now={now}
              isToday={d === today}
              onOpen={onOpen}
              onSlot={onSlot ? (min) => onSlot(master.id, d, min) : null}
              workFrom={toMin(settings?.work_start || "10:00")}
              workTo={toMin(settings?.work_end || "20:00")}
            />
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
export function MonthView({ anchor, appts, masters, settings, onPickDay }) {
  const today = isoDay(new Date());
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1, 12);
  const start = mondayOf(first);
  const cells = [];
  for (let k = 0; k < 42; k++) cells.push(addDays(start, k));
  while (cells.length > 35 && cells[cells.length - 7].getMonth() !== anchor.getMonth()) cells.splice(cells.length - 7, 7);
  const workDays = settings?.work_days || [1, 2, 3, 4, 5, 6];
  const open = toMin(settings?.work_end || "20:00") - toMin(settings?.work_start || "10:00");

  const byDay = new Map();
  for (const a of appts) {
    const d = isoDay(new Date(a.start_time));
    if (!byDay.has(d)) byDay.set(d, []);
    byDay.get(d).push(a);
  }
  const colorOf = new Map(masters.map((m) => [m.id, m.color || "#03839a"]));

  return (
    <div className="sc-month">
      {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
        <span key={d} className="sc-month__dow">{d}</span>
      ))}
      {cells.map((date) => {
        const d = isoDay(date);
        const list = byDay.get(d) || [];
        const visits = list.filter((a) => !isDayOff(a) && a.status !== "cancelled");
        const done = visits.filter((a) => a.status === "completed").length;
        const value = visits.reduce((s, a) => s + Number(a.price || 0), 0);
        const bookedMin = visits.reduce((s, a) => s + (new Date(a.end_time) - new Date(a.start_time)) / 60000, 0);
        const offMin = list.filter(isDayOff).reduce((s, a) => s + (new Date(a.end_time) - new Date(a.start_time)) / 60000, 0);
        const dow = ((date.getDay() + 6) % 7) + 1;
        const isOpen = workDays.includes(dow);
        const cap = isOpen ? open * masters.length - offMin : 0;
        const share = cap > 0 ? Math.min(100, (bookedMin / cap) * 100) : 0;
        const perMaster = [...visits.reduce((m, a) => m.set(a.master_id, (m.get(a.master_id) || 0) + 1), new Map())];
        const outside = date.getMonth() !== anchor.getMonth();
        return (
          <button
            key={d}
            type="button"
            className={`sc-mday ${outside ? "is-outside" : ""} ${d === today ? "is-today" : ""} ${isOpen ? "" : "is-closed"}`}
            onClick={() => onPickDay(d)}
            aria-label={`${date.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}: ${visits.length} visits`}
          >
            <span className="sc-mday__num">{date.getDate()}</span>
            {visits.length > 0 && (
              <>
                <span className="sc-mday__count">{count(visits.length)} visits</span>
                <span className="sc-mday__value">{euro(value)}{done && done < visits.length ? ` · ${done} done` : ""}</span>
                <span className="sc-mday__bar" title={`${pct(share)} of working hours booked`}>
                  <i style={{ width: `${share}%` }} />
                </span>
                <span className="sc-mday__dots" aria-hidden="true">
                  {perMaster.slice(0, 12).map(([id, n]) => (
                    <i key={id} style={{ background: colorOf.get(id) || "#9ca3af", opacity: Math.min(1, 0.35 + n / 8) }} />
                  ))}
                </span>
              </>
            )}
            {!visits.length && !isOpen && !outside && <span className="sc-mday__closed">closed</span>}
          </button>
        );
      })}
    </div>
  );
}

