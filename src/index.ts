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
import { OAuth2Client } from "google-auth-library";
import jwt from "jsonwebtoken";
import translate from "translate-google";
import { isHtml } from "cheerio/utils";

import wrapJsFileContent from "./utils/wrapJsFileContent.js";
import generateJsFile from "./utils/generateJsFile.js";
import parseExcelToObject from "./utils/parseExcelToObject.js";
import generateExcelBuffer from "./utils/generateExcelBuffer.js";
import generateDuplicateExcel from "./utils/generateDuplicateExcel.js";
import { Visitor } from "./models/Visitors.js";
import { ApiUsage } from "./models/ApiUsage.js";
import { AuthorizedUser } from "./models/AuthorizedUser.js";
import { Language } from "./models/Language.js";
import { shouldTrackEndpoint } from "./utils/shouldTrackEndpoint.js";
import { verifyToken, verifyAdmin } from "./middleware/validation.js";
import translateComplexHtml from "./utils/translateComplexHtml.js";
import delay from "./utils/delay.js";
import parseExcelToObjectV2 from "./utils/parseExcelToObject.v2.js";

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

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

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

app.post("/auth/google", async (req: Request, res: Response) => {
  try {
    const { token } = req.body;

    const ticket = await googleClient.verifyIdToken({
      idToken: token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    if (!payload) return res.status(400).json({ message: "Invalid Google token" });

    const email = payload.email;

    let authUser = await AuthorizedUser.findOne({ email });

    if (!authUser) {
      if (email === process.env.ADMIN_EMAIL) {
        authUser = await AuthorizedUser.create({ email, role: "admin" });
      } else {
        return res.status(403).json({ message: "Access Denied. Please contact Admin for IT Support" });
      }
    }

    const customToken = jwt.sign(
      {
        email: payload.email,
        name: payload.name,
        picture: payload.picture,
        role: authUser.role
      },
      process.env.JWT_SECRET as string,
      { expiresIn: "1d" }
    );

    res.json({ token: customToken, user: payload });
  } catch (error) {
    console.error("Auth error:", error);
    res.status(500).json({ message: "Authentication failed" });
  }
});

app.get("/visits", verifyToken, async (req, res) => {
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

app.get("/blob-token", verifyToken, async (_req: Request, res: Response) => {
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

app.post("/upload", verifyToken, async (req: Request, res: Response) => {
  try {
    const {
      fileUrl,
    } = req.body;

    if (!fileUrl) return res.status(400).json({ message: "No file uploaded" });

    const fileRes = await fetch(fileUrl);

    if (!fileRes.ok) {
      return res.status(400).json({ message: "Cannot fetch file from Blob Storage" });
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
    const errMsg = err instanceof Error ? err.message : "Error processing JS file";
    return res.status(500).json({ message: errMsg });
  }
});

app.post(
  "/upload-excel", verifyToken,
  async (req: Request, res: Response) => {
    try {
      const {
        fileUrl,
      } = req.body;

      if (!fileUrl) return res.status(400).json({ message: "No file uploaded" });

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
      return res.status(500).json({ message: "Error processing Excel file" });
    }
  }
);

app.post("/v2/upload-excel", verifyToken, async (req: Request, res: Response) => {
  try {
    const { fileUrl } = req.body;

    if (!fileUrl) return res.status(400).json({ message: "No file uploaded" });

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
    return res.status(500).json({ message: "Error processing Excel file" });
  }
});

const uploadMultiple = upload.fields([
  { name: "file1", maxCount: 1 },
  { name: "file2", maxCount: 1 },
]);
app.post(
  "/upload-excel-merge",
  verifyToken,
  uploadMultiple,
  async (req: Request, res: Response) => {
    try {
      const files = req.files as {
        [fieldname: string]: Express.Multer.File[];
      };

      const file1 = files?.file1?.[0];
      const file2 = files?.file2?.[0];

      if (!file1 || !file2) {
        return res.status(400).json({ message: "Need 2 files: file1 & file2" });
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
      return res.status(500).json({ message: "Error merging Excel files: Invalid format" });
    }
  }
);

app.post("/upload-excel-merge-zip", verifyToken, async (req: Request, res: Response) => {
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

    const data1 = await parseExcelToObjectV2(
      file1Buffer,
      Number(keyColumnFile1),
      Number(valueColumnFile1)
    );

    const data2 = await parseExcelToObjectV2(
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

app.get("/api-usage/total", verifyToken, async (req, res) => {
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

app.post("/generate-excels-for-each-locales", verifyToken, async (req: Request, res: Response) => {
  try {
    const {
      fileUrl,
      workSheetKey = 1,
      keyColumn = 1,
      workSheetValue = 1,
      valueColumns = [],
    } = req.body;

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

app.post("/v2/generate-excels-for-each-locales", verifyToken, async (req: Request, res: Response) => {
  try {
    const {
      fileUrl,
      workSheetKey = 1,
      keyColumn = 1,
      workSheetValue = 1,
      valueColumns = [],
    } = req.body;

    if (!fileUrl) return res.status(400).json({ message: "Missing file URLs" });

    const fileRes = await fetch(fileUrl);
    if (!fileRes.ok) return res.status(400).json({ message: "Cannot fetch files from URL" });

    const fileBuffer = Buffer.from(await fileRes.arrayBuffer());

    if (!Array.isArray(valueColumns) || valueColumns.length === 0) {
      return res.status(400).json({ message: "No valueColumns provided" });
    }

    const workbook = XLSX.read(fileBuffer, { type: "buffer" });

    const keySheetName = workbook.SheetNames[workSheetKey - 1];
    const valueSheetName = workbook.SheetNames[workSheetValue - 1];

    if (!keySheetName || !valueSheetName) {
      return res.status(400).json({ message: "Worksheet not found" });
    }

    const keySheet = workbook.Sheets[keySheetName];
    const valueSheet = workbook.Sheets[valueSheetName];

    const keyRows = XLSX.utils.sheet_to_json(keySheet, { header: 1 }) as any[][];
    const valueRows = XLSX.utils.sheet_to_json(valueSheet, { header: 1 }) as any[][];

    const headerRow = valueRows[0] || [];

    const results: Record<string, Record<string, string>> = {};

    valueColumns.forEach((colIndex: number) => {
      const header = headerRow[colIndex - 1]?.toString().trim() || `col_${colIndex}`;
      results[header] = {};
    });

    const maxRows = Math.max(keyRows.length, valueRows.length);
    for (let i = 1; i < maxRows; i++) {
      const kRow = keyRows[i];
      const vRow = valueRows[i];

      if (!kRow) continue;

      const key = kRow[keyColumn - 1]?.toString().trim();
      if (!key) continue;

      valueColumns.forEach((colIndex: number) => {
        const header = headerRow[colIndex - 1]?.toString().trim() || `col_${colIndex}`;
        const value = vRow ? vRow[colIndex - 1]?.toString().trim() : "";
        results[header][key] = value || "";
      });
    }

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
      archive.append(excelBuffer as any, { name: `${locale}.xlsx` });
    }

    await archive.finalize();
    const zipBuffer = Buffer.concat(chunks);

    const blob = await put(`locales_${Date.now()}.zip`, zipBuffer, {
      access: "public",
      token: process.env.BLOB_READ_WRITE_TOKEN,
      allowOverwrite: true,
    });

    return res.json({ url: blob.url });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error processing files" });
  }
});

app.get("/admin/users", verifyToken, verifyAdmin, async (req, res) => {
  try {
    const users = await AuthorizedUser.find().sort({ createdAt: -1 });
    const adminEmail = process.env.ADMIN_EMAIL;

    const formattedUsers = users.map(u => ({
      email: u.email,
      role: u.email === adminEmail ? "super_admin" : u.role,
      createdAt: u.createdAt
    }));

    res.json(formattedUsers);
  } catch (err) {
    res.status(500).json({ message: "Cannot get user list" });
  }
});

app.post("/admin/users", verifyToken, verifyAdmin, async (req, res) => {
  try {
    const { email, role } = req.body;
    if (!email) return res.status(400).json({ message: "Email cannot empty" });

    const exists = await AuthorizedUser.exists({ email });
    if (exists) return res.status(400).json({ message: "Email existed" });

    await AuthorizedUser.create({ email, role: role || "user" });
    res.json({ message: "Add user success" });
  } catch (err) {
    res.status(500).json({ message: "Create user failed." });
  }
});

app.delete("/admin/users/:email", verifyToken, verifyAdmin, async (req, res) => {
  try {
    const targetEmail = req.params.email;
    const requesterEmail = (req as any).user.email;

    if (targetEmail === process.env.ADMIN_EMAIL) {
      return res.status(400).json({ message: "Cannot delete Super Admin" });
    }

    if (targetEmail === requesterEmail) {
      return res.status(400).json({ message: "Cannot remove your permisison. Please contact Super Admin or IT Support!" });
    }

    const targetUser = await AuthorizedUser.findOne({ email: targetEmail });
    if (!targetUser) {
      return res.status(404).json({ message: "User not found." });
    }

    if (targetUser.role === "admin" && requesterEmail !== process.env.ADMIN_EMAIL) {
      return res.status(403).json({ message: "Only Super Admin can delete other admin!" });
    }

    await AuthorizedUser.deleteOne({ email: targetEmail });
    res.json({ message: "Delete user success" });
  } catch (err) {
    res.status(500).json({ message: "Delete user failed." });
  }
});

// ================= DIFF CHECKER (COMPARE 2 JS FILES) =================
app.post("/diff-js", verifyToken, async (req: Request, res: Response) => {
  try {
    const { oldFileUrl, newFileUrl } = req.body;

    if (!oldFileUrl || !newFileUrl) {
      return res.status(400).json({ message: "Please provide both files to compare." });
    }

    const [oldRes, newRes] = await Promise.all([fetch(oldFileUrl), fetch(newFileUrl)]);
    if (!oldRes.ok || !newRes.ok) {
      return res.status(400).json({ message: "Cannot fetch files from storage." });
    }

    const oldBuffer = Buffer.from(await oldRes.arrayBuffer());
    const newBuffer = Buffer.from(await newRes.arrayBuffer());

    const oldData: Record<string, string> = eval(wrapJsFileContent(oldBuffer.toString("utf-8")));
    const newData: Record<string, string> = eval(wrapJsFileContent(newBuffer.toString("utf-8")));

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Diff Report");

    sheet.columns = [
      { header: "Key", key: "key", width: 40 },
      { header: "Old Value", key: "oldValue", width: 50 },
      { header: "New Value", key: "newValue", width: 50 },
      { header: "Status", key: "status", width: 20 },
    ];

    const allKeys = Array.from(new Set([...Object.keys(oldData), ...Object.keys(newData)]));

    allKeys.forEach((key) => {
      const oldVal = oldData[key];
      const newVal = newData[key];
      let status = "";
      let color = "";

      if (oldVal === undefined && newVal !== undefined) {
        status = "Added";
        color = "FFC6EFCE"; // Light Green
      } else if (oldVal !== undefined && newVal === undefined) {
        status = "Removed";
        color = "FFFFC7CE"; // Light Red
      } else if (oldVal !== newVal) {
        status = "Modified";
        color = "FFFFEB9C"; // Light Yellow
      } else {
        status = "Unchanged";
        color = "FFFFFFFF"; // White
      }

      const row = sheet.addRow({
        key: key,
        oldValue: oldVal || "",
        newValue: newVal || "",
        status: status,
      });

      if (color !== "FFFFFFFF") {
        row.eachCell((cell) => {
          cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: color },
          };
        });
      }
    });

    sheet.getRow(1).font = { bold: true };

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = await put(`diff_report_${Date.now()}.xlsx`, buffer as any, {
      access: "public",
      token: process.env.BLOB_READ_WRITE_TOKEN,
      allowOverwrite: true,
    });

    return res.json({ url: blob.url });
  } catch (err) {
    console.error("Diff Error:", err);
    return res.status(500).json({ message: "An error occurred while generating the diff report." });
  }
});

// ================= DIFF CHECKER (COMPARE 2 EXCEL FILES) =================
app.post("/diff-excel", verifyToken, async (req: Request, res: Response) => {
  try {
    const {
      oldFileUrl, newFileUrl,
      keyColumnOld = 1, valueColumnOld = 2,
      keyColumnNew = 1, valueColumnNew = 2
    } = req.body;

    if (!oldFileUrl || !newFileUrl) {
      return res.status(400).json({ message: "Please provide both Excel files to compare." });
    }

    const [oldRes, newRes] = await Promise.all([fetch(oldFileUrl), fetch(newFileUrl)]);
    if (!oldRes.ok || !newRes.ok) {
      return res.status(400).json({ message: "Cannot fetch files from storage." });
    }

    const oldBuffer = Buffer.from(await oldRes.arrayBuffer());
    const newBuffer = Buffer.from(await newRes.arrayBuffer());

    const oldData = await parseExcelToObject(oldBuffer, Number(keyColumnOld), Number(valueColumnOld));
    const newData = await parseExcelToObject(newBuffer, Number(keyColumnNew), Number(valueColumnNew));

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Diff Report");

    sheet.columns = [
      { header: "Key", key: "key", width: 40 },
      { header: "Old Value", key: "oldValue", width: 50 },
      { header: "New Value", key: "newValue", width: 50 },
      { header: "Status", key: "status", width: 20 },
    ];

    const allKeys = Array.from(new Set([...Object.keys(oldData), ...Object.keys(newData)]));

    allKeys.forEach((key) => {
      const oldVal = oldData[key];
      const newVal = newData[key];
      let status = "";
      let color = "";

      if (oldVal === undefined && newVal !== undefined) {
        status = "Added"; color = "FFC6EFCE"; // Green
      } else if (oldVal !== undefined && newVal === undefined) {
        status = "Removed"; color = "FFFFC7CE"; // Red
      } else if (oldVal !== newVal) {
        status = "Modified"; color = "FFFFEB9C"; // Yellow
      } else {
        status = "Unchanged"; color = "FFFFFFFF"; // White
      }

      const row = sheet.addRow({
        key: key, oldValue: oldVal || "", newValue: newVal || "", status: status,
      });

      if (color !== "FFFFFFFF") {
        row.eachCell((cell) => {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: color } };
        });
      }
    });

    sheet.getRow(1).font = { bold: true };

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = await put(`diff_excel_report_${Date.now()}.xlsx`, buffer as any, {
      access: "public", token: process.env.BLOB_READ_WRITE_TOKEN, allowOverwrite: true,
    });

    return res.json({ url: blob.url });
  } catch (err) {
    console.error("Diff Excel Error:", err);
    return res.status(500).json({ message: "An error occurred while generating the Excel diff report." });
  }
});

// ================= AUTO TRANSLATE (EXCEL) - MULTI LANGUAGES =================
app.post("/translate-excel", verifyToken, async (req: Request, res: Response) => {
  try {
    // Đổi targetLang thành mảng targetLangs
    const { fileUrl, targetLangs, keyColumn = 1, valueColumn = 2 } = req.body;

    if (!fileUrl || !targetLangs || !Array.isArray(targetLangs) || targetLangs.length === 0) {
      return res.status(400).json({ message: "Please provide a file URL and at least one target language." });
    }

    const fileRes = await fetch(fileUrl);
    if (!fileRes.ok) {
      return res.status(400).json({ message: "Cannot fetch the file from storage." });
    }

    const fileBuffer = Buffer.from(await fileRes.arrayBuffer());
    const data = await parseExcelToObject(fileBuffer, Number(keyColumn), Number(valueColumn));

    const keys = Object.keys(data);
    const originalValues = Object.values(data);

    const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
    const isHtml = (str: string) => /<\/?(html|body|div|p|h[1-6]|span|a|ul|li|table|tr|td|br|strong|b|em|i)[^>]*>/i.test(str);

    // =========================================================================
    // Object save result of each languages (VD: { 'vi': [...], 'fr': [...] })
    // =========================================================================
    const translationsByLang: Record<string, string[]> = {};
    for (const lang of targetLangs) {
      console.log(`\n🌍 STARTING TRANSLATION FOR LANGUAGE: ${lang.toUpperCase()}`);
      let currentLangTranslations: string[] = new Array(originalValues.length).fill("");
      const plainTextBatch: { index: number; text: string }[] = [];

      for (let i = 0; i < originalValues.length; i++) {
        const str = (originalValues[i] === null || originalValues[i] === undefined) ? "" : String(originalValues[i]);

        if (isHtml(str)) {
          const htmlRes = await translateComplexHtml(str, lang);
          currentLangTranslations[i] = htmlRes;
        } else {
          currentLangTranslations[i] = str;
          if (str.trim()) {
            plainTextBatch.push({ index: i, text: str });
          }
        }
      }

      console.log(`🚀 Translating ${plainTextBatch.length} plain text items to ${lang}...`);
      for (let i = 0; i < plainTextBatch.length; i += 30) {
        const batch = plainTextBatch.slice(i, i + 30);
        const textsToTranslate = batch.map(b => b.text);

        try {
          const res = await translate(textsToTranslate, { to: lang });
          batch.forEach((b, idx) => {
            currentLangTranslations[b.index] = res[idx];
          });
          await delay(2000);
        } catch (err) {
          console.warn(`⚠️ Chunk failed. Falling back to 1-by-1 for lang ${lang}...`);
          for (const b of batch) {
            try {
              const singleRes = await translate(b.text, { to: lang });
              currentLangTranslations[b.index] = singleRes;
              await delay(1000);
            } catch (e) {
              // Lỗi thì giữ nguyên bản gốc
            }
          }
        }
      }

      translationsByLang[lang] = currentLangTranslations;
    }

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Translations");

    const columns = [
      { header: "Key", key: "key", width: 35 },
      { header: "Original Value", key: "original", width: 45 },
    ];

    targetLangs.forEach((lang: string) => {
      columns.push({ header: `Translated (${lang})`, key: lang, width: 45 });
    });
    sheet.columns = columns;

    keys.forEach((key, index) => {
      const rowData: any = {
        key: key,
        original: originalValues[index],
      };
      targetLangs.forEach((lang: string) => {
        rowData[lang] = translationsByLang[lang][index];
      });
      sheet.addRow(rowData);
    });

    sheet.getRow(1).font = { bold: true };
    sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE0E0E0" } };

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = await put(`translated_multi_${Date.now()}.xlsx`, buffer as any, {
      access: "public",
      token: process.env.BLOB_READ_WRITE_TOKEN,
      allowOverwrite: true,
    });

    return res.json({ url: blob.url, totalTranslated: keys.length, languages: targetLangs });
  } catch (err) {
    console.error("Translate Error:", err);
    return res.status(500).json({ message: "An error occurred during translation." });
  }
});

// ================= AUTO TRANSLATE (JS) - MULTI LANGUAGES (ARCHIVER ZIP) =================
app.post("/translate-js", verifyToken, async (req: Request, res: Response) => {
  try {
    const { fileUrl, targetLangs } = req.body;

    if (!fileUrl || !targetLangs || !Array.isArray(targetLangs) || targetLangs.length === 0) {
      return res.status(400).json({ message: "Please provide a file URL and at least one target language." });
    }

    const fileRes = await fetch(fileUrl);
    if (!fileRes.ok) return res.status(400).json({ message: "Cannot fetch the file from storage." });

    const fileBuffer = Buffer.from(await fileRes.arrayBuffer());
    const fileContent = fileBuffer.toString("utf-8");

    let data: Record<string, string> = {};
    try {
      data = eval(wrapJsFileContent(fileContent));
    } catch (e) {
      return res.status(400).json({ message: "Invalid JS file format." });
    }

    const keys = Object.keys(data);
    const originalValues = Object.values(data);

    const archive = archiver("zip", { zlib: { level: 9 } });
    const chunks: Buffer[] = [];
    const writable = new Writable({
      write(chunk, _, cb) {
        chunks.push(chunk);
        cb();
      },
    });
    archive.pipe(writable);

    for (const lang of targetLangs) {
      console.log(`\n🌍 STARTING JS TRANSLATION FOR LANGUAGE: ${lang.toUpperCase()}`);
      let currentLangTranslations: string[] = new Array(originalValues.length).fill("");
      const plainTextBatch: { index: number; text: string }[] = [];

      for (let i = 0; i < originalValues.length; i++) {
        const str = (originalValues[i] === null || originalValues[i] === undefined) ? "" : String(originalValues[i]);

        if (isHtml(str)) {
          const htmlRes = await translateComplexHtml(str, lang);
          currentLangTranslations[i] = htmlRes;
        } else {
          currentLangTranslations[i] = str;
          if (str.trim()) plainTextBatch.push({ index: i, text: str });
        }
      }

      console.log(`🚀 Translating ${plainTextBatch.length} plain text items to ${lang}...`);
      for (let i = 0; i < plainTextBatch.length; i += 30) {
        const batch = plainTextBatch.slice(i, i + 30);
        const textsToTranslate = batch.map(b => b.text);

        try {
          const res = await translate(textsToTranslate, { to: lang });
          batch.forEach((b, idx) => { currentLangTranslations[b.index] = res[idx]; });
          await delay(2000);
        } catch (err) {
          console.warn(`⚠️ Chunk failed. Falling back to 1-by-1 for lang ${lang}...`);
          for (const b of batch) {
            try {
              const singleRes = await translate(b.text, { to: lang });
              currentLangTranslations[b.index] = singleRes;
              await delay(1000);
            } catch (e) { }
          }
        }
      }

      const resultObj: Record<string, string> = {};
      keys.forEach((key, index) => {
        resultObj[key] = currentLangTranslations[index];
      });

      const jsString = generateJsFile(resultObj);

      archive.append(jsString, { name: `${lang}.js` });
    }

    await archive.finalize();
    const zipBuffer = Buffer.concat(chunks);

    const blob = await put(`translated_js_locales_${Date.now()}.zip`, zipBuffer, {
      access: "public",
      token: process.env.BLOB_READ_WRITE_TOKEN,
      allowOverwrite: true,
    });

    return res.json({ url: blob.url, totalTranslated: keys.length, languages: targetLangs });
  } catch (err) {
    console.error("Translate JS Error:", err);
    return res.status(500).json({ message: "An error occurred during JS translation." });
  }
});

// ================= LANGUAGE MANAGEMENT =================
app.get("/languages", verifyToken, async (req, res) => {
  try {
    const langs = await Language.find().sort({ name: 1 });
    res.json(langs);
  } catch (err) {
    res.status(500).json({ message: "Cannot get languages" });
  }
});

app.post("/admin/languages", verifyToken, verifyAdmin, async (req, res) => {
  try {
    const { code, name } = req.body;
    if (!code || !name) return res.status(400).json({ message: "Code and Name cannot be empty" });

    const normalizedCode = code.trim().toLowerCase();
    const exists = await Language.exists({ code: normalizedCode });
    if (exists) return res.status(400).json({ message: "This language code already exists" });

    await Language.create({ code: normalizedCode, name: name.trim() });
    res.json({ message: "Language added successfully" });
  } catch (err) {
    res.status(500).json({ message: "Failed to add language" });
  }
});

app.delete("/admin/languages/:code", verifyToken, verifyAdmin, async (req, res) => {
  try {
    const { code } = req.params;
    await Language.deleteOne({ code });
    res.json({ message: "Language deleted successfully" });
  } catch (err) {
    res.status(500).json({ message: "Failed to delete language" });
  }
});

app.use(express.static(path.resolve('src/public')));

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});