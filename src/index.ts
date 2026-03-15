import type { Request, Response } from "express";
import express from "express";
import multer from "multer";
import ExcelJS from "exceljs";
import path from "path";
import wrapJsFileContent from "./utils/wrapJsFileContent.js";

const app = express();
const PORT = 3000;

const storage = multer.memoryStorage();
const upload = multer({ storage });

app.post("/upload", upload.single("file"), async (req: Request, res: Response) => {
  try {
    if (!req.file) return res.status(400).send("No file uploaded");

    const fileBuffer = req.file.buffer;

    const fileContent = fileBuffer.toString("utf-8");
    const fixedContent = wrapJsFileContent(fileContent);

    const data: Record<string, string> = eval(fixedContent);

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('App');

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

    Object.entries(data).forEach(([key, value], index) => {
      sheet.addRow([key, value]);
    });

    headers.forEach((col, index) => {
      sheet.getColumn(index + 1).alignment = { wrapText: true };
    });

    sheet.getColumn(1).width = 50;
    sheet.getColumn(2).width = 50;
    sheet.getRow(1).height = 30;

    const buffer = await workbook.xlsx.writeBuffer();

    res.setHeader(
      "Content-Disposition",
      'attachment; filename="translations_key.xlsx"'
    );
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.send(buffer);
  } catch (err) {
    console.log('check err', err);

    console.error(err);
    res.status(500).send("Error processing file");
  }
});

app.use(express.static(path.resolve('src/public')));

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});