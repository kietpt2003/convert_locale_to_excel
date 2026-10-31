const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const webRoot = '/Users/kietpt2003/SOURCE/my-only-tool';
const req = createRequire(webRoot + '/package.json');
const { JSDOM } = require('/private/tmp/redmine-scope-ui-check/node_modules/jsdom');
const dom = new JSDOM('<div id="root"></div>', { url: 'https://example.test' });
global.window = dom.window; global.document = dom.window.document;
Object.defineProperty(global, 'navigator', { configurable: true, value: dom.window.navigator });
global.IS_REACT_ACT_ENVIRONMENT = true;
window.confirm = () => true;
const React = req('react'); const { createRoot } = req('react-dom/client'); const ts = req('typescript');
let target = { email: 'gift-admin@example.test', role: 'admin', premiumPlan: 'NONE', premiumValidUntil: null };
let paid = false, deferUsers = false;
const pending = [];
const users = () => [{ email: 'owner@example.test', role: 'super_admin', isSuperAdmin: true, premiumPlan: 'DAILY' }, { ...target }];
const store = { authStore: { user: { email: 'owner@example.test' } }, languagesStore: { languages: [], isLoading: false, fetchLanguages() {}, addLanguage() {}, deleteLanguage() {} } };
const apiAdmin = { getUsers: async () => deferUsers ? new Promise(resolve => pending.push(resolve)) : ({ data: users() }) };
const apiPremiumPlan = {
 getPendingCashOrders: async () => ({ data: paid ? [] : [{ orderId: 'CASH_FIXTURE', userEmail: 'buyer@example.test', planType: 'DAILY', amount: 7000, buyOneGetOne: true, recipientEmail: target.email }] }),
 confirmCashOrder: async () => { paid = true; target = { ...target, premiumPlan: 'DAILY', premiumValidUntil: '2026-11-01T05:29:28.384Z' }; return { success: true }; },
};
function compile(file, imports) {
 const code = ts.transpileModule(fs.readFileSync(webRoot + '/src/' + file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText;
 const mod = { exports: {} };
 vm.runInNewContext(code, { exports: mod.exports, module: mod, window, document, console, alert() {},
  require(name) { if (name in imports) return imports[name]; throw new Error('Unexpected import ' + name); },
 }); return mod.exports;
}
const cash = compile('components/PendingCashOrders.tsx', { react: React, './GiftRecipientPicker': { __esModule: true, default: () => null }, '@/services/apiPremiumPlan': { apiPremiumPlan } });
const admin = compile('features/tools/components/AdminTab.tsx', { react: React, 'mobx-react-lite': { observer: value => value }, '@/store': { useStore: () => store }, '@/services/apiAdmin': { apiAdmin }, '@/constants/user': { USER_ROLE: { SUPER_ADMIN: 'super_admin', ADMIN: 'admin', USER: 'user' } }, '@/constants/premiumPlan': { PREMIUM_PLAN: { NONE: 'NONE', TRIAL: 'TRIAL', DAILY: 'DAILY', MONTHLY: 'MONTHLY', YEARLY: 'YEARLY', LIFETIME: 'LIFETIME' } }, '@/components/PendingCashOrders': cash }).default;
const root = createRoot(document.getElementById('root'));
const row = () => [...document.querySelectorAll('tr')].find(row => row.textContent.includes(target.email));
(async () => {
 try {
  await React.act(async () => root.render(React.createElement(admin)));
  assert.equal(row().cells[2].textContent, 'NONE'); assert.equal(row().cells[3].textContent, '—');
  await React.act(async () => [...document.querySelectorAll('button')].find(button => button.textContent.includes('Confirm cash received')).click());
  assert.ok(row().cells[2].textContent.includes('DAILY'));
  assert.ok(row().cells[3].textContent.includes('01/11/2026'));
  assert.ok(row().cells[1].textContent.includes('admin'));
  target.premiumPlan = 'MONTHLY';
  await React.act(async () => window.dispatchEvent(new window.Event('focus')));
  assert.ok(row().cells[2].textContent.includes('MONTHLY'));
  target.premiumPlan = 'YEARLY';
  await React.act(async () => document.querySelector('[aria-label="Refresh users"]').click());
  assert.ok(row().cells[2].textContent.includes('YEARLY'));
  deferUsers = true;
  await React.act(async () => document.querySelector('[aria-label="Refresh users"]').click());
  await React.act(async () => window.dispatchEvent(new window.Event('focus')));
  target.premiumPlan = 'LIFETIME'; target.premiumValidUntil = null;
  await React.act(async () => pending[1]({ data: users() }));
  target.premiumPlan = 'NONE';
  await React.act(async () => pending[0]({ data: users() }));
  assert.ok(row().cells[2].textContent.includes('LIFETIME'));
  assert.ok(row().cells[3].textContent.includes('Permanent'));
  console.log('PASS: admin recipient plan/expiry refresh after cash approval, window focus, manual refresh and stale-response protection.');
 } finally { await React.act(async () => root.unmount()); dom.window.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
