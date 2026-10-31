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
const favoriteWrites = [];
let serverFavorites = [];
const http = {
  interceptors: { request: { use() {} }, response: { use() {} } },
  post(url, body) { return new Promise((resolve, reject) => favoriteWrites.push({ url, body, method: 'POST', resolve, reject })); },
  patch(url, body) { return new Promise((resolve, reject) => favoriteWrites.push({ url, body, method: 'PATCH', resolve, reject })); },
  get(url, options) {
    if (url === '/projects/favorites') return Promise.resolve({ data: { projectIds: [...serverFavorites] } });
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
const favoriteCheckbox = () => [...container.querySelectorAll('label')].find(label => label.textContent.includes('Only Favorite Projects')).querySelector('input');
const star = name => [...container.querySelectorAll('button')].find(button => button.getAttribute('aria-label')?.includes(name));
async function saveFavorite(index) {
  const write = favoriteWrites[index];
  serverFavorites = write.method === 'POST' ? [...new Set([...serverFavorites, ...write.body.projectIds])] : write.body.projectIds;
  await React.act(async () => write.resolve({ data: { projectIds: [...serverFavorites] } }));
}
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
    assert.equal(favoriteCheckbox().checked, false);
    assert.equal(pending[10].params.projectIds, undefined);
    // A star saves without expanding the project or reloading all tasks.
    await React.act(async () => star('RECENT_ACTIVE_ONLY').click());
    assert.deepEqual(Array.from(favoriteWrites[0].body.projectIds), [1]);
    assert.equal(favoriteWrites[0].method, 'POST');
    assert.equal(star('RECENT_ACTIVE_ONLY').disabled, true);
    assert.equal(favoriteCheckbox().disabled, true);
    await saveFavorite(0);
    assert.equal(star('RECENT_ACTIVE_ONLY').getAttribute('aria-pressed'), 'true');
    assert.ok(!container.textContent.includes('Nested project'));
    assert.equal(pending.length, 11);
    // Failed writes keep the last confirmed star and expose a retryable error.
    await React.act(async () => star('RECENT_ACTIVE_ONLY').click());
    await React.act(async () => favoriteWrites[1].reject(new Error('save failed')));
    assert.equal(star('RECENT_ACTIVE_ONLY').getAttribute('aria-pressed'), 'true');
    assert.ok(container.textContent.includes('Unable to save favorite'));
    // Add the nested project directly from the existing tree.
    await React.act(async () => star('RECENT_ACTIVE_ONLY').parentElement.parentElement.click());
    await React.act(async () => star('Nested project').click());
    assert.deepEqual(Array.from(favoriteWrites[2].body.projectIds), [2]);
    await saveFavorite(2);
    await React.act(async () => favoriteCheckbox().click());
    assert.equal(pending[11].params.projectIds, '1,2');
    assert.equal(pending[11].params.includeInactiveProjects, false);
    assert.equal(pending[11].params.recentOnly, true);
    await complete(11, 'FAVORITE_PARENT');
    // Removing a favorite in filtered mode fetches only the remaining IDs.
    await React.act(async () => star('FAVORITE_PARENT').click());
    assert.equal(favoriteWrites[3].method, 'PATCH');
    assert.deepEqual(Array.from(favoriteWrites[3].body.projectIds), [2]);
    await saveFavorite(3);
    assert.equal(pending[12].params.projectIds, '2');
    await React.act(async () => pending[12].resolve({ data: [{ id: 2, name: 'Nested favorite', tasks: [], subProjects: [] }] }));
    assert.ok(!container.textContent.includes('FAVORITE_PARENT'));
    await React.act(async () => star('Nested favorite').click());
    await saveFavorite(4);
    assert.equal(pending.length, 13); // No task scan for an empty favorite list.
    assert.ok(container.textContent.includes('No favorite projects yet'));
    await React.act(async () => root.unmount());
    root = createRoot(container);
    await React.act(async () => root.render(React.createElement(Explorer)));
    assert.equal(favoriteCheckbox().checked, false);
    assert.equal(pending[13].params.projectIds, undefined);
    await complete(13, 'ALL_PROJECTS_RESTORED');
    // Each opening uses the account's favorites as the default, before the task query.
    serverFavorites = [1];
    await React.act(async () => root.unmount());
    root = createRoot(container);
    await React.act(async () => root.render(React.createElement(Explorer)));
    assert.equal(favoriteCheckbox().checked, true);
    assert.equal(pending[14].params.projectIds, '1');
    await complete(14, 'DEFAULT_FAVORITES');
    await React.act(async () => favoriteCheckbox().click());
    assert.equal(favoriteCheckbox().checked, false);
    assert.equal(pending[15].params.projectIds, undefined);
    await complete(15, 'MANUALLY_ALL_PROJECTS');
    await React.act(async () => syncButton().click());
    assert.equal(favoriteCheckbox().checked, false);
    assert.equal(pending[16].params.projectIds, undefined);
    await complete(16, 'SYNC_KEEPS_MANUAL_SELECTION');
    console.log('PASS: real React DOM + actual API service: default recent, disable, 504, remount, Sync all, rapid toggles, stale response rejected; favorite stars, save failure, nested selection, scoped filtering/removal, empty favorites and remount.');
  } finally {
    await React.act(async () => root.unmount());
    dom.window.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
