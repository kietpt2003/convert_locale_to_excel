import mongoose, { ClientSession } from 'mongoose';
import { AuthorizedUser } from '../models/AuthorizedUser.js';
import { Order } from '../models/Order.js';
import { ORDER_STATUS, PAYMENT_METHOD } from '../constants/order.js';
import { PREMIUM_PLAN, PREMIUM_PLAN_ENUM } from '../constants/premiumPlan.js';
import { getSubscriptionCatalog } from '../constants/subscriptionCatalog.js';

export class PurchaseError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export function eligibleRecipientQuery(now = new Date()) {
  return {
    role: { $in: ['user', 'admin'] },
    $or: [
      { premiumPlan: PREMIUM_PLAN.NONE },
      { premiumPlan: { $nin: [PREMIUM_PLAN.NONE, PREMIUM_PLAN.LIFETIME] }, premiumValidUntil: { $lte: now } },
      { premiumPlan: { $ne: PREMIUM_PLAN.LIFETIME }, premiumValidUntil: null },
    ],
  };
}

export function purchaseQuote(planType: unknown, buyOneGetOne: unknown, paymentMethod: PAYMENT_METHOD) {
  if (buyOneGetOne !== undefined && typeof buyOneGetOne !== 'boolean') throw new PurchaseError(400, 'buyOneGetOne must be a boolean');
  const plan = getSubscriptionCatalog().find(plan => plan.id === planType);
  if (!plan) throw new PurchaseError(400, 'Invalid paid plan');
  if (buyOneGetOne && !plan.bogoEnabled) throw new PurchaseError(400, 'Buy 1 Get 1 is unavailable for this plan');
  const usd = paymentMethod === PAYMENT_METHOD.PAYPAL;
  return { planType: plan.id, buyOneGetOne: buyOneGetOne === true,
    currency: usd ? 'USD' : 'VND',
    amount: usd ? (buyOneGetOne ? plan.bogoUsdPrice : plan.usdPrice) : (buyOneGetOne ? plan.bogoVndPrice : plan.vndPrice) };
}

export async function findEligibleGiftRecipient(userId: string, recipientUserId: unknown) {
  if (recipientUserId instanceof mongoose.Types.ObjectId) recipientUserId = recipientUserId.toHexString();
  if (typeof recipientUserId !== 'string' || !mongoose.isValidObjectId(recipientUserId)
    || recipientUserId.toLowerCase() === String(userId).toLowerCase()) {
    throw new PurchaseError(400, 'Choose another eligible user to receive the gift');
  }
  const recipient = await AuthorizedUser.findOne({ _id: recipientUserId, ...eligibleRecipientQuery() });
  if (!recipient) throw new PurchaseError(409, 'This recipient already has an active plan or is unavailable. Please choose another user.');
  return recipient;
}

export async function validatePurchase(userId: string, body: any, method: PAYMENT_METHOD) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new PurchaseError(400, 'Purchase selection is required');
  const quote = purchaseQuote(body.planType, body.buyOneGetOne, method);
  const buyer = await AuthorizedUser.findById(userId);
  if (!buyer) throw new PurchaseError(404, 'Buyer not found');
  let recipient;
  if (quote.buyOneGetOne) {
    recipient = await findEligibleGiftRecipient(userId, body.recipientUserId);
  } else if (body.recipientUserId) throw new PurchaseError(400, 'Enable Buy 1 Get 1 before choosing a recipient');
  return { ...quote, buyer, recipient };
}

export function nextPremiumExpiry(plan: string, previousExpiry: Date | null | undefined, now = new Date()) {
  if (plan === PREMIUM_PLAN.LIFETIME) return null;
  const date = new Date(previousExpiry && previousExpiry > now ? previousExpiry : now);
  if (plan === PREMIUM_PLAN.DAILY) date.setDate(date.getDate() + 1);
  else if (plan === PREMIUM_PLAN.MONTHLY) {
    const day = date.getDate(); date.setDate(1); date.setMonth(date.getMonth() + 1);
    date.setDate(Math.min(day, new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()));
  } else if (plan === PREMIUM_PLAN.YEARLY) {
    const month = date.getMonth(); date.setFullYear(date.getFullYear() + 1);
    if (date.getMonth() !== month) date.setDate(0);
  } else throw new PurchaseError(400, 'Invalid paid plan');
  return date;
}

