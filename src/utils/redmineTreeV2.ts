import axios from 'axios';
import { createHash } from 'node:crypto';
import { setMaxListeners } from 'node:events';

type RecordData = Record<string, any>;
export type TreeFilters = {
  onlyShowMyTasks: boolean;
  projectName: string;
  taskName: string;
  taskDate: string;
  compact: boolean;
  createdSince?: string;
  includeInactiveProjects?: boolean;
};

export function twoMonthsAgo(now = new Date()): string {
  const cutoff = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 2, 1));
  const lastDay = new Date(Date.UTC(cutoff.getUTCFullYear(), cutoff.getUTCMonth() + 1, 0)).getUTCDate();
  cutoff.setUTCDate(Math.min(now.getUTCDate(), lastDay));
  return cutoff.toISOString().slice(0, 10);
}

export const treeCacheKey = (url: string, apiKey: string, filters: TreeFilters) =>
  `redmine:tree:v2:${createHash('sha256').update(JSON.stringify([url, apiKey, filters])).digest('hex')}`;

export function createTreeAbortController(concurrency: number) {
  const controller = new AbortController();
  // Axios adds one abort listener per active request and removes it on completion.
  // Keep a finite limit scoped to this load; leave global listener limits alone.
  setMaxListeners(concurrency, controller.signal);
  return controller;
}

export function treeIssueParams(filters: TreeFilters, projects: RecordData[], updatedSince?: string): RecordData {
  // Include-inactive mode keeps all visible issues. Only the explicit active
  // scope restricts project IDs; date and assignee filters remain independent.
  const params: RecordData = {
    status_id: '*', sort: 'id:desc',
    ...(filters.onlyShowMyTasks ? { assigned_to_id: 'me' } : {}),
    ...(filters.taskDate ? { created_on: filters.taskDate }
      : filters.createdSince ? { created_on: `>=${filters.createdSince}` } : {}),
    // This Redmine accepts dates, not timestamps. The sync layer overlaps a day.
    ...(filters.createdSince && updatedSince ? { updated_on: `>=${updatedSince.slice(0, 10)}` } : {}),
  };
  if (filters.includeInactiveProjects === false && !filters.taskDate) {
    Object.assign(params, {
      set_filter: 1,
      'f[]': ['status_id', 'project_id'],
      'op[status_id]': '*',
      'op[project_id]': '=',
      'v[project_id][]': projects.filter(project => project.status === undefined || project.status === 1).map(project => project.id),
    });
    for (const field of ['assigned_to_id', 'created_on', 'updated_on']) {
      if (params[field] === undefined) continue;
      params['f[]'].push(field);
      params[`op[${field}]`] = field === 'assigned_to_id' ? '=' : '>=';
      params[`v[${field}][]`] = [field === 'assigned_to_id' ? params[field] : params[field].slice(2)];
      delete params[field];
    }
  }
  return params;
}

export function treeIssueCountParams(filters: TreeFilters, projects: RecordData[]) {
  return treeIssueParams(filters, projects);
}

// Share one request budget between the projects and issues collections.
export function createRequestPool(concurrency: number) {
  let active = 0;
  const waiting: Array<() => void> = [];
  return async <T>(work: () => Promise<T>): Promise<T> => {
    if (active >= concurrency) await new Promise<void>(resolve => waiting.push(resolve));
    else active++;
    try {
      return await work();
    } finally {
      const next = waiting.shift();
      if (next) next();
      else active--;
    }
  };
}

