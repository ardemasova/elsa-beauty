export function hexToRgba(hex, a) {
  const h = String(hex || "#03839a").replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full, 16);
  if (Number.isNaN(n)) return `rgba(3,131,154,${a})`;
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}


/** The appointment as the existing details modal expects it. */
export function asModalEvent(a, color) {
  return {
    id: a.id,
    start: a.start_time,
    end: a.end_time,
    extendedProps: {
      masterName: a.master_name,
      clientName: a.client_name || null,
      serviceName: a.service_name,
      servicePrice: a.price,
      status: a.status,
      originalData: a,
      masterColor: color,
    },
  };
}
