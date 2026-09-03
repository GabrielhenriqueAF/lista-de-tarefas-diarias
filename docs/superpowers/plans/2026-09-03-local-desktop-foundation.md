# Local Desktop Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Windows desktop app that stores recurring daily tasks, real work sessions, subtask progress and local reports.

**Architecture:** Electron runs a privileged Node.js main process and a browser-like renderer. The main process owns SQLite, calculates domain data and exposes a small, validated IPC API; the renderer only calls that API and renders the four approved tabs. This plan deliberately finishes the complete local workflow before a separate Google Calendar synchronization plan adds OAuth and remote state.

**Tech Stack:** Node.js, Electron, HTML, CSS, vanilla JavaScript, SQLite through `better-sqlite3`, Vitest, `@electron/rebuild`.

**Spec:** `docs/superpowers/specs/2026-09-03-lista-de-tarefas-diarias-design.md`

## Global Constraints

- Build for Windows with Electron and JavaScript; do not introduce a frontend framework.
- Store all user data in a SQLite database under Electron's `userData` directory, never in the repository.
- Keep Node.js APIs out of the renderer; expose only validated functions through `contextBridge`.
- Count progress from real session times, never from planned times.
- Keep Google credentials, tokens, databases, `node_modules`, build output and `.superpowers/` out of Git.
- Work only on a feature branch and open a Pull Request to `main`; never commit implementation work directly to `main`.
- Google Calendar OAuth and remote synchronization belong to the next implementation plan; this plan must leave a clean interface for them.

---

## Scope boundary

This plan implements every local requirement from the design: recurring schedules, task management, start/finish tracking, subtasks, progress, history and offline persistence. The approved Google Calendar requirements are intentionally deferred to the next plan because they require a separate OAuth setup, external API test doubles and conflict-resolution execution. The database schema includes `google_event_id` and `updated_at` so the next plan can add synchronization without redesigning the local app.

## Planned file structure

| File | Responsibility |
| --- | --- |
| `package.json` | Dependencies and `start`, `test`, `rebuild` scripts. |
| `.gitignore` | Prevent local/private data from reaching Git. |
| `src/main/index.js` | Electron lifecycle and secure application window. |
| `src/main/database.js` | SQLite connection and migrations. |
| `src/main/task-repository.js` | Task, weekly schedule and subtask persistence. |
| `src/main/session-repository.js` | Start/finish records, notes and reports. |
| `src/main/ipc.js` | Validated IPC handlers that call repositories. |
| `src/preload.js` | Narrow `window.taskApi` bridge. |
| `src/shared/domain.js` | Pure validation, duration and date/report helpers. |
| `src/renderer/index.html` | Four-tab application shell. |
| `src/renderer/app.js` | UI state, events and rendering. |
| `src/renderer/styles.css` | Responsive desktop layout and task states. |
| `vitest.config.js` | Test-runner defaults and renderer test environment. |
| `tests/shared/domain.test.js` | Pure unit tests. |
| `tests/main/repositories.test.js` | SQLite repository integration tests. |
| `tests/main/ipc.test.js` | Handler validation tests. |

### Task 1: Electron project shell and secure bridge

**Files:**
- Create: `package.json`
- Create: `.gitignore`
- Create: `src/main/index.js`
- Create: `src/preload.js`
- Create: `src/renderer/index.html`
- Create: `vitest.config.js`
- Create: `tests/shared/domain.test.js`

**Interfaces:**
- Produces: `window.taskApi` as the only renderer-to-main entry point.
- Produces: `npm run start`, `npm run test` and `npm run rebuild` commands.

- [ ] **Step 1: Add a failing pure-function test that Vitest can discover.**

```js
// tests/shared/domain.test.js
import { describe, expect, it } from 'vitest';
import { minutesBetween } from '../../src/shared/domain.js';

describe('minutesBetween', () => {
  it('calculates a session that ends early', () => {
    expect(minutesBetween('2026-09-03T08:00:00', '2026-09-03T10:15:00')).toBe(135);
  });
});
```

- [ ] **Step 2: Run the test and verify it fails because the project is not configured.**

Run: `npm test -- --run tests/shared/domain.test.js`

Expected: FAIL because `package.json`, Vitest and `src/shared/domain.js` do not exist.

- [ ] **Step 3: Create the smallest Electron shell and package scripts.**

