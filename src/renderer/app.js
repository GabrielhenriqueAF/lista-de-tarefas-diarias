const activeSessions = new Map();

function appRoot() { return document.querySelector('#app') ?? document.body; }
function dateString(date) { return date.toISOString().slice(0, 10); }
function formatClock(value) { return value?.slice(11, 16) ?? ''; }

export function currentWeekStart(now = new Date()) {
  const date = new Date(now);
  date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
  return dateString(date);
}

function heading(title, description) {
  const container = document.createElement('div');
  container.className = 'view-heading';
  const titleElement = document.createElement('h2');
  titleElement.textContent = title;
  const descriptionElement = document.createElement('p');
  descriptionElement.className = 'muted';
  descriptionElement.textContent = description;
  container.append(titleElement, descriptionElement);
  return container;
}

function message(text) {
  const element = document.createElement('p');
  element.className = 'empty';
  element.textContent = text;
  return element;
}

function addField(form, name, label, value = '') {
  const field = document.createElement('label');
  field.textContent = label;
  const input = name === 'subtask' ? document.createElement('input') : document.createElement('textarea');
  input.name = name;
  input.value = value;
  field.append(input);
  form.append(field);
}

async function finishActiveSession(occurrence, form) {
  const session = activeSessions.get(occurrence.id) ?? occurrence.session;
  await window.taskApi.sessions.finish({ id: session.id, finishedAt: new Date().toISOString(), note: form.elements.note.value });
  await window.taskApi.sessions.recordProgress({
    sessionId: session.id,
    subtaskTitle: form.elements.subtask.value,
    progress: form.elements.progress.value,
    continuationPoint: form.elements.continuationPoint.value
  });
  activeSessions.delete(occurrence.id);
  await renderToday();
}

async function startSession(occurrence) {
  const session = await window.taskApi.sessions.start({
    taskId: occurrence.taskId,
    scheduleId: occurrence.id,
    startedAt: new Date().toISOString(),
    plannedStartAt: occurrence.date ? `${occurrence.date}T${occurrence.startTime}:00` : null,
    plannedEndAt: occurrence.date ? `${occurrence.date}T${occurrence.endTime}:00` : null
  });
  activeSessions.set(occurrence.id, session);
  await renderToday();
}

function createOccurrenceCard(occurrence) {
  const card = document.createElement('article');
  card.className = 'task-card';
  card.style.setProperty('--task-color', occurrence.color ?? '#60a5fa');
  const title = document.createElement('p');
  title.className = 'task-title';
  title.textContent = `${occurrence.startTime ? `${occurrence.startTime} — ` : ''}${occurrence.title}`;
  card.append(title);
  if (occurrence.subtaskTitle) {
    const subtask = document.createElement('p');
    subtask.className = 'task-meta';
    subtask.textContent = `Subtarefa: ${occurrence.subtaskTitle}`;
    card.append(subtask);
  }
  const session = activeSessions.get(occurrence.id) ?? occurrence.session;
  if (session?.status === 'in_progress') {
    const started = document.createElement('p');
    started.textContent = `Iniciado às ${formatClock(session.startedAt)}`;
    const form = document.createElement('form');
    form.className = 'session-form';
    addField(form, 'subtask', 'Subtarefa', occurrence.subtaskTitle ?? '');
    addField(form, 'progress', 'O que avançou?');
    addField(form, 'continuationPoint', 'Onde continuar?');
    addField(form, 'note', 'Observação');
    const button = document.createElement('button');
    button.type = 'submit'; button.dataset.action = 'finish-session'; button.textContent = 'Finalizar agora';
    form.append(button);
    form.addEventListener('submit', async (event) => { event.preventDefault(); await finishActiveSession(occurrence, form); });
    card.append(started, form);
  } else if (typeof window.taskApi !== 'undefined' && occurrence.taskId) {
    const button = document.createElement('button');
    button.type = 'button'; button.dataset.action = 'start-session'; button.textContent = 'Iniciar agora';
    button.addEventListener('click', () => startSession(occurrence));
    card.append(button);
  }
  return card;
}

function labeledControl(form, labelText, control) {
  const label = document.createElement('label');
  label.textContent = labelText;
  label.append(control);
  form.append(label);
}

