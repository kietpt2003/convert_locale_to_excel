import ExcelJS from "exceljs";
import { PassThrough } from "stream";

export default async function generateDuplicateExcelStream(
  data1: Record<string, string>,
  data2: Record<string, string>,
  duplicatedKeys: string[]
) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Duplicated");

  const headers = ["Key", "Value File 1", "Value File 2"];

  sheet.addRow(headers);

  sheet.getRow(1).eachCell((cell, colNumber) => {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: colNumber <= 3 ? 'FFD9EAD3' : 'C9DBF8' },
    };
    cell.font = { bold: true, color: { argb: '0000000' } };
  });

  duplicatedKeys.forEach((key) => {
    sheet.addRow([key, data1[key] || "", data2[key] || ""]);
  });

  headers.forEach((col, index) => {
    sheet.getColumn(index + 1).alignment = { wrapText: true };
  });

  sheet.getColumn(1).width = 50;
  sheet.getColumn(2).width = 50;
  sheet.getColumn(3).width = 50;
  sheet.getRow(1).height = 30;

  const stream = new PassThrough();

  await workbook.xlsx.write(stream);

  return stream;
}