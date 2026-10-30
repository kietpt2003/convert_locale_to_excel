import { createHash } from 'node:crypto';
import { gzip, gunzip } from 'node:zlib';
import { promisify } from 'node:util';

type Data = Record<string, any>;
export type TaskSnapshot = {
  version: 3;
  scope?: string;
  projects: Data[];
  tasks: Data[];
  syncedAt: string;
  reconciledAt: number;
};
export type SyncSource = {
  projects: () => Promise<{ items: Data[]; serverDate?: string }>;
  tasks: (projects: Data[], since?: string) => Promise<Data[]>;
  count: (projects: Data[]) => Promise<number>;
};

const compress = promisify(gzip);
const decompress = promisify(gunzip);
export const FULL_RECONCILE_MS = 5 * 60_000;
// The installed Redmine accepts dates, not ISO timestamp filters. Re-read the
// previous day too so UTC/local-date boundaries cannot skip new issues.
const OVERLAP_MS = 24 * 60 * 60_000 + 2 * 60_000;

export function snapshotKey(url: string, apiKey: string, mine: boolean, createdSince?: string, includeInactiveProjects = true) {
  const scope: Array<string | boolean> = [url, apiKey, mine];
  if (createdSince) scope.push(createdSince);
  if (!includeInactiveProjects) scope.push('active-projects-only');
  return `redmine:snapshot:v3:${createHash('sha256').update(JSON.stringify(scope)).digest('hex')}`;
}

export async function encodeSnapshot(snapshot: TaskSnapshot, generation: number) {
  const payload = (await compress(JSON.stringify(snapshot))).toString('base64');
  return JSON.stringify({ generation, payload });
}

export async function decodeSnapshot(value: string | null | undefined, expectedScope?: string): Promise<TaskSnapshot | undefined> {
  if (!value) return;
  try {
    const { payload } = JSON.parse(value);
    const snapshot = JSON.parse((await decompress(Buffer.from(payload, 'base64'), { maxOutputLength: 64 * 1024 * 1024 })).toString());
    if (snapshot.version !== 3 || (expectedScope && snapshot.scope !== expectedScope)
      || !Array.isArray(snapshot.projects) || !Array.isArray(snapshot.tasks)
      || !Number.isFinite(Date.parse(snapshot.syncedAt)) || !Number.isFinite(snapshot.reconciledAt)) return;
    return snapshot;
  } catch { return; }
}

// Each reload checks upstream after the previous reload finishes. Merely joining
// an older in-flight scan could miss a task created before the later reload.
const queues = new Map<string, Promise<unknown>>();
export function serializeTaskSync<T>(key: string, work: () => Promise<T>, signal?: AbortSignal): Promise<T> {
  const previous = queues.get(key) || Promise.resolve();
  const job = previous.catch(() => undefined).then(() => { signal?.throwIfAborted(); return work(); });
  queues.set(key, job);
  const completion = job.finally(() => { if (queues.get(key) === job) queues.delete(key); });
  if (!signal) return completion;
  let cancel: () => void;
  const cancelled = new Promise<never>((_resolve, reject) => {
    cancel = () => reject(signal.reason);
    if (signal.aborted) cancel();
    else signal.addEventListener('abort', cancel, { once: true });
  });
  return Promise.race([completion, cancelled]).finally(() => signal.removeEventListener('abort', cancel));
}

export async function synchronizeTasks(
  previous: TaskSnapshot | undefined,
  source: SyncSource,
  forceFull = false,
  now = Date.now(),
): Promise<{ snapshot: TaskSnapshot; mode: 'FULL' | 'DELTA' }> {
  const { items: projects, serverDate } = await source.projects();
  const projectIds = new Set(projects.map(p => p.id));
  const oldIds = new Set(previous?.projects.map(p => p.id));
  const changedProjects = projectIds.size !== oldIds.size || [...projectIds].some(id => !oldIds.has(id));
  let full = forceFull || !previous || changedProjects || now - previous.reconciledAt >= FULL_RECONCILE_MS;
  // Use Redmine's clock from the first project response, before scanning tasks.
  // If Date is unavailable, retaining the old watermark (epoch initially) is
  // slower but cannot skip new tasks because of local/server clock skew.
  const syncedAt = serverDate && Number.isFinite(Date.parse(serverDate))
    ? new Date(serverDate).toISOString() : previous?.syncedAt || new Date(0).toISOString();
  let tasks: Data[];
  if (full) {
    tasks = await source.tasks(projects);
  } else {
    const since = new Date(Math.max(0, Date.parse(previous!.syncedAt) - OVERLAP_MS)).toISOString().slice(0, 10);
    const changes = await source.tasks(projects, since);
    const merged = new Map(previous!.tasks.map(task => [task.id, task]));
    for (const task of changes) merged.set(task.id, task);
    tasks = [...merged.values()];
    // Deleted/moved/inaccessible tasks and assignee changes may not appear in
    // the delta. A fresh total detects mismatches and forces reconciliation.
    const expected = await source.count(projects);
    if (tasks.length !== expected) {
      tasks = await source.tasks(projects);
      full = true;
    }
  }
  tasks = [...tasks].sort((a, b) => b.id - a.id);
  return {
    mode: full ? 'FULL' : 'DELTA',
    snapshot: { version: 3, projects, tasks, syncedAt, reconciledAt: full ? now : previous!.reconciledAt },
  };
}

// A timed-out or slower request in another server instance must not overwrite
// a newer snapshot. Cache contents include no API keys; the key is a hash.
export const SAVE_SNAPSHOT_SCRIPT = `
local old = redis.call('GET', KEYS[1])
if old then
  local ok, data = pcall(cjson.decode, old)
  if ok and tonumber(data.generation) and tonumber(data.generation) > tonumber(ARGV[2]) then return 0 end
end
redis.call('SET', KEYS[1], ARGV[1], 'EX', 86400)
return 1
`;
