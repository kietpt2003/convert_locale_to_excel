import assert from 'node:assert/strict';
import test from 'node:test';
import mongoose from 'mongoose';
import { getSubscriptionCatalog } from '../src/constants/subscriptionCatalog.js';
import { PAYMENT_METHOD, ORDER_STATUS } from '../src/constants/order.js';
import { PREMIUM_PLAN_ENUM } from '../src/constants/premiumPlan.js';
import { purchaseQuote, validatePurchase, nextPremiumExpiry, completePurchase, eligibleRecipientQuery } from '../src/utils/subscriptionPurchase.js';
import { verifiedPaypalCapture, createOfflinePurchase } from '../src/controllers/subscription.controller.js';
import { AuthorizedUser } from '../src/models/AuthorizedUser.js';
import { Order } from '../src/models/Order.js';

const buyerId = '111111111111111111111111';
const recipientId = '222222222222222222222222';
const buyer = { _id: buyerId, email: 'buyer@example.test', premiumPlan: 'NONE', premiumValidUntil: null };
const friend = { _id: recipientId, email: 'friend@example.test', role: 'user', premiumPlan: 'NONE', premiumValidUntil: null };

test('all normal and Buy 1 Get 1 prices match the requested card, bank and cash totals', () => {
  const original = process.env.BOGO_ENABLED_PLANS;
  delete process.env.BOGO_ENABLED_PLANS;
  try {
    const expected = { DAILY: [5000, 7000, 4.99, 5], MONTHLY: [50000, 55000, 5.55, 5.6], YEARLY: [150000, 155000, 7.25, 7.3], LIFETIME: [200000, 200000, 9.99, 9.99] };
    for (const [plan, values] of Object.entries(expected)) {
      for (const method of [PAYMENT_METHOD.SE_PAY, PAYMENT_METHOD.CASH]) {
        assert.equal(purchaseQuote(plan, false, method).amount, values[0]);
        assert.equal(purchaseQuote(plan, true, method).amount, values[1]);
      }
      assert.equal(purchaseQuote(plan, false, PAYMENT_METHOD.PAYPAL).amount, values[2]);
      assert.equal(purchaseQuote(plan, true, PAYMENT_METHOD.PAYPAL).amount, values[3]);
    }
    assert.throws(() => purchaseQuote('TRIAL', true, PAYMENT_METHOD.SE_PAY));
    assert.throws(() => purchaseQuote('DAILY', 'false', PAYMENT_METHOD.SE_PAY));
    process.env.BOGO_ENABLED_PLANS = 'MONTHLY';
    assert.throws(() => purchaseQuote('DAILY', true, PAYMENT_METHOD.PAYPAL));
    assert.equal(purchaseQuote('DAILY', false, PAYMENT_METHOD.PAYPAL).amount, 4.99);
    assert.deepEqual(getSubscriptionCatalog().filter(plan => plan.bogoEnabled).map(plan => plan.id), ['MONTHLY']);
  } finally { if (original === undefined) delete process.env.BOGO_ENABLED_PLANS; else process.env.BOGO_ENABLED_PLANS = original; }
});

test('expiry is one matching plan term, clamps month ends/leap years and extends an existing buyer plan', () => {
  const now = new Date('2026-01-31T12:00:00Z');
  assert.equal(nextPremiumExpiry('DAILY', null, now)!.toISOString(), '2026-02-01T12:00:00.000Z');
  assert.equal(nextPremiumExpiry('MONTHLY', null, now)!.toISOString(), '2026-02-28T12:00:00.000Z');
  assert.equal(nextPremiumExpiry('YEARLY', null, new Date('2024-02-29T12:00:00Z'))!.toISOString(), '2025-02-28T12:00:00.000Z');
  assert.equal(nextPremiumExpiry('DAILY', new Date('2026-02-15T12:00:00Z'), now)!.toISOString(), '2026-02-16T12:00:00.000Z');
  assert.equal(nextPremiumExpiry('LIFETIME', null, now), null);
});