export async function fetchCollection(
  url: string,
  apiKey: string,
  params: RecordData,
  key: string,
  pool: ReturnType<typeof createRequestPool>,
  concurrency: number,
  signal?: AbortSignal,
  onFirstPage?: (serverDate: string | undefined) => void,
) {
  const page = (offset: number, limit: number) => pool(async () => {
    const { data, headers } = await axios.get(url, {
      headers: { 'X-Redmine-API-Key': apiKey },
      params: { ...params, limit, offset },
      timeout: 20_000,
      signal,
    });
    if (!Array.isArray(data[key]) || !Number.isInteger(data.total_count) || data.total_count < 0) {
      throw new Error('Invalid Redmine pagination response');
    }
    if (offset === 0) onFirstPage?.(headers?.date ? String(headers.date) : undefined);
    return data;
  });
  // The first request already contains a full page; no count-only round trip.
  const first = await page(0, 100);
  const limit = Math.min(100, Number(first.limit) || 100);
  if (!Number.isInteger(limit) || limit < 1) throw new Error('Invalid Redmine page size');
  if (first[key].length < Math.min(limit, first.total_count)) {
    throw new Error('Incomplete first Redmine page');
  }
  const pages: RecordData[][] = [first[key]];
  const count = Math.ceil(first.total_count / limit);
  let nextPage = 1;
  await Promise.all(Array.from({ length: Math.min(concurrency, Math.max(0, count - 1)) }, async () => {
    while (nextPage < count) {
      const index = nextPage++;
      const data = await page(index * limit, limit);
      const expected = Math.min(limit, first.total_count - index * limit);
      if (data[key].length < expected) throw new Error('Redmine collection changed during pagination; reload required');
      pages[index] = data[key];
    }
  }));
  // Stable id sorting at the upstream prevents moving page boundaries on edits.
  return [...new Map(pages.flat().map(item => [item.id, item])).values()];
}

export function buildProjectTaskTree(projects: RecordData[], issues: RecordData[], filters: TreeFilters) {
  const allProjects = projects.filter(project => filters.includeInactiveProjects !== false || project.status === undefined || project.status === 1);
  const projectNodes = new Map<number, RecordData>();
  const taskNodes = new Map<number, RecordData>();
  const roots: RecordData[] = [];
  for (const project of allProjects) {
    projectNodes.set(project.id, {
      id: project.id, name: project.name, identifier: project.identifier, tasks: [], subProjects: [],
    });
  }
  const search = filters.taskName.toLowerCase();
  for (const task of issues) {
    if (!task.project?.id) throw new Error('Redmine issue has no project reference');
    if (!projectNodes.has(task.project.id)) {
      if (filters.includeInactiveProjects === false) continue;
      // Retain a visible issue even when the project-list endpoint omits its
      // project. Use only metadata supplied by Redmine, not invented hierarchy.
      const project = task.project;
      allProjects.push(project);
      projectNodes.set(project.id, { id: project.id, name: project.name, identifier: project.identifier, tasks: [], subProjects: [] });
    }
    if (search && !task.subject.toLowerCase().includes(search) && !String(task.id).includes(search)) continue;
    const data = filters.compact ? {
      id: task.id, subject: task.subject, project: task.project, parent: task.parent,
      status: task.status, tracker: task.tracker, assigned_to: task.assigned_to,
      spent_hours: task.spent_hours,
    } : task;
    taskNodes.set(task.id, { ...data, subtasks: [] });
  }
  // Each node is visited once, including children whose parent is not visible.
  for (const task of taskNodes.values()) {
    const parent = taskNodes.get(task.parent?.id);
    if (parent && parent.project.id === task.project.id && parent.id !== task.id) parent.subtasks.push(task);
    else projectNodes.get(task.project.id)!.tasks.push(task);
  }
  for (const project of allProjects) {
    const node = projectNodes.get(project.id)!;
    const parent = projectNodes.get(project.parent?.id);
    if (parent && parent.id !== project.id) parent.subProjects.push(node);
    else roots.push(node);
  }
  if (!filters.projectName && !filters.taskName && !filters.onlyShowMyTasks) return roots;
  const projectSearch = filters.projectName.toLowerCase();
  const prune = (nodes: RecordData[]): RecordData[] => nodes.filter(node => {
    node.subProjects = prune(node.subProjects);
    return node.tasks.length || node.subProjects.length || (projectSearch && (
      node.name.toLowerCase().includes(projectSearch) || String(node.id).includes(projectSearch)
    ));
  });
  return prune(roots);
}

// Coalesce simultaneous reloads for the same account and filters.
const pending = new Map<string, Promise<RecordData[]>>();
export function loadTreeOnce(key: string, loader: () => Promise<RecordData[]>) {
  const existing = pending.get(key);
  if (existing) return existing;
  const promise = loader().finally(() => pending.delete(key));
  pending.set(key, promise);
  return promise;
}
