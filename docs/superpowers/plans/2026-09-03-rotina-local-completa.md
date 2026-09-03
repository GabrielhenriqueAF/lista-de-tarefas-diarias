# Rotina Local Completa Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the local Electron app around Activities, Fronts, Blocks and Track items, with durable SQLite persistence, theme, backups, templates and reports.

**Architecture:** SQLite is the source of truth. Repositories own aggregates; the Electron main process validates IPC; renderer views only receive plain data through preload. Recurrence rules materialize dated Blocks, keeping the planned routine separate from real execution.

**Tech Stack:** Node.js, Electron, better-sqlite3, Vitest, HTML, CSS, JavaScript and native SVG.

**Spec:** `docs/superpowers/specs/2026-09-03-rotina-completa-design.md`

## Global Constraints

- Store the database in `app.getPath('userData')`.
- Gabriel authorized a one-time reset of the previous local schema.
- Keep `contextIsolation: true` and `nodeIntegration: false`.
- Insert user text with DOM nodes and `textContent`, never raw `innerHTML`.
- Use `America/Sao_Paulo` for schedule calculations.
- Persist theme and sync state in SQLite.
- Make a local backup before a legacy reset and once per day when the application opens.
- Ignore databases, backups, credentials and tokens in Git.

---

### Task 1: Replace the legacy schema with versioned routine tables

**Files:**
- Create: `src/main/migrations.js`
- Modify: `src/main/database.js`
- Modify: `tests/main/repositories.test.js`

**Interfaces:**
- Produces `createDatabase(filename): Database`, `runMigrations(database): void`, `schemaVersion(database): number`.
- Creates `activities`, `fronts`, `recurrence_rules`, `blocks`, `block_checklist_items`, `track_items`, `settings`, `sync_state`, `sync_queue` and `schema_migrations`.

- [ ] **Step 1: Write the failing migration test**

```js
it('creates an empty versioned routine database', () => {
  const database = createDatabase(':memory:');
  expect(schemaVersion(database)).toBe(1);
  expect(database.prepare('SELECT count(*) AS total FROM activities').get().total).toBe(0);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- --run tests/main/repositories.test.js`

Expected: FAIL because versioned migrations and `activities` do not exist.

- [ ] **Step 3: Implement the migration**

```js
export function runMigrations(database) {
  database.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)');
  const applied = database.prepare('SELECT version FROM schema_migrations').all().map((row) => row.version);
  if (!applied.includes(1)) {
    database.transaction(() => {
      database.exec('DROP TABLE IF EXISTS progress_entries; DROP TABLE IF EXISTS sessions; DROP TABLE IF EXISTS weekly_schedules; DROP TABLE IF EXISTS tasks;');
      database.exec(ROUTINE_SCHEMA_SQL);
      database.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (1, ?)').run(new Date().toISOString());
    })();
  }
}
```

`ROUTINE_SCHEMA_SQL` defines all tables from the interface, foreign keys and a unique `(recurrence_rule_id, date)` on Blocks.

- [ ] **Step 4: Run the repository suite**

Run: `npm test -- --run tests/main/repositories.test.js`

Expected: PASS; a new database has the versioned tables once.

- [ ] **Step 5: Commit**

```bash
git add src/main/migrations.js src/main/database.js tests/main/repositories.test.js
git commit -m "feat: add versioned routine schema"
```

### Task 2: Persist Activities and Fronts

**Files:**
- Create: `src/main/activity-repository.js`
- Create: `src/main/front-repository.js`
- Modify: `src/shared/domain.js`
- Modify: `tests/main/repositories.test.js`

**Interfaces:**
- Produces `activities.create(input)`, `update(input)`, `listActive()`, `archive(id)`.
- Produces `fronts.create(input)`, `update(input)`, `get(id)`, `listByActivity(activityId)`.
- `Activity = { id, name, category, color, weeklyGoalMinutes, active, createdAt, updatedAt }`.
- `Front = { id, activityId, name, currentPoint, nextStep, defaultWeekday, weeklyGoalMinutes, active, createdAt, updatedAt }`.

- [ ] **Step 1: Write the failing repository test**

```js
it('stores a Front and its continuity beneath an Activity', () => {
  const english = activities.create({ name: 'Inglês', category: 'Estudo', color: '#2563eb', weeklyGoalMinutes: 600 });
  const writing = fronts.create({ activityId: english.id, name: 'Writing', currentPoint: 'Unidade 3', nextStep: 'Exercício 13', defaultWeekday: 2 });
  expect(fronts.get(writing.id)).toMatchObject({ activityId: english.id, nextStep: 'Exercício 13' });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- --run tests/main/repositories.test.js`

