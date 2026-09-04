# Interface Focada do Rotina Gabriel — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transformar o Rotina Gabriel em um aplicativo desktop focado em executar a rotina, com Hoje como início, Semana em Tabela/Kanban/Calendário e criação por modal.

**Architecture:** O SQLite, IPC e serviços Google permanecem local-first e inalterados em comportamento. O renderer recebe um shell compacto, views puras para Hoje/Semana e um componente de wizard que devolve um rascunho ao `app.js`; o controlador converte o rascunho nas chamadas já seguras de `routineApi`.

**Tech Stack:** Electron 44, Node.js, JavaScript ESM no main/renderer, preload CommonJS, SQLite via better-sqlite3, Vitest e JSDOM.

**Spec:** `docs/superpowers/specs/2026-09-04-interface-focada-design.md`

## Global Constraints

- Não criar migração, não recriar o banco e não expor APIs novas desnecessárias pelo preload.
- Preservar `contextIsolation: true`, `nodeIntegration: false`, OAuth e o calendário separado Rotina Gabriel.
- Não adicionar biblioteca de UI, fonte remota ou dependência de rede à interface.
- Usar os tokens do design aprovado, tema claro/escuro, `tabular-nums`, foco visível e `color-scheme` em controles de data/hora.
- Usar TDD: cada comportamento novo começa por um teste em falha e termina com a suíte completa verde.
- Cada tarefa é commitada diretamente em `main`, conforme autorização de Gabriel.

## File Structure

- `src/main/window-options.js`: opções puras da janela Windows, testáveis sem iniciar Electron.
- `src/main/index.js`: aplica o chrome integrado e remove o menu padrão.
- `src/renderer/index.html`: shell de barra de título, navegação, raiz da view e região de toast.
- `src/renderer/styles.css`: tokens, layout compacto, agenda, tabela, Kanban, modal e temas.
- `src/renderer/app.js`: estado de aba/modo, carregamento de dados, toast e gravação de rascunhos do wizard.
- `src/renderer/block-wizard.js`: modal de três passos e contrato de rascunho independente de IPC.
- `src/renderer/views/today-view.js`: cartão de Bloco atual/próximo e agenda do dia.
- `src/renderer/views/week-view.js`: Tabela, Kanban e Calendário da Semana.
- `src/renderer/views/history-view.js`, `progress-view.js`, `settings-view.js`: versões compactas das áreas existentes.
- `src/main/routine-repository.js`, `src/main/block-repository.js`: adicionam somente `activityName` ao DTO de leitura dos Blocos.
- `tests/main/window-options.test.js`, `tests/main/repositories.test.js`, `tests/renderer/render.test.js`, `tests/renderer/block-wizard.test.js`: regressões do chrome, dados e interações visuais.

### Task 1: Tornar o chrome Windows compacto e testável

**Files:**
- Create: `src/main/window-options.js`
- Create: `tests/main/window-options.test.js`
- Modify: `src/main/index.js:1-34`

**Interfaces:**
- Produces: `desktopWindowOptions(preloadPath)` que retorna as opções usadas por `new BrowserWindow()`.
- Consumes: caminho absoluto de preload e nenhum módulo Electron no arquivo de opções.

- [ ] **Step 1: Write the failing test**

```js
import { describe, expect, it } from 'vitest';
import { desktopWindowOptions } from '../../src/main/window-options.js';

it('keeps native Windows controls while using the compact content title bar', () => {
  const options = desktopWindowOptions('C:\\app\\preload.js');
  expect(options).toMatchObject({
    width: 1280,
    minWidth: 980,
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#1A1917', symbolColor: '#EFEAE1', height: 44 },
    webPreferences: { contextIsolation: true, nodeIntegration: false, preload: 'C:\\app\\preload.js' }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run tests/main/window-options.test.js`

Expected: FAIL because `src/main/window-options.js` does not exist.

- [ ] **Step 3: Write minimal implementation**

```js
// src/main/window-options.js
export function desktopWindowOptions(preload) {
  return {
    width: 1280, height: 820, minWidth: 980, minHeight: 680,
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#1A1917', symbolColor: '#EFEAE1', height: 44 },
    webPreferences: { contextIsolation: true, nodeIntegration: false, preload }
  };
}
```

