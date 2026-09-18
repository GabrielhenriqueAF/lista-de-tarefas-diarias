# Daymint Remote Routines Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move routine data to PostgreSQL behind Workspace-scoped API routes while preserving the existing Electron flow during a controlled import.

**Architecture:** The `server/routines` module owns PostgreSQL records, recurrence materialization, and Workspace isolation. Electron gains a typed API client through the preload and migrates one Workspace from the existing SQLite export only after the user explicitly starts import. SQLite stays available as a local backup/cache throughout this phase.

**Tech Stack:** Existing Electron 44 / vanilla renderer / better-sqlite3, Node.js 24, Fastify, PostgreSQL, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-17-daymint-platform-design.md`

## Global Constraints

- Do not delete or overwrite the existing SQLite database during import.
- Every routine query requires verified Workspace membership.
- Preserve the existing Activity → Front → Rule → Block → Checklist and Track semantics.
- Rules materialize blocks only once per rule/date and only within their inclusive date period.
- Do not add billing enforcement until the Daymint billing plan is implemented.

---

### Task 1: Add Workspace-scoped routine schema and repositories

**Files:**
- Create: `server/src/database/migrations/002_routines.sql`
- Create: `server/src/routines/routine-repository.js`
- Create: `server/src/routines/date.js`
- Create: `server/tests/routines/routine-repository.test.js`

**Interfaces:**
- Produces `createActivity`, `createFront`, `createRule`, `createAdHocBlock`, `listWeek`, `listToday`, `startBlock`, `finishBlock`, and `listChecklist`.
- Produces `dateForWeekday(weekStart, weekday): string`.
- All repository methods accept `workspaceId` as their first argument.

- [ ] **Step 1: Write failing repository tests for materialization and isolation**

```js
it('materializes a Workspace rule once without returning another Workspace data', async () => {
  const first = await routines.createActivity(workspaceA, { name: 'Inglês', color: '#2563eb' });
  await routines.createRule(workspaceA, { activityId: first.id, title: 'Writing', weekdays: [2], startTime: '05:00', endTime: '06:00' });
  await routines.listWeek(workspaceA, '2026-09-07');
  await routines.listWeek(workspaceA, '2026-09-07');
  expect(await routines.listWeek(workspaceB, '2026-09-07')).toEqual([]);
  expect(await countBlocksForWorkspace(workspaceA)).toBe(1);
});
```

- [ ] **Step 2: Run the focused repository test and verify it fails**

Run: `npm test -- --run tests/routines/routine-repository.test.js` from `server/`.

Expected: FAIL because migration 002 and the routine repository do not exist.

- [ ] **Step 3: Create migration 002 and focused repository implementation**

Create `activities`, `fronts`, `recurrence_rules`, `blocks`, `block_checklist_items`, and `track_items`, each with UUID primary keys and `workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE` where applicable. Add unique constraints `(recurrence_rule_id, date)` and `(block_id, position)`. Every SQL statement must include `workspace_id = $1` when selecting or mutating a Workspace-owned root resource.

- [ ] **Step 4: Preserve current execution behavior in tests**

Add a test that starts then finishes a block and verifies its Front receives `current_point` and `next_step`; add a test that only completed blocks contribute `realMinutes` to history.

- [ ] **Step 5: Run all server tests**

Run: `npm test -- --run` from `server/`.

Expected: PASS with both routine behavior and Workspace isolation covered.

- [ ] **Step 6: Commit remote routine persistence**

```bash
git add server/src/database/migrations/002_routines.sql server/src/routines server/tests/routines
git commit -m "feat: persist routines per Daymint workspace"
```

### Task 2: Expose authenticated routine routes

**Files:**
- Create: `server/src/routines/routine-service.js`
- Create: `server/src/routines/routine-routes.js`
- Create: `server/tests/routines/routine-routes.test.js`
- Modify: `server/src/app.js`

**Interfaces:**
- Exposes `GET/POST /workspaces/:workspaceId/activities`.
- Exposes `GET/POST /workspaces/:workspaceId/rules` and `GET /workspaces/:workspaceId/week?start=YYYY-MM-DD`.
- Exposes `GET /workspaces/:workspaceId/today?date=YYYY-MM-DD`, `POST /workspaces/:workspaceId/blocks/:blockId/start`, and `POST /workspaces/:workspaceId/blocks/:blockId/finish`.

- [ ] **Step 1: Write failing HTTP tests for member access and foreign IDs**

```js
it('returns 404 when a member tries to finish a Block from another Workspace', async () => {
  const response = await app.inject({
    method: 'POST', url: `/workspaces/${workspaceA.id}/blocks/${workspaceBBlock.id}/finish`,
    headers: bearer(ownerA.token), payload: finishPayload
  });
  expect(response.statusCode).toBe(404);
});
```

- [ ] **Step 2: Run route tests and verify they fail**

Run: `npm test -- --run tests/routines/routine-routes.test.js` from `server/`.

Expected: FAIL because routine routes are not registered.

- [ ] **Step 3: Implement route validation and service methods**

Validate ISO dates, non-empty names, weekday array, `HH:MM` times, and valid finish reasons before reaching repositories. Every route must call `request.requireWorkspaceMembership(workspaceId, 'member')`. Route error mapping must return `404` for resource IDs outside the Workspace and `422` for invalid input.

- [ ] **Step 4: Run route tests and full server suite**

Run: `npm test -- --run tests/routines/routine-routes.test.js`, then `npm test -- --run` from `server/`.

Expected: PASS.

- [ ] **Step 5: Commit routine HTTP API**

```bash
git add server/src/routines/routine-service.js server/src/routines/routine-routes.js server/src/app.js server/tests/routines/routine-routes.test.js
git commit -m "feat: expose workspace routine API"
```

### Task 3: Add non-destructive SQLite export and server import

**Files:**
- Create: `src/main/daymint-export.js`
- Create: `server/src/routines/import-service.js`
- Create: `server/tests/routines/import-service.test.js`
- Create: `tests/main/daymint-export.test.js`

**Interfaces:**
- Produces `exportLocalRoutine(database): LocalRoutineExport` with activities, fronts, rules, blocks, checklists, and track items.
- Produces `importLocalRoutine({ workspaceId, exportData }): { imported: Record<string, number> }`.
- Import receives one-time data only; it does not delete local SQLite rows or existing remote rows.

- [ ] **Step 1: Write failing export/import tests using current SQLite fixtures**

```js
expect(exportLocalRoutine(database)).toMatchObject({
  activities: [{ name: 'Inglês' }],
  rules: [{ title: 'Inglês — Writing' }],
  blocks: [{ status: 'completed' }]
});
await expect(importLocalRoutine({ workspaceId, exportData })).resolves.toMatchObject({
  imported: { activities: 1, rules: 1, blocks: 1 }
});
```

- [ ] **Step 2: Run tests and verify they fail**

Run: `npm test -- --run tests/main/daymint-export.test.js` from the repository root and `npm test -- --run tests/routines/import-service.test.js` from `server/`.

Expected: FAIL because export/import modules do not exist.

- [ ] **Step 3: Implement a transaction-safe importer**

Map old SQLite IDs to newly created PostgreSQL UUIDs in memory. Insert Activities, then Fronts, Rules, Blocks, checklist items, and track items in one PostgreSQL transaction. Reject imports into a Workspace that already has routine rows with HTTP 409; this prevents accidental duplication. Return counts only, never raw SQLite data.

- [ ] **Step 4: Run export/import and existing desktop tests**

Run: `npm test -- --run tests/main/daymint-export.test.js` from root, `npm test -- --run tests/routines/import-service.test.js` from `server/`, then both complete suites.

Expected: PASS; SQLite fixture remains unchanged after export.

- [ ] **Step 5: Commit safe migration utilities**

```bash
git add src/main/daymint-export.js tests/main/daymint-export.test.js server/src/routines/import-service.js server/tests/routines/import-service.test.js
git commit -m "feat: import local routines into Daymint"
```

### Task 4: Connect Electron through a secure API client after explicit import

**Files:**
- Create: `src/main/daymint-client.js`
- Modify: `src/main/index.js`
- Modify: `src/preload.js`
- Create: `tests/main/daymint-client.test.js`
- Create: `tests/main/daymint-preload.test.js`

**Interfaces:**
- Produces `createDaymintClient({ baseUrl, tokenStore, fetch })`.
- Exposes `window.daymintApi.auth`, `window.daymintApi.workspaces`, and `window.daymintApi.routines` without exposing tokens.
- Existing `window.routineApi` remains operational until the user completes import and selects a remote Workspace.

- [ ] **Step 1: Write failing tests for no-token exposure and API error mapping**

```js
expect(Object.keys(exposedApi)).not.toContain('token');
await expect(client.routines.listWeek('workspace-1', '2026-09-07')).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
```

- [ ] **Step 2: Run Electron client tests and verify they fail**

Run: `npm test -- --run tests/main/daymint-client.test.js tests/main/daymint-preload.test.js` from the repository root.

Expected: FAIL because the Daymint client and preload bridge do not exist.

- [ ] **Step 3: Implement the secure client boundary**

Store the bearer token through Electron `safeStorage` in the main process. Preload methods invoke named IPC handlers only; renderer code cannot read the token. Preserve existing routine API methods and add an explicit “migrate and switch Workspace” operation instead of automatically changing data sources.

- [ ] **Step 4: Run focused and full desktop/server tests**

Run: `npm test -- --run` from repository root and from `server/`.

Expected: PASS with original local mode unchanged.

- [ ] **Step 5: Commit controlled Electron connection**

```bash
git add src/main/daymint-client.js src/main/index.js src/preload.js tests/main/daymint-client.test.js tests/main/daymint-preload.test.js
git commit -m "feat: connect desktop to Daymint API"
```