```json
{
  "name": "lista-de-tarefas-diarias",
  "private": true,
  "type": "module",
  "main": "src/main/index.js",
  "scripts": {
    "start": "electron .",
    "test": "vitest",
    "rebuild": "electron-rebuild -f -w better-sqlite3"
  }
}
```

```js
// src/main/index.js
import { app, BrowserWindow } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = path.dirname(fileURLToPath(import.meta.url));

function createWindow() {
  const window = new BrowserWindow({
    width: 1280,
    height: 820,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(directory, '../preload.js')
    }
  });
  window.loadFile(path.join(directory, '../renderer/index.html'));
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => process.platform !== 'darwin' && app.quit());
```

```js
// vitest.config.js
import { defineConfig } from 'vitest/config';

export default defineConfig({ test: { environment: 'node' } });
```

- [ ] **Step 4: Implement the initial pure function and safe preload bridge.**

```js
// src/shared/domain.js
export function minutesBetween(startedAt, finishedAt) {
  return Math.round((new Date(finishedAt) - new Date(startedAt)) / 60000);
}
```

```js
// src/preload.js
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('taskApi', {
  listWeek: (weekStart) => ipcRenderer.invoke('tasks:list-week', weekStart)
});
```

- [ ] **Step 5: Install dependencies, rebuild the SQLite native module and verify both entry points.**

Run: `npm install -D electron vitest @electron/rebuild jsdom && npm install better-sqlite3 && npm run rebuild && npm test -- --run tests/shared/domain.test.js && npm run start`

Expected: the test passes and Electron opens a blank app window without DevTools errors.

- [ ] **Step 6: Commit the shell.**

```bash
git add package.json package-lock.json .gitignore src tests
git commit -m "chore: add Electron application shell"
```

### Task 2: SQLite schema and task scheduling repository

**Files:**
- Create: `src/main/database.js`
- Create: `src/main/task-repository.js`
- Modify: `src/shared/domain.js`
- Modify: `tests/main/repositories.test.js`

**Interfaces:**
- Consumes: `minutesBetween(startedAt, finishedAt): number`.
- Produces: `createTaskRepository(database): TaskRepository`, `createTask(input): Task`, `saveSchedule(input): WeeklySchedule`, `listTasks(): Task[]`, `listWeek(weekStart): PlannedOccurrence[]`.
- `Task` has `id`, `title`, `color`, `monthlyGoalMinutes`, `archived`, `googleEventId`, `updatedAt`.
- `WeeklySchedule` has `id`, `taskId`, `weekday`, `startTime`, `endTime`, `subtaskTitle`, `updatedAt`.

- [ ] **Step 1: Write a repository test for a weekday schedule.**

```js
it('returns a Tuesday English occurrence for the selected week', () => {
  const task = repository.createTask({ title: 'Estudar inglês', color: '#2563eb' });
  repository.saveSchedule({ taskId: task.id, weekday: 2, startTime: '05:00', endTime: '08:00', subtaskTitle: 'Writing' });
  expect(repository.listWeek('2026-09-07')).toMatchObject([
    { title: 'Estudar inglês', date: '2026-09-08', subtaskTitle: 'Writing', startTime: '05:00' }
  ]);
});
```

- [ ] **Step 2: Run the repository test and verify it fails.**

Run: `npm test -- --run tests/main/repositories.test.js`

Expected: FAIL because the database and repository modules do not exist.

- [ ] **Step 3: Add migrations and repository operations.**

```sql
CREATE TABLE tasks (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  color TEXT NOT NULL,
  monthly_goal_minutes INTEGER,
  archived INTEGER NOT NULL DEFAULT 0,
  google_event_id TEXT,
  updated_at TEXT NOT NULL
);
CREATE TABLE weekly_schedules (
  id INTEGER PRIMARY KEY,
  task_id INTEGER NOT NULL REFERENCES tasks(id),
  weekday INTEGER NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  subtask_title TEXT,
  updated_at TEXT NOT NULL
);
```

