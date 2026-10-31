const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const webRoot = '/Users/kietpt2003/SOURCE/my-only-tool';
const req = createRequire(webRoot + '/package.json');
const { JSDOM } = require('/private/tmp/redmine-scope-ui-check/node_modules/jsdom');
const dom = new JSDOM('<div id="root"></div>', { url: 'https://example.test' });
global.window = dom.window;
global.document = dom.window.document;
Object.defineProperty(global, 'navigator', { configurable: true, value: dom.window.navigator });
global.IS_REACT_ACT_ENVIRONMENT = true;
const React = req('react');
const { createRoot } = req('react-dom/client');
const ts = req('typescript');
const pending = [];
const source = fs.readFileSync(path.join(webRoot, 'src/features/redmine/components/RedmineCalendarTab.tsx'), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText;
const mod = { exports: {} };
vm.runInNewContext(code, {
  exports: mod.exports, module: mod, window: dom.window, Date, console,
  require(name) {
    if (name === 'react') return React;
    if (name === '@/services/apiRedmine') return { apiRedmine: { getMonthlyStatus: (month, year) => new Promise(resolve => pending.push({ month, year, resolve })) } };
    throw new Error('Unexpected import: ' + name);
  },
});
const root = createRoot(document.getElementById('root'));
const fixture = (request, issueName = 'Full task title: ' + 'details '.repeat(40)) => ({
  [request.year + '-' + String(request.month).padStart(2, '0') + '-08']: {
    totalHours: 8, isFull: true, redmineUrl: 'https://redmine.example.test',
    logs: [
      { id: 'a', project: 'Long project name', issueId: '1234', issueName, comments: 'First line\nSecond line\n' + 'https://example.test/' + 'long-reference'.repeat(40), hours: 5 },
      { id: 'b', project: 'Second project', issueId: '5678', issueName: 'Second task', comments: '', hours: 3 },
    ],
  },
});
(async () => {
  try {
    await React.act(async () => root.render(React.createElement(mod.exports.default)));
    const initial = fixture(pending[0]);
    await React.act(async () => pending[0].resolve({ data: initial }));
    const card = document.querySelector('[data-calendar-log="a"]');
    const log = Object.values(initial)[0].logs[0];
    assert.ok(card.textContent.includes(log.issueName));
    assert.ok(!card.textContent.includes(log.comments));
    assert.ok(card.textContent.includes('5h'));
    assert.equal(card.querySelector('a').href, 'https://redmine.example.test/issues/1234');
    assert.ok(!document.querySelector('[data-calendar-log="b"]').textContent.includes('No comment'));
    assert.equal(document.querySelector('[role="tooltip"]'), null);
    await React.act(async () => card.dispatchEvent(new window.MouseEvent('mouseover', { bubbles: true })));
    assert.ok(document.querySelector('[role="tooltip"]').textContent.includes(log.issueName));
    assert.ok(document.querySelector('[role="tooltip"]').textContent.includes(log.comments));
    await React.act(async () => card.dispatchEvent(new window.MouseEvent('mouseout', { bubbles: true })));
    assert.equal(document.querySelector('[role="tooltip"]'), null);
    await React.act(async () => card.querySelector('a').focus());
    assert.ok(document.querySelector('[role="tooltip"]'));
    await React.act(async () => window.dispatchEvent(new window.Event('scroll')));
    assert.equal(document.querySelector('[role="tooltip"]'), null);
    const next = document.querySelector('button[aria-label="Next month"]');
    await React.act(async () => next.click());
    await React.act(async () => next.click());
    await React.act(async () => pending[2].resolve({ data: fixture(pending[2], 'LATEST_MONTH') }));
    await React.act(async () => pending[1].resolve({ data: {} }));
    assert.ok(document.body.textContent.includes('LATEST_MONTH'));
    console.log('PASS: task titles before hover, comments only in tooltip, multiple logs, task link, hover/focus/scroll and late month response.');
  } finally {
    await React.act(async () => root.unmount());
    dom.window.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
