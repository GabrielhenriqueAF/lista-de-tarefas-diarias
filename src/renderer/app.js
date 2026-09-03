import { dateOnly, element, labeled } from './views/dom.js';
import { renderHistoryView } from './views/history-view.js';
import { renderProgressView } from './views/progress-view.js';
import { renderSettingsView } from './views/settings-view.js';
import { renderTodayView } from './views/today-view.js';
import { renderWeekView } from './views/week-view.js';

const WEEKDAYS = [
  ['1', 'Segunda-feira'],
  ['2', 'Terça-feira'],
  ['3', 'Quarta-feira'],
  ['4', 'Quinta-feira'],
  ['5', 'Sexta-feira'],
  ['6', 'Sábado'],
  ['0', 'Domingo']
];

const state = {
  tab: 'week',
  theme: 'system',
  progressFilter: monthFilter(),
  historyFrontId: null
};

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

function setStatus(message, type = 'success') {
  const status = document.querySelector('#app-status');
  if (!status) return;
  status.textContent = message;
  status.dataset.type = type;
}

function activityOptions(select, activities, emptyText = 'Selecione uma atividade') {
  select.replaceChildren(element('option', { value: '', text: emptyText }));
  activities.forEach((activity) => select.append(element('option', { value: String(activity.id), text: activity.name })));
}

function frontOptions(select, fronts, emptyText = 'Sem Frente') {
  select.replaceChildren(element('option', { value: '', text: emptyText }));
  fronts.forEach((front) => select.append(element('option', { value: String(front.id), text: front.name })));
}

function planningPanel({ activities, fronts, refresh }) {
  const panel = element('section', { className: 'planning-panel' });
  panel.append(element('h2', { text: 'Planejar minha rotina' }), element('p', { className: 'muted', text: 'Crie sua atividade, uma Frente de trabalho e depois os horários recorrentes.' }));

  const grids = element('div', { className: 'planning-grid' });

  const activityForm = element('form', { className: 'form-card' });
  const activityName = element('input', { name: 'name', placeholder: 'Ex.: Inglês' });
  const activityCategory = element('input', { name: 'category', placeholder: 'Ex.: Estudo' });
  const activityColor = element('input', { type: 'color', name: 'color', value: '#2563eb' });
  const activityGoal = element('input', { type: 'number', name: 'weeklyGoalMinutes', value: '300' });
  activityForm.append(
    element('h3', { text: '1. Atividade' }),
    labeled('Nome', activityName),
    labeled('Categoria', activityCategory),
    labeled('Cor', activityColor),
    labeled('Meta semanal (minutos)', activityGoal),
    element('button', { type: 'submit', text: 'Adicionar atividade' })
  );
  activityForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      await applicationApi().activities.create({
        name: activityName.value,
        category: activityCategory.value,
        color: activityColor.value,
        weeklyGoalMinutes: Number(activityGoal.value) || null
      });
      setStatus('Atividade criada. Agora você pode adicionar uma Frente.');
      await refresh();
    } catch (error) {
      setStatus(error.message, 'error');
    }
  });

  const frontForm = element('form', { className: 'form-card' });
  const frontActivity = element('select', { name: 'activityId' });
  activityOptions(frontActivity, activities);
  const frontName = element('input', { name: 'name', placeholder: 'Ex.: Writing' });
  const currentPoint = element('textarea', { name: 'currentPoint', placeholder: 'Onde você está agora?' });
  const nextStep = element('textarea', { name: 'nextStep', placeholder: 'Qual é o próximo passo?' });
  frontForm.append(
    element('h3', { text: '2. Frente' }),
    labeled('Atividade', frontActivity),
    labeled('Nome da Frente', frontName),
    labeled('Ponto atual', currentPoint),
    labeled('Próximo passo', nextStep),
    element('button', { type: 'submit', text: 'Adicionar Frente' })
  );
  frontForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      await applicationApi().fronts.create({
        activityId: Number(frontActivity.value),
        name: frontName.value,
        currentPoint: currentPoint.value,
        nextStep: nextStep.value
      });
      setStatus('Frente criada. Agora defina seus blocos de horário.');
      await refresh();
    } catch (error) {
      setStatus(error.message, 'error');
    }
  });

  const ruleForm = element('form', { className: 'form-card' });
  const ruleActivity = element('select', { name: 'activityId' });
  activityOptions(ruleActivity, activities);
  const ruleFront = element('select', { name: 'frontId' });
  frontOptions(ruleFront, fronts);
  const title = element('input', { name: 'title', placeholder: 'Ex.: Inglês — Writing' });
  const weekday = element('select', { name: 'weekday' });
  WEEKDAYS.forEach(([value, label]) => weekday.append(element('option', { value, text: label })));
  const startTime = element('input', { type: 'time', name: 'startTime', value: '08:00' });
  const endTime = element('input', { type: 'time', name: 'endTime', value: '09:00' });
  const checklist = element('textarea', { name: 'checklist', placeholder: 'Subtarefas, uma por linha (opcional)' });
  ruleActivity.addEventListener('change', () => {
    frontOptions(ruleFront, fronts.filter((front) => front.activityId === Number(ruleActivity.value)));
  });
  ruleForm.append(
    element('h3', { text: '3. Bloco recorrente' }),
    labeled('Atividade', ruleActivity),
    labeled('Frente', ruleFront),
    labeled('Título', title),
    labeled('Dia da semana', weekday),
    labeled('Início', startTime),
    labeled('Término', endTime),
    labeled('Subtarefas', checklist),
    element('button', { type: 'submit', text: 'Adicionar à semana' })
  );
  ruleForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      const activity = activities.find((item) => item.id === Number(ruleActivity.value));
      const front = fronts.find((item) => item.id === Number(ruleFront.value));
      await applicationApi().rules.create({
        activityId: Number(ruleActivity.value),
        frontId: ruleFront.value ? Number(ruleFront.value) : null,
        title: title.value || [activity?.name, front?.name].filter(Boolean).join(' — '),
        weekdays: [Number(weekday.value)],
        startTime: startTime.value,
        endTime: endTime.value,
        checklistTemplate: checklist.value.split('\n').map((item) => item.trim()).filter(Boolean)
      });
      setStatus('Bloco recorrente criado e incluído na sua semana.');
      await refresh();
    } catch (error) {
      setStatus(error.message, 'error');
    }
  });

  grids.append(activityForm, frontForm, ruleForm);
  panel.append(grids);
  return panel;
}

