import { Router } from 'express';

import { verifyToken } from '../middleware/validation.js';
import { handleActivatePlan, handlePaypalSuccess } from '../controllers/order.controller.js';

const router = Router();

router.use(verifyToken);

router.post('/paypal-success', handlePaypalSuccess);
router.post('/premium/activate-plan', handleActivatePlan);

export default router;
