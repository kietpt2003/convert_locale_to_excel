import * as XLSX from "xlsx";

export default async function parseExcelToObjectV2(
  buffer: Buffer,
  keyColumn: number,
  valueColumn: number
): Promise<Record<string, string>> {
  const workbook = XLSX.read(buffer, { type: "buffer" });

  const firstSheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[firstSheetName];

  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];

  const result: Record<string, string> = {};

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;

    const key = row[keyColumn - 1]?.toString().trim();
    const value = row[valueColumn - 1]?.toString().trim();

    if (key) {
      result[key] = value || "";
    }
  }

  return result;
}