test('recipient validation rejects self, malformed/missing ID, active/inaccessible recipient and gift without promotion', async () => {
  const findById = AuthorizedUser.findById, findOne = AuthorizedUser.findOne;
  let recipient: any = friend;
  AuthorizedUser.findById = (async () => buyer) as any;
  AuthorizedUser.findOne = (async query => {
    assert.deepEqual(query.role, { $in: ['user', 'admin'] }); assert.equal(query._id, recipientId);
    return recipient;
  }) as any;
  try {
    for (const id of [undefined, buyerId, 'bad']) await assert.rejects(validatePurchase(buyerId, { planType: 'MONTHLY', buyOneGetOne: true, recipientUserId: id }, PAYMENT_METHOD.SE_PAY));
    await assert.rejects(validatePurchase(buyerId, { planType: 'MONTHLY', buyOneGetOne: false, recipientUserId: recipientId }, PAYMENT_METHOD.SE_PAY));
    const valid = await validatePurchase(buyerId, { planType: 'MONTHLY', buyOneGetOne: true, recipientUserId: recipientId, amount: 1 }, PAYMENT_METHOD.SE_PAY);
    assert.equal(valid.amount, 55000);
    recipient = { ...friend, role: 'admin' };
    const adminGift = await validatePurchase(buyerId, { planType: 'MONTHLY', buyOneGetOne: true, recipientUserId: recipientId }, PAYMENT_METHOD.SE_PAY);
    assert.equal(adminGift.recipient?.role, 'admin');
    const persisted = await validatePurchase(buyerId, { planType: 'MONTHLY', buyOneGetOne: true, recipientUserId: new mongoose.Types.ObjectId(recipientId) }, PAYMENT_METHOD.PAYPAL);
    assert.equal(persisted.amount, 5.6);
    await assert.rejects(validatePurchase('abcdefabcdefabcdefabcdef', { planType: 'DAILY', buyOneGetOne: true, recipientUserId: 'ABCDEFABCDEFABCDEFABCDEF' }, PAYMENT_METHOD.SE_PAY));
    recipient = null;
    await assert.rejects(validatePurchase(buyerId, { planType: 'MONTHLY', buyOneGetOne: true, recipientUserId: recipientId }, PAYMENT_METHOD.SE_PAY), /already has an active plan/);
    const query = eligibleRecipientQuery(new Date('2026-10-31'));
    assert.equal(query.$or[0].premiumPlan, 'NONE');
    assert.deepEqual(query.$or[1].premiumPlan, { $nin: ['NONE', 'LIFETIME'] });
    assert.equal(query.$or[1].premiumValidUntil!.$lte.toISOString(), '2026-10-31T00:00:00.000Z');
  } finally { AuthorizedUser.findById = findById; AuthorizedUser.findOne = findOne; }
});

test('cash/bank invoices store the recipient and server-calculated total, independent of client amount', async () => {
  const originals = [AuthorizedUser.findById, AuthorizedUser.findOne, Order.findOne, Order.create];
  const saved: any[] = [];
  AuthorizedUser.findById = (async () => buyer) as any;
  AuthorizedUser.findOne = (async () => friend) as any;
  Order.findOne = (async () => null) as any;
  Order.create = (async data => { saved.push(data); return data; }) as any;
  const res: any = { status(code: number) { this.code = code; return this; }, json(data: any) { this.data = data; return this; } };
  try {
    for (const method of [PAYMENT_METHOD.SE_PAY, PAYMENT_METHOD.CASH] as const) {
      await createOfflinePurchase(method)({ user: { id: buyerId }, body: { planType: 'DAILY', buyOneGetOne: true, recipientUserId: recipientId, amount: 1 } }, res);
      assert.equal(res.code, 201); assert.equal(res.data.amount, 7000); assert.equal(res.data.recipientEmail, friend.email);
      assert.equal(saved.at(-1).paymentMethod, method);
      assert.equal(saved.at(-1).recipientUserId, recipientId);
    }
  } finally { [AuthorizedUser.findById, AuthorizedUser.findOne, Order.findOne, Order.create] = originals as any; }
});

