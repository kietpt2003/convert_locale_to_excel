# Redmine project/tasks v2

Deploy the server before the updated `my-only-tool` web bundle. The old
`GET /api/redmine/projects/tasks` remains available.

`GET /api/redmine/v2/projects/tasks` keeps the JWT/premium checks and array
response (`tasks`, `subtasks`, `subProjects`). All Redmine data is obtained using
the account's existing API key; no Redmine database connection is required.

## Reload behavior

Every call checks Redmine, including `reload=false`. Both web Explorers now call
the API again when reopened; a module-level browser cache cannot suppress the
freshness check. Request cancellation on `my-only-tool` prevents obsolete browser
responses from replacing the selected scope.

Both web Explorers default to the enabled "Created: Last 2 Months" filter. The
checkbox can be turned off to load all dates. The cutoff is two calendar months
before the current UTC date, clamped to the final day of a shorter month; it is
based on `created_on`, not `updated_on`. Filtering happens at Redmine, not after
downloading all tasks. It combines with Only My Tasks when that box is checked.

The first call loads the complete list within the selected date range. A gzip-compressed snapshot in the existing
Redis stores projects, raw tasks, and synchronization timestamps. Keys hash the
Redmine URL, API key, Only My Tasks scope and optional creation cutoff. Recent and
all-time snapshots are separate. A new cutoff date starts a separate snapshot,
so tasks that age out cannot remain indefinitely in the rolling window. Search/compact responses are built
after synchronization, so searches cannot corrupt the stored baseline.

Subsequent calls fetch current projects and issues updated since the previous
watermark, merge issues by ID, validate the total, then rebuild the tree. The
watermark uses Redmine's HTTP Date captured before scanning issues. This Redmine
installation rejects ISO timestamps with HTTP 422 (`Updated is invalid`), so the
query uses a date with a previous-day overlap for timezone safety. Repeated issues
are deduplicated by ID. A missing HTTP Date retains the older watermark instead
of advancing it using a potentially skewed local clock.

All-task queries have no assignee or author restriction: another person's newly
created, unassigned task appears after reload if the account can see it and its
project is active. Only My Tasks explicitly retains `assigned_to_id=me` and has
a separate snapshot. New project access triggers a full scan to include older
issues that have not themselves been updated recently.

Reloads for the same snapshot are serialized, not joined to an older in-flight
scan, so a later reload performs its own freshness check. Failed pages never
advance the stored watermark or return success with stale data. An atomic Redis
write prevents an older concurrent generation from overwriting a newer snapshot.
Redis reads/writes have a one-second budget; a Redis outage falls back to a full
Redmine load rather than preventing access.

## Reconciliation and limits

A fresh count detects most deletions, moves out of scope and visibility changes;
a mismatch triggers a full scan. Counts cannot detect every equal-count visibility
swap. A full scan therefore runs at least every five minutes, preserving the old
cache's maximum reconciliation interval. The snapshot has a one-day storage TTL;
this is not permission to serve it without checking Redmine.

Initial loads, expired reconciliation intervals, changed project access, and count
mismatches still require a full scan of the selected date range. Live measurements
were 9.8 seconds with the two-month filter enabled versus 33.9 seconds for all dates.
Incremental reloads are much faster. Redmine offset pagination has no
snapshot isolation; changes during a multi-page scan may require another reload.

## Parameters and diagnostics

- `reload`: retained for compatibility; every request revalidates upstream.
- `fullReload=true`: explicitly rebuild the complete snapshot.
- `onlyShowMyTasks=true`: restrict to assigned-to-me tasks. Leave false to include
  other people's and unassigned tasks.
- `recentOnly=true`: restrict `created_on` to the last two calendar months in
  full scans, delta scans and count checks. Both webs send true by default.
  False/omitted keeps all dates for compatibility with existing API clients.
  An explicit `taskDate` takes precedence over this convenience filter.
- `taskName`, `projectName`: retain existing tree filtering behavior.
- `taskDate`: retain the original Redmine `created_on` operators through a direct
  query, rather than approximating them in local storage.
- `compact=true`: retain Explorer fields only; omit for full issue fields.

`REDMINE_TREE_CONCURRENCY` defaults to 1 (range 1–32). Live tuning showed that
raising concurrency can slow this Redmine instance substantially. Request timeout
is 20 seconds and upstream work has a 60-second deadline. A finite per-load
AbortSignal listener budget matches the request budget without changing global
limits. Errors log timing/code/status without Axios config or credentials.

`X-Redmine-Sync` reports `FULL` or `DELTA`; `X-Redmine-Cache: REVALIDATED` means
the response checked upstream. `Server-Timing` includes server lookup, sync and
tree building, but excludes response serialization, download and rendering.

## Validation

```sh
./node_modules/.bin/tsc --noEmit
node --import tsx --test tests/redmineTaskSync.test.ts tests/redmineTreeV2.test.ts tests/redmineTreeV2.http.test.ts
```

Authenticated live HTTP checks against the configured administrator's Redmine:

| Mode | Sync | HTTP | Duration | Returned tasks |
| --- | --- | --- | --- | --- |
| Two-month filter enabled, initial snapshot | FULL | 200 | 9.8 s | 2,102 |
| Two-month filter enabled, reload | DELTA | 200 | 3.2 s | 2,102 |
| Filter disabled, all dates | FULL | 200 | 33.9 s | 7,527 |
| Filter re-enabled after all dates | DELTA | 200 | 2.9 s | 2,102 |
| Two months and Only My Tasks | FULL | 200 | 0.94 s | 65 |
| Two months and Only My Tasks, reload | DELTA | 200 | 0.95 s | 65 |

The compact payload dropped from 2,154,769 bytes to 596,291 bytes (about 72%).

The HTTP regression fixture creates a task from another author with no assignee
between loads and verifies it appears after delta reload while the two-month
filter is enabled. Disabling the filter restores the older parent and nesting;
re-enabling returns only recent tasks. Tests also check month-end/leap-year
cutoffs, scope isolation and no assignee restriction in all-task mode. All 22
tests pass. No real Redmine task was created or
modified for testing. Other tests cover failure/retry, deletion/count mismatch,
project access changes, expiry, clock fallback, overlapping reloads, snapshot
compression and listener cleanup with actual Axios HTTP requests.

The existing Chrome tab cannot be controlled while JavaScript from Apple Events
is disabled. Live verification covers HTTP, server middleware, Redis and Redmine;
direct browser interaction has not been verified. Web TypeScript and production
Webpack build pass; Webpack retains existing bundle/image size warnings.
