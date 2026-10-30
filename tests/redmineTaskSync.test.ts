import assert from 'node:assert/strict';
import test from 'node:test';
import { getEventListeners } from 'node:events';
import { decodeSnapshot, encodeSnapshot, FULL_RECONCILE_MS, serializeTaskSync, snapshotKey, synchronizeTasks, type SyncSource, type TaskSnapshot } from '../src/utils/redmineTaskSync.js';
import { buildProjectTaskTree, treeIssueCountParams, treeIssueParams, twoMonthsAgo, type TreeFilters } from '../src/utils/redmineTreeV2.js';

const now = Date.parse('2026-10-30T10:00:00Z');
const projects = [{ id: 1, name: 'Project' }];
const oldTask = { id: 1, subject: 'Existing', project: { id: 1 }, updated_on: '2026-10-30T09:59:00Z' };
const baseline = (): TaskSnapshot => ({ version: 2, projects, tasks: [oldTask], syncedAt: new Date(now - 1000).toISOString(), reconciledAt: now - 1000 });
const filters: TreeFilters = { onlyShowMyTasks: false, taskDate: '', taskName: '', projectName: '', compact: true };
const source = (tasks: any[], count = 1): SyncSource => ({
  projects: async () => ({ items: projects, serverDate: new Date(now).toUTCString() }),
  tasks: async () => tasks,
  count: async () => count,
});

test('two-month cutoff uses calendar months and clamps shorter months without rollover', () => {
  assert.equal(twoMonthsAgo(new Date('2026-10-31T12:00:00Z')), '2026-08-31');
  assert.equal(twoMonthsAgo(new Date('2026-04-30T12:00:00Z')), '2026-02-28');
  assert.equal(twoMonthsAgo(new Date('2024-04-30T12:00:00Z')), '2024-02-29');
  assert.equal(twoMonthsAgo(new Date('2026-01-01T12:00:00Z')), '2025-11-01');
});

test('recent filter reaches full, delta and count queries without adding an assignee restriction', () => {
  const recent = { ...filters, createdSince: '2026-08-31' };
  for (const params of [treeIssueParams(recent, projects), treeIssueParams(recent, projects, '2026-10-29'), treeIssueCountParams(recent, projects)]) {
    assert.equal(params['op[created_on]'], '>=');
    assert.deepEqual(params['v[created_on][]'], ['2026-08-31']);
    assert.equal(params.assigned_to_id, undefined);
  }
  const mine = treeIssueParams({ ...recent, onlyShowMyTasks: true }, projects, '2026-10-29');
  assert.equal(mine.created_on, '>=2026-08-31');
  assert.equal(mine.updated_on, '>=2026-10-29');
  assert.equal(mine.assigned_to_id, 'me');
  const count = treeIssueCountParams({ ...recent, onlyShowMyTasks: true }, projects);
  assert.deepEqual(count['v[created_on][]'], ['2026-08-31']);
  assert.deepEqual(count['v[assigned_to_id][]'], ['me']);
  assert.equal(treeIssueParams(filters, projects).created_on, undefined);
  assert.equal(treeIssueParams({ ...recent, taskDate: '<=2026-09-01' }, projects).created_on, '<=2026-09-01');
});

test('recent and all-time snapshots remain isolated across toggles and cutoff date changes', () => {
  const all = snapshotKey('host', 'key', false);
  const recent = snapshotKey('host', 'key', false, '2026-08-31');
  assert.notEqual(all, recent);
  assert.notEqual(recent, snapshotKey('host', 'key', true, '2026-08-31'));
  assert.notEqual(recent, snapshotKey('host', 'key', false, '2026-09-01'));
  assert.equal(all, snapshotKey('host', 'key', false));
});