test('PayPal verification rejects pending, wrong amount/currency, duplicate or missing capture IDs', () => {
  const data = () => ({ status: 'COMPLETED', purchase_units: [{ payments: { captures: [{ id: 'CAPTURE', status: 'COMPLETED', amount: { currency_code: 'USD', value: '5.60' } }] } }] });
  assert.equal(verifiedPaypalCapture(data(), 5.6), 'CAPTURE');
  assert.throws(() => verifiedPaypalCapture(data(), 5));
  const pending = data(); pending.status = 'APPROVED'; assert.throws(() => verifiedPaypalCapture(pending, 5.6));
  const currency = data(); currency.purchase_units[0].payments.captures[0].amount.currency_code = 'VND'; assert.throws(() => verifiedPaypalCapture(currency, 5.6));
  const missing = data(); missing.purchase_units[0].payments.captures[0].id = ''; assert.throws(() => verifiedPaypalCapture(missing, 5.6));
  const duplicate = data(); duplicate.purchase_units.push(duplicate.purchase_units[0]); assert.throws(() => verifiedPaypalCapture(duplicate, 5.6));
});

test('transactional fulfillment credits both users once and preserves verified payment for review on rollback', async () => {
  const originals = { session: mongoose.startSession, orderFind: Order.findOne, orderUpdate: Order.updateOne, userFind: AuthorizedUser.findOne, userById: AuthorizedUser.findById };
  let users: Record<string, any> = { [buyerId]: { ...buyer }, [recipientId]: { ...friend } };
  let order: any = { orderId: 'BOGO', userId: buyerId, recipientUserId: recipientId, planType: PREMIUM_PLAN_ENUM.MONTHLY, buyOneGetOne: true, status: ORDER_STATUS.PENDING };
  let failBuyer = false;
  const session: any = { withTransaction: async (callback: any) => {
    const savedUsers = structuredClone(users), savedOrder = structuredClone(order);
    try { return await callback(); } catch (error) { users = savedUsers; order = savedOrder; throw error; }
  }, endSession: async () => {} };
  mongoose.startSession = (async () => session) as any;
  Order.updateOne = (async (_query, update: any) => { if (order.status === ORDER_STATUS.PENDING) Object.assign(order, update.$set); }) as any;
  Order.findOne = (() => ({ session: async () => ({ ...order, save: async function(options: any) { assert.equal(options.session, session); const values = { ...this }; delete values.save; Object.assign(order, values); } }) })) as any;
  const document = (id: string) => ({ ...users[id], save: async function(options: any) {
    assert.equal(options.session, session); if (failBuyer && id === buyerId) throw new Error('Injected buyer save failure');
    users[id] = { ...this }; delete users[id].save;
  } });
  AuthorizedUser.findById = ((id: string) => ({ session: async () => document(id) })) as any;
  AuthorizedUser.findOne = (() => ({ session: async () => users[recipientId].premiumPlan === 'NONE' ? document(recipientId) : null })) as any;
  try {
    await completePurchase('BOGO', 'PAYMENT');
    assert.equal(order.status, ORDER_STATUS.COMPLETE);
    assert.equal(users[buyerId].premiumPlan, 'MONTHLY'); assert.equal(users[recipientId].premiumPlan, 'MONTHLY');
    assert.equal(users[buyerId].premiumValidUntil.getTime(), users[recipientId].premiumValidUntil.getTime());
    const expiration = users[buyerId].premiumValidUntil.getTime();
    await completePurchase('BOGO', 'PAYMENT');
    assert.equal(users[buyerId].premiumValidUntil.getTime(), expiration);
    order.status = ORDER_STATUS.PENDING;
    users[buyerId] = { ...buyer }; users[recipientId] = { ...friend }; failBuyer = true;
    await assert.rejects(completePurchase('BOGO', 'PAYMENT'), /Injected/);
    assert.equal(users[recipientId].premiumPlan, 'NONE'); assert.equal(users[buyerId].premiumPlan, 'NONE');
    assert.equal(order.status, ORDER_STATUS.PENDING); assert.equal(order.verifiedCaptureId, 'PAYMENT');
    failBuyer = false; users[recipientId].premiumPlan = 'LIFETIME';
    await assert.rejects(completePurchase('BOGO', 'PAYMENT'), /no longer eligible/);
    assert.equal(users[buyerId].premiumPlan, 'NONE'); assert.equal(users[recipientId].premiumPlan, 'LIFETIME');
  } finally {
    mongoose.startSession = originals.session; Order.findOne = originals.orderFind; Order.updateOne = originals.orderUpdate;
    AuthorizedUser.findOne = originals.userFind; AuthorizedUser.findById = originals.userById;
  }
});

