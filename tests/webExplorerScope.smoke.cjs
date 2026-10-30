// Run with the web's PnP loader and a temporary jsdom installation; see docs.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const [webRoot, jsdomModule] = process.argv.slice(2);
if (!webRoot || !jsdomModule) throw new Error('Usage: node -r <web>/.pnp.cjs tests/webExplorerScope.smoke.cjs <web-root> <jsdom-module-path>');
const webRequire = createRequire(path.resolve(webRoot, 'package.json'));
const { JSDOM } = require(path.resolve(jsdomModule));
const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/' });
global.window = dom.window;
global.document = dom.window.document;
global.HTMLElement = dom.window.HTMLElement;
Object.defineProperty(global, 'navigator', { configurable: true, value: dom.window.navigator });
global.IS_REACT_ACT_ENVIRONMENT = true;
const React = webRequire('react');
const { createRoot } = webRequire('react-dom/client');
const ts = webRequire('typescript');
const pending = [];
const http = {
  interceptors: { request: { use() {} }, response: { use() {} } },
  get(url, options) {
    return new Promise((resolve, reject) => pending.push({ url, ...options, resolve, reject }));
  },
};
const errors = [];
const store = { redmineUserStore: { redmineUrl: 'http://redmine/' }, draftStore: { activities: [], loadActivities() {}, loadDraftsFromServer() {} } };
function compile(relativePath, imports) {
  const text = fs.readFileSync(path.join(webRoot, relativePath), 'utf8');
  const code = ts.transpileModule(text, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText;
  const mod = { exports: {} };
  vm.runInNewContext(code, {
    exports: mod.exports, module: mod,
    require(name) { if (name in imports) return imports[name]; throw new Error(`Unexpected import: ${name}`); },
    process: { env: { API_URL: 'http://fixture' } }, window: dom.window,
    localStorage: dom.window.localStorage, AbortController, Date,
    console: { ...console, error: (...args) => errors.push(args) },
  }, { filename: relativePath });
  return mod.exports;
}
const service = compile('src/services/apiRedmine.ts', {
  axios: { create: () => http }, '@/constants/premiumPlan': { PREMIUM_ERROR: {} }, '@/constants/redmine': { REDMINE_AUTHEN_ERROR: {} },
});
const Explorer = compile('src/features/redmine/components/RedmineExplorerTab.tsx', {
  react: React, '@/store': { useStore: () => store }, '@/services/apiRedmine': service,
}).default;
const container = document.getElementById('root');
let root = createRoot(container);
const recentCheckbox = () => [...container.querySelectorAll('label')].find(label => label.textContent.includes('Last 2 Months')).querySelector('input');
const syncButton = () => [...container.querySelectorAll('button')].find(button => button.textContent.includes('Sync Now'));
const inactiveCheckbox = () => [...container.querySelectorAll('label')].find(label => label.textContent.includes('Include Inactive Projects')).querySelector('input');
async function complete(index, name) {
  const task = id => ({ id, subject: `Task ${id}`, status: { id: 1, name: 'Open' }, tracker: { id: 1, name: 'Task' } });
  await React.act(async () => pending[index].resolve({ data: [{ id: 1, name,
    tasks: [{ ...task(1), subtasks: [task(2)] }],
    subProjects: [{ id: 2, name: 'Nested project', tasks: [task(3)], subProjects: [] }],
  }], status: 200 }));
  if (!pending[index].signal.aborted) {
    assert.ok(container.textContent.includes('3 tasks · 2 projects'));
    assert.ok(container.textContent.includes('3 Tasks'));
  }
}
(async () => {
  try {
    await React.act(async () => root.render(React.createElement(Explorer)));
    assert.equal(pending[0].params.recentOnly, true);
    assert.equal(pending[0].params.includeInactiveProjects, false);
    assert.equal(inactiveCheckbox().checked, false);
    await complete(0, 'RECENT_ONLY');
    await React.act(async () => recentCheckbox().click());
    assert.equal(pending[1].params.recentOnly, false);
    assert.equal(pending[1].params.fullReload, true);
    await React.act(async () => pending[1].reject(new Error('504 timeout')));
    assert.equal(recentCheckbox().checked, false);
    // Reopening after a failed all-date fetch must retain the selected scope,
    // and must never display the old recent-only list as an all-date response.
    await React.act(async () => root.unmount());
    root = createRoot(container);
    await React.act(async () => root.render(React.createElement(Explorer)));
    assert.equal(recentCheckbox().checked, false);
    assert.equal(pending[2].params.recentOnly, false);
    assert.ok(!container.textContent.includes('RECENT_ONLY'));
    await complete(2, 'FULL_SET');
    await React.act(async () => syncButton().click());
    assert.equal(pending[3].params.recentOnly, false);
    assert.equal(pending[3].params.fullReload, true);
    await complete(3, 'FULL_REFRESH');
    // Deliberately deliver an abandoned recent response after switching back.
    await React.act(async () => recentCheckbox().click());
    await React.act(async () => recentCheckbox().click());
    assert.equal(pending[4].signal.aborted, true);
    assert.equal(pending[5].params.recentOnly, false);
    assert.equal(pending[5].params.fullReload, true);
    await complete(4, 'RECENT_LATE');
    assert.ok(!container.textContent.includes('RECENT_LATE'));
    await complete(5, 'FULL_FINAL');
    assert.ok(container.textContent.includes('FULL_FINAL'));
    await React.act(async () => syncButton().click());
    assert.equal(pending[6].params.recentOnly, false);
    assert.equal(pending[6].params.fullReload, true);
    await complete(6, 'FULL_AFTER_SYNC');
    assert.equal(recentCheckbox().checked, false);
    await React.act(async () => inactiveCheckbox().click());
    assert.equal(pending[7].params.includeInactiveProjects, true);
    assert.equal(pending[7].params.recentOnly, false);
    await complete(7, 'INCLUDING_CLOSED_PROJECTS');
    await React.act(async () => syncButton().click());
    assert.equal(pending[8].params.includeInactiveProjects, true);
    assert.equal(pending[8].params.fullReload, true);
    await complete(8, 'INCLUDING_CLOSED_AFTER_SYNC');
    await React.act(async () => recentCheckbox().click());
    assert.equal(pending[9].params.recentOnly, true);
    assert.equal(pending[9].params.includeInactiveProjects, true);
    await complete(9, 'RECENT_WITH_CLOSED');
    await React.act(async () => inactiveCheckbox().click());
    assert.equal(pending[10].params.includeInactiveProjects, false);
    assert.equal(pending[10].params.recentOnly, true);
    await complete(10, 'RECENT_ACTIVE_ONLY');
    assert.equal(errors.length, 1);
    console.log('PASS: real React DOM + actual API service: default recent, disable, 504, remount, Sync all, rapid toggles, stale response rejected.');
  } finally {
    await React.act(async () => root.unmount());
    dom.window.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