```js
export function createTaskRepository(database) {
  const insertTask = database.prepare(`
    INSERT INTO tasks (title, color, monthly_goal_minutes, updated_at)
    VALUES (@title, @color, @monthlyGoalMinutes, @updatedAt)
  `);
  const insertSchedule = database.prepare(`
    INSERT INTO weekly_schedules (task_id, weekday, start_time, end_time, subtask_title, updated_at)
    VALUES (@taskId, @weekday, @startTime, @endTime, @subtaskTitle, @updatedAt)
  `);
  return {
    createTask({ title, color, monthlyGoalMinutes = null }) {
      const updatedAt = new Date().toISOString();
      const result = insertTask.run({ title, color, monthlyGoalMinutes, updatedAt });
      return database.prepare('SELECT * FROM tasks WHERE id = ?').get(result.lastInsertRowid);
    },
    saveSchedule({ taskId, weekday, startTime, endTime, subtaskTitle = null }) {
      const updatedAt = new Date().toISOString();
      const result = insertSchedule.run({ taskId, weekday, startTime, endTime, subtaskTitle, updatedAt });
      return database.prepare('SELECT * FROM weekly_schedules WHERE id = ?').get(result.lastInsertRowid);
    },
    listWeek(weekStart) {
      return database.prepare('SELECT weekly_schedules.*, tasks.title, tasks.color FROM weekly_schedules JOIN tasks ON tasks.id = weekly_schedules.task_id WHERE tasks.archived = 0').all()
        .map((schedule) => ({ ...schedule, date: dateForWeekday(weekStart, schedule.weekday) }));
    }
  };
}
```

- [ ] **Step 4: Add validation for task titles and time ranges.**

```js
export function assertSchedule(input) {
  if (!/^\d{2}:\d{2}$/.test(input.startTime) || input.endTime <= input.startTime) {
    throw new Error('O horário de término deve ser posterior ao horário de início.');
  }
}
```

- [ ] **Step 5: Run repository and pure-function tests.**

Run: `npm test -- --run tests/shared/domain.test.js tests/main/repositories.test.js`

Expected: PASS, including Tuesday `Writing` at 05:00–08:00.

- [ ] **Step 6: Commit the local scheduling model.**

```bash
git add src/main/database.js src/main/task-repository.js src/shared/domain.js tests/main/repositories.test.js
git commit -m "feat: store tasks and weekly schedules"
```

### Task 3: Session, subtask-history and report repositories

**Files:**
- Create: `src/main/session-repository.js`
- Modify: `src/main/database.js`
- Modify: `tests/main/repositories.test.js`

**Interfaces:**
- Consumes: `TaskRepository.listWeek(weekStart): PlannedOccurrence[]`.
- Produces: `startSession(input): Session`, `finishSession(input): Session`, `recordProgress(input): ProgressEntry`, `listHistory(taskId): HistoryEntry[]`, `getProgressReport({ taskId, from, to }): ProgressReport`.
- `ProgressReport` has `realMinutes`, `activeDays`, `sessions`, `subtasks`.

- [ ] **Step 1: Write failing tests for a real early finish and a continuation note.**

```js
it('uses real times in the monthly report', () => {
  const session = sessions.startSession({ scheduleId: 1, taskId: 1, startedAt: '2026-09-08T05:18:00' });
  sessions.finishSession({ id: session.id, finishedAt: '2026-09-08T07:40:00', note: 'Exercício 12 concluído' });
  expect(sessions.getProgressReport({ taskId: 1, from: '2026-09-01', to: '2026-09-30' }).realMinutes).toBe(142);
});

it('returns the most recent subtask continuation point first', () => {
  sessions.recordProgress({ sessionId: 1, subtaskTitle: 'Writing', progress: 'Unidade 3', continuationPoint: 'Começar no exercício 13' });
  expect(sessions.listHistory(1)[0].continuationPoint).toBe('Começar no exercício 13');
});
```

- [ ] **Step 2: Run the tests and verify they fail.**

Run: `npm test -- --run tests/main/repositories.test.js`

Expected: FAIL because `session-repository.js` and its tables do not exist.

- [ ] **Step 3: Add the session and progress tables.**

```sql
CREATE TABLE sessions (
  id INTEGER PRIMARY KEY,
  task_id INTEGER NOT NULL REFERENCES tasks(id),
  schedule_id INTEGER REFERENCES weekly_schedules(id),
  planned_start_at TEXT,
  planned_end_at TEXT,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  status TEXT NOT NULL,
  note TEXT
);
CREATE TABLE progress_entries (
  id INTEGER PRIMARY KEY,
  session_id INTEGER NOT NULL REFERENCES sessions(id),
  subtask_title TEXT NOT NULL,
  progress TEXT NOT NULL,
  continuation_point TEXT NOT NULL,
  created_at TEXT NOT NULL
);
```