test('recipient search is paginated, escaped literally and excludes the purchaser', async () => {
  const { getGiftRecipients } = await import('../src/controllers/subscription.controller.js');
  const originalFind = AuthorizedUser.find, originalCount = AuthorizedUser.countDocuments;
  let query: any, skip: number, limit: number;
  const chain: any = { select() { return this; }, sort() { return this; }, skip(value: number) { skip = value; return this; }, limit(value: number) { limit = value; return this; }, lean: async () => [{ _id: recipientId, email: friend.email }] };
  AuthorizedUser.find = ((value: any) => { query = value; return chain; }) as any;
  AuthorizedUser.countDocuments = (async () => 51) as any;
  const response: any = { status() { return this; }, json(data: any) { this.data = data; return this; } };
  try {
    await getGiftRecipients({ user: { id: buyerId }, query: { search: 'a+b@example.test', page: '2', limit: '500' } }, response);
    assert.equal(skip!, 50); assert.equal(limit!, 50);
    assert.deepEqual(query.$and[0].role, { $in: ['user', 'admin'] });
    assert.equal('email' in query.$and[0], false);
    assert.equal(query.$and[1]._id.$ne, buyerId);
    assert.equal(query.$and[2].email.$regex, 'a\\+b@example\\.test');
    assert.equal(response.data.data[0].id, recipientId);
    assert.equal(response.data.pagination.totalItems, 51);
    assert.equal(response.data.pagination.hasNextPage, false);
    await getGiftRecipients({ user: { id: buyerId }, query: { page: 'Infinity', limit: '-1' } }, response);
    assert.equal(skip!, 0); assert.equal(limit!, 1);
  } finally { AuthorizedUser.find = originalFind; AuthorizedUser.countDocuments = originalCount; }
});

test('bank webhook rejects forged signatures and insufficient transfers; capture cannot access another buyer order', async () => {
  const { confirmBankPurchase, capturePaypalPurchase } = await import('../src/controllers/subscription.controller.js');
  const crypto = await import('node:crypto');
  const secret = process.env.SEPAY_WEBHOOK_SECRET;
  const find = Order.findOne;
  process.env.SEPAY_WEBHOOK_SECRET = 'fixture-secret';
  const response: any = { status(code: number) { this.code = code; return this; }, json(data: any) { this.data = data; return this; } };
  try {
    const body = { content: 'MYONLYTOOLMABC123', transferAmount: 50000, transferType: 'in' };
    await confirmBankPurchase({ body, headers: {} }, response);
    assert.equal(response.code, 401);
    const timestamp = 'fixture-timestamp';
    const signature = 'sha256=' + crypto.createHmac('sha256', 'fixture-secret').update(timestamp + '.' + JSON.stringify(body)).digest('hex');
    Order.findOne = (async () => ({ amount: 55000 })) as any;
    await confirmBankPurchase({ body, headers: { 'x-sepay-signature': signature, 'x-sepay-timestamp': timestamp } }, response);
    assert.equal(response.code, 400);
    Order.findOne = (async query => { assert.equal(query.userId, buyerId); return null; }) as any;
    await capturePaypalPurchase({ user: { id: buyerId }, params: { orderCode: 'SOMEONE_ELSE_ORDER' } }, response);
    assert.equal(response.code, 404);
  } finally { if (secret === undefined) delete process.env.SEPAY_WEBHOOK_SECRET; else process.env.SEPAY_WEBHOOK_SECRET = secret; Order.findOne = find; }
});

