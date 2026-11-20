import { useEffect, useId, useMemo, useRef, useState } from "react";

/**
 * Multi-select filter: a button "Masters · 3 of 11" and a list with
 * checkboxes. selected = array of ids; an empty array means "all".
 */
export default function FilterMenu({ label, items, selected, onChange, searchable }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const box = useRef(null);
  const listId = useId();

  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => {
      if (box.current && !box.current.contains(e.target)) setOpen(false);
    };
    const esc = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  const all = selected.length === 0 || selected.length === items.length;
  const isOn = (id) => all || selected.includes(id);
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? items.filter((it) => it.name.toLowerCase().includes(s)) : items;
  }, [items, q]);

  const toggle = (id) => {
    const current = all ? items.map((it) => it.id) : selected;
    const next = current.includes(id) ? current.filter((x) => x !== id) : [...current, id];
    if (!next.length) return; // at least one stays selected; "Select all" resets
    onChange(next.length === items.length ? [] : next);
  };

  const summary = all ? `all ${items.length}` : `${selected.length} of ${items.length}`;

  return (
    <div className="fm" ref={box}>
      <button
        type="button"
        className={`fm-toggle ${all ? "" : "is-filtered"}`}
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((o) => !o)}
      >
        {label} <span className="fm-count">· {summary}</span>
      </button>
      {open && (
        <div className="fm-pop" id={listId}>
          {searchable && (
            <input
              className="fm-search"
              type="search"
              placeholder="Search"
              aria-label={`Search ${label.toLowerCase()}`}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              autoFocus
            />
          )}
          <div className="fm-actions">
            <button type="button" onClick={() => onChange([])} disabled={all}>Select all</button>
            {!all && <span className="fm-note">{selected.length} selected</span>}
          </div>
          <div className="fm-list">
            {shown.map((it) => (
              <div key={it.id} className="fm-row">
                <label className="fm-option">
                  <input type="checkbox" checked={isOn(it.id)} onChange={() => toggle(it.id)} />
                  {it.color && <span className="fm-dot" style={{ background: it.color }} aria-hidden="true" />}
                  <span>{it.name}</span>
                </label>
                <button type="button" className="fm-only" onClick={() => onChange([it.id])} aria-label={`Only ${it.name}`}>
                  only
                </button>
              </div>
            ))}
            {!shown.length && <p className="fm-empty">Nothing found</p>}
          </div>
        </div>
      )}
    </div>
  );
}
