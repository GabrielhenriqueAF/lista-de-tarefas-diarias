import { dateOnly, element, formatClock } from './dom.js';

const MODE_LABELS = { table: 'Tabela', kanban: 'Kanban', calendar: 'Calendário' };
const STATUS_LABELS = { planned: 'A fazer', in_progress: 'Em andamento', completed: 'Concluído', cancelled: 'Cancelado' };

function weekDates(weekStart) {
  const monday = new Date(`${weekStart}T12:00:00`);
  return Array.from({ length: 7 }, (_, offset) => {
    const date = new Date(monday);
    date.setDate(date.getDate() + offset);
    return date;
  });
}

function styledBlock(block, className = 'block-card') {
  const card = element('article', { className });
  card.style.setProperty('--block-color', block.color ?? '#e0a33c');
  card.append(
    element('strong', { text: block.title }),
    element('span', { className: 'muted', text: block.activityName ?? 'Atividade' }),
    element('span', { className: `status status-${block.status}`, text: STATUS_LABELS[block.status] ?? block.status })
  );
  return card;
}

function modeSelector(mode, onModeChange) {
  const selector = element('nav', { className: 'view-switcher', attributes: { 'aria-label': 'Visualização da semana' } });
  Object.entries(MODE_LABELS).forEach(([value, label]) => {
    const button = element('button', {
      type: 'button',
      text: label,
      dataset: { weekMode: value },
      attributes: { 'aria-pressed': String(mode === value) }
    });
    button.addEventListener('click', () => onModeChange?.(value));
    selector.append(button);
  });
  return selector;
}

function formatDate(date) {
  return new Intl.DateTimeFormat('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' }).format(date);
}

function renderTable(blocks) {
  const table = element('table', { className: 'routine-table', attributes: { 'data-week-table': '' } });
  const head = element('thead');
  const headRow = element('tr');
  ['Bloco', 'Atividade', 'Frente', 'Quando', 'Status'].forEach((title) => headRow.append(element('th', { text: title, attributes: { scope: 'col' } })));
  head.append(headRow);
  const body = element('tbody');

  if (blocks.length === 0) {
    const row = element('tr');
    row.append(element('td', { text: 'Nenhum bloco nesta semana.', attributes: { colspan: '5' } }));
    body.append(row);
  } else {
    blocks.forEach((block) => {
      const row = element('tr');
      row.style.setProperty('--block-color', block.color ?? '#e0a33c');
      const when = `${formatDate(new Date(`${block.date}T12:00:00`))} · ${formatClock(block.plannedStartAt)}–${formatClock(block.plannedEndAt)}`;
      row.append(
        element('td', { className: 'table-title', text: block.title }),
        element('td', { text: block.activityName ?? '—' }),
        element('td', { text: block.frontName ?? 'Sem Frente' }),
        element('td', { className: 'num', text: when }),
        element('td', { className: `status-cell status-${block.status}`, text: STATUS_LABELS[block.status] ?? block.status })
      );
      body.append(row);
    });
  }

  table.append(head, body);
  return table;
}

function renderKanban(blocks) {
  const board = element('section', { className: 'kanban-board', attributes: { 'data-week-kanban': '', 'aria-label': 'Quadro da semana' } });
  Object.entries(STATUS_LABELS).forEach(([status, label]) => {
    const column = element('section', { className: `kanban-column status-${status}` });
    column.append(element('h3', { text: label }));
    const items = blocks.filter((block) => block.status === status);
    if (items.length) column.append(...items.map((block) => styledBlock(block, 'kanban-card')));
    else column.append(element('p', { className: 'kanban-empty', text: 'Sem blocos' }));
    board.append(column);
  });
  return board;
}

function minutesAt(value, fallback = 0) {
  if (!value) return fallback;
  const [hour, minute] = value.slice(11, 16).split(':').map(Number);
  return hour * 60 + minute;
}

function renderCalendar(weekStart, blocks) {
  const minimumStart = 5 * 60;
  const latest = blocks.reduce((current, block) => {
    const start = minutesAt(block.plannedStartAt);
    return Math.max(current, minutesAt(block.plannedEndAt, start + 60));
  }, 22 * 60);
  const end = Math.max(latest, 22 * 60);
  const height = (end - minimumStart) * 0.78;
  const calendar = element('section', { className: 'week-calendar', attributes: { 'data-week-calendar': '', 'aria-label': 'Calendário da semana' } });
  const dates = weekDates(weekStart);
  const headings = element('div', { className: 'calendar-headings' });
  headings.append(element('span', { text: '' }));
  dates.forEach((date) => headings.append(element('strong', { text: formatDate(date) })));
  calendar.append(headings);

  const body = element('div', { className: 'calendar-body', attributes: { style: `--calendar-height: ${height}px` } });
  const hours = element('div', { className: 'calendar-hours' });
  for (let minute = minimumStart; minute <= end; minute += 60) {
    hours.append(element('span', { className: 'num', text: `${String(Math.floor(minute / 60)).padStart(2, '0')}:00`, attributes: { style: `top: ${(minute - minimumStart) * 0.78}px` } }));
  }
  body.append(hours);

  dates.forEach((date) => {
    const dateKey = dateOnly(date);
    const column = element('section', { className: 'calendar-day', attributes: { 'data-date': dateKey } });
    blocks.filter((block) => block.date === dateKey).forEach((block) => {
      const card = styledBlock(block, 'calendar-block');
      const start = minutesAt(block.plannedStartAt);
      const duration = Math.max(minutesAt(block.plannedEndAt, start + 60) - start, 30);
      card.style.setProperty('--block-top', `${(start - minimumStart) * 0.78}px`);
      card.style.setProperty('--block-height', `${Math.max(duration * 0.78 - 3, 28)}px`);
      card.prepend(element('span', { className: 'num calendar-time', text: `${formatClock(block.plannedStartAt)}–${formatClock(block.plannedEndAt)}` }));
      column.append(card);
    });
    body.append(column);
  });
  calendar.append(body);
  return calendar;
}

export function renderWeekView(root, { weekStart, blocks = [], mode = 'calendar', onModeChange }) {
  const heading = element('section', { className: 'view-heading' });
  const title = element('div');
  title.append(element('p', { className: 'eyebrow', text: 'ROTINA' }), element('h1', { text: 'Minha semana' }));
  heading.append(title, modeSelector(mode, onModeChange));

  const content = mode === 'table'
    ? renderTable(blocks)
    : mode === 'kanban'
      ? renderKanban(blocks)
      : renderCalendar(weekStart, blocks);

  root.replaceChildren(heading, content);
}