- [ ] **Step 4: Implement session transitions and reports.**

```js
function startSession({ scheduleId, taskId, startedAt, plannedStartAt, plannedEndAt }) {
  return insertSession.run({ scheduleId, taskId, startedAt, plannedStartAt, plannedEndAt, status: 'in_progress' });
}

function finishSession({ id, finishedAt, note }) {
  const session = findSession.get(id);
  if (new Date(finishedAt) < new Date(session.started_at)) throw new Error('O fim não pode ser anterior ao início.');
  return updateSession.run({ id, finishedAt, note, status: 'completed' });
}

function getProgressReport({ taskId, from, to }) {
  return reportForPeriod.get({ taskId, from, to });
}
```

- [ ] **Step 5: Run all repository tests.**

Run: `npm test -- --run tests/main/repositories.test.js`

Expected: PASS; the 05:18–07:40 session contributes 142 minutes and its Writing continuation is returned first.

- [ ] **Step 6: Commit session tracking.**

```bash
git add src/main/database.js src/main/session-repository.js tests/main/repositories.test.js
git commit -m "feat: record sessions and study history"
```

### Task 4: Validated IPC API

**Files:**
- Create: `src/main/ipc.js`
- Modify: `src/main/index.js`
- Modify: `src/preload.js`
- Create: `tests/main/ipc.test.js`

**Interfaces:**
- Consumes: task and session repository functions from Tasks 2 and 3.
- Produces: `createHandlers(repositories)`, `window.taskApi.tasks`, `window.taskApi.sessions`, `window.taskApi.reports`.
- Renderer methods: `tasks.create(input)`, `tasks.listWeek(weekStart)`, `sessions.start(input)`, `sessions.finish(input)`, `sessions.recordProgress(input)`, `sessions.listHistory(taskId)`, `reports.progress(filter)`.

- [ ] **Step 1: Write a failing handler validation test.**

```js
it('rejects an untrusted create-task payload without a title', async () => {
  await expect(handlers.createTask({ color: '#2563eb' })).rejects.toThrow('Título obrigatório');
});
```

- [ ] **Step 2: Run the test and verify it fails.**

Run: `npm test -- --run tests/main/ipc.test.js`

Expected: FAIL because the IPC module does not exist yet.

- [ ] **Step 3: Register narrow handlers in the main process.**

```js
export function createHandlers(repositories) {
  return {
    createTask(input) {
      if (typeof input?.title !== 'string' || input.title.trim() === '') throw new Error('Título obrigatório');
      return repositories.tasks.createTask(input);
    },
    finishSession(input) {
      if (!Number.isInteger(input?.id) || typeof input.finishedAt !== 'string') throw new Error('Sessão e horário de fim obrigatórios');
      return repositories.sessions.finishSession(input);
    },
    progressReport(filter) {
      if (!Number.isInteger(filter?.taskId) || typeof filter.from !== 'string' || typeof filter.to !== 'string') throw new Error('Filtro de progresso inválido');
      return repositories.sessions.getProgressReport(filter);
    }
  };
}

const handlers = createHandlers(repositories);
ipcMain.handle('tasks:create', (_event, input) => handlers.createTask(input));
ipcMain.handle('sessions:finish', (_event, input) => handlers.finishSession(input));
ipcMain.handle('sessions:list-history', (_event, taskId) => repositories.sessions.listHistory(taskId));
ipcMain.handle('reports:progress', (_event, filter) => handlers.progressReport(filter));
```

- [ ] **Step 4: Expose the matching bridge without exposing `ipcRenderer`.**

```js
contextBridge.exposeInMainWorld('taskApi', {
  tasks: { create: (input) => ipcRenderer.invoke('tasks:create', input), listWeek: (weekStart) => ipcRenderer.invoke('tasks:list-week', weekStart) },
  sessions: { start: (input) => ipcRenderer.invoke('sessions:start', input), finish: (input) => ipcRenderer.invoke('sessions:finish', input), recordProgress: (input) => ipcRenderer.invoke('sessions:record-progress', input), listHistory: (taskId) => ipcRenderer.invoke('sessions:list-history', taskId) },
  reports: { progress: (filter) => ipcRenderer.invoke('reports:progress', filter) }
});
```