test('reload includes another author’s new unassigned task and updates existing tasks', async () => {
  const task = { id: 2, subject: 'Other person created this', author: { id: 99 }, project: { id: 1 } };
  let observedSince: string | undefined;
  const upstream = source([], 2);
  upstream.tasks = async (_projects, since) => { observedSince = since; return [{ ...oldTask, subject: 'Edited' }, task]; };
  const result = await synchronizeTasks(baseline(), upstream, false, now);
  assert.equal(result.mode, 'DELTA');
  assert.ok(observedSince && Date.parse(observedSince) < now - 1000);
  assert.deepEqual(result.snapshot.tasks.map(t => t.id), [2, 1]);
  assert.equal(result.snapshot.tasks[0].assigned_to, undefined);
  assert.equal(result.snapshot.tasks[1].subject, 'Edited');
  assert.equal(result.snapshot.syncedAt, new Date(now).toISOString());
  const tree = buildProjectTaskTree(projects, result.snapshot.tasks, filters);
  assert.equal(tree[0].tasks[0].id, 2);
  const params = treeIssueParams(filters, projects, observedSince);
  assert.equal(params.assigned_to_id, undefined);
  assert.deepEqual(params['f[]'], ['status_id', 'project_id', 'updated_on']);
  assert.equal(params['op[updated_on]'], '>=');
});

test('Only My Tasks keeps its own scope and timestamp filter', () => {
  const params = treeIssueParams({ ...filters, onlyShowMyTasks: true }, projects, '2026-10-30T10:00:00Z');
  assert.equal(params.assigned_to_id, 'me');
  assert.equal(params.updated_on, '>=2026-10-30');
  const countParams = treeIssueCountParams({ ...filters, onlyShowMyTasks: true }, projects);
  assert.deepEqual(countParams['v[project_id][]'], [1]);
  assert.deepEqual(countParams['v[assigned_to_id][]'], ['me']);
  assert.notEqual(snapshotKey('host', 'secret', false), snapshotKey('host', 'secret', true));
  assert.notEqual(snapshotKey('other', 'secret', false), snapshotKey('host', 'secret', false));
  assert.notEqual(snapshotKey('host', 'other', false), snapshotKey('host', 'secret', false));
});

test('failed delta never advances the stored baseline; retry starts from the same watermark', async () => {
  const previous = baseline();
  const upstream = source([]);
  upstream.tasks = async () => { throw new Error('page failed'); };
  await assert.rejects(synchronizeTasks(previous, upstream, false, now), /page failed/);
  assert.equal(previous.syncedAt, new Date(now - 1000).toISOString());
  assert.deepEqual(previous.tasks, [oldTask]);
  upstream.tasks = async () => [];
  const result = await synchronizeTasks(previous, upstream, false, now);
  assert.equal(result.snapshot.tasks.length, 1);
});

test('a deleted or no-longer-visible task forces a full reconciliation on count mismatch', async () => {
  const requested: Array<string | undefined> = [];
  const upstream = source([], 0);
  upstream.tasks = async (_projects, since) => { requested.push(since); return []; };
  const result = await synchronizeTasks(baseline(), upstream, false, now);
  assert.equal(result.mode, 'FULL');
  assert.equal(requested.length, 2);
  assert.equal(requested[1], undefined);
  assert.deepEqual(result.snapshot.tasks, []);
});

test('new project access backfills older tasks even if their updated_on predates the watermark', async () => {
  const extra = { id: 20, subject: 'Old task newly visible', project: { id: 2 } };
  const upstream = source([oldTask, extra], 2);
  upstream.projects = async () => ({ items: [...projects, { id: 2, name: 'New access' }], serverDate: new Date(now).toUTCString() });
  upstream.tasks = async (_projects, since) => { assert.equal(since, undefined); return [oldTask, extra]; };
  assert.equal((await synchronizeTasks(baseline(), upstream, false, now)).snapshot.tasks.length, 2);
});

