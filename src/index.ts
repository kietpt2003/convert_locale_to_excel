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

import wrapJsFileContent from "./utils/wrapJsFileContent.js";
import generateJsFile from "./utils/generateJsFile.js";
import parseExcelToObject from "./utils/parseExcelToObject.js";
import generateExcelBuffer from "./utils/generateExcelBuffer.js";
import generateDuplicateExcel from "./utils/generateDuplicateExcel.js";

const uniqueIPs = new Set<string>();

const app = express();
const PORT = 3000;

const storage = multer.memoryStorage();
const upload = multer({ storage });

dotenv.config();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
  const ip =
    req.headers["x-forwarded-for"]?.toString().split(",")[0] ||
    req.socket.remoteAddress ||
    "";

  if (ip) {
    uniqueIPs.add(ip);
  }

  console.log("Unique visits:", uniqueIPs.size);
  next();
});

app.get("/visits", (req, res) => {
  res.json({
    totalUnique: uniqueIPs.size,
  });
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

app.use(express.static(path.resolve('src/public')));

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});