async function loadRoutineData() {
  const activities = await applicationApi().activities.list();
  const grouped = await Promise.all(activities.map((activity) => applicationApi().fronts.list(activity.id)));
  return { activities, fronts: grouped.flat() };
}

async function renderWeek() {
  const root = document.querySelector('#app');
  const { activities, fronts } = await loadRoutineData();
  const blocks = await applicationApi().rules.listWeek(weekStart());
  renderWeekView(root, { weekStart: weekStart(), blocks });
  root.prepend(planningPanel({ activities, fronts, refresh: renderCurrentView }));
}

async function renderToday() {
  const root = document.querySelector('#app');
  const blocks = await applicationApi().blocks.listToday(dateOnly(new Date()));
  const checklistRows = await Promise.all(blocks.map(async (block) => [block.id, await applicationApi().blocks.listChecklist(block.id)]));
  const checklists = Object.fromEntries(checklistRows);
  renderTodayView(root, {
    blocks,
    checklists,
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
  const { fronts } = await loadRoutineData();
  if (!state.historyFrontId && fronts.length) state.historyFrontId = fronts[0].id;
  const selectedFront = fronts.find((front) => front.id === state.historyFrontId) ?? null;
  const [blocks, trackItems] = selectedFront
    ? await Promise.all([applicationApi().blocks.listHistory(selectedFront.id), applicationApi().track.list(selectedFront.id)])
    : [[], []];
  renderHistoryView(root, {
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
  renderSettingsView(document.querySelector('#app'), { theme: state.theme });
}

function updateNavigation() {
  document.querySelectorAll('[data-tab]').forEach((button) => {
    button.setAttribute('aria-current', button.dataset.tab === state.tab ? 'page' : 'false');
  });
  const toggle = document.querySelector('#theme-toggle');
  if (toggle) {
    const nextTheme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    toggle.textContent = nextTheme === 'light' ? '☀️ Tema claro' : '🌙 Tema escuro';
    toggle.setAttribute('aria-label', `Ativar ${nextTheme}`);
  }
}

async function renderCurrentView() {
  try {
    const renderers = { week: renderWeek, today: renderToday, progress: renderProgress, history: renderHistory, settings: renderSettings };
    await renderers[state.tab]();
    updateNavigation();
  } catch (error) {
    document.querySelector('#app').replaceChildren(element('p', { className: 'empty', text: `Não foi possível carregar esta tela: ${error.message}` }));
    setStatus(error.message, 'error');
  }
}

async function initializeApplication() {
  if (!window.routineApi) return;
  state.theme = await applicationApi().settings.getTheme();
  applyTheme(state.theme);
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
}
