import { Router } from 'express';

import { verifyAdmin, verifyToken } from '../middleware/validation.js';
import { getListOrders, handleActivatePlan } from '../controllers/order.controller.js';
import { getPurchasePlans, getGiftRecipients, createOfflinePurchase, createPaypalPurchase, capturePaypalPurchase,
  subscriptionOrderStatus, confirmBankPurchase, listPendingCashPurchases, confirmCashPurchase, correctGiftRecipient } from '../controllers/subscription.controller.js';
import { PAYMENT_METHOD } from '../constants/order.js';

const router = Router();

router.post('/paypal-success', verifyToken, capturePaypalPurchase);
router.post('/premium/activate-plan', verifyToken, handleActivatePlan);
router.post('/webhook/se-pay', confirmBankPurchase);
router.post('/se-pay', verifyToken, createOfflinePurchase(PAYMENT_METHOD.SE_PAY));
router.get('/status/:orderCode', verifyToken, subscriptionOrderStatus);
router.get('/plans', verifyToken, getPurchasePlans);
router.get('/gift-recipients', verifyToken, getGiftRecipients);
router.post('/paypal', verifyToken, createPaypalPurchase);
router.post('/paypal/:orderCode/capture', verifyToken, capturePaypalPurchase);
router.post('/cash', verifyToken, createOfflinePurchase(PAYMENT_METHOD.CASH));
router.get('/cash/pending', verifyToken, verifyAdmin, listPendingCashPurchases);
router.post('/cash/:orderCode/confirm', verifyToken, verifyAdmin, confirmCashPurchase);
router.patch('/:orderCode/gift-recipient', verifyToken, verifyAdmin, correctGiftRecipient);
router.get('/', verifyToken, getListOrders);

export default router;
