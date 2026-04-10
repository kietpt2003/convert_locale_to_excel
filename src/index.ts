import type { Request, Response } from "express";
import express from "express";
import multer from "multer";
import ExcelJS from "exceljs";
import path from "path";
import archiver from "archiver";
import { Writable } from "stream";
import dotenv from "dotenv";
import { put } from "@vercel/blob";
import cors from "cors";
import mongoose from "mongoose";
import * as XLSX from "xlsx";

import wrapJsFileContent from "./utils/wrapJsFileContent.js";
import generateJsFile from "./utils/generateJsFile.js";
import parseExcelToObject from "./utils/parseExcelToObject.js";
import generateExcelBuffer from "./utils/generateExcelBuffer.js";
import generateDuplicateExcel from "./utils/generateDuplicateExcel.js";
import { Visitor } from "./models/Visitors.js";
import { ApiUsage } from "./models/ApiUsage.js";
import { shouldTrackEndpoint } from "./utils/shouldTrackEndpoint.js";

const app = express();
const PORT = 3000;

const storage = multer.memoryStorage();
const upload = multer({ storage });

dotenv.config();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const DB_URL = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_USER_PASSWORD}@${process.env.DB_CLUSTER_PATH}`;
const connect = mongoose.connect(DB_URL, { family: 4, dbName: process.env.DB_NAME });

connect.then((db) => {
  console.log("Connect server success");
});

app.use(async (req, res, next) => {
  try {
    const ip =
      req.headers["x-forwarded-for"]?.toString().split(",")[0] ||
      req.socket.remoteAddress ||
      "";

    if (ip) {
      const exists = await Visitor.exists({ ip });

      if (!exists) {
        await Visitor.create({ ip });
        console.log("New visitor:", ip);
      }
    }

    next();
  } catch (err) {
    console.error("Track visit error:", err);
    next();
  }
});

app.use(async (req, res, next) => {
  try {
    if (!shouldTrackEndpoint(req)) {
      return next();
    }

    const endpoint = req.path;
    const method = req.method;

    const date = new Date().toISOString().slice(0, 10);

    await ApiUsage.findOneAndUpdate(
      { endpoint, method, date },
      { $inc: { count: 1 } },
      {
        upsert: true,
        returnDocument: "after",
      }
    );

    next();
  } catch (err) {
    console.error("Track API usage error:", err);
    next();
  }
});

app.get("/visits", async (req, res) => {
  try {
    const totalUnique = await Visitor.countDocuments();

    res.json({
      totalUnique,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      message: "Failed to get visits",
    });
  }
});

app.get("/blob-token", async (_req: Request, res: Response) => {
  try {
    return res.json({
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      message: "Cannot generate token",
    });
  }
});

app.post("/upload", async (req: Request, res: Response) => {
  try {
    const {
      fileUrl,
    } = req.body;

    if (!fileUrl) return res.status(400).send("No file uploaded");

    const fileRes = await fetch(fileUrl);

    if (!fileRes.ok) {
      return res.status(400).json({ message: "Cannot fetch files from URL" });
    }

    const fileBuffer = Buffer.from(await fileRes.arrayBuffer());

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
  async (req: Request, res: Response) => {
    try {
      const {
        fileUrl,
      } = req.body;

      if (!fileUrl) return res.status(400).send("No file uploaded");

      const fileRes = await fetch(fileUrl);

      if (!fileRes.ok) {
        return res.status(400).json({ message: "Cannot fetch files from URL" });
      }

      const fileBuffer = Buffer.from(await fileRes.arrayBuffer());

      const keyColumn = Number(req.body.keyColumn) || 1;
      const valueColumn = Number(req.body.valueColumn) || 2;

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(fileBuffer as any);

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

      const jsContent = generateJsFile(result);
      const jsBuffer = Buffer.from(jsContent, "utf-8");

      const blob = await put("en.js", jsBuffer, {
        access: "public",
        token: process.env.BLOB_READ_WRITE_TOKEN,
        allowOverwrite: true
      });

      return res.json({
        url: blob.url,
      });
    } catch (err) {
      console.error(err);
      res.status(500).send("Error processing Excel file");
    }
  }
);

app.post("/v2/upload-excel", async (req: Request, res: Response) => {
  try {
    const { fileUrl } = req.body;

    if (!fileUrl) return res.status(400).send("No file uploaded");

    const fileRes = await fetch(fileUrl);

    if (!fileRes.ok) {
      return res.status(400).json({ message: "Cannot fetch files from URL" });
    }

    const fileBuffer = Buffer.from(await fileRes.arrayBuffer());

    const keyColumn = Number(req.body.keyColumn) || 1;
    const valueColumn = Number(req.body.valueColumn) || 2;

    const workbook = XLSX.read(fileBuffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
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

    const jsContent = generateJsFile(result);
    const jsBuffer = Buffer.from(jsContent, "utf-8");

    const blob = await put("en.js", jsBuffer, {
      access: "public",
      token: process.env.BLOB_READ_WRITE_TOKEN,
      allowOverwrite: true
    });

    return res.json({
      url: blob.url,
    });
  } catch (err) {
    console.error(err);
    res.status(500).send("Error processing Excel file");
  }
});

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

app.post("/upload-excel-merge-zip", async (req: Request, res: Response) => {
  try {
    const {
      file1Url,
      file2Url,
      keyColumnFile1 = 1,
      valueColumnFile1 = 2,
      keyColumnFile2 = 1,
      valueColumnFile2 = 2,
    } = req.body;

    if (!file1Url || !file2Url) {
      return res.status(400).json({ message: "Missing file URLs" });
    }

    const [file1Res, file2Res] = await Promise.all([
      fetch(file1Url),
      fetch(file2Url),
    ]);

    if (!file1Res.ok || !file2Res.ok) {
      return res.status(400).json({ message: "Cannot fetch files from URL" });
    }

    const file1Buffer = Buffer.from(await file1Res.arrayBuffer());
    const file2Buffer = Buffer.from(await file2Res.arrayBuffer());

    const data1 = await parseExcelToObject(
      file1Buffer,
      Number(keyColumnFile1),
      Number(valueColumnFile1)
    );

    const data2 = await parseExcelToObject(
      file2Buffer,
      Number(keyColumnFile2),
      Number(valueColumnFile2)
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

    const duplicateExcelBuffer =
      duplicatedKeys.length > 0
        ? await generateDuplicateExcel(data1, data2, duplicatedKeys)
        : null;

    const archive = archiver("zip", {
      zlib: { level: 9 },
    });

    const chunks: Buffer[] = [];

    const writable = new Writable({
      write(chunk, _, cb) {
        chunks.push(chunk);
        cb();
      },
    });

    archive.pipe(writable);

    archive.append(jsContent, { name: "en.js" });
    archive.append(excelBuffer as any, { name: "merged_keys.xlsx" });

    if (duplicateExcelBuffer) {
      archive.append(duplicateExcelBuffer as any, {
        name: "duplicated_keys.xlsx",
      });
    }

    await archive.finalize();

    const zipBuffer = Buffer.concat(chunks);

    const blob = await put(
      `merged_keys_${Date.now()}.zip`,
      zipBuffer,
      {
        access: "public",
        token: process.env.BLOB_READ_WRITE_TOKEN,
        allowOverwrite: true
      }
    );

    return res.json({
      url: blob.url,
      duplicatedCount: duplicatedKeys.length,
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({
      message: "Error processing files",
    });
  }
});

app.get("/api-usage/total", async (req, res) => {
  try {
    const endpoint = req.query.endpoint as string | undefined;

    const matchStage: any = {};

    if (endpoint) {
      matchStage.endpoint = endpoint;
    }

    const result = await ApiUsage.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: null,
          total: { $sum: "$count" },
        },
      },
    ]);

    const total = result[0]?.total || 0;

    res.json({
      endpoint: endpoint || "ALL",
      total,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      message: "Failed to get usage",
    });
  }
});

app.post("/generate-excels-for-each-locales", async (req: Request, res: Response) => {
  try {
    const {
      fileUrl,
      workSheetKey = 1,
      keyColumn = 1,
      workSheetValue = 1,
      valueColumns = [],
    } = req.body;

    console.log('check', req.body);


    if (!fileUrl) {
      return res.status(400).json({ message: "Missing file URLs" });
    }

    const fileRes = await fetch(fileUrl);

    if (!fileRes.ok) {
      return res.status(400).json({ message: "Cannot fetch files from URL" });
    }

    const fileBuffer = Buffer.from(await fileRes.arrayBuffer());

    if (!Array.isArray(valueColumns) || valueColumns.length === 0) {
      return res.status(400).json({ message: "No valueColumns provided" });
    }

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(fileBuffer as any);

    const keySheet = workbook.worksheets[workSheetKey - 1];
    const valueSheet = workbook.worksheets[workSheetValue - 1];

    if (!keySheet || !valueSheet) {
      return res.status(400).json({ message: "Worksheet not found" });
    }

    const headerRow = valueSheet.getRow(1);

    const results: Record<string, Record<string, string>> = {};

    valueColumns.forEach((colIndex: number) => {
      const header =
        headerRow.getCell(colIndex).text?.trim() || `col_${colIndex}`;

      results[header] = {};
    });

    keySheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;

      const key = row.getCell(keyColumn).text?.trim();
      if (!key) return;

      valueColumns.forEach((colIndex: number) => {
        const header =
          headerRow.getCell(colIndex).text?.trim() || `col_${colIndex}`;

        const value =
          valueSheet.getRow(rowNumber).getCell(colIndex).text?.trim() || "";

        results[header][key] = value;
      });
    });

    const archive = archiver("zip", { zlib: { level: 9 } });

    const chunks: Buffer[] = [];
    const writable = new Writable({
      write(chunk, _, cb) {
        chunks.push(chunk);
        cb();
      },
    });

    archive.pipe(writable);

    for (const locale of Object.keys(results)) {
      const data = results[locale];

      const excelBuffer = await generateExcelBuffer(data);

      archive.append(excelBuffer as any, {
        name: `${locale}.xlsx`,
      });
    }

    await archive.finalize();

    const zipBuffer = Buffer.concat(chunks);

    const blob = await put(
      `locales_${Date.now()}.zip`,
      zipBuffer,
      {
        access: "public",
        token: process.env.BLOB_READ_WRITE_TOKEN,
        allowOverwrite: true,
      }
    );

    return res.json({
      url: blob.url,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      message: "Error processing files",
    });
  }
});

app.use(express.static(path.resolve('src/public')));

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});