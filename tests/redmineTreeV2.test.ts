import assert from 'node:assert/strict';
import test from 'node:test';
import axios from 'axios';
import { buildProjectTaskTree, createRequestPool, fetchCollection, loadTreeOnce, treeCacheKey, treeIssueParams, type TreeFilters } from '../src/utils/redmineTreeV2.js';

const filters: TreeFilters = { onlyShowMyTasks: false, projectName: '', taskName: '', taskDate: '', compact: false };
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

test('all-time queries have no date or project restriction, including closed/unlisted issue projects', () => {
  const params = treeIssueParams(filters, [{ id: 1 }, { id: 2 }], '2026-10-30');
  assert.deepEqual(params, { status_id: '*', sort: 'id:desc' });
  const mine = treeIssueParams({ ...filters, onlyShowMyTasks: true }, [{ id: 1 }]);
  assert.equal(mine.assigned_to_id, 'me');
  const dated = treeIssueParams({ ...filters, taskDate: '2026-10-30' }, [{ id: 1 }]);
  assert.equal(dated.created_on, '2026-10-30');
});

test('pagination reuses first page, respects upstream limit and keeps pool busy', async () => {
  const original = axios.get;
  let active = 0;
  let maximum = 0;
  const offsets: number[] = [];
  const items = Array.from({ length: 263 }, (_, id) => ({ id }));
  axios.get = (async (_url: string, config: any) => {
    active++;
    maximum = Math.max(maximum, active);
    const offset = config.params.offset;
    offsets.push(offset);
    await wait(offset === 25 ? 25 : 2);
    active--;
    return { data: { issues: items.slice(offset, offset + 25), limit: 25, total_count: items.length } };
  }) as any;
  try {
    const result = await fetchCollection('mock', 'key', {}, 'issues', createRequestPool(3), 3);
    assert.deepEqual(result, items);
    assert.equal(maximum, 3);
    assert.deepEqual([...offsets].sort((a, b) => a - b), Array.from({ length: 11 }, (_, i) => i * 25));
    assert.equal(offsets.filter(offset => offset === 0).length, 1);
  } finally { axios.get = original; }
});

test('failed or incomplete pages reject the whole collection', async () => {
  const original = axios.get;
  axios.get = (async (_url: string, config: any) => ({ data: {
    issues: config.params.offset ? [] : Array.from({ length: 100 }, (_, id) => ({ id })),
    limit: 100, total_count: 101,
  } })) as any;
  try {
    await assert.rejects(fetchCollection('mock', 'key', {}, 'issues', createRequestPool(2), 2), /collection changed/);
  } finally { axios.get = original; }
});

test('projects and issues share one request budget, including empty collections', async () => {
  const original = axios.get;
  let active = 0;
  let maximum = 0;
  axios.get = (async (url: string, config: any) => {
    active++;
    maximum = Math.max(maximum, active);
    await wait(2);
    active--;
    const key = url === 'projects' ? 'projects' : 'issues';
    const total = url === 'empty' ? 0 : 250;
    const { offset, limit } = config.params;
    return { data: { [key]: Array.from({ length: Math.min(limit, Math.max(0, total - offset)) }, (_, i) => ({ id: offset + i })), total_count: total, limit } };
  }) as any;
  try {
    const pool = createRequestPool(3);
    const result = await Promise.all([
      fetchCollection('projects', 'key', {}, 'projects', pool, 3),
      fetchCollection('issues', 'key', {}, 'issues', pool, 3),
      fetchCollection('empty', 'key', {}, 'issues', pool, 3),
    ]);
    assert.deepEqual(result.map(items => items.length), [250, 250, 0]);
    assert.equal(maximum, 3);
  } finally { axios.get = original; }
});