async function grantPlan(user: any, plan: PREMIUM_PLAN_ENUM, session: ClientSession, now: Date, gift = false) {
  // Buying a shorter tier cannot replace an existing lifetime entitlement.
  if (user.premiumPlan !== PREMIUM_PLAN.LIFETIME || gift) {
    user.premiumValidUntil = nextPremiumExpiry(plan, gift ? null : user.premiumValidUntil, now);
    user.premiumPlan = plan;
    await user.save({ session });
  }
}

// Transactional status + both grants: concurrent callbacks cannot credit twice,
// and a recipient who becomes ineligible cannot silently lose their active plan.
export async function completePurchase(orderId: string, captureId: string) {
  // Preserve the verified payment even if eligibility changes before grants.
  // Admin can then correct the recipient and retry without another payment.
  await Order.updateOne({ orderId, status: ORDER_STATUS.PENDING }, { $set: { paymentVerifiedAt: new Date(), verifiedCaptureId: captureId } });
  const session = await mongoose.startSession();
  try {
    return await session.withTransaction(async () => {
      const order = await Order.findOne({ orderId }).session(session);
      if (!order) throw new PurchaseError(404, 'Order not found');
      if (order.status === ORDER_STATUS.COMPLETE) {
        if (order.buyOneGetOne && !order.giftActivatedAt) {
          // Only the legacy bank handler used this marker and never issued gifts.
          // Other missing audit records may be an intentionally revoked gift.
          if (order.paymentMethod !== PAYMENT_METHOD.SE_PAY || order.paypalCaptureId !== 'COMPLETED' || order.paymentVerifiedAt) {
            throw new PurchaseError(409, 'Gift activation audit is missing; admin review is required');
          }
          if (!order.recipientUserId || String(order.recipientUserId) === String(order.userId)) {
            throw new PurchaseError(409, 'Completed gift order needs admin review: payment or recipient details are missing');
          }
          const activatedAt = new Date(order.paymentVerifiedAt || order.updatedAt);
          const validUntil = nextPremiumExpiry(order.planType, null, activatedAt);
          if (!Number.isFinite(activatedAt.getTime()) || (validUntil && validUntil <= new Date())) {
            throw new PurchaseError(409, 'The original gift period has elapsed; admin review is required');
          }
          const recipient = await AuthorizedUser.findOne({ _id: order.recipientUserId, ...eligibleRecipientQuery() }).session(session);
          if (!recipient) throw new PurchaseError(409, 'Completed payment needs admin review: gift has no activation record and the recipient has an active plan');
          await grantPlan(recipient, order.planType, session, activatedAt, true);
          order.giftActivatedAt = activatedAt;
          order.giftValidUntil = validUntil;
          order.giftActivationSource = 'legacy-reconcile';
          await order.save({ session });
        }
        return order;
      }
      if (order.status !== ORDER_STATUS.PENDING) throw new PurchaseError(409, 'Order cannot be completed');
      const buyer = await AuthorizedUser.findById(order.userId).session(session);
      if (!buyer) throw new PurchaseError(404, 'Buyer not found');
      const now = new Date();
      if (order.buyOneGetOne) {
        const recipient = await AuthorizedUser.findOne({ _id: order.recipientUserId, ...eligibleRecipientQuery(now) }).session(session);
        if (!recipient) throw new PurchaseError(409, 'Payment needs admin review: the gift recipient is no longer eligible. Both grants remain pending.');
        await grantPlan(recipient, order.planType, session, now, true);
        order.giftActivatedAt = now;
        order.giftValidUntil = recipient.premiumValidUntil;
        order.giftActivationSource = 'checkout';
      }
      await grantPlan(buyer, order.planType, session, now);
      order.paypalCaptureId = captureId;
      order.status = ORDER_STATUS.COMPLETE;
      await order.save({ session });
      return order;
    });
  } finally { await session.endSession(); }
}
