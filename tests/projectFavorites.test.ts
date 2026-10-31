import assert from 'node:assert/strict';
import test from 'node:test';
import { expandProjectIds, parseProjectIds } from '../src/utils/projectIds.js';
import { addFavoriteProjects, getFavoriteProjects, updateFavoriteProjects } from '../src/controllers/projectFavorite.controller.js';
import { AuthorizedUser } from '../src/models/AuthorizedUser.js';
import { RedmineAccount } from '../src/models/RedmineAccount.js';
import { buildProjectTaskTree, treeIssueParams, type TreeFilters } from '../src/utils/redmineTreeV2.js';
import { snapshotKey } from '../src/utils/redmineTaskSync.js';

const filters: TreeFilters = { projectIds: [2], projectName: '', taskName: '', taskDate: '', onlyShowMyTasks: false, compact: false };

test('project IDs distinguish omitted and empty selections, normalize duplicates and reject malformed input', () => {
  assert.equal(parseProjectIds(undefined, true), undefined);
  assert.deepEqual(parseProjectIds('', true), []);
  assert.deepEqual(parseProjectIds([], true), []);
  assert.deepEqual(parseProjectIds('2,1,2', true), [1, 2]);
  assert.deepEqual(parseProjectIds(['2', '1'], true), [1, 2]);
  for (const value of [undefined, null, '1,2', [0], [-1], [1.2], [true], [{}], ['1e2'], [''], [Number.MAX_SAFE_INTEGER + 1]]) {
    assert.throws(() => parseProjectIds(value));
  }
});

test('project scope restricts full/delta/count upstream queries including inactive and dated modes', () => {
  const projects = [{ id: 1 }, { id: 2 }, { id: 3, status: 5 }];
  for (const includeInactiveProjects of [false, true]) {
    const params = treeIssueParams({ ...filters, includeInactiveProjects, onlyShowMyTasks: true, createdSince: '2026-08-31' }, projects, '2026-10-30');
    assert.deepEqual(params['v[project_id][]'], [2]);
    assert.deepEqual(params['v[assigned_to_id][]'], ['me']);
    assert.deepEqual(params['v[created_on][]'], ['2026-08-31']);
    assert.deepEqual(params['v[updated_on][]'], ['2026-10-30']);
  }
  for (const [date, operator, values] of [
    ['2026-10-31', '=', ['2026-10-31']],
    ['<=2026-10-31', '<=', ['2026-10-31']],
    ['><2026-10-01|2026-10-31', '><', ['2026-10-01', '2026-10-31']],
    ['t', 't', ['']],
    ['>t-7', '>t-', ['7']],
    ['><t+7', '><t+', ['7']],
  ] as const) {
    const params = treeIssueParams({ ...filters, taskDate: date }, projects);
    assert.deepEqual(params['v[project_id][]'], [2]);
    assert.equal(params['op[created_on]'], operator);
    assert.deepEqual(params['v[created_on][]'], values);
  }
  const inactive = treeIssueParams({ ...filters, projectIds: [2, 3], includeInactiveProjects: false }, projects);
  assert.deepEqual(inactive['v[project_id][]'], [2]);
});

test('selected child projects become roots when their parent is not selected', () => {
  const projects = [{ id: 1, name: 'Parent' }, { id: 2, name: 'Selected child', parent: { id: 1 } }];
  const tasks = [{ id: 10, subject: 'Excluded', project: { id: 1 } }, { id: 11, subject: 'Selected', project: { id: 2 } }];
  const tree = buildProjectTaskTree(projects, tasks, filters);
  assert.deepEqual(tree.map(p => p.id), [2]);
  assert.deepEqual(tree[0].tasks.map((t: any) => t.id), [11]);
  assert.deepEqual(buildProjectTaskTree(projects, tasks, { ...filters, projectIds: [] }), []);
});


test('selecting a parent includes every descendant and its tasks, with no duplicates or unrelated projects', () => {
  // Deliberately unordered to check multi-level traversal independently of API order.
  const projects = [
    { id: 4, name: 'Grandchild', parent: { id: 3 } },
    { id: 1, name: 'Unrelated' },
    { id: 3, name: 'Child', parent: { id: 2 } },
    { id: 2, name: 'Favorite parent' },
  ];
  const tasks = projects.map(project => ({ id: project.id * 10, subject: project.name, project: { id: project.id } }));
  assert.deepEqual(expandProjectIds([2, 3, 2], projects), [2, 3, 4]);
  const params = treeIssueParams(filters, projects);
  assert.deepEqual(params['v[project_id][]'], [2, 3, 4]);
  const tree = buildProjectTaskTree(projects, tasks, filters);
  assert.deepEqual(tree.map(project => project.id), [2]);
  assert.equal(tree[0].tasks[0].id, 20);
  assert.equal(tree[0].subProjects[0].tasks[0].id, 30);
  assert.equal(tree[0].subProjects[0].subProjects[0].tasks[0].id, 40);
  assert.deepEqual(expandProjectIds([], projects), []);
  assert.deepEqual(expandProjectIds([9], [{ id: 9, parent: { id: 10 } }, { id: 10, parent: { id: 9 } }]), [9, 10]);
});

