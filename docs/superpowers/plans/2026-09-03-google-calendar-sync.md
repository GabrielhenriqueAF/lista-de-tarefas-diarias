# Google Calendar Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add manual bidirectional synchronization between routine rules/Blocks and the Google Calendar named Rotina Gabriel.

**Architecture:** Google access lives exclusively in Electron's main process through an adapter interface. The sync service sends local queue operations first, then imports incremental Google changes and compares timestamps for conflicts. Tests use a fake adapter, so automated checks require no account or secret.

**Tech Stack:** Electron, Node.js, SQLite, googleapis, OAuth 2.0 desktop flow and Vitest.

**Spec:** `docs/superpowers/specs/2026-09-03-rotina-completa-design.md`

## Global Constraints

- The calendar summary is exactly `Rotina Gabriel`.
- Credentials and tokens live in application user data and are ignored by Git.
- Google events use `America/Sao_Paulo`, explicit `-03:00`, `useDefault: false` and popup reminders at 60 and 10 minutes.
- No token, OAuth client or Google API object crosses preload.
- Sync always pushes local queue before incremental remote import.
- A deleted Google event cancels its local rule/Block without erasing completed data.

---

### Task 1: Isolate OAuth and Google Calendar adapter

**Files:**
- Modify: `package.json`
- Create: `src/main/google/google-auth.js`
- Create: `src/main/google/google-adapter.js`
- Create: `tests/main/google-auth.test.js`

**Interfaces:**
- Produces `createGoogleAuth({ credentialsPath, tokenPath, openExternal })`.
- Produces adapter methods `listCalendars`, `createCalendar`, `listEvents`, `insertEvent`, `patchEvent`, `deleteEvent`.

- [ ] **Step 1: Write the failing path test**

```js
it('stores the OAuth token under application data', () => {
  const auth = createGoogleAuth({ credentialsPath: 'C:/app/credentials.json', tokenPath: 'C:/app/data/google-token.json', openExternal: async () => {} });
  expect(auth.tokenPath).toBe('C:/app/data/google-token.json');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- --run tests/main/google-auth.test.js`

Expected: FAIL because the Google auth module does not exist.

- [ ] **Step 3: Install and implement the adapter**

```bash
npm install googleapis
```

```js
export function createGoogleAdapter(calendarApi) {
  return {
    listCalendars: () => calendarApi.calendarList.list(),
    createCalendar: (summary) => calendarApi.calendars.insert({ requestBody: { summary } }),
    listEvents: (calendarId, params) => calendarApi.events.list({ calendarId, ...params }),
    insertEvent: (calendarId, requestBody) => calendarApi.events.insert({ calendarId, requestBody }),
    patchEvent: (calendarId, eventId, requestBody) => calendarApi.events.patch({ calendarId, eventId, requestBody }),
    deleteEvent: (calendarId, eventId) => calendarApi.events.delete({ calendarId, eventId })
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- --run tests/main/google-auth.test.js`

Expected: PASS; paths are explicit and no token is created in the repository.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json src/main/google tests/main/google-auth.test.js
git commit -m "feat: add isolated Google Calendar client"
```

### Task 2: Discover Rotina Gabriel and build event payloads

**Files:**
- Create: `src/main/google/calendar-service.js`
- Create: `tests/main/calendar-service.test.js`

**Interfaces:**
- Produces `ensureRoutineCalendar(): Promise<string>`, `eventForRule(rule)`, `eventForBlock(block)`.

- [ ] **Step 1: Write the failing reminder and RRULE test**

```js
it('builds a Tuesday Writing event with two reminders', () => {
  const event = eventForRule({ id: 8, title: 'Inglês — Writing', weekdays: [2], startTime: '05:00', endTime: '08:00', updatedAt: '2026-09-03T10:00:00Z' });
  expect(event).toMatchObject({
    recurrence: ['RRULE:FREQ=WEEKLY;BYDAY=TU'],
    reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 60 }, { method: 'popup', minutes: 10 }] }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- --run tests/main/calendar-service.test.js`

Expected: FAIL because calendar payload building does not exist.

- [ ] **Step 3: Implement calendar discovery and builder**

```js
const DAY_CODES = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
export function eventForRule(rule) {
  return {
    summary: rule.title,
    start: { dateTime: `2026-01-05T${rule.startTime}:00-03:00`, timeZone: 'America/Sao_Paulo' },
    end: { dateTime: `2026-01-05T${rule.endTime}:00-03:00`, timeZone: 'America/Sao_Paulo' },
    recurrence: [`RRULE:FREQ=WEEKLY;BYDAY=${rule.weekdays.map((day) => DAY_CODES[day]).join(',')}`],
    reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 60 }, { method: 'popup', minutes: 10 }] },
    extendedProperties: { private: { recurrenceRuleId: String(rule.id), localUpdatedAt: rule.updatedAt } }
  };
}
```

`ensureRoutineCalendar` reuses the saved calendar id, otherwise finds a calendar by summary or inserts one and saves its id.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- --run tests/main/calendar-service.test.js`

Expected: PASS; calendar creation occurs only when Rotina Gabriel is absent.

- [ ] **Step 5: Commit**

```bash
git add src/main/google/calendar-service.js tests/main/calendar-service.test.js
git commit -m "feat: build routine calendar events"
```

