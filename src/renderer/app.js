import { dateOnly, element } from './views/dom.js';
import { createBlockWizard } from './block-wizard.js';
import { createDangerConfirmDialog } from './danger-confirm-dialog.js';
import { renderHistoryView } from './views/history-view.js';
import { renderProgressView } from './views/progress-view.js';
import { renderSettingsView } from './views/settings-view.js';
import { renderTodayView } from './views/today-view.js';
import { renderWeekView } from './views/week-view.js';

export function initialUiState() {
  return {
    tab: 'today',
    theme: 'system',
    weekMode: 'calendar',
    selectedWeekStart: weekStart(),
    progressFilter: monthFilter(),
    historyFrontId: null
  };
}

const state = initialUiState();
let toastTimeout;
let todayRefreshInterval;
let blockWizard;
let dangerConfirmDialog;

function monthFilter(now = new Date()) {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const lastDay = new Date(year, now.getMonth() + 1, 0).getDate();
  return { activityId: null, frontId: null, from: `${year}-${month}-01`, to: `${year}-${month}-${lastDay}` };
}

function weekStart(now = new Date()) {
  const date = new Date(now);
  const offset = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - offset);
  return dateOnly(date);
}

function applicationApi() {
  return window.routineApi;
}

function resolvedTheme(theme) {
  if (theme !== 'system') return theme;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function applyTheme(theme) {
  document.documentElement.dataset.theme = resolvedTheme(theme);
}

export function showToast(message, type = 'success') {
  const toast = document.querySelector('#toast');
  if (!toast) return;
  toast.textContent = message;
  toast.dataset.type = type;
  toast.hidden = false;
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    toast.hidden = true;
  }, 3000);
}

function shiftWeek(value, amount) {
  const date = new Date(`${value}T12:00:00`);
  date.setDate(date.getDate() + (amount * 7));
  return dateOnly(date);
}

function setStatus(message, type = 'success') {
  showToast(message, type);
}

function relativeSyncTime(lastSyncedAt) {
  if (!lastSyncedAt) return 'Não sincronizado';
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(lastSyncedAt).getTime()) / 60000));
  if (minutes === 0) return 'Sincronizado agora';
  return `Sincronizado há ${minutes} min`;
}

export function renderSyncIndicator(googleState = {}) {
  const indicator = document.querySelector('#sync-indicator');
  if (!indicator) return;
  indicator.lastChild.textContent = relativeSyncTime(googleState.lastSyncedAt);
  indicator.dataset.state = googleState.connected ? 'connected' : 'idle';
}

async function loadRoutineData() {
  const activities = await applicationApi().activities.list();
  const grouped = await Promise.all(activities.map((activity) => applicationApi().fronts.list(activity.id)));
  return { activities, fronts: grouped.flat() };
}

async function saveBlockDraft(draft) {
  let activity;
  if (draft.activity.mode === 'create') {
    activity = await applicationApi().activities.create({
      name: draft.activity.name,
      category: draft.activity.category,
      color: draft.activity.color,
      weeklyGoalMinutes: draft.activity.weeklyGoalMinutes
    });
  } else {
    activity = (await applicationApi().activities.list()).find((item) => item.id === draft.activity.id);
  }
  if (!activity) throw new Error('Atividade não encontrada.');

  let front = null;
  if (draft.front.mode === 'create') {
    front = await applicationApi().fronts.create({ activityId: activity.id, ...draft.front });
  } else if (draft.front.mode === 'existing') {
    front = (await applicationApi().fronts.list(activity.id)).find((item) => item.id === draft.front.id);
  }
  if (draft.front.mode !== 'skip' && !front) throw new Error('Frente não encontrada.');

  const title = front ? `${activity.name} — ${front.name}` : activity.name;
  await applicationApi().rules.create({
    activityId: activity.id,
    frontId: front?.id ?? null,
    title,
    weekdays: draft.weekdays,
    startTime: draft.startTime,
    endTime: draft.endTime,
    checklistTemplate: draft.checklistTemplate,
    startsOn: draft.startsOn,
    endsOn: draft.endsOn
  });
  showToast('Bloco adicionado à sua rotina.');
  await renderCurrentView();
}

