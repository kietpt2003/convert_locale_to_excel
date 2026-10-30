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

Filter selections are remembered as soon as the checkbox changes, even if that
request fails or is cancelled. The web no longer reuses a module-level task list
across Explorer mounts. Requests use the current scope ref explicitly, so Sync
after an error/remount cannot silently fall back to recent-only mode. Turning
the two-month filter off, or pressing Sync Now while it is off, forces a full
all-date fetch (`fullReload=true`). All-date requests also force full scans on
the server regardless of `reload`, so neither `created_on` nor `updated_on` is
sent in ALL mode. Late responses from abandoned scopes cannot
replace the current list.

Both web Explorers default to the enabled "Created: Last 2 Months" filter. The
checkbox can be turned off to load all dates. The cutoff is two calendar months
before the current UTC date, clamped to the final day of a shorter month; it is
based on `created_on`, not `updated_on`. Filtering happens at Redmine, not after
downloading all tasks. It combines with Only My Tasks when that box is checked.

Both webs also provide "Include Inactive Projects", default **false**. Off loads
only active project tasks; on additionally includes closed/archived projects the
account can access. This checkbox is independent of the date and assignee boxes.
Its value is sent explicitly as `includeInactiveProjects` and is part of the
snapshot scope. Active-only issue scans and count checks use the same native
project-ID filter; an empty active-project list returns no tasks without issuing
an invalid empty-ID query. Explicit custom `taskDate` searches are filtered to
active projects when building the response.

The first call loads the complete list within the selected date range. A gzip-compressed snapshot in the existing
Redis stores projects, raw tasks, and synchronization timestamps. Keys hash the
Redmine URL, API key, Only My Tasks scope and optional creation cutoff. Recent and
all-time snapshots are separate. A new cutoff date starts a separate snapshot,
so tasks that age out cannot remain indefinitely in the rolling window. Search/compact responses are built
after synchronization, so searches cannot corrupt the stored baseline.
Snapshot format/key namespace is now v3. Stored snapshots carry their exact scope
key and are rejected if it does not match the requested scope. Legacy snapshots
without provenance are rebuilt instead of being trusted.

Subsequent calls fetch current projects and issues updated since the previous
watermark, merge issues by ID, validate the total, then rebuild the tree. The
watermark uses Redmine's HTTP Date captured before scanning issues. This Redmine
installation rejects ISO timestamps with HTTP 422 (`Updated is invalid`), so the
query uses a date with a previous-day overlap for timezone safety. Repeated issues
are deduplicated by ID. A missing HTTP Date retains the older watermark instead
of advancing it using a potentially skewed local clock.

