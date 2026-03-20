import { PassThrough } from "stream";
import ExcelJS from "exceljs";

export default async function generateExcelStream(data: Record<string, string>) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("App");

  const headers = ['Key', 'Propose Content'];

  sheet.addRow(headers);

  sheet.getRow(1).eachCell((cell, colNumber) => {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: colNumber <= 2 ? 'FFD9EAD3' : 'C9DBF8' },
    };
    cell.font = { bold: true, color: { argb: '0000000' } };
  });

  Object.entries(data).forEach(([key, value]) => {
    sheet.addRow([key, value]);
  });

  headers.forEach((col, index) => {
    sheet.getColumn(index + 1).alignment = { wrapText: true };
  });

  sheet.getColumn(1).width = 50;
  sheet.getColumn(2).width = 50;
  sheet.getRow(1).height = 30;

  const stream = new PassThrough();

  await workbook.xlsx.write(stream);

  return stream;
}