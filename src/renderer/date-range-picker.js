import { element, labeled } from './views/dom.js';

const WEEKDAY_NAMES = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

function parseDate(value) {
  return new Date(`${value}T12:00:00`);
}

function dateOnly(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function addMonths(value, amount) {
  const source = parseDate(value);
  const day = source.getDate();
  const target = new Date(source.getFullYear(), source.getMonth() + amount, 1, 12);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(day, lastDay));
  return dateOnly(target);
}

function firstOfMonth(value) {
  const date = parseDate(value);
  date.setDate(1);
  return date;
}

function shiftMonth(month, amount) {
  return new Date(month.getFullYear(), month.getMonth() + amount, 1, 12);
}

function monthName(month) {
  return new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(month);
}

function isInsideRange(value, range) {
  return Boolean(range.startsOn && range.endsOn && value >= range.startsOn && value <= range.endsOn);
}

function renderMonth(month, state, selectDate) {
  const calendar = element('section', { className: 'range-month' });
  calendar.append(element('strong', { text: monthName(month) }));
  const weekdayHeader = element('div', { className: 'range-weekdays' });
  WEEKDAY_NAMES.forEach((name) => weekdayHeader.append(element('span', { text: name })));
  calendar.append(weekdayHeader);
  const days = element('div', { className: 'range-days' });
  const start = new Date(month.getFullYear(), month.getMonth(), 1, 12);
  const end = new Date(month.getFullYear(), month.getMonth() + 1, 0, 12);
  for (let index = 0; index < start.getDay(); index += 1) days.append(element('span', { className: 'range-day is-empty', text: '' }));
  for (let number = 1; number <= end.getDate(); number += 1) {
    const date = new Date(month.getFullYear(), month.getMonth(), number, 12);
    const value = dateOnly(date);
    const classes = ['range-day'];
    if (value === state.startsOn || value === state.endsOn) classes.push('is-edge');
    if (isInsideRange(value, state)) classes.push('is-selected');
    const button = element('button', {
      type: 'button', text: String(number), className: classes.join(' '), dataset: { rangeDate: value },
      attributes: { 'aria-pressed': String(value === state.startsOn || value === state.endsOn) }
    });
    button.addEventListener('click', () => selectDate(value));
    days.append(button);
  }
  calendar.append(days);
  return calendar;
}

export function createDateRangePicker({ value = {}, now = new Date(), onChange = () => {} } = {}) {
  const root = element('section', { className: 'date-range-picker', attributes: { 'aria-label': 'Período da rotina' } });
  const state = {
    startsOn: value.startsOn ?? null,
    endsOn: value.endsOn ?? null,
    visibleMonth: firstOfMonth(value.startsOn ?? dateOnly(now))
  };

  function emit() {
    onChange({ startsOn: state.startsOn, endsOn: state.endsOn });
  }

  function selectDate(value) {
    if (!state.startsOn || state.endsOn || value < state.startsOn) {
      state.startsOn = value;
      state.endsOn = null;
    } else {
      state.endsOn = value;
    }
    emit();
    render();
  }

  function setPreset(months) {
    const start = dateOnly(now);
    state.startsOn = start;
    state.endsOn = addMonths(start, months);
    state.visibleMonth = firstOfMonth(start);
    emit();
    render();
  }

  function setInput(boundary, input) {
    state[boundary] = input.value || null;
    if (state.startsOn && state.endsOn && state.endsOn < state.startsOn) state.endsOn = null;
    emit();
    render();
  }

  function render() {
    const fields = element('div', { className: 'range-fields' });
    const start = element('input', { type: 'date', value: state.startsOn ?? '', dataset: { rangeStart: '' } });
    const end = element('input', { type: 'date', value: state.endsOn ?? '', dataset: { rangeEnd: '' } });
    start.addEventListener('change', () => setInput('startsOn', start));
    end.addEventListener('change', () => setInput('endsOn', end));
    fields.append(labeled('De', start), labeled('Até', end));

    const controls = element('div', { className: 'range-controls' });
    const previous = element('button', { type: 'button', text: '‹', className: 'icon-button', dataset: { rangePrevious: '' }, attributes: { 'aria-label': 'Mês anterior' } });
    const next = element('button', { type: 'button', text: '›', className: 'icon-button', dataset: { rangeNext: '' }, attributes: { 'aria-label': 'Próximo mês' } });
    previous.addEventListener('click', () => { state.visibleMonth = shiftMonth(state.visibleMonth, -1); render(); });
    next.addEventListener('click', () => { state.visibleMonth = shiftMonth(state.visibleMonth, 1); render(); });
    controls.append(previous, next);

    const months = element('div', { className: 'range-months' });
    months.append(renderMonth(state.visibleMonth, state, selectDate), renderMonth(shiftMonth(state.visibleMonth, 1), state, selectDate));

    const shortcuts = element('div', { className: 'range-shortcuts' });
    [['3-months', '3 meses', 3], ['6-months', '6 meses', 6]].forEach(([key, text, months]) => {
      const button = element('button', { type: 'button', text, className: 'btn-ghost', dataset: { rangePreset: key } });
      button.addEventListener('click', () => setPreset(months));
      shortcuts.append(button);
    });
    const custom = element('button', { type: 'button', text: 'Personalizar', className: 'btn-ghost', dataset: { rangePreset: 'custom' } });
    custom.addEventListener('click', () => root.querySelector('[data-range-start]')?.focus());
    const clear = element('button', { type: 'button', text: 'Limpar', className: 'btn-ghost', dataset: { rangePreset: 'clear' } });
    clear.addEventListener('click', () => {
      state.startsOn = null;
      state.endsOn = null;
      emit();
      render();
    });
    shortcuts.append(custom, clear);

    root.replaceChildren(fields, controls, months, shortcuts);
  }

  render();
  return root;
}