test('tree retains nested, missing-parent and cross-project tasks; compact keeps Explorer fields', () => {
  const projects = [{ id: 1, name: 'Root' }, { id: 2, name: 'Child', parent: { id: 1 } }, { id: 3, name: 'Empty' }];
  const tasks = [
    { id: 10, subject: 'Parent', project: { id: 1 } },
    { id: 11, subject: 'Nested', project: { id: 1 }, parent: { id: 10 }, description: 'Large', spent_hours: 4 },
    { id: 12, subject: 'Orphan', project: { id: 2 }, parent: { id: 999 } },
    { id: 13, subject: 'Cross project', project: { id: 2 }, parent: { id: 10 } },
  ];
  const tree = buildProjectTaskTree(projects, tasks, { ...filters, compact: true });
  assert.equal(tree[0].tasks[0].subtasks[0].id, 11);
  assert.equal(tree[0].tasks[0].subtasks[0].spent_hours, 4);
  assert.equal(tree[0].tasks[0].subtasks[0].description, undefined);
  assert.equal(tree[0].subProjects[0].tasks.length, 2);
  assert.equal(tree.length, 2);
  const matching = buildProjectTaskTree(projects, tasks, { ...filters, taskName: 'Nested' });
  assert.equal(matching.length, 1);
  assert.equal(matching[0].tasks[0].id, 11);
  assert.equal(matching[0].tasks[0].description, 'Large');
  assert.equal(buildProjectTaskTree(projects, tasks, { ...filters, onlyShowMyTasks: true }).length, 1);
});

test('cache isolates host, key and every query filter', () => {
  const base = treeCacheKey('host', 'secret', filters);
  assert.ok(!base.includes('secret'));
  for (const change of [{ compact: true }, { onlyShowMyTasks: true }, { taskDate: '2026-10-30' }, { taskName: 'test' }, { projectName: 'test' }]) {
    assert.notEqual(treeCacheKey('host', 'secret', { ...filters, ...change }), base);
  }
  assert.notEqual(treeCacheKey('other', 'secret', filters), base);
  assert.notEqual(treeCacheKey('host', 'other', filters), base);
});

test('simultaneous reloads share work and failures can be retried', async () => {
  let calls = 0;
  const loader = async () => { calls++; await wait(5); return [{ id: 1 }]; };
  const results = await Promise.all([loadTreeOnce('same', loader), loadTreeOnce('same', loader)]);
  assert.equal(calls, 1);
  assert.equal(results[0], results[1]);
  await assert.rejects(loadTreeOnce('failure', async () => { throw new Error('failed'); }));
  assert.deepEqual(await loadTreeOnce('failure', loader), [{ id: 1 }]);
});

test('large tree benchmark preserves all 30000 tasks', () => {
  const tasks = Array.from({ length: 30000 }, (_, i) => ({
    id: i + 1, subject: `Task ${i}`, project: { id: 1 },
    ...(i % 10 ? { parent: { id: i - i % 10 + 1 } } : {}),
    description: 'x'.repeat(1000),
  }));
  const start = performance.now();
  const tree = buildProjectTaskTree([{ id: 1, name: 'Large' }], tasks, { ...filters, compact: true });
  const duration = performance.now() - start;
  assert.equal(tree[0].tasks.length, 3000);
  assert.equal(tree[0].tasks.reduce((sum: number, task: any) => sum + 1 + task.subtasks.length, 0), 30000);
  console.log(`30000-task tree: ${duration.toFixed(1)}ms; compact bytes: ${JSON.stringify(tree).length}; raw bytes: ${JSON.stringify(tasks).length}`);
});

test('closed project tasks and visible issues whose project is omitted from the list are retained', () => {
  const projects = [{ id: 1, name: 'Active', status: 1 }, { id: 2, name: 'Closed', status: 5 }];
  const issues = [
    { id: 10, subject: 'Active task', project: { id: 1, name: 'Active' } },
    { id: 11, subject: 'Closed task', project: { id: 2, name: 'Closed' }, created_on: '2010-01-01' },
    { id: 12, subject: 'Visible orphan project task', project: { id: 3, name: 'Unlisted visible project' } },
  ];
  const tree = buildProjectTaskTree(projects, issues, filters);
  assert.equal(tree.length, 3);
  assert.deepEqual(tree.flatMap(project => project.tasks.map((task: any) => task.id)), [10, 11, 12]);
  assert.equal(tree[2].name, 'Unlisted visible project');
  assert.equal(projects.length, 2);
  const activeTree = buildProjectTaskTree(projects, issues, { ...filters, includeInactiveProjects: false });
  assert.equal(activeTree.length, 1);
  assert.deepEqual(activeTree[0].tasks.map((task: any) => task.id), [10]);
});
