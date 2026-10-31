const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const rootPath = '/Users/kietpt2003/SOURCE/my-only-tool';
const req = createRequire(rootPath + '/package.json');
const { JSDOM } = require('/private/tmp/redmine-scope-ui-check/node_modules/jsdom');
const dom = new JSDOM('<div id="root"></div>', { url: 'https://example.test' });
global.window = dom.window;
global.document = dom.window.document;
Object.defineProperty(global, 'navigator', { configurable: true, value: dom.window.navigator });
global.IS_REACT_ACT_ENVIRONMENT = true;
const React = req('react');
const { createRoot } = req('react-dom/client');
const ts = req('typescript');
const submitted = [];
const noop = () => {};
const store = { draftStore: {
  addDraft: payload => submitted.push(payload), loadDraftsFromServer: noop, deleteDraft: noop,
  filteredDrafts: [], searchDraftQuery: '', setSearchDraftQuery: noop, trackers: [], trackerMap: {},
  loadQuickDraftTrackers: noop, activities: [{ id: '1', name: 'Development' }], activityMap: {}, loadActivities: noop,
}, redmineUserStore: { setShowLoginModal: noop } };
function compile(name, extra = {}) {
  const file = `${rootPath}/src/features/redmine/components/${name}.tsx`;
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText;
  const mod = { exports: {} };
  const imports = { react: React, 'mobx-react-lite': { observer: value => value }, '@/store': { useStore: () => store }, './DraftItem': { default: () => null, __esModule: true }, ...extra };
  vm.runInNewContext(code, { exports: mod.exports, module: mod, document, Date, Node: window.Node, console,
    require(name) { if (name in imports) return imports[name]; throw new Error('Unexpected import: ' + name); },
  });
  return mod.exports;
}
const picker = compile('QuickDraftDatePicker');
const QuickDrafts = compile('QuickDrafts', { './QuickDraftDatePicker': picker }).default;
const root = createRoot(document.getElementById('root'));
async function change(input, value) {
  await React.act(async () => {
    const proto = input.tagName === 'SELECT' ? window.HTMLSelectElement.prototype : window.HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(input, value);
    input.dispatchEvent(new window.Event(input.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
  });
}
const dateTrigger = () => document.querySelector('[aria-label="Draft date"]');
const dateButton = date => document.querySelector(`button[aria-label="${date}"]`);
const toggle = () => document.querySelector('input[type="checkbox"]');
async function openOctober() {
  await React.act(async () => dateTrigger().click());
  await change(document.querySelector('[aria-label="Draft calendar month"]'), '2026-10');
}
async function submit(hours) {
  await change(document.querySelector('input[type="text"]'), 'Example draft');
  await change(document.querySelector('input[type="number"]'), hours);
  await change(document.querySelectorAll('select')[1], '1');
  await React.act(async () => document.querySelector('form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true })));
}
(async () => {
 try {
  await React.act(async () => root.render(React.createElement(QuickDrafts)));
  assert.equal(toggle().checked, false);
  assert.equal(picker.isWeekendDate(picker.defaultDraftDate()), false);
  await openOctober();
  assert.equal(dateButton('2026-10-31').disabled, true);
  assert.equal(dateButton('2026-10-25').disabled, true);
  assert.equal(dateButton('2026-10-30').disabled, false);
  await React.act(async () => dateButton('2026-10-30').click());
  for (const hours of ['0.05', '0.15', '0.25', '0.5', '1', '1.5']) {
   const before = submitted.length;
   await submit(hours);
   assert.equal(submitted.length, before + 1);
   assert.equal(submitted.at(-1).hours, Number(hours));
   assert.equal(submitted.at(-1).spentOn, '2026-10-30');
  }
  for (const hours of ['0', '-1', '0.01', '0.333', '0.07']) {
   const before = submitted.length;
   await submit(hours);
   assert.equal(submitted.length, before);
   assert.ok(document.querySelector('[role="alert"]'));
  }
  await React.act(async () => toggle().click());
  await openOctober();
  assert.equal(dateButton('2026-10-31').disabled, false);
  await React.act(async () => dateButton('2026-10-31').click());
  await submit('1');
  assert.equal(submitted.at(-1).spentOn, '2026-10-31');
  await React.act(async () => toggle().click());
  assert.ok(dateTrigger().textContent.includes('Choose date'));
  const before = submitted.length;
  await submit('1');
  assert.equal(submitted.length, before);
  await openOctober();
  assert.equal(dateButton('2026-10-31').disabled, true);
  await React.act(async () => document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  assert.equal(document.querySelector('[role="dialog"]'), null);
  console.log('PASS: default weekdays, disabled Saturday/Sunday, allow toggle, clear disallowed date, 3-minute increments including 1h, invalid-hour rejection, payload dates and Escape.');
 } finally { await React.act(async () => root.unmount()); dom.window.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
