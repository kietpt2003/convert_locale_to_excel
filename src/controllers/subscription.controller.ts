import { Response } from 'express';
import axios from 'axios';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { AuthorizedUser } from '../models/AuthorizedUser.js';
import { Order } from '../models/Order.js';
import { ORDER_STATUS, PAYMENT_METHOD } from '../constants/order.js';
import { getSubscriptionCatalog } from '../constants/subscriptionCatalog.js';
import { completePurchase, eligibleRecipientQuery, findEligibleGiftRecipient, PurchaseError, validatePurchase } from '../utils/subscriptionPurchase.js';

function fail(res: Response, error: unknown) {
  if (error instanceof PurchaseError) return res.status(error.status).json({ success: false, message: error.message });
  console.error('[Subscription]', error instanceof Error ? error.message : 'Unexpected failure');
  return res.status(502).json({ success: false, message: 'Unable to process this purchase. Please retry or contact admin with your order code.' });
}

async function tokenFor(userId: any, claims: any) {
  const user = await AuthorizedUser.findById(userId);
  if (!user) throw new PurchaseError(404, 'User not found');
  return jwt.sign({ id: String(user._id), email: user.email, name: claims.name || '', picture: claims.picture || '', role: user.role,
    premiumPlan: user.premiumPlan, premiumValidUntil: user.premiumValidUntil, hasUsedTrial: user.hasUsedTrial }, process.env.JWT_SECRET!, { expiresIn: '1d' });
}

export const getPurchasePlans = (_req: any, res: Response) => res.json({ success: true, data: getSubscriptionCatalog() });

export const getGiftRecipients = async (req: any, res: Response) => {
  try {
    const rawPage = Number(req.query.page), rawLimit = Number(req.query.limit);
    const page = Number.isFinite(rawPage) ? Math.max(1, Math.min(100000, Math.floor(rawPage) || 1)) : 1;
    const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(50, Math.floor(rawLimit) || 20)) : 20;
    const search = String(req.query.search || '').trim().slice(0, 200).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const query = { $and: [eligibleRecipientQuery(), { _id: { $ne: req.user.id } }, ...(search ? [{ email: { $regex: search, $options: 'i' } }] : [])] };
    const [items, total] = await Promise.all([
      AuthorizedUser.find(query).select('_id email').sort({ email: 1 }).skip((page - 1) * limit).limit(limit).lean(),
      AuthorizedUser.countDocuments(query),
    ]);
    return res.json({ success: true, data: items.map(user => ({ id: String(user._id), email: user.email })),
      pagination: { currentPage: page, itemsPerPage: limit, totalItems: total, totalPages: Math.ceil(total / limit), hasNextPage: page * limit < total } });
  } catch (error) { return fail(res, error); }
};

function orderFields(selection: Awaited<ReturnType<typeof validatePurchase>>) {
  return { userId: selection.buyer._id, userName: selection.buyer.email, userEmail: selection.buyer.email,
    amount: selection.amount, currency: selection.currency, planType: selection.planType, buyOneGetOne: selection.buyOneGetOne,
    recipientUserId: selection.recipient?._id, recipientEmail: selection.recipient?.email,
    status: ORDER_STATUS.PENDING, paypalCaptureId: 'PENDING' };
}

function orderResponse(order: any) {
  const memo = `Thanh toan don hang ${order.orderId}`;
  const bankAccount = process.env.TPBANK_NUMBER || '';
  return { success: true, orderCode: order.orderId, planType: order.planType, amount: order.amount,
    currency: order.currency, buyOneGetOne: order.buyOneGetOne, recipientEmail: order.recipientEmail,
    memo, isExisting: false,
    ...(order.paymentMethod === PAYMENT_METHOD.SE_PAY ? { qrUrl: `https://qr.sepay.vn/img?bank=TPBank&acc=${encodeURIComponent(bankAccount)}&template=compact&amount=${order.amount}&des=${encodeURIComponent(memo)}` } : {}) };
}