test('legacy completed BOGO restores an admin gift from confirmation time without extending buyer or granting twice', async () => {
  const originals = { session: mongoose.startSession, orderFind: Order.findOne, orderUpdate: Order.updateOne, userFind: AuthorizedUser.findOne, userById: AuthorizedUser.findById };
  const confirmedAt = new Date(Date.now() - 60_000);
  let recipient: any = { ...friend, role: 'admin' };
  let order: any = { orderId: 'LEGACY_PAID', userId: buyerId, recipientUserId: recipientId, planType: PREMIUM_PLAN_ENUM.DAILY, buyOneGetOne: true,
    status: ORDER_STATUS.COMPLETE, paymentMethod: PAYMENT_METHOD.SE_PAY, paypalCaptureId: 'COMPLETED', updatedAt: confirmedAt };
  const session: any = { withTransaction: async (callback: any) => callback(), endSession: async () => {} };
  let giftSaves = 0;
  mongoose.startSession = (async () => session) as any;
  Order.updateOne = (async (query: any) => { assert.equal(query.status, ORDER_STATUS.PENDING); }) as any;
  Order.findOne = (() => ({ session: async () => ({ ...order, save: async function(options: any) {
    assert.equal(options.session, session); const values = { ...this }; delete values.save; Object.assign(order, values);
  } }) })) as any;
  AuthorizedUser.findById = (() => { throw new Error('Legacy reconciliation must never update the buyer'); }) as any;
  AuthorizedUser.findOne = ((query: any) => ({ session: async () => {
    assert.deepEqual(query.role, { $in: ['user', 'admin'] });
    return recipient.premiumPlan === 'NONE' ? { ...recipient, save: async function(options: any) {
      assert.equal(options.session, session); giftSaves++; recipient = { ...this }; delete recipient.save;
    } } : null;
  } })) as any;
  try {
    await completePurchase('LEGACY_PAID', 'COMPLETED');
    const expectedExpiry = nextPremiumExpiry('DAILY', null, confirmedAt)!;
    assert.equal(recipient.premiumPlan, 'DAILY'); assert.equal(recipient.role, 'admin');
    assert.equal(recipient.premiumValidUntil.getTime(), expectedExpiry.getTime());
    assert.equal(order.giftActivatedAt.getTime(), confirmedAt.getTime());
    assert.equal(order.giftActivationSource, 'legacy-reconcile');
    await completePurchase('LEGACY_PAID', 'COMPLETED');
    assert.equal(giftSaves, 1);
    assert.equal(recipient.premiumValidUntil.getTime(), expectedExpiry.getTime());
    order.giftActivatedAt = undefined; order.updatedAt = new Date(Date.now() - 2 * 86400_000); recipient = { ...friend, role: 'admin' };
    await assert.rejects(completePurchase('LEGACY_PAID', 'COMPLETED'), /period has elapsed/);
    assert.equal(giftSaves, 1);
  } finally {
    mongoose.startSession = originals.session; Order.findOne = originals.orderFind; Order.updateOne = originals.orderUpdate;
    AuthorizedUser.findOne = originals.userFind; AuthorizedUser.findById = originals.userById;
  }
});