Expected: FAIL because Activity and Front repositories do not exist.

- [ ] **Step 3: Implement prepared-statement repositories**

```js
export function assertNonEmpty(value, label) {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${label} é obrigatório.`);
}
create(input) {
  assertNonEmpty(input.name, 'Nome');
  const timestamp = new Date().toISOString();
  const result = insert.run({ ...input, name: input.name.trim(), timestamp });
  return mapRow(findById.get(result.lastInsertRowid));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- --run tests/main/repositories.test.js`

Expected: PASS; SQLite rejects a Front without its Activity.

- [ ] **Step 5: Commit**

```bash
git add src/main/activity-repository.js src/main/front-repository.js src/shared/domain.js tests/main/repositories.test.js
git commit -m "feat: manage activities and fronts"
```

### Task 3: Add recurrence rules and materialized Blocks

**Files:**
- Create: `src/main/routine-repository.js`
- Modify: `src/shared/domain.js`
- Modify: `tests/main/repositories.test.js`

**Interfaces:**
- Produces `rules.create(input)`, `update(input)`, `listWeek(weekStart)`, `ensureBlocksForWeek(weekStart)`.
- `Block` carries planned/real timestamps, Activity, optional Front, status, note, reason and continuation point.

- [ ] **Step 1: Write the failing materialization test**

```js
it('materializes Tuesday Writing only once', () => {
  const rule = rules.create({ activityId: english.id, frontId: writing.id, weekdays: [2], startTime: '05:00', endTime: '08:00', title: 'Inglês — Writing', checklistTemplate: [] });
  expect(rules.ensureBlocksForWeek('2026-09-07')).toMatchObject([{ recurrenceRuleId: rule.id, date: '2026-09-08', status: 'planned' }]);
  expect(rules.ensureBlocksForWeek('2026-09-07')).toHaveLength(1);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- --run tests/main/repositories.test.js`

Expected: FAIL because no rule can create a dated Block.

- [ ] **Step 3: Implement idempotent Block creation**

```js
function ensureBlock(rule, date) {
  const existing = findByRuleAndDate.get(rule.id, date);
  if (existing) return mapBlock(existing);
  const result = insertBlock.run({ recurrenceRuleId: rule.id, activityId: rule.activity_id, frontId: rule.front_id, date, plannedStartAt: `${date}T${rule.start_time}:00`, plannedEndAt: `${date}T${rule.end_time}:00`, status: 'planned', updatedAt: new Date().toISOString() });
  return mapBlock(findBlock.get(result.lastInsertRowid));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- --run tests/shared/domain.test.js tests/main/repositories.test.js`

Expected: PASS; the unique rule/date constraint prevents duplicate Blocks.

- [ ] **Step 5: Commit**

```bash
git add src/main/routine-repository.js src/shared/domain.js tests/main/repositories.test.js
git commit -m "feat: materialize recurring blocks"
```

### Task 4: Execute Blocks and update Front continuity atomically

**Files:**
- Create: `src/main/block-repository.js`
- Modify: `src/shared/domain.js`
- Modify: `tests/main/repositories.test.js`

**Interfaces:**
- Produces `blocks.start(input)`, `finish(input)`, `listToday(date)`, `listHistory(frontId)`, `cancel(id)`.
- `finish` updates the Block and linked Front in one transaction.

- [ ] **Step 1: Write the failing execution test**

```js
it('records 142 real minutes and the next Writing step', () => {
  const started = blocks.start({ id: planned.id, startedAt: '2026-09-08T05:18:00' });
  const completed = blocks.finish({ id: started.id, finishedAt: '2026-09-08T07:40:00', finishReason: 'goal_completed', note: 'Exercício 12 concluído', continuationPoint: 'Começar no exercício 13' });
  expect(completed.realMinutes).toBe(142);
  expect(fronts.get(writing.id).nextStep).toBe('Começar no exercício 13');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- --run tests/main/repositories.test.js`

Expected: FAIL because Block execution methods do not exist.

- [ ] **Step 3: Implement the finish transaction**

```js
const finishBlock = database.transaction((input) => {
  const block = findBlock.get(input.id);
  if (!block || block.status === 'cancelled') throw new Error('Bloco não pode ser finalizado.');
  if (new Date(input.finishedAt) < new Date(block.started_at)) throw new Error('O fim não pode ser anterior ao início.');
  updateCompletedBlock.run({ ...input, status: 'completed', updatedAt: new Date().toISOString() });
  if (block.front_id) updateFrontContinuation.run({ id: block.front_id, currentPoint: input.note, nextStep: input.continuationPoint, updatedAt: new Date().toISOString() });
  return mapBlock(findBlock.get(input.id));
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- --run tests/main/repositories.test.js`

Expected: PASS; data is preserved with early finishing and continuity.

- [ ] **Step 5: Commit**

```bash
git add src/main/block-repository.js src/shared/domain.js tests/main/repositories.test.js
git commit -m "feat: record real blocks and continuity"
```

### Task 5: Add templates, checklists and learning Track

**Files:**
- Create: `src/main/template-repository.js`
- Create: `src/main/track-repository.js`
- Modify: `src/main/routine-repository.js`
- Modify: `tests/main/repositories.test.js`

**Interfaces:**
- Produces `templates.listDefaults()`, `applyToRule(input)`, `blocks.listChecklist(blockId)`, `blocks.toggleChecklistItem(input)`.
- Produces `track.create(input)`, `complete(id, completedAt)`, `listByFront(frontId)`, `progressForFront(frontId)`.

- [ ] **Step 1: Write the failing template and Track test**

```js
it('copies Reading steps into a Block and computes Track progress', () => {
  const rule = templates.applyToRule({ activityId: english.id, frontId: reading.id, templateName: 'Inglês — Reading', weekdays: [1], startTime: '05:00', endTime: '08:00' });
  const [block] = rules.ensureBlocksForWeek('2026-09-07');
  expect(blocks.listChecklist(block.id)).toHaveLength(5);
  const item = track.create({ frontId: reading.id, position: 1, title: 'Capítulo 1' });
  track.complete(item.id, '2026-09-07T08:00:00');
  expect(track.progressForFront(reading.id)).toEqual({ completed: 1, total: 1, percent: 100 });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- --run tests/main/repositories.test.js`

Expected: FAIL because templates and Track do not exist.

- [ ] **Step 3: Implement defaults and ordered items**

```js
const DEFAULT_TEMPLATES = {
  'Inglês — Reading': ['Escolher texto', 'Leitura ativa', 'Anotar 10 palavras novas', 'Reler em voz alta', 'Atualizar ponto atual'],
  'Inglês — Listening': ['Escuta sem legenda', 'Escuta com legenda', 'Shadowing', 'Resumo falado'],
  'Inglês — Speaking': ['Aquecimento 5 min', 'Tema do dia', 'Gravar 3 min', 'Ouvir a gravação'],
  'Trabalho GG': ['Revisar Plane', 'Bloco de foco', 'Handoff/anotação'],
  'Estudo genérico': ['Executar atividade', 'Registrar avanço', 'Atualizar ponto atual']
};
```

Generated Blocks copy checklist text into their own rows, so checking one Block never mutates a template or another day.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- --run tests/main/repositories.test.js`

Expected: PASS; each template creates independent checklist records and Track progress is correct.

- [ ] **Step 5: Commit**

```bash
git add src/main/template-repository.js src/main/track-repository.js src/main/routine-repository.js tests/main/repositories.test.js
git commit -m "feat: add templates checklists and track"
```

### Task 6: Persist settings, backups and reports

**Files:**
- Create: `src/main/settings-repository.js`
- Create: `src/main/backup-service.js`
- Create: `src/main/report-repository.js`
- Modify: `tests/main/repositories.test.js`

**Interfaces:**
- Produces `settings.getTheme()`, `setTheme(theme)`, `createDailyBackup(databasePath, backupDirectory, now)`.
- Produces `reports.getDashboardReport(filter)` with minutes grouped by Activity, Front, day, week and adherence.

- [ ] **Step 1: Write the failing theme and report test**

```js
it('persists light theme and reports English real minutes', () => {
  settings.setTheme('light');
  expect(settings.getTheme()).toBe('light');
  expect(reports.getDashboardReport({ from: '2026-09-01', to: '2026-09-30', activityId: english.id, frontId: null }).summary.realMinutes).toBe(142);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- --run tests/main/repositories.test.js`

Expected: FAIL because settings, backup and report services do not exist.

- [ ] **Step 3: Implement services**

```js
export function createDailyBackup(databasePath, backupDirectory, now) {
  const target = path.join(backupDirectory, `rotina-${now.toISOString().slice(0, 10)}.db`);
  if (!existsSync(target)) copyFileSync(databasePath, target);
  return target;
}
```

Reports only count completed Blocks with real start and end values. Return minute totals; the renderer formats hours.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- --run tests/main/repositories.test.js`

Expected: PASS; theme persists, backup is idempotent and cancelled Blocks are excluded.

- [ ] **Step 5: Commit**

```bash
git add src/main/settings-repository.js src/main/backup-service.js src/main/report-repository.js tests/main/repositories.test.js
git commit -m "feat: add settings backups and reports"
```

### Task 7: Replace IPC, preload and renderer views

**Files:**
- Modify: `src/main/index.js`
- Modify: `src/main/ipc.js`
- Modify: `src/preload.js`
- Replace: `src/renderer/app.js`
- Modify: `src/renderer/index.html`
- Modify: `src/renderer/styles.css`
- Create: `src/renderer/views/week-view.js`
- Create: `src/renderer/views/today-view.js`
- Create: `src/renderer/views/history-view.js`
- Create: `src/renderer/views/progress-view.js`
- Create: `src/renderer/views/chart-view.js`
- Create: `src/renderer/views/settings-view.js`
- Modify: `tests/main/ipc.test.js`
- Modify: `tests/renderer/render.test.js`

**Interfaces:**
- Exposes only `window.routineApi.activities`, `fronts`, `rules`, `blocks`, `track`, `reports`, `settings` and `backups`.
- Produces `applyTheme(theme)`, each tab view renderer and accessible SVG chart renderers.

- [ ] **Step 1: Write failing IPC and renderer tests**

```js
it('rejects an invalid finish reason', async () => {
  await expect(handlers.finishBlock({ id: 1, finishedAt: '2026-09-08T07:40:00', finishReason: 'anything' })).rejects.toThrow('Motivo de encerramento inválido');
});

it('renders a saved light theme and a weekly Writing Block', () => {
  applyTheme('light');
  renderWeekView(document.querySelector('#app'), { blocks: [{ date: '2026-09-08', title: 'Inglês — Writing', frontName: 'Writing', color: '#2563eb', status: 'planned' }] });
  expect(document.documentElement.dataset.theme).toBe('light');
  expect(document.body.textContent).toContain('Inglês — Writing');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- --run tests/main/ipc.test.js tests/renderer/render.test.js`

Expected: FAIL because the routine API and focused views do not exist.

- [ ] **Step 3: Implement safe API and themed views**

```css
:root[data-theme='light'] { --page: #f8fafc; --surface: #ffffff; --text: #172033; --muted: #475569; }
:root[data-theme='dark'] { --page: #101827; --surface: #172033; --text: #edf2f7; --muted: #94a3b8; }
```

The header includes an accessible sun/moon toggle and Settings tab. Today creates/finalizes Blocks and checklist items. History displays Front point/next step and Blocks. Progress filters Activity, Front and date range and renders bar, line and donut SVG charts from report data.

- [ ] **Step 4: Implement chart helper and run tests**

```js
export function renderBarChart(items) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  const maximum = Math.max(1, ...items.map((item) => item.value));
  items.forEach((item, index) => {
    const bar = document.createElementNS(svg.namespaceURI, 'rect');
    bar.setAttribute('width', String((item.value / maximum) * 260));
    bar.setAttribute('y', String(index * 32));
    bar.setAttribute('height', '20');
    bar.setAttribute('aria-label', `${item.label}: ${item.value} minutos`);
    svg.append(bar);
  });
  return svg;
}
```

Run: `npm test -- --run tests/main/ipc.test.js tests/renderer/render.test.js`

Expected: PASS; renderer contains no raw Node API, theme is persisted and charts render real report minutes.

- [ ] **Step 5: Commit**

```bash
git add src/main src/preload.js src/renderer tests/main/ipc.test.js tests/renderer/render.test.js
git commit -m "feat: build complete themed routine interface"
```

### Task 8: Document, verify and launch the local application

**Files:**
- Modify: `.gitignore`
- Modify: `README.md`
- Modify: `tests/main/repositories.test.js`

- [ ] **Step 1: Add a final fresh database test**

```js
it('starts with no Activities and system theme', () => {
  const database = createDatabase(':memory:');
  expect(activities.listActive()).toEqual([]);
  expect(settings.getTheme()).toBe('system');
});
```

- [ ] **Step 2: Document run, test and backup paths**

Include exact commands `npm install`, `npm run rebuild`, `npm run start` and `npm test -- --run`; state that local DB/backups are private and Google authorization follows the separate plan.

- [ ] **Step 3: Run final local verification**

Run: `npm test -- --run && npm run rebuild && npm run start`

Expected: all tests pass and Electron opens with a persisted theme, routine tabs, planning forms and report charts.

- [ ] **Step 4: Commit**

```bash
git add .gitignore README.md tests/main/repositories.test.js
git commit -m "docs: document local routine application"
```