export const createOfflinePurchase = (method: PAYMENT_METHOD.SE_PAY | PAYMENT_METHOD.CASH) => async (req: any, res: Response) => {
  try {
    const selection = await validatePurchase(req.user.id, req.body, method);
    const fields = orderFields(selection);
    const existing = await Order.findOne({ userId: fields.userId, status: ORDER_STATUS.PENDING, paymentMethod: method,
      planType: fields.planType, amount: fields.amount, buyOneGetOne: fields.buyOneGetOne,
      recipientUserId: fields.recipientUserId || null, currency: fields.currency });
    if (existing) return res.json({ ...orderResponse(existing), isExisting: true });
    const order = await Order.create({ ...fields, paymentMethod: method,
      orderId: `MYONLYTOOL${selection.planType[0]}${crypto.randomUUID().replace(/-/g, '').slice(0, 11).toUpperCase()}` });
    return res.status(201).json(orderResponse(order));
  } catch (error) { return fail(res, error); }
};

async function paypalClient() {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const secret = process.env.PAYPAL_CLIENT_SECRET;
  if (!clientId || !secret) throw new PurchaseError(503, 'PayPal server credentials are not configured. Please use bank transfer or cash.');
  const baseURL = process.env.PAYPAL_ENV === 'sandbox' ? 'https://api-m.sandbox.paypal.com' : 'https://api-m.paypal.com';
  const { data } = await axios.post(`${baseURL}/v1/oauth2/token`, 'grant_type=client_credentials', {
    auth: { username: clientId, password: secret }, headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 20_000,
  });
  return axios.create({ baseURL, timeout: 30_000, headers: { Authorization: `Bearer ${data.access_token}` } });
}

export const createPaypalPurchase = async (req: any, res: Response) => {
  try {
    const selection = await validatePurchase(req.user.id, req.body, PAYMENT_METHOD.PAYPAL);
    const client = await paypalClient();
    const reference = crypto.randomUUID();
    const { data } = await client.post('/v2/checkout/orders', { intent: 'CAPTURE', purchase_units: [{
      custom_id: `${req.user.id}:${reference}`, amount: { currency_code: 'USD', value: selection.amount.toFixed(2) },
      description: `${selection.planType}${selection.buyOneGetOne ? ' Buy 1 Get 1' : ''} - My Only Tool`,
    }] }, { headers: { 'PayPal-Request-Id': reference } });
    const order = await Order.create({ ...orderFields(selection), paymentMethod: PAYMENT_METHOD.PAYPAL, orderId: data.id });
    return res.status(201).json({ ...orderResponse(order), id: data.id });
  } catch (error) { return fail(res, error); }
};

export function verifiedPaypalCapture(data: any, amount: number) {
  const captures = data.purchase_units?.flatMap((unit: any) => unit.payments?.captures || []) || [];
  if (data.status !== 'COMPLETED' || captures.length !== 1 || typeof captures[0].id !== 'string' || !captures[0].id || captures[0].status !== 'COMPLETED'
    || captures[0].amount?.currency_code !== 'USD' || Math.round(Number(captures[0].amount.value) * 100) !== Math.round(amount * 100)) {
    throw new PurchaseError(409, 'PayPal has not confirmed the expected USD payment');
  }
  return String(captures[0].id);
}

export const capturePaypalPurchase = async (req: any, res: Response) => {
  try {
    const orderCode = req.params.orderCode || req.body.paypalDetails?.id;
    const order = await Order.findOne({ orderId: orderCode, userId: req.user.id, paymentMethod: PAYMENT_METHOD.PAYPAL });
    if (!order) throw new PurchaseError(404, 'PayPal order not found. Please create checkout again.');
    if (order.status !== ORDER_STATUS.COMPLETE) {
      const client = await paypalClient();
      let { data } = await client.get(`/v2/checkout/orders/${encodeURIComponent(order.orderId)}`);
      if (data.status !== 'COMPLETED') {
        // Check eligibility before charging; also recheck atomically before grants.
        await validatePurchase(req.user.id, order, PAYMENT_METHOD.PAYPAL);
        ({ data } = await client.post(`/v2/checkout/orders/${encodeURIComponent(order.orderId)}/capture`, {}, { headers: { 'PayPal-Request-Id': `${order.orderId}-capture` } }));
      }
      await completePurchase(order.orderId, verifiedPaypalCapture(data, order.amount));
    } else if (order.buyOneGetOne && !order.giftActivatedAt) {
      await completePurchase(order.orderId, order.paypalCaptureId);
    }
    return res.json({ success: true, message: 'Payment confirmed. Purchased and gift plans are active.', newToken: await tokenFor(req.user.id, req.user) });
  } catch (error) { return fail(res, error); }
};