function createPlanningForm(tasks) {
  const section = document.createElement('section');
  section.className = 'task-card';
  const title = document.createElement('h3');
  title.textContent = 'Adicionar à rotina';
  const form = document.createElement('form');
  form.className = 'session-form';
  form.dataset.form = 'create-schedule';

  const existingTask = document.createElement('select');
  existingTask.name = 'existingTaskId';
  const newTask = document.createElement('option');
  newTask.value = '';
  newTask.textContent = 'Criar uma tarefa nova';
  existingTask.append(newTask);
  for (const task of tasks) {
    const option = document.createElement('option');
    option.value = String(task.id);
    option.textContent = task.title;
    existingTask.append(option);
  }
  labeledControl(form, 'Tarefa existente (opcional)', existingTask);

  const taskTitle = document.createElement('input');
  taskTitle.name = 'title';
  taskTitle.placeholder = 'Ex.: Estudar inglês';
  labeledControl(form, 'Nome da nova tarefa', taskTitle);

  const color = document.createElement('input');
  color.name = 'color'; color.type = 'color'; color.value = '#2563eb';
  labeledControl(form, 'Cor', color);

  const weekday = document.createElement('select');
  weekday.name = 'weekday';
  for (const [value, text] of [[1, 'Segunda'], [2, 'Terça'], [3, 'Quarta'], [4, 'Quinta'], [5, 'Sexta'], [6, 'Sábado'], [0, 'Domingo']]) {
    const option = document.createElement('option'); option.value = String(value); option.textContent = text; weekday.append(option);
  }
  labeledControl(form, 'Dia da semana', weekday);

  for (const [name, label, value] of [['startTime', 'Início', '05:00'], ['endTime', 'Término', '08:00']]) {
    const input = document.createElement('input'); input.name = name; input.type = 'time'; input.value = value;
    labeledControl(form, label, input);
  }
  const subtask = document.createElement('input');
  subtask.name = 'subtaskTitle'; subtask.placeholder = 'Ex.: Writing';
  labeledControl(form, 'Subtarefa (opcional)', subtask);

  const submit = document.createElement('button');
  submit.type = 'submit'; submit.textContent = 'Salvar na rotina'; form.append(submit);
  const feedback = document.createElement('p'); feedback.className = 'muted'; form.append(feedback);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      const selectedId = Number(form.elements.existingTaskId.value);
      const task = selectedId
        ? { id: selectedId }
        : await window.taskApi.tasks.create({ title: form.elements.title.value, color: form.elements.color.value });
      await window.taskApi.tasks.saveSchedule({
        taskId: task.id,
        weekday: Number(form.elements.weekday.value),
        startTime: form.elements.startTime.value,
        endTime: form.elements.endTime.value,
        subtaskTitle: form.elements.subtaskTitle.value || null
      });
      await renderWeek();
    } catch (error) {
      feedback.textContent = error.message;
    }
  });
  section.append(title, form);
  return section;
}

export async function renderWeek(occurrences) {
  const planned = occurrences ?? await window.taskApi.tasks.listWeek(currentWeekStart());
  const tasks = typeof window.taskApi !== 'undefined' ? await window.taskApi.tasks.list() : [];
  const grid = document.createElement('section');
  grid.className = 'week-grid';
  const monday = new Date(`${currentWeekStart()}T12:00:00`);
  for (let offset = 0; offset < 7; offset += 1) {
    const day = new Date(monday); day.setDate(day.getDate() + offset);
    const date = dateString(day);
    const column = document.createElement('section');
    column.className = 'day-column';
    const dayTitle = document.createElement('h3');
    dayTitle.textContent = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' }).format(day);
    column.append(dayTitle);
    const items = planned.filter((item) => item.date === date);
    column.append(...(items.length ? items.map(createOccurrenceCard) : [message('Sem tarefas previstas.')]));
    grid.append(column);
  }
  appRoot().replaceChildren(heading('Minha semana', 'Planeje e acompanhe a sua rotina.'), createPlanningForm(tasks), grid);
}

export async function renderToday(occurrences) {
  const supplied = Array.isArray(occurrences);
  const planned = supplied ? occurrences : await window.taskApi.tasks.listWeek(currentWeekStart());
  const items = supplied ? planned : planned.filter((item) => item.date === dateString(new Date()));
  appRoot().replaceChildren(heading('Hoje', 'Inicie e finalize usando o horário real.'), ...(items.length ? items.map(createOccurrenceCard) : [message('Nenhuma tarefa prevista para hoje.')]));
}

export function formatMinutes(totalMinutes) {
  return `${Math.floor(totalMinutes / 60)}h ${totalMinutes % 60}m`;
}

