import { element, formatClock, formatMinutes } from './dom.js';

function finishForm(block, onFinish) {
  const form = element('form', { className: 'finish-form' });
  const reason = element('select', { name: 'finishReason' });
  [['goal_completed', 'Objetivo concluído'], ['fatigue', 'Cansaço'], ['interruption', 'Interrupção'], ['unexpected', 'Imprevisto'], ['other', 'Outro']]
    .forEach(([value, label]) => reason.append(element('option', { value, text: label })));
  const note = element('textarea', { name: 'note', placeholder: 'O que você fez?' });
  const continuation = element('textarea', { name: 'continuationPoint', placeholder: 'Onde continuar depois?' });
  form.append(
    element('label', { text: 'Motivo do encerramento' }), reason,
    element('label', { text: 'Avanço / nota' }), note,
    element('label', { text: 'Próximo passo' }), continuation
  );
  const submit = element('button', { type: 'submit', text: 'Finalizar agora', className: 'btn-primary', dataset: { action: 'finish-block' } });
  form.append(submit);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    await onFinish({ id: block.id, finishedAt: new Date().toISOString(), finishReason: reason.value, note: note.value, continuationPoint: continuation.value });
  });
  return form;
}

function checklist(items, onToggleChecklist) {
  if (!items.length) return null;
  const section = element('section', { className: 'checklist' });
  section.append(element('h4', { text: 'Subtarefas' }));
  items.forEach((item) => {
    const row = element('label', { className: 'check-row' });
    const checkbox = element('input', { type: 'checkbox' });
    checkbox.checked = item.completed;
    checkbox.addEventListener('change', () => onToggleChecklist({ id: item.id, completed: checkbox.checked }));
    row.append(checkbox, element('span', { text: item.title }));
    section.append(row);
  });
  return section;
}

function timeValue(value) {
  if (!value) return 0;
  const [hour, minute] = value.slice(11, 16).split(':').map(Number);
  return hour * 60 + minute;
}

function plannedMinutes(block) {
  return Math.max(0, timeValue(block.plannedEndAt) - timeValue(block.plannedStartAt));
}

function chooseFocusBlock(blocks, now) {
  const active = blocks.find((block) => block.status === 'in_progress');
  if (active) return active;
  const minuteNow = now.getHours() * 60 + now.getMinutes();
  return blocks.find((block) => block.status === 'planned' && timeValue(block.plannedStartAt) >= minuteNow)
    ?? blocks.find((block) => block.status === 'planned')
    ?? blocks[0]
    ?? null;
}

function focusCard(block, items, { now, onStart, onFinish, onToggleChecklist }) {
  const card = element('section', { className: 'current-block', attributes: { 'data-current-block': '' } });
  card.style.setProperty('--task-color', block.color ?? '#e0a33c');
  const started = block.startedAt ? `começou ${formatClock(block.startedAt)}` : `previsto ${formatClock(block.plannedStartAt)}`;
  card.append(
    element('div', { className: 'focus-title' }),
    element('span', { className: `status status-${block.status}`, text: block.status === 'in_progress' ? 'Em andamento' : block.status === 'planned' ? 'A seguir' : block.status }),
    element('h2', { text: block.title }),
    element('p', { className: 'muted num', text: `${formatClock(block.plannedStartAt)}–${formatClock(block.plannedEndAt)} · ${started}` })
  );
  card.firstChild.append(element('span', { className: 'color-dot', attributes: { style: `background: ${block.color ?? '#e0a33c'}` } }), element('strong', { text: block.activityName ?? 'Bloco da rotina' }));

  if (block.status === 'in_progress') {
    const elapsed = Math.max(0, Math.floor((now.getTime() - new Date(block.startedAt).getTime()) / 60000));
    card.append(element('p', { className: 'elapsed num', text: formatMinutes(elapsed) }));
  }
  const blockChecklist = checklist(items, onToggleChecklist);
  if (blockChecklist) card.append(blockChecklist);

  if (block.status === 'planned') {
    const button = element('button', { type: 'button', text: 'Começar', className: 'btn-primary', dataset: { action: 'start-block' } });
    button.addEventListener('click', () => onStart(block));
    card.append(button);
  } else if (block.status === 'in_progress') {
    card.append(finishForm(block, onFinish));
  } else if (block.status === 'completed') {
    card.append(element('p', { text: `Concluído: ${formatMinutes(block.realMinutes ?? 0)}` }));
  }
  return card;
}

function agendaRow(block) {
  const row = element('article', { className: 'agenda-row', attributes: { 'data-agenda-block': String(block.id) } });
  row.style.setProperty('--task-color', block.color ?? '#e0a33c');
  row.append(
    element('time', { className: 'num', text: `${formatClock(block.plannedStartAt)}–${formatClock(block.plannedEndAt)}` }),
    element('strong', { text: block.title }),
    element('span', { className: 'muted', text: block.activityName ?? 'Atividade' }),
    element('span', { className: 'num muted', text: formatMinutes(plannedMinutes(block)) })
  );
  return row;
}

export function renderTodayView(root, {
  blocks = [],
  checklists = {},
  now = new Date(),
  onOpenCreate = () => {},
  onStart = () => {},
  onFinish = () => {},
  onToggleChecklist = () => {}
}) {
  const section = element('section', { className: 'today-view' });
  const heading = element('header', { className: 'view-heading' });
  const title = element('div');
  title.append(element('p', { className: 'eyebrow', text: 'HOJE' }), element('h1', { text: new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }).format(now) }));
  const create = element('button', { type: 'button', text: '+ Novo bloco', className: 'btn-primary', dataset: { action: 'open-create' } });
  create.addEventListener('click', onOpenCreate);
  heading.append(title, create);
  section.append(heading);

  if (!blocks.length) {
    const empty = element('section', { className: 'empty today-empty' });
    empty.append(element('h2', { text: 'Seu dia está livre.' }), element('p', { text: 'Crie um bloco para começar a organizar sua rotina.' }));
    const action = element('button', { type: 'button', text: 'Criar bloco', className: 'btn-primary' });
    action.addEventListener('click', onOpenCreate);
    empty.append(action);
    section.append(empty);
    root.replaceChildren(section);
    return;
  }

  const focus = chooseFocusBlock(blocks, now);
  section.append(focusCard(focus, checklists[focus.id] ?? [], { now, onStart, onFinish, onToggleChecklist }));

  const agenda = element('section', { className: 'day-agenda', attributes: { 'data-day-agenda': '', 'aria-label': 'Agenda de hoje' } });
  agenda.append(element('div', { className: 'agenda-label', text: 'A seguir' }));
  agenda.append(element('div', { className: 'current-time-line', attributes: { 'data-current-time': '' } }));
  agenda.append(...blocks.map(agendaRow));
  section.append(agenda);

  const completed = blocks.filter((block) => block.status === 'completed').length;
  const totalMinutes = blocks.reduce((total, block) => total + plannedMinutes(block), 0);
  section.append(element('p', { className: 'day-summary num', text: `${blocks.length} blocos · ${formatMinutes(totalMinutes)} planejadas · ${completed} concluído(s)` }));
  root.replaceChildren(section);
}
