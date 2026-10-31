export class InvalidProjectIds extends Error {}

// Query: projectIds=1,2,3 or repeated projectIds=1&projectIds=2.
// Body: projectIds must be an array. An explicit empty list selects no projects.
export function parseProjectIds(value: unknown, query = false): number[] | undefined {
  if (value === undefined && query) return undefined;
  const items = query && typeof value === 'string' ? (value === '' ? [] : value.split(',')) : value;
  if (!Array.isArray(items)) throw new InvalidProjectIds('projectIds must be a list of positive integer IDs');
  const ids = items.map(item => {
    if ((typeof item !== 'number' && typeof item !== 'string') || !/^[1-9]\d*$/.test(String(item))) {
      throw new InvalidProjectIds('projectIds must contain only positive integer IDs');
    }
    const id = Number(item);
    if (!Number.isSafeInteger(id)) throw new InvalidProjectIds('Invalid project ID');
    return id;
  });
  return [...new Set(ids)].sort((a, b) => a - b);
}

// Expand the selection before applying status filters so active descendants
// remain reachable through a closed/archived intermediate project.
export function expandProjectIds(projectIds: number[], projects: Array<{ id: number; parent?: { id: number } }>): number[] {
  const children = new Map<number, number[]>();
  for (const project of projects) {
    if (!project.parent) continue;
    const siblings = children.get(project.parent.id) || [];
    siblings.push(project.id);
    children.set(project.parent.id, siblings);
  }
  const selected = new Set(projectIds);
  const queue = [...selected];
  for (let index = 0; index < queue.length; index++) {
    for (const child of children.get(queue[index]) || []) {
      if (selected.has(child)) continue;
      selected.add(child);
      queue.push(child);
    }
  }
  return [...selected].sort((a, b) => a - b);
}
