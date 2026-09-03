import { dateOnly, element, emptyState, formatClock } from './dom.js';

function weekDates(weekStart) {
  const monday = new Date(`${weekStart}T12:00:00`);
  return Array.from({ length: 7 }, (_, offset) => {
    const date = new Date(monday);
    date.setDate(date.getDate() + offset);
    return date;
  });
}

function blockCard(block) {
  const card = element('article', { className: 'block-card' });
  card.style.setProperty('--block-color', block.color ?? '#2563eb');
  card.append(
    element('strong', { text: `${formatClock(block.plannedStartAt)} · ${block.title}` }),
    element('span', { className: 'muted', text: block.frontName ? block.frontName : 'Sem Frente' }),
    element('span', { className: `status status-${block.status}`, text: block.status })
  );
  return card;
}

export function renderWeekView(root, { weekStart, blocks = [] }) {
  const heading = element('section', { className: 'view-heading' });
  heading.append(
    element('div', { text: '' }),
    element('p', { className: 'muted', text: 'Planeje Atividades, Frentes e blocos recorrentes.' })
  );
  heading.firstChild.append(element('h2', { text: 'Minha semana' }));

  const grid = element('section', { className: 'week-grid', attributes: { 'aria-label': 'Rotina da semana' } });
  const formatter = new Intl.DateTimeFormat('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' });
  for (const date of weekDates(weekStart)) {
    const dateKey = dateOnly(date);
    const column = element('section', { className: 'day-column' });
    column.append(element('h3', { text: formatter.format(date) }));
    const items = blocks.filter((block) => block.date === dateKey);
    column.append(...(items.length ? items.map(blockCard) : [emptyState('Livre')]));
    grid.append(column);
  }

  root.replaceChildren(heading, grid);
}

