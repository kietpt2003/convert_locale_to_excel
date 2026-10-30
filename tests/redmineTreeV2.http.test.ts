import assert from 'node:assert/strict';
import { getEventListeners, getMaxListeners } from 'node:events';
import { createServer } from 'node:http';
import test from 'node:test';
import axios from 'axios';
import { buildProjectTaskTree, createRequestPool, createTreeAbortController, fetchCollection, treeIssueParams, type TreeFilters } from '../src/utils/redmineTreeV2.js';
import { synchronizeTasks, type SyncSource } from '../src/utils/redmineTaskSync.js';

test('16 concurrent Axios requests clean up abort listeners on success, failure and cancellation', async () => {
  const warnings: Error[] = [];
  const collectWarning = (warning: Error) => { warnings.push(warning); };
  process.on('warning', collectWarning);
  const server = createServer((req, res) => {
    const url = new URL(req.url!, 'http://localhost');
    const offset = Number(url.searchParams.get('offset'));
    const limit = Number(url.searchParams.get('limit'));
    setTimeout(() => {
      if (url.pathname === '/failure' && offset > 0) {
        res.writeHead(503).end();
        return;
      }
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ issues: Array.from({ length: limit }, (_, i) => ({ id: offset + i })), total_count: 1700, limit }));
    }, offset === 0 ? 1 : 40);
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}`;
  try {
    const success = createTreeAbortController(16);
    assert.equal(getMaxListeners(success.signal), 16);
    assert.equal(getMaxListeners(new AbortController().signal), 10);
    const tasks = await fetchCollection(`${base}/success`, 'test', {}, 'issues', createRequestPool(16), 16, success.signal);
    assert.equal(tasks.length, 1700);
    assert.equal(getEventListeners(success.signal, 'abort').length, 0);

    const failure = createTreeAbortController(16);
    try {
      await assert.rejects(fetchCollection(`${base}/failure`, 'test', {}, 'issues', createRequestPool(16), 16, failure.signal));
    } finally { failure.abort(); }

    const cancelled = createTreeAbortController(16);
    const pending = fetchCollection(`${base}/cancel`, 'test', {}, 'issues', createRequestPool(16), 16, cancelled.signal);
    const timer = setInterval(() => {
      if (getEventListeners(cancelled.signal, 'abort').length === 16) cancelled.abort();
    }, 1);
    try { await assert.rejects(pending, { code: 'ERR_CANCELED' }); }
    finally { clearInterval(timer); cancelled.abort(); }
    await new Promise(resolve => setTimeout(resolve, 50));
    assert.equal(getEventListeners(failure.signal, 'abort').length, 0);
    assert.equal(getEventListeners(cancelled.signal, 'abort').length, 0);
    assert.equal(warnings.filter(warning => warning.name === 'MaxListenersExceededWarning').length, 0);
  } finally {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
    process.off('warning', collectWarning);
  }
});

test('recent HTTP reload includes a new unassigned task; toggling off restores older tasks and parent context', async () => {
  const now = Date.parse('2026-10-30T10:00:00Z');
  const filters: TreeFilters = { onlyShowMyTasks: false, compact: true, taskDate: '', taskName: '', projectName: '', createdSince: '2026-08-31' };
  const items: any[] = [{ id: 1, subject: 'Older parent', project: { id: 1 }, created_on: '2026-08-30T10:00:00Z', updated_on: '2026-10-28T10:00:00Z' }];
  const requests: Array<{ since: string | null; assignee: string | null }> = [];
  const server = createServer((request, response) => {
    const url = new URL(request.url!, 'http://localhost');
    response.setHeader('Content-Type', 'application/json');
    response.setHeader('Date', new Date(now).toUTCString());
    const limit = Number(url.searchParams.get('limit'));
    if (url.pathname === '/projects.json') {
      response.end(JSON.stringify({ projects: [{ id: 1, name: 'Visible project' }], total_count: 1, limit }));
      return;
    }
    const since = url.searchParams.get('updated_on')?.replace(/^>=/, '') || null;
    const createdSince = url.searchParams.get('created_on')?.replace(/^>=/, '') || null;
    requests.push({ since, assignee: url.searchParams.get('assigned_to_id') });
    const issues = items.filter(item => (!since || item.updated_on >= since) && (!createdSince || item.created_on >= createdSince)).sort((a, b) => b.id - a.id);
    response.end(JSON.stringify({ issues: issues.slice(0, limit), total_count: issues.length, limit }));
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}`;
  const pool = createRequestPool(1);
  let date: string | undefined;
  const source: SyncSource = {
    projects: async () => ({
      items: await fetchCollection(`${base}/projects.json`, 'test-key', {}, 'projects', pool, 1, undefined, value => { date = value; }),
      serverDate: date,
    }),
    tasks: (projects, since) => fetchCollection(`${base}/issues.json`, 'test-key', treeIssueParams(filters, projects, since), 'issues', pool, 1),
    count: async projects => (await axios.get(`${base}/issues.json`, { params: { ...treeIssueParams(filters, projects), limit: 1 } })).data.total_count,
  };
  try {
    const first = await synchronizeTasks(undefined, source, false, now);
    assert.equal(first.mode, 'FULL');
    assert.equal(first.snapshot.tasks.length, 0);
    items.push({ id: 2, subject: 'Other author, unassigned', author: { id: 99 }, project: { id: 1 }, parent: { id: 1 }, created_on: '2026-10-30T10:00:00Z', updated_on: '2026-10-30T10:00:00Z' });
    const second = await synchronizeTasks(first.snapshot, source, false, now + 1000);
    assert.equal(second.mode, 'DELTA');
    assert.equal(second.snapshot.tasks[0].id, 2);
    assert.equal(second.snapshot.tasks[0].author.id, 99);
    assert.equal(second.snapshot.tasks[0].assigned_to, undefined);
    assert.ok(requests.some(request => request.since === '2026-10-29'));
    assert.ok(requests.every(request => request.assignee === null));
    assert.equal(buildProjectTaskTree(second.snapshot.projects, second.snapshot.tasks, filters)[0].tasks[0].id, 2);
    filters.createdSince = undefined;
    const all = await synchronizeTasks(undefined, source, false, now + 2000);
    assert.equal(all.snapshot.tasks.length, 2);
    const allTree = buildProjectTaskTree(all.snapshot.projects, all.snapshot.tasks, filters);
    assert.equal(allTree[0].tasks[0].id, 1);
    assert.equal(allTree[0].tasks[0].subtasks[0].id, 2);
    filters.createdSince = '2026-08-31';
    const recentAgain = await synchronizeTasks(second.snapshot, source, false, now + 3000);
    assert.equal(recentAgain.mode, 'DELTA');
    assert.deepEqual(recentAgain.snapshot.tasks.map(task => task.id), [2]);
  } finally {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});
