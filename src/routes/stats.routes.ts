import { Router } from 'express';

import { verifyToken } from '../middleware/validation.js';
import { countTotalUsage, getSiteVisits } from '../controllers/statistic.controller.js';

const router = Router();

router.use(verifyToken);

router.get('/visits', getSiteVisits);
router.get('/total-usage', countTotalUsage);

export default router;