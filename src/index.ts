import type { Request, Response } from "express";
import express from "express";
import multer from "multer";
import ExcelJS from "exceljs";
import path from "path";
import archiver from "archiver";
import { Writable } from "stream";
import dotenv from "dotenv";
import { put } from "@vercel/blob";

import wrapJsFileContent from "./utils/wrapJsFileContent.js";
import generateJsFile from "./utils/generateJsFile.js";
import parseExcelToObject from "./utils/parseExcelToObject.js";
import generateExcelBuffer from "./utils/generateExcelBuffer.js";
import generateDuplicateExcel from "./utils/generateDuplicateExcel.js";

const app = express();
const PORT = 3000;

const storage = multer.memoryStorage();
const upload = multer({ storage });

dotenv.config();

app.post("/upload", upload.single("file"), async (req: Request, res: Response) => {
  try {
    if (!req.file) return res.status(400).send("No file uploaded");

    const fileBuffer = req.file.buffer;

    const fileContent = fileBuffer.toString("utf-8");
    const fixedContent = wrapJsFileContent(fileContent);

    const data: Record<string, string> = eval(fixedContent);

    const excelBuffer = await generateExcelBuffer(data);

    const blob = await put(
      `translations-key-${Date.now()}.xlsx`,
      excelBuffer,
      {
        access: "public",
        token: process.env.BLOB_READ_WRITE_TOKEN,
        allowOverwrite: true
      }
    );

    return res.json({
      url: blob.url,
    });
  } catch (err) {
    console.error(err);
    res.status(500).send("Error processing file");
  }
});

app.post(
  "/upload-excel",
  upload.single("file"),
  async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        return res.status(400).send("No file uploaded");
      }

      const keyColumn = Number(req.body.keyColumn) || 1;
      const valueColumn = Number(req.body.valueColumn) || 2;

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(req.file.buffer as any);

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

      // Convert object -> JS string
      const jsContent = generateJsFile(result);

      res.setHeader(
        "Content-Disposition",
        'attachment; filename="en.js"'
      );
      res.setHeader("Content-Type", "application/javascript");

      res.send(jsContent);
    } catch (err) {
      console.error(err);
      res.status(500).send("Error processing Excel file");
    }
  }
);

const uploadMultiple = upload.fields([
  { name: "file1", maxCount: 1 },
  { name: "file2", maxCount: 1 },
]);
app.post(
  "/upload-excel-merge",
  uploadMultiple,
  async (req: Request, res: Response) => {
    try {
      const files = req.files as {
        [fieldname: string]: Express.Multer.File[];
      };

      const file1 = files?.file1?.[0];
      const file2 = files?.file2?.[0];

      if (!file1 || !file2) {
        return res.status(400).send("Need 2 files: file1 & file2");
      }

      const keyColumnFile1 = Number(req.body.keyColumnFile1) || 1;
      const valueColumnFile1 = Number(req.body.valueColumnFile1) || 2;
      const keyColumnFile2 = Number(req.body.keyColumnFile2) || 1;
      const valueColumnFile2 = Number(req.body.valueColumnFile2) || 2;

      const data1 = await parseExcelToObject(
        file1.buffer,
        keyColumnFile1,
        valueColumnFile1
      );

      const data2 = await parseExcelToObject(
        file2.buffer,
        keyColumnFile2,
        valueColumnFile2
      );

      const merged = {
        ...data1,
        ...data2,
      };

      const jsContent = generateJsFile(merged);

      res.setHeader(
        "Content-Disposition",
        'attachment; filename="en_merged.js"'
      );
      res.setHeader("Content-Type", "application/javascript");

      res.send(jsContent);
    } catch (err) {
      console.error(err);
      res.status(500).send("Error merging Excel files");
    }
  }
);

app.post(
  "/upload-excel-merge-zip",
  uploadMultiple,
  async (req: Request, res: Response) => {
    try {
      const files = req.files as {
        [fieldname: string]: Express.Multer.File[];
      };

      const file1 = files?.file1?.[0];
      const file2 = files?.file2?.[0];

      if (!file1 || !file2) {
        return res.status(400).send("Need 2 files: file1 & file2");
      }

      const keyColumnFile1 = Number(req.body.keyColumnFile1) || 1;
      const valueColumnFile1 = Number(req.body.valueColumnFile1) || 2;
      const keyColumnFile2 = Number(req.body.keyColumnFile2) || 1;
      const valueColumnFile2 = Number(req.body.valueColumnFile2) || 2;

      const data1 = await parseExcelToObject(
        file1.buffer,
        keyColumnFile1,
        valueColumnFile1
      );

      const data2 = await parseExcelToObject(
        file2.buffer,
        keyColumnFile2,
        valueColumnFile2
      );

      const duplicatedKeys = Object.keys(data1).filter(
        (key) => key in data2
      );

      const merged = {
        ...data1,
        ...data2,
      };

      const jsContent = generateJsFile(merged);
      const excelBuffer = await generateExcelBuffer(merged);

      const duplicateExcelBuffer = await generateDuplicateExcel(
        data1,
        data2,
        duplicatedKeys
      );

      const chunks: Buffer[] = [];
      const writable = new Writable({
        write(chunk, _, cb) {
          chunks.push(chunk);
          cb();
        },
      });

      const archive = archiver("zip", {
        zlib: { level: 9 },
      });

      archive.pipe(writable);

      archive.append(jsContent, { name: "en.js" });
      archive.append(excelBuffer as any, { name: "merged_keys.xlsx" });

      if (duplicatedKeys.length > 0) {
        archive.append(duplicateExcelBuffer as any, {
          name: "duplicated_keys.xlsx",
        });
      }

      await archive.finalize();

      const zipBuffer = Buffer.concat(chunks);

      const blob = await put(
        `merged-keys-${Date.now()}.zip`,
        zipBuffer,
        {
          access: "public",
          token: process.env.BLOB_READ_WRITE_TOKEN,
          allowOverwrite: true
        }
      );

      return res.json({
        url: blob.url,
      });
    } catch (err) {
      console.error(err);
      res.status(500).send("Error merging Excel files");
    }
  }
);

app.use(express.static(path.resolve('src/public')));

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});