export async function renderProgress(reportOrFilter) {
  const report = Number.isFinite(reportOrFilter?.realMinutes)
    ? reportOrFilter
    : await window.taskApi.reports.progress(reportOrFilter);
  const metrics = document.createElement('section');
  metrics.className = 'task-card';
  const total = document.createElement('p');
  total.className = 'task-title';
  total.textContent = formatMinutes(report.realMinutes);
  const days = document.createElement('p');
  days.textContent = `${report.activeDays} dias ativos`;
  const sessions = document.createElement('p');
  sessions.className = 'task-meta';
  sessions.textContent = `${report.sessions ?? 0} sessões concluídas`;
  metrics.append(total, days, sessions);

  const subtasks = document.createElement('ul');
  for (const subtask of report.subtasks ?? []) {
    const item = document.createElement('li');
    item.textContent = subtask;
    subtasks.append(item);
  }
  appRoot().replaceChildren(
    heading('Progresso', 'Tempo real investido no período escolhido.'),
    metrics,
    ...(subtasks.children.length ? [subtasks] : [message('Ainda não há subtarefas registradas neste período.')])
  );
}

export async function renderHistory(entriesOrTaskId) {
  const entries = Array.isArray(entriesOrTaskId)
    ? entriesOrTaskId
    : await window.taskApi.sessions.listHistory(entriesOrTaskId);
  const list = document.createElement('ol');
  for (const entry of entries) {
    const row = document.createElement('li');
    row.textContent = `${entry.subtaskTitle}: ${entry.continuationPoint}`;
    list.append(row);
  }
  appRoot().replaceChildren(
    heading('Histórico', 'Continue exatamente de onde parou.'),
    ...(entries.length ? [list] : [message('Nenhum registro de estudo foi criado ainda.')])
  );
}

function currentMonthFilter(taskId) {
  const now = new Date();
  return {
    taskId,
    from: dateString(new Date(now.getFullYear(), now.getMonth(), 1)),
    to: dateString(now)
  };
}

function createTaskFilter(tasks, filter, dataForm) {
  const form = document.createElement('form');
  form.className = 'session-form';
  form.dataset.form = dataForm;
  const select = document.createElement('select');
  select.name = 'taskId';
  for (const task of tasks) {
    const option = document.createElement('option');
    option.value = String(task.id); option.textContent = task.title;
    option.selected = task.id === filter.taskId;
    select.append(option);
  }
  labeledControl(form, 'Tarefa', select);
  if (dataForm === 'progress-filter') {
    for (const [name, label, value] of [['from', 'De', filter.from], ['to', 'Até', filter.to]]) {
      const input = document.createElement('input'); input.name = name; input.type = 'date'; input.value = value;
      labeledControl(form, label, input);
    }
  }
  const submit = document.createElement('button'); submit.type = 'submit'; submit.textContent = 'Aplicar filtro'; form.append(submit);
  return form;
}

export async function renderProgressPanel(tasks, suppliedReport, suppliedFilter) {
  const availableTasks = tasks ?? await window.taskApi.tasks.list();
  if (!availableTasks.length) {
    appRoot().replaceChildren(heading('Progresso', 'Tempo real investido no período escolhido.'), message('Crie uma tarefa na aba Minha semana para acompanhar o progresso.'));
    return;
  }
  const filter = suppliedFilter ?? currentMonthFilter(availableTasks[0].id);
  const report = suppliedReport ?? await window.taskApi.reports.progress(filter);
  await renderProgress(report);
  const form = createTaskFilter(availableTasks, filter, 'progress-filter');
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    await renderProgressPanel(availableTasks, undefined, {
      taskId: Number(form.elements.taskId.value),
      from: form.elements.from.value,
      to: form.elements.to.value
    });
  });
  appRoot().prepend(form);
}

export async function renderHistoryPanel(tasks, suppliedEntries, suppliedTaskId) {
  const availableTasks = tasks ?? await window.taskApi.tasks.list();
  if (!availableTasks.length) {
    appRoot().replaceChildren(heading('Histórico', 'Continue exatamente de onde parou.'), message('Crie uma tarefa para começar seu histórico.'));
    return;
  }
  const taskId = suppliedTaskId ?? availableTasks[0].id;
  const entries = suppliedEntries ?? await window.taskApi.sessions.listHistory(taskId);
  await renderHistory(entries);
  const form = createTaskFilter(availableTasks, { taskId }, 'history-filter');
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    await renderHistoryPanel(availableTasks, undefined, Number(form.elements.taskId.value));
  });
  appRoot().prepend(form);
}

async function selectTab(tab) {
  document.querySelectorAll('[data-tab]').forEach((button) => button.setAttribute('aria-current', button.dataset.tab === tab ? 'page' : 'false'));
  if (tab === 'week') return renderWeek();
  if (tab === 'today') return renderToday();
  if (tab === 'progress') return renderProgressPanel();
  return renderHistoryPanel();
}

function initialize() {
  document.querySelectorAll('[data-tab]').forEach((button) => button.addEventListener('click', () => selectTab(button.dataset.tab)));
  selectTab('week');
}

if (typeof window !== 'undefined' && window.taskApi) document.addEventListener('DOMContentLoaded', initialize, { once: true });
