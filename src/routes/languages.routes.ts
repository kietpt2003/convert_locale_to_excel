import { Router } from 'express';

import { verifyAdmin, verifyToken } from '../middleware/validation.js';
import { createLanguages, deleteLanguage, getLanguages } from '../controllers/languages.controller.js';

const router = Router();

router.use(verifyToken);

router.get('/', getLanguages);
router.post('/admin', verifyAdmin, createLanguages);
router.delete('/admin/:code', verifyAdmin, deleteLanguage);

export default router;