test('descendant selection combines with active/inactive, custom date, assignee and delta filters', () => {
  const projects = [{ id: 2, name: 'Parent' }, { id: 3, name: 'Closed child', status: 5, parent: { id: 2 } }, { id: 4, name: 'Active grandchild', status: 1, parent: { id: 3 } }];
  for (const includeInactiveProjects of [false, true]) {
    for (const taskDate of ['', '<=2026-10-31']) {
      const params = treeIssueParams({ ...filters, includeInactiveProjects, taskDate, onlyShowMyTasks: true, createdSince: '2026-08-31' }, projects, '2026-10-30');
      assert.deepEqual(params['v[project_id][]'], includeInactiveProjects ? [2, 3, 4] : [2, 4]);
      assert.deepEqual(params['v[assigned_to_id][]'], ['me']);
      assert.equal(params['op[created_on]'], taskDate ? '<=' : '>=');
    }
  }
  const tasks = projects.map(project => ({ id: project.id, subject: project.name, project: { id: project.id } }));
  const tree = buildProjectTaskTree(projects, tasks, { ...filters, includeInactiveProjects: false });
  assert.deepEqual(tree.map(project => project.id), [2, 4]);
});

test('snapshot keys isolate selections, normalize order and distinguish empty from unrestricted', () => {
  const key = (ids?: number[]) => snapshotKey('url', 'key', false, undefined, true, ids);
  assert.equal(key([2, 1, 2]), key([1, 2]));
  assert.notEqual(key([1]), key([2]));
  assert.notEqual(key(), key([]));
});

test('favorite handlers use authenticated owner, add atomically, replace/clear, and reject invalid bodies', async () => {
  const originalUser = AuthorizedUser.findOne;
  const originalAccount = RedmineAccount.findOne;
  const originalUpdate = RedmineAccount.findOneAndUpdate;
  const records = new Map<string, number[]>([['user-a', []], ['user-b', [99]]]);
  const updates: any[] = [];
  AuthorizedUser.findOne = (async ({ email }: any) => ({ _id: email })) as any;
  RedmineAccount.findOne = (({ userId }: any) => ({ select: async () => records.has(userId) ? { favoriteProjectIds: records.get(userId) } : null })) as any;
  RedmineAccount.findOneAndUpdate = (({ userId }: any, update: any, options: any) => ({ select: async () => {
    updates.push({ userId, update, options });
    if (!records.has(userId)) return null;
    records.set(userId, update.$set ? update.$set.favoriteProjectIds : [...new Set([...records.get(userId)!, ...update.$addToSet.favoriteProjectIds.$each])]);
    return { favoriteProjectIds: records.get(userId) };
  } })) as any;
  async function call(handler: any, body?: any, email = 'user-a') {
    const response = { statusCode: 200, body: undefined as any, status(code: number) { this.statusCode = code; return this; }, json(value: any) { this.body = value; return this; } };
    await handler({ user: { email }, body }, response);
    return response;
  }
  try {
    assert.deepEqual((await call(getFavoriteProjects)).body, { projectIds: [] });
    assert.deepEqual((await call(addFavoriteProjects, { projectIds: [2, 1, 2] })).body, { projectIds: [1, 2] });
    assert.deepEqual((await call(addFavoriteProjects, { projectIds: [2, 3] })).body, { projectIds: [1, 2, 3] });
    assert.ok(updates[0].update.$addToSet);
    assert.equal(updates[0].options.new, true);
    assert.deepEqual((await call(updateFavoriteProjects, { projectIds: [3] })).body, { projectIds: [3] });
    assert.deepEqual((await call(updateFavoriteProjects, { projectIds: [] })).body, { projectIds: [] });
    assert.deepEqual((await call(getFavoriteProjects, undefined, 'user-b')).body, { projectIds: [99] });
    assert.equal((await call(updateFavoriteProjects, {})).statusCode, 400);
    assert.equal((await call(addFavoriteProjects, { projectIds: ['bad'] })).statusCode, 400);
    assert.equal((await call(getFavoriteProjects, undefined, 'missing')).statusCode, 400);
  } finally {
    AuthorizedUser.findOne = originalUser;
    RedmineAccount.findOne = originalAccount;
    RedmineAccount.findOneAndUpdate = originalUpdate;
  }
});
