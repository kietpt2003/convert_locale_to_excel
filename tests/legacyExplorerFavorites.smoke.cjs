const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { JSDOM } = require(path.resolve(process.argv[2] || '/private/tmp/redmine-scope-ui-check/node_modules/jsdom'));
const dom = new JSDOM(fs.readFileSync('src/public/admin-redmine.html', 'utf8'), { url: 'http://localhost/', runScripts: 'outside-only' });
const { window } = dom;
const pending = [];
const writes = [];
let serverFavorites = [2];
const response = data => ({ ok: true, status: 200, json: async () => data, clone() { return this; } });
window.fetch = async (url, options = {}) => {
  if (url === '/api/redmine/projects/favorites') {
    if (!options.method) return response({ projectIds: [...serverFavorites] });
    return new Promise((resolve, reject) => writes.push({ ...options, body: JSON.parse(options.body), resolve, reject }));
  }
  return new Promise((resolve, reject) => pending.push({ url: new URL(url, 'http://localhost'), ...options, resolve, reject }));
};
window.AbortController = AbortController;
window.debounce = fn => fn;
const source = fs.readFileSync('src/public/js/redmine.js', 'utf8').replace(/^import[\s\S]*?from\s+"[^"]+";\s*/gm, '').replace(/^export /gm, '');
vm.runInContext(source, dom.getInternalVMContext());
const document = window.document;
const checkbox = document.getElementById('chkFavoriteProjects');
const button = name => [...document.querySelectorAll('.project-favorite')].find(button => button.getAttribute('aria-label').includes(name));
const flush = () => new Promise(resolve => setImmediate(resolve));
const projects = [{ id: 1, name: 'Parent', tasks: [], subProjects: [{ id: 2, name: 'Child', tasks: [], subProjects: [] }] }];
async function complete(index, tree = projects) {
  pending[index].resolve(response(tree));
  await flush();
}
async function save(index) {
  const write = writes[index];
  serverFavorites = write.method === 'POST' ? [...new Set([...serverFavorites, ...write.body.projectIds])] : write.body.projectIds;
  write.resolve(response({ projectIds: [...serverFavorites] }));
  await flush();
}
(async () => {
  try {
    const initial = window.loadFullProjectTree();
    await flush();
    assert.equal(pending[0].url.searchParams.has('projectIds'), false);
    await complete(0);
    await initial;
    assert.equal(button('Child').getAttribute('aria-pressed'), 'true');
    assert.equal(button('Parent').getAttribute('aria-pressed'), 'false');
    button('Parent').click();
    await flush();
    assert.equal(writes[0].method, 'POST');
    assert.deepEqual(Array.from(writes[0].body.projectIds), [1]);
    assert.equal(checkbox.disabled, true);
    await save(0);
    assert.equal(button('Parent').getAttribute('aria-pressed'), 'true');
    assert.equal(button('Parent').closest('.project-node').classList.contains('open'), false);
    button('Child').click();
    await flush();
    writes[1].reject(new Error('save failed'));
    await flush();
    assert.equal(button('Child').getAttribute('aria-pressed'), 'true');
    assert.equal(document.getElementById('favoriteProjectsError').hidden, false);
    checkbox.click();
    await flush();
    assert.equal(pending[1].url.searchParams.get('projectIds'), '2,1');
    await complete(1);
    button('Parent').click();
    await flush();
    assert.equal(writes[2].method, 'PATCH');
    assert.deepEqual(Array.from(writes[2].body.projectIds), [2]);
    await save(2);
    assert.equal(pending[2].url.searchParams.get('projectIds'), '2');
    await complete(2, [projects[0].subProjects[0]]);
    assert.equal(button('Parent'), undefined);
    button('Child').click();
    await flush();
    await save(3);
    assert.equal(pending.length, 3);
    assert.ok(document.getElementById('projectTreeContainer').textContent.includes('No favorite projects yet'));
    checkbox.click();
    await flush();
    assert.equal(pending[3].url.searchParams.has('projectIds'), false);
    await complete(3);
    serverFavorites = [2];
    checkbox.click();
    await flush();
    checkbox.click();
    await flush();
    assert.equal(pending[4].signal.aborted, true);
    await complete(5, [{ id: 1, name: 'LATEST', tasks: [], subProjects: [] }]);
    await complete(4, [{ id: 2, name: 'STALE', tasks: [], subProjects: [] }]);
    assert.ok(document.getElementById('projectTreeContainer').textContent.includes('LATEST'));
    assert.ok(!document.getElementById('projectTreeContainer').textContent.includes('STALE'));
    console.log('PASS: legacy Explorer stars, nested favorites, save error, scoped requests, removal, empty state and stale response cancellation.');
  } finally { dom.window.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