Queries without Only My Tasks have no assignee or author restriction: another person's newly
created, unassigned task appears after reload if the account can see it and its
project is in the selected active/inactive scope. Only My Tasks explicitly retains `assigned_to_id=me` and has
a separate snapshot. When inactive projects are included, the issues API is authoritative: queries do not restrict
`project_id` to the projects listed by a separate endpoint. Project metadata is
fetched for active (1), closed (5), and archived (9) states; `status='*' on the
projects endpoint is unsupported by this installation. If a visible issue refers
to an unlisted project, its own project metadata is used to retain the task as a
root project instead of silently discarding it. New project access triggers a full scan to include older
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
were 9.7 seconds with the two-month filter enabled versus 49.7 seconds for all dates.
Incremental reloads are much faster. Redmine offset pagination has no
snapshot isolation; changes during a multi-page scan may require another reload.

## Parameters and diagnostics

- `reload`: every request revalidates upstream. With the recent filter off, the
  server always performs a complete all-date scan without date parameters.
- `fullReload=true`: explicitly rebuild the complete snapshot.
- `onlyShowMyTasks=true`: restrict to assigned-to-me tasks. Leave false to include
  other people's and unassigned tasks.
- `includeInactiveProjects=true`: include closed/archived projects. Default false
  restricts results to active project tasks, independently of the date filter.
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
is 20 seconds. The request budget, including queue time, is 110 seconds. A finite per-load
AbortSignal listener budget matches the request budget without changing global
limits. Errors log timing/code/status without Axios config or credentials.
The Node response close event aborts abandoned scans; cancelled queued requests
reject immediately and never start another Redmine scan.

`vercel.json` explicitly enables Fluid compute; the static `config` export in
`src/index.ts` sets the function duration to 300 seconds, leaving room for the
request budget and response overhead. The existing legacy builds entry/routes
are retained. These settings take effect only after redeploying the server.
Vercel documents Fluid configuration and duration limits at
https://vercel.com/docs/fluid-compute and
https://vercel.com/docs/functions/configuring-functions/duration.

`X-Redmine-Sync` reports `FULL` or `DELTA`; `X-Redmine-Cache: REVALIDATED` means
the response checked upstream. `X-Redmine-Scope` identifies all/mine and the exact
creation cutoff or `all-dates`, including error responses after scope resolution.
Timeout JSON distinguishes `REDMINE_SYNC_DEADLINE` from
`REDMINE_UPSTREAM_TIMEOUT`; a Vercel platform timeout instead has platform headers.
`Server-Timing` includes server lookup, sync and
tree building, but excludes response serialization, download and rendering.

## Validation

```sh
./node_modules/.bin/tsc --noEmit
node --import tsx --test tests/redmineTaskSync.test.ts tests/redmineTreeV2.test.ts tests/redmineTreeV2.http.test.ts
```

Authenticated live HTTP checks against the configured administrator's Redmine:

| Mode | Sync | HTTP | Duration | Returned tasks |
| --- | --- | --- | --- | --- |
| Two-month filter enabled, inactive included, initial snapshot | FULL | 200 | 9.7 s | 2,124 |
| Date filter disabled, inactive included | FULL | 200 | 49.7 s | 10,940 |
| Date filter re-enabled, inactive included | DELTA | 200 | 3.2 s | 2,124 |

Inactive checkbox live toggle verification (two-month date filter enabled):

| Include inactive | Projects | Tasks | HTTP | Sync duration |
| --- | --- | --- | --- | --- |
| false (default) | 41 | 2,103 | 200 | 3.10 s (delta) |
| true | 69 | 2,124 | 200 | 10.36 s (full) |
| false again | 41 | 2,103 | 200 | 3.13 s (delta) |

The former 7,528-task total was incomplete: only 41 active projects were loaded,
discarding tasks in 28 closed projects. The corrected ALL response includes
69 projects and matches the unrestricted Redmine issues `total_count` of 10,940.
The compact ALL payload is 3,133,762 bytes; the two-month payload is 605,299 bytes.
Web project badges now count nested subtasks and subprojects, and Explorer shows
the total task/project count for the currently displayed tree. Previously badges
counted only root tasks, which also understated the apparent number of tasks.

These latest measurements use the fixed server locally against the actual
Redmine. Before the fix, direct production API scope tests also returned HTTP
200 and the expected counts; the intermittent 504 was not reproduced in that
run. Runtime-log access via the Vercel connector returned a team authorization
error, so its exact production cause remains unconfirmed. The new deployment
settings have not been published or verified on Vercel.

The HTTP regression fixture creates a task from another author with no assignee
between loads and verifies it appears after delta reload while the two-month
filter is enabled. Disabling the filter restores the older parent and nesting;
re-enabling returns only recent tasks. Tests also check month-end/leap-year
cutoffs, snapshot provenance, cancellation while queued, scope isolation and no
assignee restriction in all-task mode. All 27
tests pass. No real Redmine task was created or
modified for testing. Other tests cover failure/retry, deletion/count mismatch,
project access changes, expiry, clock fallback, overlapping reloads, snapshot
compression and listener cleanup with actual Axios HTTP requests.

An additional real React DOM smoke test loads the actual web component and API
service in jsdom. It verifies inactive defaults to false, independent inactive/date
toggles, Sync preserving both scopes, nested task/project totals, default recent mode, disabling the filter, a 504,
remount, Sync all, rapid toggles and an out-of-order recent response. To run it
without adding dependencies to either repository:

```sh
npm install --prefix /private/tmp/redmine-scope-ui-check --no-package-lock --ignore-scripts jsdom@26.1.0
node --require ../my-only-tool/.pnp.cjs tests/webExplorerScope.smoke.cjs ../my-only-tool /private/tmp/redmine-scope-ui-check/node_modules/jsdom
```

Direct Chrome interaction/layout has not been verified. Web TypeScript and production
Webpack build pass; Webpack retains existing bundle/image size warnings.