- [ ] **Step 5: Run IPC and repository tests.**

Run: `npm test -- --run tests/main/ipc.test.js tests/main/repositories.test.js`

Expected: PASS; invalid inputs return readable errors and no Node API is exposed to the renderer.

- [ ] **Step 6: Commit the application boundary.**

```bash
git add src/main/ipc.js src/main/index.js src/preload.js tests/main/ipc.test.js
git commit -m "feat: expose validated task API"
```

### Task 5: Minha semana and Hoje user interface

**Files:**
- Modify: `src/renderer/index.html`
- Create: `src/renderer/app.js`
- Create: `src/renderer/styles.css`
- Create: `tests/renderer/render.test.js`

**Interfaces:**
- Consumes: `window.taskApi.tasks.listWeek`, `window.taskApi.sessions.start`, `window.taskApi.sessions.finish`, `window.taskApi.sessions.recordProgress`.
- Produces: `renderWeek(occurrences)`, `renderToday(occurrences)`, `renderSessionForm(session)`.

- [ ] **Step 1: Write a failing renderer test for a real session state.**

```js
// @vitest-environment jsdom
it('renders the actual start time and a finish button for an active session', async () => {
  renderToday([{ title: 'Estudar inglês', subtaskTitle: 'Writing', session: { status: 'in_progress', startedAt: '2026-09-08T05:18:00' } }]);
  expect(document.body.textContent).toContain('Iniciado às 05:18');
  expect(document.querySelector('[data-action="finish-session"]')).not.toBeNull();
});
```

- [ ] **Step 2: Run the test and verify it fails.**

Run: `npm test -- --run tests/renderer/render.test.js`

Expected: FAIL because the renderer module and DOM setup do not exist.

- [ ] **Step 3: Build the approved tabs and semantic task cards.**

```html
<nav aria-label="Áreas do aplicativo">
  <button data-tab="week">Minha semana</button>
  <button data-tab="today">Hoje</button>
  <button data-tab="progress">Progresso</button>
  <button data-tab="history">Histórico</button>
</nav>
<main id="app" aria-live="polite"></main>
```

```js
const app = document.querySelector('#app');

export function currentWeekStart(now = new Date()) {
  const date = new Date(now);
  const offset = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - offset);
  return date.toISOString().slice(0, 10);
}

function createOccurrenceCard(occurrence) {
  const card = document.createElement('article');
  card.textContent = `${occurrence.startTime} — ${occurrence.title}${occurrence.subtaskTitle ? ` · ${occurrence.subtaskTitle}` : ''}`;
  return card;
}

export async function renderToday() {
  const occurrences = await window.taskApi.tasks.listWeek(currentWeekStart());
  const today = new Date().toISOString().slice(0, 10);
  const todayOccurrences = occurrences.filter((occurrence) => occurrence.date === today);
  app.replaceChildren(...todayOccurrences.map(createOccurrenceCard));
}
```

- [ ] **Step 4: Implement start, finish-early and continuation-note interactions.**

```js
async function finishActiveSession(sessionId, form) {
  await window.taskApi.sessions.finish({ id: sessionId, finishedAt: new Date().toISOString(), note: form.note.value });
  await window.taskApi.sessions.recordProgress({ sessionId, subtaskTitle: form.subtask.value, progress: form.progress.value, continuationPoint: form.continuationPoint.value });
  await renderToday();
}
```

- [ ] **Step 5: Run renderer tests and manually verify the Electron window.**

Run: `npm test -- --run tests/renderer/render.test.js && npm run start`

Expected: PASS; the week grid shows English and GG work, and an active session can be finished before its planned end.

- [ ] **Step 6: Commit the execution screens.**

```bash
git add src/renderer tests/renderer
git commit -m "feat: add weekly and daily task screens"
```

### Task 6: Progress and history views

**Files:**
- Modify: `src/renderer/app.js`
- Modify: `src/renderer/index.html`
- Modify: `src/renderer/styles.css`
- Modify: `tests/renderer/render.test.js`

**Interfaces:**
- Consumes: `window.taskApi.reports.progress(filter)` and `window.taskApi.sessions.listHistory(taskId)`.
- Produces: `renderProgress(report)`, `renderHistory(entries)`.