### Task 3: Add queue and bidirectional sync service

**Files:**
- Create: `src/main/sync-repository.js`
- Create: `src/main/google/sync-service.js`
- Create: `tests/main/sync-service.test.js`

**Interfaces:**
- Produces `queue.enqueue(operation)`, `pending()`, `markDone(id)`.
- Produces `syncNow(): Promise<{ pushed, imported, cancelled, conflicts, lastSyncedAt }>`.

- [ ] **Step 1: Write failing remote deletion and conflict tests**

```js
it('cancels a linked Block when its remote event is deleted', async () => {
  fakeGoogle.listEvents.mockResolvedValue({ items: [{ id: 'g-1', status: 'cancelled', updated: '2026-09-04T12:00:00Z', extendedProperties: { private: { blockId: '3' } } }] });
  const result = await sync.syncNow();
  expect(result.cancelled).toBe(1);
  expect(blocks.get(3).status).toBe('cancelled');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- --run tests/main/sync-service.test.js`

Expected: FAIL because queue and sync service do not exist.

- [ ] **Step 3: Implement push-first incremental sync**

```js
export async function syncNow() {
  const calendarId = await calendarService.ensureRoutineCalendar();
  for (const operation of queue.pending()) await pushOperation(calendarId, operation);
  const response = await google.listEvents(calendarId, { syncToken: state.getToken(), showDeleted: true, singleEvents: false });
  for (const event of response.items) importEvent(event);
  state.setToken(response.nextSyncToken, new Date().toISOString());
  return summary;
}
```

`importEvent` compares local `updatedAt` against `event.updated`; it imports only newer date/time/title fields. Notes, checklists, Track and Front continuity remain local.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- --run tests/main/sync-service.test.js`

Expected: PASS; linked events PATCH rather than duplicate, newest schedulable value wins and remote removal cancels locally.

- [ ] **Step 5: Commit**

```bash
git add src/main/sync-repository.js src/main/google/sync-service.js tests/main/sync-service.test.js
git commit -m "feat: synchronize routine calendar bidirectionally"
```

### Task 4: Expose manual sync and settings UI

**Files:**
- Modify: `src/main/ipc.js`
- Modify: `src/preload.js`
- Create: `src/renderer/views/settings-view.js`
- Modify: `src/renderer/app.js`
- Modify: `tests/main/ipc.test.js`
- Modify: `tests/renderer/render.test.js`

**Interfaces:**
- Exposes `window.routineApi.google.connect()`, `syncNow()` and `status()`.
- Produces `renderSettingsView(root, state)`.

- [ ] **Step 1: Write the failing sync-button test**

```js
it('renders a Google sync button and Rotina Gabriel state', () => {
  renderSettingsView(document.querySelector('#app'), { calendarName: 'Rotina Gabriel', lastSyncedAt: '2026-09-03T12:00:00Z', connected: true });
  expect(document.querySelector('[data-action="sync-google"]')).not.toBeNull();
  expect(document.body.textContent).toContain('Rotina Gabriel');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- --run tests/renderer/render.test.js`

Expected: FAIL because settings and Google bridge do not exist.

- [ ] **Step 3: Implement connection, status and recoverable action**

```js
button.addEventListener('click', async () => {
  button.disabled = true;
  status.textContent = 'Sincronizando…';
  try { status.textContent = `Sincronizado: ${(await window.routineApi.google.syncNow()).lastSyncedAt}`; }
  catch (error) { status.textContent = `Não foi possível sincronizar: ${error.message}`; }
  finally { button.disabled = false; }
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- --run tests/main/ipc.test.js tests/renderer/render.test.js`

Expected: PASS; renderer can request only auth/status/sync and receives readable failures.

- [ ] **Step 5: Commit**

```bash
git add src/main/ipc.js src/preload.js src/renderer/views/settings-view.js src/renderer/app.js tests/main/ipc.test.js tests/renderer/render.test.js
git commit -m "feat: add Google sync controls"
```

### Task 5: Document OAuth configuration and verify with Gabriel's account

**Files:**
- Create: `docs/google-oauth-setup.md`
- Modify: `README.md`
- Modify: `.gitignore`

- [ ] **Step 1: Document required Google Cloud setup**

```markdown
1. Create or select a Google Cloud project.
2. Enable Google Calendar API.
3. Configure OAuth consent for the account that owns Rotina Gabriel.
4. Create Desktop app OAuth credentials.
5. Put the downloaded JSON as credentials.json in the user-data path shown in Configurações.
6. Restart and click Conectar ao Google.
```

- [ ] **Step 2: Verify ignored private paths**

Run: `git check-ignore credentials.json token.json backups/example.db`

Expected: every path is ignored.

- [ ] **Step 3: Run complete automated verification**

Run: `npm test -- --run && npm run rebuild && npm run start`

Expected: all fake-Google tests pass and Electron opens without an account token until Gabriel authorizes.

- [ ] **Step 4: Perform the authorized manual test**

Create one Writing rule, click sync, authorize in Chrome, verify two reminders in Rotina Gabriel, alter its time in Google, click sync and confirm local rule time changes.

- [ ] **Step 5: Commit**

```bash
git add docs/google-oauth-setup.md README.md .gitignore
git commit -m "docs: add Google Calendar authorization guide"
```