test('full reconciliation expires after the original five-minute visibility window; fullReload works', async () => {
  const previous = baseline();
  previous.reconciledAt = now - FULL_RECONCILE_MS;
  assert.equal((await synchronizeTasks(previous, source([oldTask]), false, now)).mode, 'FULL');
  assert.equal((await synchronizeTasks(baseline(), source([oldTask]), true, now)).mode, 'FULL');
});

test('an empty project list removes prior tasks; missing server Date never advances using local clock', async () => {
  const upstream = source([]);
  upstream.projects = async () => ({ items: [] });
  upstream.tasks = async () => { throw new Error('should not fetch tasks'); };
  assert.deepEqual((await synchronizeTasks(baseline(), upstream, false, now)).snapshot.tasks, []);
  upstream.projects = async () => ({ items: projects });
  upstream.tasks = async () => [];
  const result = await synchronizeTasks(baseline(), upstream, false, now);
  assert.equal(result.snapshot.syncedAt, baseline().syncedAt);
});

test('overlapping reloads are queued so a late-created task is not hidden by coalescing', async () => {
  let stored: TaskSnapshot | undefined;
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  let upstreamTasks = [oldTask];
  const upstream = source([]);
  upstream.tasks = async () => { const tasks = [...upstreamTasks]; if (!stored) await gate; return tasks; };
  upstream.count = async () => upstreamTasks.length;
  const refresh = () => serializeTaskSync('account', async () => {
    const result = await synchronizeTasks(stored, upstream, false, now);
    stored = result.snapshot;
    return result;
  });
  const first = refresh();
  await new Promise(resolve => setTimeout(resolve, 1));
  upstreamTasks = [...upstreamTasks, { ...oldTask, id: 2 }];
  const second = refresh();
  release();
  assert.equal((await first).snapshot.tasks.length, 1);
  assert.equal((await second).snapshot.tasks.length, 2);
  await assert.rejects(serializeTaskSync('account', async () => { throw new Error('failed'); }));
  assert.equal(await serializeTaskSync('account', async () => 42), 42);
});

test('snapshots compress, round-trip, and reject corrupt cache data', async () => {
  const original = baseline();
  const encoded = await encodeSnapshot(original, now);
  assert.deepEqual(await decodeSnapshot(encoded), original);
  assert.equal(await decodeSnapshot('broken'), undefined);
  assert.equal(await decodeSnapshot(null), undefined);
  assert.equal(await decodeSnapshot(JSON.stringify({ payload: 'invalid' })), undefined);
});

test('snapshot provenance rejects recent data under an all-dates key and invalidates v1 snapshots', async () => {
  const allKey = snapshotKey('host', 'key', false);
  const recentKey = snapshotKey('host', 'key', false, '2026-08-31');
  const recent = { ...baseline(), scope: recentKey };
  const encoded = await encodeSnapshot(recent, now);
  assert.equal(await decodeSnapshot(encoded, allKey), undefined);
  assert.deepEqual(await decodeSnapshot(encoded, recentKey), recent);
  assert.equal(await decodeSnapshot(await encodeSnapshot(baseline(), now), allKey), undefined);
  const all = { ...baseline(), scope: allKey };
  assert.deepEqual(await decodeSnapshot(await encodeSnapshot(all, now), allKey), all);
  assert.equal(await decodeSnapshot(await encodeSnapshot({ ...all, version: 1 } as any, now), allKey), undefined);
});

test('a request cancelled while queued rejects immediately and never starts an abandoned scan', async () => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const first = serializeTaskSync('cancel-queue', () => gate);
  const controller = new AbortController();
  let ran = false;
  const second = serializeTaskSync('cancel-queue', async () => { ran = true; }, controller.signal);
  controller.abort();
  await assert.rejects(second, { name: 'AbortError' });
  assert.equal(ran, false);
  assert.equal(getEventListeners(controller.signal, 'abort').length, 0);
  release();
  await first;
  assert.equal(await serializeTaskSync('cancel-queue', async () => 42), 42);
  assert.equal(ran, false);
});