export const subscriptionOrderStatus = async (req: any, res: Response) => {
  try {
    const order = await Order.findOne({ orderId: req.params.orderCode, userId: req.user.id });
    if (!order) throw new PurchaseError(404, 'Order not found');
    if (order.status === ORDER_STATUS.COMPLETE && order.buyOneGetOne && !order.giftActivatedAt) {
      await completePurchase(order.orderId, order.paypalCaptureId);
    }
    return res.json({ success: true, status: order.status === ORDER_STATUS.COMPLETE ? 'COMPLETED' : 'PENDING',
      ...(order.status === ORDER_STATUS.COMPLETE ? { newToken: await tokenFor(req.user.id, req.user) } : {}) });
  } catch (error) { return fail(res, error); }
};

export const confirmBankPurchase = async (req: any, res: Response) => {
  try {
    const secret = process.env.SEPAY_WEBHOOK_SECRET;
    if (!secret) throw new PurchaseError(503, 'SePay webhook is not configured');
    const signature = String(req.headers['x-sepay-signature'] || '');
    const timestamp = String(req.headers['x-sepay-timestamp'] || '');
    const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(timestamp + '.' + JSON.stringify(req.body)).digest('hex');
    if (Buffer.byteLength(signature) !== Buffer.byteLength(expected) || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) throw new PurchaseError(401, 'Invalid signature');
    if (req.body.transferType && req.body.transferType !== 'in') return res.json({ success: true, message: 'Outgoing transfer ignored' });
    const code = String(req.body.content || '').match(/(MYONLYTOOL[DMYL][A-Z0-9]+)/i)?.[1].toUpperCase();
    if (!code) return res.json({ success: true, message: 'Unrelated transfer' });
    const order = await Order.findOne({ orderId: code, paymentMethod: PAYMENT_METHOD.SE_PAY });
    if (!order) throw new PurchaseError(404, 'Order not found');
    if (!Number.isFinite(Number(req.body.transferAmount)) || Number(req.body.transferAmount) < order.amount) throw new PurchaseError(400, 'Transfer amount is below the invoice total');
    await completePurchase(code, `SEPAY:${req.body.id || code}`);
    return res.json({ success: true, message: 'Payment confirmed and plans activated' });
  } catch (error) { return fail(res, error); }
};

export const listPendingCashPurchases = async (_req: any, res: Response) => {
  try {
    const data = await Order.find({ status: ORDER_STATUS.PENDING, $or: [{ paymentMethod: PAYMENT_METHOD.CASH }, { paymentVerifiedAt: { $exists: true } }] }).sort({ createdAt: -1 }).limit(100).lean();
    return res.json({ success: true, data });
  } catch (error) { return fail(res, error); }
};

export const confirmCashPurchase = async (req: any, res: Response) => {
  try {
    const order = await Order.findOne({ orderId: req.params.orderCode, paymentMethod: PAYMENT_METHOD.CASH });
    if (!order) throw new PurchaseError(404, 'Cash order not found');
    await completePurchase(order.orderId, `CASH:${req.user.id}`);
    return res.json({ success: true, message: 'Cash payment confirmed and plans activated' });
  } catch (error) { return fail(res, error); }
};


export const correctGiftRecipient = async (req: any, res: Response) => {
  try {
    const order = await Order.findOne({ orderId: req.params.orderCode, status: ORDER_STATUS.PENDING, buyOneGetOne: true });
    if (!order) throw new PurchaseError(404, 'Pending gift order not found');
    // Honor the paid invoice even if the promotion has since been disabled.
    const recipient = await findEligibleGiftRecipient(String(order.userId), req.body.recipientUserId);
    const updated = await Order.findOneAndUpdate({ _id: order._id, status: ORDER_STATUS.PENDING },
      { $set: { recipientUserId: recipient!._id, recipientEmail: recipient!.email } }, { new: true });
    if (!updated) throw new PurchaseError(409, 'Order has already been completed');
    if (updated.paymentVerifiedAt && updated.verifiedCaptureId) await completePurchase(updated.orderId, updated.verifiedCaptureId);
    return res.json({ success: true, message: updated.paymentVerifiedAt ? 'Recipient corrected and both plans activated' : 'Recipient updated; payment confirmation is still required' });
  } catch (error) { return fail(res, error); }
};