In `index.js`, import `Menu` and `desktopWindowOptions`, call `Menu.setApplicationMenu(null)` after `app.whenReady()`, and replace the inline BrowserWindow object with `desktopWindowOptions(path.join(directory, '../preload.js'))`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --run tests/main/window-options.test.js`

Expected: PASS with one test.

- [ ] **Step 5: Commit**

```bash
git add src/main/window-options.js src/main/index.js tests/main/window-options.test.js
git commit -m "feat: add compact Windows chrome"
```

### Task 2: Criar shell, tokens e feedback não permanente

**Files:**
- Modify: `src/renderer/index.html:1-27`
- Modify: `src/renderer/styles.css:1-99`
- Modify: `src/renderer/app.js:15-55,293-337`
- Modify: `tests/renderer/render.test.js:1-92`

**Interfaces:**
- Produces: `showToast(message, type = 'success')` no renderer e navegação com `data-tab="today|week|history|progress|settings"`.
- Produces: `renderSyncIndicator(googleState)` para preencher o estado discreto do cabeçalho.
- Consumes: o elemento `#toast`, o elemento `#sync-indicator`, os botões `[data-tab]`, o tema salvo de `routineApi.settings` e `routineApi.google.status()`.

- [ ] **Step 1: Write the failing test**

```js
it('uses Today as the initial tab and renders a transient toast region', async () => {
  document.body.innerHTML = '<header><button data-tab="today"></button></header><main id="app"></main><div id="toast" hidden></div>';
  const { initialUiState, showToast } = await import('../../src/renderer/app.js');
  expect(initialUiState()).toMatchObject({ tab: 'today', weekMode: 'calendar' });
  showToast('Bloco criado');
  expect(document.querySelector('#toast')).toMatchObject({ hidden: false, textContent: 'Bloco criado' });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run tests/renderer/render.test.js`

Expected: FAIL because `initialUiState` and `showToast` are not exported.

- [ ] **Step 3: Write minimal implementation**

- Replace the large header with a 44 px `.titlebar`, brand, compact nav, `.sync-indicator`, and icon-only `#theme-toggle`.
- Add `<div id="toast" role="status" aria-live="polite" hidden></div>` after `#app`; remove the permanent `#app-status` element.
- Define the approved `--page`, `--surface-1`, `--surface-2`, `--line`, `--text-1`, `--text-2`, `--accent`, `--success` tokens in both themes; add `font-variant-numeric: tabular-nums` for time/numeric classes.
- Export `initialUiState()` returning `{ tab: 'today', theme: 'system', weekMode: 'calendar', progressFilter: monthFilter(), historyFrontId: null }` and initialize `state` from it.
- Implement `showToast` by setting content, removing `hidden`, resetting one module-scoped timeout and setting `hidden = true` after 3000 ms. Replace every successful `setStatus(...)` call with `showToast(...)`; keep render errors visible inside `#app`.
- Add `renderSyncIndicator(googleState)` that prints `Não sincronizado` without `lastSyncedAt`, otherwise a short relative label such as `Sincronizado agora` or `Sincronizado há 8 min`; load this state once during initialization and refresh it after connecting or synchronizing Google.
- Style native date/time with `color-scheme: dark` and light override, controls with `appearance: none` where safe, one `.btn-primary` and `.btn-ghost` family, plus width-constrained `.wrap`/`.field` rules.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --run tests/renderer/render.test.js`

Expected: PASS, including prior checklist, Trilha and Google settings tests.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/index.html src/renderer/styles.css src/renderer/app.js tests/renderer/render.test.js
git commit -m "feat: add focused application shell"
```

### Task 3: Expor dados de Atividade e renderizar Semana em três modos

**Files:**
- Modify: `src/main/routine-repository.js:18-41,70-101`
- Modify: `src/main/block-repository.js:3-27,42-57`
- Modify: `src/renderer/views/week-view.js:1-45`
- Modify: `src/renderer/app.js:191-197,305-309`
- Modify: `tests/main/repositories.test.js:61-100`
- Modify: `tests/renderer/render.test.js:20-37`

**Interfaces:**
- Produces: Blocos de `listWeek()` e `listToday()` com `activityName` além de `color` e `frontName`.
- Produces: `renderWeekView(root, { weekStart, blocks, mode, onModeChange })` com `mode` em `table`, `kanban` ou `calendar`.
- Consumes: `state.weekMode` e o mesmo array de Blocos materializados da Semana.

- [ ] **Step 1: Write the failing tests**

