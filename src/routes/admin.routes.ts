import { Router } from 'express';

import { verifyAdmin, verifyToken } from '../middleware/validation.js';
import { createAdmin, deleteUser, getAdminInfo } from '../controllers/admin.controller.js';

const router = Router();

router.use(verifyToken, verifyAdmin);

router.get('/users', getAdminInfo);
router.post('/users', createAdmin);
router.delete('/users/:email', deleteUser);

export default router;