/**
 * Saves an array of plain objects as an .xlsx file (first row = headers).
 *
 * Replaces the "xlsx" npm package, which has unpatched security advisories
 * and is no longer maintained on npm. The library is loaded only when the
 * user actually exports, so it does not slow down page loads.
 */
function toCell(v) {
  if (v === undefined || v === null || v === "") return null;
  if (typeof v === "number" || typeof v === "boolean" || v instanceof Date) return v;
  return String(v);
}

export async function exportRowsToExcel(rows, sheetName, fileName) {
  const { default: writeExcelFile } = await import("write-excel-file/browser");
  const list = Array.isArray(rows) ? rows : [];
  const headers = list.length ? Object.keys(list[0]) : ["(no data)"];
  const data = [
    headers.map((h) => ({ value: h, fontWeight: "bold" })),
    ...list.map((r) => headers.map((h) => toCell(r[h]))),
  ];
  await writeExcelFile(data, {
    sheet: String(sheetName || "Sheet1").slice(0, 31),
    stickyRowsCount: 1,
    columns: headers.map(() => ({ width: 18 })),
  }).toFile(fileName);
}
