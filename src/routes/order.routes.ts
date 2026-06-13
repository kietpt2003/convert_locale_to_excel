import { Router } from 'express';

import { verifyToken } from '../middleware/validation.js';
import {
  checkOrderStatus,
  createSePayQROrder,
  handleActivatePlan,
  handlePaypalSuccess,
  handleSePayWebhook
} from '../controllers/order.controller.js';

const router = Router();

router.post('/paypal-success', verifyToken, handlePaypalSuccess);
router.post('/premium/activate-plan', verifyToken, handleActivatePlan);
router.post('/webhook/se-pay', handleSePayWebhook);
router.post('/se-pay', verifyToken, createSePayQROrder);
router.get('/status/:orderCode', verifyToken, checkOrderStatus);

export default router;
