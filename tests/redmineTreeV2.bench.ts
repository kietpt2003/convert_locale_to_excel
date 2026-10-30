import axios from 'axios';
import assert from 'node:assert/strict';
import { fetchRedmineDataParallel } from '../src/utils/redmineUtils.js';
import { buildProjectTaskTree, createRequestPool, fetchCollection } from '../src/utils/redmineTreeV2.js';

// Synthetic upstream latency only: this is not a production Redmine SLA.
const tasks = Array.from({ length: 10000 }, (_, i) => ({
  id: i + 1, subject: `Task ${i}`, project: { id: 1 },
  ...(i % 10 ? { parent: { id: i - i % 10 + 1 } } : {}),
}));
const original = axios.get;
axios.get = (async (_url: string, config: any) => {
  const { offset, limit } = config.params;
  await new Promise(resolve => setTimeout(resolve, offset % 1000 === 0 ? 80 : 10));
  return { data: { total_count: tasks.length, limit, issues: tasks.slice(offset, offset + limit) } };
}) as any;
const oldBuild = (nodes: any[], parentId: number | null, ids: Set<number>): any[] => nodes
  .filter(t => parentId === null ? !t.parent || !ids.has(t.parent.id) : t.parent?.id === parentId)
  .map(t => ({ ...t, subtasks: oldBuild(nodes, t.id, ids) }));

try {
  const oldStart = performance.now();
  const oldTasks = await fetchRedmineDataParallel('mock', 'key', {}, 'issues');
  const oldFetched = performance.now();
  const oldTree = oldBuild(oldTasks, null, new Set(oldTasks.map(t => t.id)));
  const oldDone = performance.now();
  const newStart = performance.now();
  const newTasks = await fetchCollection('mock', 'key', { sort: 'id:desc' }, 'issues', createRequestPool(16), 16);
  const newFetched = performance.now();
  const newTree = buildProjectTaskTree([{ id: 1, name: 'Project' }], newTasks, {
    onlyShowMyTasks: false, projectName: '', taskName: '', taskDate: '', compact: false,
  });
  const newDone = performance.now();
  assert.deepEqual(newTree[0].tasks, oldTree);
  console.log(JSON.stringify({
    dataset: tasks.length,
    old: { fetchMs: oldFetched - oldStart, treeMs: oldDone - oldFetched, totalMs: oldDone - oldStart },
    v2: { fetchMs: newFetched - newStart, treeMs: newDone - newFetched, totalMs: newDone - newStart },
    speedup: (oldDone - oldStart) / (newDone - newStart),
  }, null, 2));
} finally { axios.get = original; }