async function openBlockWizard(trigger = document.activeElement) {
  try {
    const { activities, fronts } = await loadRoutineData();
    blockWizard?.open({ activities, fronts, trigger });
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function renderWeek() {
  const root = document.querySelector('#app');
  const blocks = await applicationApi().rules.listWeek(state.selectedWeekStart);
  renderWeekView(root, {
    weekStart: state.selectedWeekStart,
    blocks,
    mode: state.weekMode,
    onModeChange: async (mode) => {
      state.weekMode = mode;
      await renderCurrentView();
    },
    onOpenCreate: () => openBlockWizard(document.activeElement),
    onPreviousWeek: async () => {
      state.selectedWeekStart = shiftWeek(state.selectedWeekStart, -1);
      await renderCurrentView();
    },
    onNextWeek: async () => {
      state.selectedWeekStart = shiftWeek(state.selectedWeekStart, 1);
      await renderCurrentView();
    },
    onToday: async () => {
      state.selectedWeekStart = weekStart();
      await renderCurrentView();
    }
  });
}

async function renderToday() {
  const root = document.querySelector('#app');
  const now = new Date();
  const blocks = await applicationApi().blocks.listToday(dateOnly(now));
  const checklistRows = await Promise.all(blocks.map(async (block) => [block.id, await applicationApi().blocks.listChecklist(block.id)]));
  const checklists = Object.fromEntries(checklistRows);
  renderTodayView(root, {
    blocks,
    checklists,
    now,
    onOpenCreate: () => openBlockWizard(document.activeElement),
    onStart: async (block) => {
      await applicationApi().blocks.start({ id: block.id, startedAt: new Date().toISOString() });
      setStatus('Bloco iniciado. Quando quiser, finalize e registre seu avanço.');
      await renderCurrentView();
    },
    onFinish: async (input) => {
      await applicationApi().blocks.finish(input);
      setStatus('Bloco finalizado e o próximo passo foi salvo no histórico.');
      await renderCurrentView();
    },
    onToggleChecklist: async (input) => {
      await applicationApi().blocks.toggleChecklist(input);
      setStatus('Subtarefa atualizada.');
      await renderCurrentView();
    }
  });
}

async function renderProgress() {
  const root = document.querySelector('#app');
  const { activities, fronts } = await loadRoutineData();
  const report = await applicationApi().reports.dashboard(state.progressFilter);
  renderProgressView(root, {
    activities,
    fronts,
    filter: state.progressFilter,
    report,
    onFilter: async (filter) => {
      state.progressFilter = filter;
      await renderCurrentView();
    }
  });
}

async function renderHistory() {
  const root = document.querySelector('#app');
  const { activities, fronts } = await loadRoutineData();
  if (!state.historyFrontId && fronts.length) state.historyFrontId = fronts[0].id;
  const selectedFront = fronts.find((front) => front.id === state.historyFrontId) ?? null;
  const [blocks, trackItems] = selectedFront
    ? await Promise.all([applicationApi().blocks.listHistory(selectedFront.id), applicationApi().track.list(selectedFront.id)])
    : [[], []];
  renderHistoryView(root, {
    activities,
    fronts,
    selectedFrontId: state.historyFrontId,
    selectedFront,
    blocks,
    trackItems,
    onFrontChange: async (frontId) => {
      state.historyFrontId = frontId;
      await renderCurrentView();
    },
    onTrackComplete: async (id) => {
      await applicationApi().track.complete({ id, completedAt: new Date().toISOString() });
      setStatus('Item de Trilha concluído.');
      await renderCurrentView();
    },
    onTrackCreate: async (input) => {
      await applicationApi().track.create({ frontId: selectedFront.id, ...input });
      setStatus('Novo item adicionado à sua Trilha.');
      await renderCurrentView();
    }
  });
}

async function renderSettings() {
  const [googleState, activities, archivedActivities] = await Promise.all([
    applicationApi().google.status(),
    applicationApi().activities.list(),
    applicationApi().activities.listArchived()
  ]);
  renderSyncIndicator(googleState);
  renderSettingsView(document.querySelector('#app'), {
    theme: state.theme,
    calendarName: googleState.calendarName,
    lastSyncedAt: googleState.lastSyncedAt,
    configured: googleState.configured,
    connected: googleState.connected,
    activities,
    archivedActivities,
    onConnect: async () => {
      await applicationApi().google.connect();
      renderSyncIndicator(await applicationApi().google.status());
      setStatus('Conta Google conectada. Agora clique em Sincronizar com Google.');
      await renderCurrentView();
    },
    onSync: async () => {
      const result = await applicationApi().google.syncNow();
      renderSyncIndicator(await applicationApi().google.status());
      setStatus(`Sincronizado: ${result.pushed} enviado(s), ${result.imported} importado(s).`);
      await renderCurrentView();
    },
    onArchive: async (activity) => {
      try {
        await applicationApi().activities.archive(activity.id);
        setStatus(`${activity.name} foi arquivada.`);
      } catch (error) {
        setStatus(error.message, 'error');
      }
      await renderCurrentView();
    },
    onRestore: async (activity) => {
      try {
        await applicationApi().activities.restore(activity.id);
        setStatus(`${activity.name} foi restaurada.`);
      } catch (error) {
        setStatus(error.message, 'error');
      }
      await renderCurrentView();
    },
    onPurge: (activity) => {
      dangerConfirmDialog?.open({ activity, trigger: document.activeElement });
    }
  });
}

function updateNavigation() {
  document.querySelectorAll('[data-tab]').forEach((button) => {
    button.setAttribute('aria-current', button.dataset.tab === state.tab ? 'page' : 'false');
  });
  const toggle = document.querySelector('#theme-toggle');
  if (toggle) {
    const nextTheme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    toggle.textContent = nextTheme === 'light' ? '☀' : '◐';
    toggle.setAttribute('aria-label', `Ativar ${nextTheme}`);
  }
}

function updateTodayRefreshTimer() {
  if (state.tab !== 'today') {
    if (todayRefreshInterval) clearInterval(todayRefreshInterval);
    todayRefreshInterval = null;
    return;
  }
  if (!todayRefreshInterval) {
    todayRefreshInterval = window.setInterval(() => {
      renderCurrentView();
    }, 30_000);
  }
}

async function renderCurrentView() {
  try {
    const renderers = { week: renderWeek, today: renderToday, progress: renderProgress, history: renderHistory, settings: renderSettings };
    await renderers[state.tab]();
    updateNavigation();
    updateTodayRefreshTimer();
  } catch (error) {
    document.querySelector('#app').replaceChildren(element('p', { className: 'empty', text: `Não foi possível carregar esta tela: ${error.message}` }));
    setStatus(error.message, 'error');
  }
}

async function initializeApplication() {
  if (!window.routineApi) return;
  state.theme = await applicationApi().settings.getTheme();
  applyTheme(state.theme);
  blockWizard = createBlockWizard({ root: document.querySelector('#modal-root'), onSubmit: saveBlockDraft });
  dangerConfirmDialog = createDangerConfirmDialog({
    root: document.querySelector('#modal-root'),
    onConfirm: async (activity) => {
      await applicationApi().activities.purge(activity.id);
      setStatus(`${activity.name} foi excluída definitivamente.`);
      await renderCurrentView();
    }
  });
  try {
    renderSyncIndicator(await applicationApi().google.status());
  } catch {
    renderSyncIndicator();
  }
  document.querySelectorAll('[data-tab]').forEach((button) => {
    button.addEventListener('click', async () => {
      state.tab = button.dataset.tab;
      await renderCurrentView();
    });
  });
  document.querySelector('#theme-toggle')?.addEventListener('click', async () => {
    state.theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    await applicationApi().settings.setTheme(state.theme);
    applyTheme(state.theme);
    updateNavigation();
    setStatus(`Tema ${state.theme === 'dark' ? 'escuro' : 'claro'} salvo.`);
  });
  await renderCurrentView();
}

if (typeof window !== 'undefined') {
  document.addEventListener('DOMContentLoaded', initializeApplication);
  window.addEventListener('beforeunload', () => {
    if (todayRefreshInterval) clearInterval(todayRefreshInterval);
  });
}
