import { useEffect, useState } from "react";
import { pct as fmtPct } from "./format";

const R = 82;
const ARC = Math.PI * R;
const PATH = `M 18 100 A ${R} ${R} 0 0 1 182 100`;

/**
 * Half-circle gauge: value out of max. The arc animates whenever the value
 * changes (filters, a selected day or master); it sweeps up from zero on load.
 */
export default function Gauge({ label, value, max, format, note, color = "#03839a", warn }) {
  const share = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(share));
    return () => cancelAnimationFrame(id);
  }, [share]);

  const stroke = warn ? "#b96c86" : color;
  return (
    <figure className="db-card db-gauge">
      <figcaption className="db-gauge__label">{label}</figcaption>
      <div className="db-gauge__dial">
        <svg viewBox="0 0 200 112" role="img" aria-label={`${label}: ${format(value)} of ${format(max)}`}>
          <path d={PATH} className="db-gauge__track" />
          <path
            d={PATH}
            className="db-gauge__value"
            style={{ stroke, strokeDasharray: `${(shown * ARC).toFixed(1)} ${ARC.toFixed(1)}` }}
          />
        </svg>
        <span className="db-gauge__pct">{max > 0 ? fmtPct(share * 100) : "—"}</span>
        <span className="db-gauge__value-text">{format(value)}</span>
      </div>
      <div className="db-gauge__scale" aria-hidden="true">
        <span>{format(0)}</span>
        <span>{max > 0 ? format(max) : "no target"}</span>
      </div>
      {note && <p className="db-gauge__note">{note}</p>}
    </figure>
  );
}