- [ ] **Step 1: Write failing tests for monthly metrics and a continuation entry.**

```js
it('renders real monthly hours and active days', () => {
  renderProgress({ realMinutes: 1120, activeDays: 8, subtasks: [] });
  expect(document.body.textContent).toContain('18h 40m');
  expect(document.body.textContent).toContain('8 dias ativos');
});

it('renders the last continuation point in history', () => {
  renderHistory([{ subtaskTitle: 'Writing', continuationPoint: 'Começar no exercício 13', createdAt: '2026-09-08T07:40:00' }]);
  expect(document.body.textContent).toContain('Começar no exercício 13');
});
```

- [ ] **Step 2: Run the tests and verify they fail.**

Run: `npm test -- --run tests/renderer/render.test.js`

Expected: FAIL because `renderProgress` and `renderHistory` do not exist.

- [ ] **Step 3: Add period and task filters plus report formatting.**

```js
export function formatMinutes(totalMinutes) {
  return `${Math.floor(totalMinutes / 60)}h ${totalMinutes % 60}m`;
}

export async function renderProgress(filter) {
  const report = await window.taskApi.reports.progress(filter);
  app.innerHTML = `<h2>Progresso</h2><p>${formatMinutes(report.realMinutes)}</p><p>${report.activeDays} dias ativos</p>`;
}
```

- [ ] **Step 4: Render subtasks and chronological history using text content, never raw user HTML.**

```js
const row = document.createElement('li');
row.textContent = `${entry.subtaskTitle}: ${entry.continuationPoint}`;
historyList.append(row);
```

- [ ] **Step 5: Run the complete local test suite.**

Run: `npm test -- --run`

Expected: PASS for domain calculations, repositories, IPC validation and renderer views.

- [ ] **Step 6: Commit reports and history.**

```bash
git add src/renderer tests/renderer
git commit -m "feat: show progress and task history"
```

### Task 7: Local acceptance, documentation and PR

**Files:**
- Create: `README.md`
- Modify: `.gitignore`
- Modify: `package.json`

**Interfaces:**
- Consumes: the runnable Electron application and all tests from Tasks 1–6.
- Produces: documented local setup and a reviewable feature Pull Request.

- [ ] **Step 1: Add a failing smoke test for a fresh database path.**

```js
it('starts with no tasks in a fresh database', () => {
  const repository = createTaskRepository(createDatabase(':memory:'));
  expect(repository.listTasks()).toEqual([]);
});
```

- [ ] **Step 2: Run the smoke test and verify it fails if migrations are not automatic.**

Run: `npm test -- --run tests/main/repositories.test.js`

Expected: FAIL until `createDatabase` runs all migrations for every new database.

- [ ] **Step 3: Make database initialization deterministic and document local use.**

```markdown
## Executar localmente

1. `npm install`
2. `npm run rebuild`
3. `npm run start`

## Testar

`npm test -- --run`
```

- [ ] **Step 4: Verify ignores include private and generated files.**

```gitignore
node_modules/
dist/
*.db
credentials.json
token.json
.superpowers/
```

- [ ] **Step 5: Run the final verification set.**

Run: `npm test -- --run && npm run start`

Expected: all tests pass, the app opens, a new task can be scheduled, a session can be completed early, and progress/history use the real duration.

- [ ] **Step 6: Commit, push and open the implementation PR.**

```bash
git add README.md .gitignore package.json package-lock.json src tests
git commit -m "docs: add local setup instructions"
git push -u origin feature/local-task-foundation
```

Create a Pull Request from `feature/local-task-foundation` to `main` with the test command and manual acceptance results in its description.

## Plan self-review

- **Covered locally:** task CRUD and schedules (Task 2), real sessions and subtask history (Task 3), safe desktop interface (Tasks 1, 4 and 5), reports (Task 6), tests and documentation (Task 7).
- **Deferred deliberately:** Google OAuth, Calendar event creation/import, reminder overrides and latest-update conflict resolution. Those requirements form the next independently testable plan after this local foundation is reviewed.
- **No placeholders:** every task identifies concrete files, interfaces, test commands, expected results and commit boundaries.
- **Type consistency:** renderer uses only the `window.taskApi` groups defined in Task 4; reports use the `ProgressReport` fields defined in Task 3.
