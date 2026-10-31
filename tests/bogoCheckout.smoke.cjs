const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const webRoot = '/Users/kietpt2003/SOURCE/my-only-tool';
const req = createRequire(webRoot + '/package.json');
const { JSDOM } = require('/private/tmp/redmine-scope-ui-check/node_modules/jsdom');
const dom = new JSDOM('<div id="root"></div>', { url: 'https://example.test/' });
global.window = dom.window; global.document = dom.window.document; global.HTMLElement = dom.window.HTMLElement;
Object.defineProperty(global, 'navigator', { configurable: true, value: dom.window.navigator });
global.IS_REACT_ACT_ENVIRONMENT = true;
const React = req('react'); const { createRoot } = req('react-dom/client'); const ts = req('typescript');
const plans = [
 ['DAILY', 'Daily Pass', 5000, 4.99, 7000, 5], ['MONTHLY', 'Monthly', 50000, 5.55, 55000, 5.6],
 ['YEARLY', 'Yearly Saver', 150000, 7.25, 155000, 7.3], ['LIFETIME', 'Lifetime VIP', 200000, 9.99, 200000, 9.99],
].map(([id, name, vndPrice, usdPrice, bogoVndPrice, bogoUsdPrice]) => ({ id, name, subName: 'Access', vndPrice, usdPrice, bogoVndPrice, bogoUsdPrice, bogoEnabled: true }));
const writes = [], searches = [], deferredSearches = [], intervals = new Set(); let paypalProps;
const http = {
 async get(url, options = {}) {
  if (url === '/api/orders/plans') return { data: { success: true, data: plans } };
  if (url === '/api/orders/gift-recipients') {
   searches.push(options);
   if (options.params.search === 'slow') return new Promise(resolve => deferredSearches.push({ ...options, resolve }));
   return { data: { success: true, data: [{ id: 'friend', email: 'friend@example.test' }], pagination: { hasNextPage: false, totalItems: 1, currentPage: 1 } } };
  }
  if (url.startsWith('/api/orders/status/')) return { data: { success: true, status: 'PENDING' } };
  throw new Error('Unexpected GET: ' + url);
 },
 async post(url, body) {
  writes.push({ url, body });
  if (url === '/api/orders/paypal') return { data: { id: 'PAYPAL_ORDER' } };
  if (url.endsWith('/capture')) throw { response: { data: { message: 'Fixture capture pending' } } };
  return { data: { success: true, orderCode: 'MYONLYTOOL_TEST', planType: body.planType, amount: body.buyOneGetOne ? plans.find(p => p.id === body.planType).bogoVndPrice : plans.find(p => p.id === body.planType).vndPrice, currency: 'VND', buyOneGetOne: body.buyOneGetOne, recipientEmail: body.recipientUserId ? 'friend@example.test' : undefined, memo: 'Invoice memo', qrUrl: url.includes('se-pay') ? 'https://example.test/qr.png' : undefined } };
 },
};
function compile(relative, imports) {
 const source = fs.readFileSync(webRoot + '/src/' + relative, 'utf8');
 const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText;
 const mod = { exports: {} };
 vm.runInNewContext(code, { exports: mod.exports, module: mod, window, document, sessionStorage: window.sessionStorage, Event: window.Event, AbortController, console,
  setTimeout, clearTimeout, setInterval: (...args) => { const id = setInterval(...args); intervals.add(id); return id; }, clearInterval: id => { clearInterval(id); intervals.delete(id); },
  require(name) { if (name in imports) return imports[name]; throw new Error('Unexpected import: ' + name); },
 }); return mod.exports;
}
const service = compile('services/apiPremiumPlan.ts', { './axiosClient': http, '@/constants/premiumPlan': { PREMIUM_PLAN: { TRIAL: 'TRIAL' } } });
const store = { authStore: { user: { id: 'buyer', email: 'buyer@example.test', premiumPlan: 'NONE', hasUsedTrial: true }, isSubmittingPayment: false, handleActivateTrial() {}, checkAndSetToken() {} } };
const shell = compile('components/SubscriptionDialog.tsx', { react: React });
const picker = compile('components/GiftRecipientPicker.tsx', { react: React, '@/services/apiPremiumPlan': service });
const modal = compile('components/PremiumSubscriptionModal.tsx', { react: React, '@paypal/react-paypal-js': { PayPalButtons: props => { paypalProps = props; return React.createElement('button', { disabled: props.disabled, 'data-paypal': true }, 'PayPal Checkout'); } }, '@/constants/premiumPlan': { PREMIUM_PLAN: { NONE: 'NONE' } }, '@/store': { useStore: () => store }, '@/services/apiPremiumPlan': service, './GiftRecipientPicker': picker, './SubscriptionDialog': shell }).default;
const promotion = compile('components/BuyOneGetOnePromotion.tsx', { react: React, 'mobx-react-lite': { observer: c => c }, '@/store': { useStore: () => store }, '@/services/apiPremiumPlan': service, './SubscriptionDialog': shell }).default;
const root = createRoot(document.getElementById('root'));
const button = text => [...document.querySelectorAll('button')].find(button => button.textContent.includes(text));
const toggle = () => document.querySelector('input[type="checkbox"]');
const waitForSearch = () => React.act(async () => { await new Promise(resolve => setTimeout(resolve, 290)); });
async function render(placement) {
 await React.act(async () => root.render(React.createElement(React.Fragment, null, React.createElement(promotion, { placement }), React.createElement(modal))));
}
(async () => {
 try {
  await render('home');
  assert.equal(document.querySelector('[role="dialog"]').getAttribute('aria-label'), 'Buy 1 Get 1');
  assert.ok(document.body.textContent.includes('55.000'));
  await React.act(async () => button('Choose a Buy 1 Get 1 plan').click());
  assert.equal(document.querySelectorAll('[role="dialog"]').length, 1);
  assert.equal(toggle().checked, true);
  assert.equal(button('Tạo mã QR').disabled, true);
  await waitForSearch();
  const searchInput = document.querySelector('input[type="search"]');
  const search = async value => React.act(async () => {
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(searchInput, value);
    searchInput.dispatchEvent(new window.Event('input', { bubbles: true }));
  });
  await search('slow'); await waitForSearch();
  await search('friend@'); await waitForSearch();
  assert.equal(deferredSearches[0].signal.aborted, true);
  await React.act(async () => deferredSearches[0].resolve({ data: { success: true, data: [{ id: 'old', email: 'stale@example.test' }], pagination: { hasNextPage: false } } }));
  assert.ok(!document.body.textContent.includes('stale@example.test'));
  assert.equal(searches.at(-1).params.search, 'friend@');
  await React.act(async () => button('friend@example.test').click());
  await React.act(async () => button('Tạo mã QR').click());
  assert.equal(writes[0].url, '/api/orders/se-pay');
  assert.equal(writes[0].body.recipientUserId, 'friend');
  assert.equal(writes[0].body.buyOneGetOne, true);
  assert.equal(writes[0].body.amount, undefined); // Server owns the price.
  assert.ok(document.body.textContent.includes('55.000'));
  assert.ok(document.body.textContent.includes('Gift recipient: friend@example.test'));
  await React.act(async () => button('Choose another option').click());
  await React.act(async () => button('Tiền mặt').click());
  await React.act(async () => button('Daily Pass').click());
  await React.act(async () => button('Create cash invoice').click());
  assert.equal(writes[1].url, '/api/orders/cash'); assert.equal(writes[1].body.planType, 'DAILY');
  assert.ok(document.body.textContent.includes('7.000'));
  assert.ok(document.body.textContent.includes('Both plans activate after admin confirms'));
  await React.act(async () => button('Choose another option').click());
  await React.act(async () => button('Thẻ quốc tế').click());
  const expected = [['Daily Pass', 5], ['Monthly', 5.6], ['Yearly Saver', 7.3], ['Lifetime VIP', 9.99]];
  for (const [name, price] of expected) {
   await React.act(async () => button(name).click());
   assert.ok(document.body.textContent.includes('$' + price.toFixed(2)));
   assert.equal(paypalProps.disabled, false);
  }
  await React.act(async () => paypalProps.createOrder());
  assert.equal(writes[2].url, '/api/orders/paypal');
  assert.equal(writes[2].body.planType, 'LIFETIME'); assert.equal(writes[2].body.recipientUserId, 'friend');
  await React.act(async () => paypalProps.onApprove({ orderID: 'PAYPAL_ORDER' }));
  assert.equal(writes[3].url, '/api/orders/paypal/PAYPAL_ORDER/capture');
  assert.ok(document.body.textContent.includes('Fixture capture pending'));
  await React.act(async () => toggle().click());
  assert.equal(toggle().checked, false);
  assert.ok(!document.body.textContent.includes('Gift: friend@example.test'));
  await React.act(async () => document.querySelector('[aria-label="Close dialog"]').click());
  await render('redmine');
  assert.equal(document.querySelector('[role="dialog"]').getAttribute('aria-label'), 'Buy 1 Get 1');
  await React.act(async () => document.querySelector('[aria-label="Close dialog"]').click());
  await render('home');
  assert.equal(document.querySelector('[role="dialog"]'), null); // Once per page/session.
  console.log('PASS: Home/Redmine promo, BOGO defaults, recipient required/search, all card prices, server-owned quote, bank/cash selection, PayPal create/capture, save error, manual opt-out and session dismissal.');
 } finally { await React.act(async () => root.unmount()); intervals.forEach(clearInterval); dom.window.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