```js
expect(rules.listWeek('2026-09-07')).toMatchObject([{ activityName: 'Inglês', frontName: 'Writing' }]);

it('switches the same weekly Blocks between table, Kanban and calendar', () => {
  const modes = [];
  const block = { id: 7, date: '2026-09-08', title: 'Inglês — Writing', activityName: 'Inglês', color: '#6E8FB5', status: 'planned', plannedStartAt: '2026-09-08T05:00:00', plannedEndAt: '2026-09-08T08:00:00' };
  renderWeekView(document.querySelector('#app'), { weekStart: '2026-09-07', blocks: [block], mode: 'table', onModeChange: (mode) => modes.push(mode) });
  expect(document.querySelector('[data-week-table]')).not.toBeNull();
  expect(document.body.textContent).toContain('Inglês');
  document.querySelector('[data-week-mode="kanban"]').click();
  expect(modes).toEqual(['kanban']);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- --run tests/main/repositories.test.js tests/renderer/render.test.js`

Expected: FAIL because `activityName`, mode buttons and the table do not exist.

- [ ] **Step 3: Write minimal implementation**

- Add `activities.name AS activity_name` to both Block SELECTs and map it as `activityName` without changing table schema.
- Split `week-view.js` into small local renderers: `renderTable`, `renderKanban` and `renderCalendar`.
- Tabela creates a semantic `<table data-week-table>` with columns Bloco, Atividade, Frente, Quando and Status; dates use `formatClock`/`Intl.DateTimeFormat('pt-BR')`.
- Kanban creates four columns using literal mappings `{ planned: 'A fazer', in_progress: 'Em andamento', completed: 'Concluído', cancelled: 'Cancelado' }`; do not implement drag and drop.
- Calendário uses the existing Monday–Sunday calculation but positions cards by `plannedStartAt`/`plannedEndAt`, includes a 05:00–22:00 minimum range and grows for the latest Block.
- Render the compact mode selector first. In `renderWeek`, pass `state.weekMode` and set it from `onModeChange` before calling `renderCurrentView()`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- --run tests/main/repositories.test.js tests/renderer/render.test.js`

Expected: PASS with the legacy materialization assertion and all three view-mode assertions.

- [ ] **Step 5: Commit**

```bash
git add src/main/routine-repository.js src/main/block-repository.js src/renderer/views/week-view.js src/renderer/app.js tests/main/repositories.test.js tests/renderer/render.test.js
git commit -m "feat: add table kanban and calendar routine views"
```

### Task 4: Refazer Hoje como painel de execução e agenda leve

**Files:**
- Modify: `src/renderer/views/today-view.js:1-79`
- Modify: `src/renderer/app.js:199-223,305-309`
- Modify: `tests/renderer/render.test.js:39-59`

**Interfaces:**
- Produces: `renderTodayView(root, { blocks, checklists, now, onOpenCreate, onStart, onFinish, onToggleChecklist })`.
- Consumes: Blocos da data atual e o timestamp injetável `now` para decidir atual, próximo ou vazio.

- [ ] **Step 1: Write the failing tests**

```js
it('highlights the running Block before the compact day agenda', () => {
  renderTodayView(document.querySelector('#app'), {
    now: new Date('2026-09-08T06:00:00'),
    blocks: [{ id: 14, title: 'Inglês — Reading', activityName: 'Inglês', color: '#6E8FB5', status: 'in_progress', startedAt: '2026-09-08T05:10:00', plannedStartAt: '2026-09-08T05:00:00', plannedEndAt: '2026-09-08T08:00:00' }],
    checklists: { 14: [] }, onOpenCreate: () => {}, onStart: () => {}, onFinish: () => {}, onToggleChecklist: () => {}
  });
  expect(document.querySelector('[data-current-block]')).not.toBeNull();
  expect(document.querySelector('[data-day-agenda]')).not.toBeNull();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run tests/renderer/render.test.js`

Expected: FAIL because Today currently renders equally weighted cards and does not expose these regions.

- [ ] **Step 3: Write minimal implementation**

- Derive a current Block from `status === 'in_progress'`, otherwise the first planned Block at or after `now`, and render it in `[data-current-block]`.
- Keep the existing finish form and checklist behavior inside the focus card; planned Blocks keep a **Começar** action.
- Add `[data-day-agenda]` rows for all Blocks with time range, color filete, title, activity label and planned duration. Add a current-time line and summary counts.
- Add `onOpenCreate` to every empty-state and compact **Novo bloco** CTA; pass an app-level wizard opener from `renderToday`.
- In `app.js`, start one 30-second interval only while `state.tab === 'today'`; it calls `renderCurrentView()` and is cleared immediately when another tab becomes active or when the window unloads.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --run tests/renderer/render.test.js`

Expected: PASS, with current-block, checklist and callback behavior covered.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/views/today-view.js src/renderer/app.js tests/renderer/render.test.js
git commit -m "feat: focus today on current routine block"
```

### Task 5: Implementar o wizard Novo bloco sem acoplar a interface ao banco

**Files:**
- Create: `src/renderer/block-wizard.js`
- Create: `tests/renderer/block-wizard.test.js`
- Modify: `src/renderer/app.js:40-187,191-223`
- Modify: `src/renderer/index.html:18-27`
- Modify: `src/renderer/styles.css`

**Interfaces:**
- Produces: `createBlockWizard({ root, onSubmit })` retornando `{ open({ activities, fronts, trigger }), close() }`.
- `onSubmit(draft)` recebe `{ activity, front, weekdays, startTime, endTime, checklistTemplate }`.
- `activity` é `{ mode: 'existing', id }` ou `{ mode: 'create', name, category, color, weeklyGoalMinutes }`; `front` é `{ mode: 'skip' }`, `{ mode: 'existing', id }` ou `{ mode: 'create', name, currentPoint, nextStep }`.

- [ ] **Step 1: Write the failing wizard tests**

```js
it('does not advance until the new activity has a name', () => {
  const wizard = createBlockWizard({ root: document.body, onSubmit: () => {} });
  wizard.open({ activities: [], fronts: [], trigger: document.body });
  document.querySelector('[data-wizard-next]').click();
  expect(document.body.textContent).toContain('Dê um nome para a atividade.');
});

it('submits a multi-day rule without a Front', () => {
  const drafts = [];
  const wizard = createBlockWizard({ root: document.body, onSubmit: (draft) => drafts.push(draft) });
  wizard.open({ activities: [], fronts: [], trigger: document.body });
  document.querySelector('input[name="activityName"]').value = 'Inglês';
  document.querySelector('[data-wizard-next]').click();
  document.querySelector('[data-front-mode="skip"]').click();
  document.querySelector('[data-wizard-next]').click();
  document.querySelector('[data-wizard-day="1"]').click();
  document.querySelector('[data-wizard-day="3"]').click();
  document.querySelector('input[name="startTime"]').value = '05:00';
  document.querySelector('input[name="endTime"]').value = '08:00';
  document.querySelector('[data-wizard-submit]').click();
  expect(drafts).toEqual([{ activity: { mode: 'create', name: 'Inglês', category: '', color: '#6E8FB5', weeklyGoalMinutes: null }, front: { mode: 'skip' }, weekdays: [1, 3], startTime: '05:00', endTime: '08:00', checklistTemplate: [] }]);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- --run tests/renderer/block-wizard.test.js`

Expected: FAIL because the wizard module does not exist.

- [ ] **Step 3: Write minimal implementation**

- Create one dialog/backdrop at startup with close button, progress indicators and Previous/Continue/Add controls. Trap Tab within the modal and restore focus to `trigger` on close.
- Step 1 lets the user choose existing Activity or new Activity; only the new path shows name, category, goal and swatches/custom color.
- Step 2 filters existing Fronts by the chosen Activity and offers existing, new or **Sem Frente**.
- Step 3 uses seven toggle buttons, validates at least one weekday and `endTime > startTime`, and parses non-empty checklist lines.
- Implement `saveBlockDraft(draft)` in `app.js`: create Activity only for `mode === 'create'`; create Front only for `mode === 'create'`; set `title` to `Atividade — Frente` when there is a Front and only `Atividade` when `front.mode === 'skip'`; then call `routineApi.rules.create({ activityId, frontId, title, weekdays, startTime, endTime, checklistTemplate })` once. Close wizard, show toast and refresh current view after success.
- Replace the removed `planningPanel` with a single app-level wizard instance and pass its `open` method to Today and Week.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- --run tests/renderer/block-wizard.test.js tests/renderer/render.test.js`

Expected: PASS, including focus/validation, multi-day draft and legacy renderer tests.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/block-wizard.js src/renderer/app.js src/renderer/index.html src/renderer/styles.css tests/renderer/block-wizard.test.js tests/renderer/render.test.js
git commit -m "feat: add guided routine block wizard"
```

### Task 6: Compactar Frentes, Progresso e Ajustes sem perder funções

**Files:**
- Modify: `src/renderer/views/history-view.js:1-70`
- Modify: `src/renderer/views/progress-view.js:1-59`
- Modify: `src/renderer/views/settings-view.js:1-51`
- Modify: `src/renderer/app.js:241-290`
- Modify: `tests/renderer/render.test.js:61-90`

**Interfaces:**
- Produces: rótulo de navegação **Frentes** para a mesma chave interna `history`.
- Consumes: callbacks existentes de Trilha, filtro de progresso, `google.status`, `google.connect` e `google.syncNow`.

- [ ] **Step 1: Write the failing tests**

```js
it('renders Frentes as compact continuity rows and keeps the learning Track action', () => {
  renderHistoryView(document.querySelector('#app'), {
    activities: [{ id: 1, name: 'Inglês', color: '#6E8FB5' }],
    fronts: [{ id: 3, activityId: 1, name: 'Writing', currentPoint: 'Parágrafo 2', nextStep: 'Conclusão' }],
    selectedFrontId: 3, selectedFront: { id: 3, activityId: 1, name: 'Writing', currentPoint: 'Parágrafo 2', nextStep: 'Conclusão' }, blocks: [], trackItems: [], onFrontChange: () => {}, onTrackComplete: () => {}, onTrackCreate: () => {}
  });
  expect(document.querySelector('[data-front-row]')).not.toBeNull();
});

it('renders Google sync as a settings row instead of a full task card', () => {
  renderSettingsView(document.querySelector('#app'), { calendarName: 'Rotina Gabriel', configured: true, connected: true, theme: 'dark' });
  expect(document.querySelector('[data-setting="google"] [data-action="sync-google"]')).not.toBeNull();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- --run tests/renderer/render.test.js`

Expected: FAIL because compact semantic hooks do not exist.

- [ ] **Step 3: Write minimal implementation**

- Change only display copy from Histórico to Frentes; pass the existing Activity array to `renderHistoryView` and derive each Front label/color from `front.activityId`, while retaining selection, continuity, history and Track callbacks.
- Use `.front-row`, `.filter-row`, `.metric-grid` and `.setting-row` layouts with the approved 980 px container and reduced card density.
- Keep Progress filters and all four reports. Do not remove Front filter or date range.
- Turn settings into separated rows. Keep OAuth state and sync control in `[data-setting="google"]`; successful sync calls `showToast` with pushed/imported totals and refreshes `renderSyncIndicator` using the newest `google.status()` result.
- Preserve failure handling: a Google error remains visible in the rendered view instead of being swallowed by a toast.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- --run tests/renderer/render.test.js`

Expected: PASS, with Frentes, Track and Google sync controls still available.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/views/history-view.js src/renderer/views/progress-view.js src/renderer/views/settings-view.js src/renderer/app.js src/renderer/styles.css tests/renderer/render.test.js
git commit -m "feat: compact routine supporting views"
```

### Task 7: Verificar o produto completo e publicar a versão redesenhada

**Files:**
- Modify only if verification finds an actual defect; otherwise no source change.

**Interfaces:**
- Consumes: todos os testes e o executável Electron.
- Produces: `main` limpa, testes verdes, rebuild nativo e janela funcional sem menu padrão.

- [ ] **Step 1: Run the full automated suite**

Run: `npm test -- --run`

Expected: all test files pass with zero failures.

- [ ] **Step 2: Rebuild the native SQLite module**

Run: `npm run rebuild`

Expected: exit code 0 for `better-sqlite3` against the Electron version in `package.json`.

- [ ] **Step 3: Perform the manual acceptance flow**

Run: `npm run start`

Verify in the visible app:

1. Today opens first and has no inline planning forms.
2. New block wizard creates Inglês → Writing on Monday and Wednesday at 05:00–08:00.
3. Trabalho GG is created with no Front in multiple weekdays.
4. Table, Kanban and Calendar show the same weekly Blocks.
5. Start, checklist, finish and continuity work in Today.
6. Theme change persists after restart; controls remain themed.
7. Google settings still show connected account and synchronization sends the new rules.

- [ ] **Step 4: Inspect the final diff and commit any verified correction**

Run: `git diff --check`

Run: `git status --short`

Expected: no whitespace errors and no untracked credential/token/database file.

- [ ] **Step 5: Publish main**

```bash
git push origin main
```

Expected: GitHub `main` receives only tested commits; no pull request is created.
