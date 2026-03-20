import ExcelJS from "exceljs";

export default async function parseExcelToObject(
  buffer: Buffer,
  keyColumn: number,
  valueColumn: number
): Promise<Record<string, string>> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as any);

  const sheet = workbook.worksheets[0];
  const result: Record<string, string> = {};

  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;

    const key = row.getCell(keyColumn).text?.trim();
    const value = row.getCell(valueColumn).text?.trim();

    if (key) {
      result[key] = value || "";
    }
  });

  return result;
}