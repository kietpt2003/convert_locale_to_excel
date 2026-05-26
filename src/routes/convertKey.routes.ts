import { Router } from 'express';
import multer from "multer";

import { verifyToken } from '../middleware/validation.js';
import {
  compareTwoExcels,
  compareTwoJs,
  generateExcelForEachLocales,
  generateExcelForEachLocalesV2,
  getBlobToken,
  translateExcel,
  translateJs,
  uploadExcelMerge,
  uploadExcelMergeZip,
  uploadExcelToJs,
  uploadExcelToJsV2,
  uploadJsToExcel
} from '../controllers/convertKey.controller.js';

const storage = multer.memoryStorage();
const upload = multer({ storage });

const uploadMultiple = upload.fields([
  { name: "file1", maxCount: 1 },
  { name: "file2", maxCount: 1 },
]);

const router = Router();

router.use(verifyToken);

router.get('/blob-token', getBlobToken);
router.post('/upload', uploadJsToExcel);
router.post('/upload-excel', uploadExcelToJs);
router.post('/v2/upload-excel', uploadExcelToJsV2);
router.post('/upload-excel-merge', uploadMultiple, uploadExcelMerge);
router.post('/upload-excel-merge-zip', uploadExcelMergeZip);
router.post('/generate-excels-for-each-locales', generateExcelForEachLocales);
router.post('/v2/generate-excels-for-each-locales', generateExcelForEachLocalesV2);
router.post('/diff-js', compareTwoJs);
router.post('/diff-excel', compareTwoExcels);
router.post('/translate-excel', translateExcel);
router.post('/translate-js', translateJs);

export default router;