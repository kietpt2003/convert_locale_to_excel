import { PREMIUM_PLAN_ENUM } from './premiumPlan.js';

export const SUBSCRIPTION_PLANS = {
  DAILY: { name: 'Daily Pass', subName: '24-hour full access', vndPrice: 5000, usdPrice: 4.99, bogoVndPrice: 7000, bogoUsdPrice: 5 },
  MONTHLY: { name: 'Monthly', subName: 'Best for starter', vndPrice: 50000, usdPrice: 5.55, bogoVndPrice: 55000, bogoUsdPrice: 5.6, badge: 'POPULAR' },
  YEARLY: { name: 'Yearly Saver', subName: '1 year full access', vndPrice: 150000, usdPrice: 7.25, bogoVndPrice: 155000, bogoUsdPrice: 7.3, badge: 'BEST VALUE' },
  LIFETIME: { name: 'Lifetime VIP', subName: 'Pay once, own forever', vndPrice: 200000, usdPrice: 9.99, bogoVndPrice: 200000, bogoUsdPrice: 9.99, badge: 'ULTIMATE' },
} as const;

export function getSubscriptionCatalog() {
  const enabled = new Set((process.env.BOGO_ENABLED_PLANS ?? 'DAILY,MONTHLY,YEARLY,LIFETIME').split(',').map(value => value.trim()));
  return Object.entries(SUBSCRIPTION_PLANS).map(([id, plan]) => ({ id: id as PREMIUM_PLAN_ENUM, ...plan, bogoEnabled: enabled.has(id) }));
}
