import { element, labeled } from './views/dom.js';
import { createDateRangePicker } from './date-range-picker.js';

const WEEKDAYS = [[1, 'Seg'], [2, 'Ter'], [3, 'Qua'], [4, 'Qui'], [5, 'Sex'], [6, 'Sáb'], [0, 'Dom']];
const COLORS = ['#6E8FB5', '#9C7AB7', '#CC8A5C', '#78A584', '#B97777', '#C9A85A'];
const RECURRING_WEEKDAY_NAMES = { 0: 'domingo', 1: 'segunda-feira', 2: 'terça-feira', 3: 'quarta-feira', 4: 'quinta-feira', 5: 'sexta-feira', 6: 'sábado' };

function controlButton(text, dataset, active = false) {
  return element('button', {
    type: 'button', text, className: active ? 'wizard-choice is-active' : 'wizard-choice', dataset,
    attributes: { 'aria-pressed': String(active) }
  });
}

function fieldValue(root, name, fallback = '') {
  return root.querySelector(`[name="${name}"]`)?.value ?? fallback;
}

function fullMonthsBetween(startsOn, endsOn) {
  if (!startsOn || !endsOn) return 0;
  const start = new Date(`${startsOn}T12:00:00`);
  const end = new Date(`${endsOn}T12:00:00`);
  const months = ((end.getFullYear() - start.getFullYear()) * 12) + end.getMonth() - start.getMonth();
  return end.getDate() === start.getDate() ? months : 0;
}

function shortDate(value) {
  const [year, month, day] = value.split('-');
  return `${day}/${month}/${year}`;
}

export function createBlockWizard({ root, onSubmit }) {
  const state = {
    step: 1,
    activities: [],
    fronts: [],
    trigger: null,
    error: '',
    activityMode: 'create',
    activityId: '',
    activityName: '',
    category: '',
    color: COLORS[0],
    weeklyGoalMinutes: '',
    frontMode: 'skip',
    frontId: '',
    frontName: '',
    currentPoint: '',
    nextStep: '',
    weekdays: new Set(),
    periodMode: 'open',
    startsOn: null,
    endsOn: null,
    startTime: '08:00',
    endTime: '09:00',
    checklist: ''
  };

  function close() {
    root.replaceChildren();
    state.trigger?.focus?.();
  }

  function setError(message) {
    state.error = message;
    render();
  }

  function selectedActivity() {
    return state.activities.find((activity) => activity.id === Number(state.activityId)) ?? null;
  }

  function availableFronts() {
    const activityId = state.activityMode === 'existing' ? Number(state.activityId) : null;
    return activityId ? state.fronts.filter((front) => front.activityId === activityId) : [];
  }

  function rememberActivityFields(dialog) {
    state.activityId = fieldValue(dialog, 'activityId', state.activityId);
    state.activityName = fieldValue(dialog, 'activityName', state.activityName);
    state.category = fieldValue(dialog, 'activityCategory', state.category);
    state.color = fieldValue(dialog, 'activityColor', state.color).toUpperCase();
    state.weeklyGoalMinutes = fieldValue(dialog, 'weeklyGoalMinutes', state.weeklyGoalMinutes);
  }

  function rememberFrontFields(dialog) {
    state.frontId = fieldValue(dialog, 'frontId', state.frontId);
    state.frontName = fieldValue(dialog, 'frontName', state.frontName);
    state.currentPoint = fieldValue(dialog, 'currentPoint', state.currentPoint);
    state.nextStep = fieldValue(dialog, 'nextStep', state.nextStep);
  }

  function rememberRuleFields(dialog) {
    state.startTime = fieldValue(dialog, 'startTime', state.startTime);
    state.endTime = fieldValue(dialog, 'endTime', state.endTime);
    state.checklist = fieldValue(dialog, 'checklistTemplate', state.checklist);
  }

  function validateStepOne(dialog) {
    rememberActivityFields(dialog);
    if (state.activityMode === 'existing' && !state.activityId) return 'Escolha uma atividade.';
    if (state.activityMode === 'create' && !state.activityName.trim()) return 'Dê um nome para a atividade.';
    return '';
  }

  function validateStepTwo(dialog) {
    rememberFrontFields(dialog);
    if (state.frontMode === 'existing' && !state.frontId) return 'Escolha uma Frente.';
    if (state.frontMode === 'create' && !state.frontName.trim()) return 'Dê um nome para a Frente.';
    return '';
  }

  function validateStepThree(dialog) {
    rememberRuleFields(dialog);
    if (state.weekdays.size === 0) return 'Escolha pelo menos um dia.';
    if (!state.startTime || !state.endTime || state.endTime <= state.startTime) return 'O término precisa ser depois do início.';
    if (state.periodMode === 'range' && (!state.startsOn || !state.endsOn)) return 'Escolha o início e o fim do período.';
    return '';
  }

  function draft() {
    const activity = state.activityMode === 'existing'
      ? { mode: 'existing', id: Number(state.activityId) }
      : {
          mode: 'create', name: state.activityName.trim(), category: state.category.trim(), color: state.color,
          weeklyGoalMinutes: Number(state.weeklyGoalMinutes) || null
        };
    const front = state.frontMode === 'skip'
      ? { mode: 'skip' }
      : state.frontMode === 'existing'
        ? { mode: 'existing', id: Number(state.frontId) }
        : { mode: 'create', name: state.frontName.trim(), currentPoint: state.currentPoint.trim(), nextStep: state.nextStep.trim() };
    return {
      activity,
      front,
      weekdays: [...state.weekdays].sort((first, second) => first - second),
      startTime: state.startTime,
      endTime: state.endTime,
      checklistTemplate: state.checklist.split('\n').map((item) => item.trim()).filter(Boolean),
      startsOn: state.periodMode === 'range' ? state.startsOn : null,
      endsOn: state.periodMode === 'range' ? state.endsOn : null
    };
  }

  function recurrenceSummary() {
    const weekdays = [...state.weekdays].sort((first, second) => first - second).map((weekday) => RECURRING_WEEKDAY_NAMES[weekday]);
    if (!weekdays.length) return 'Escolha os dias em que o bloco deve acontecer.';
    const every = weekdays.length === 1 ? `Toda ${weekdays[0]}` : `Toda ${weekdays.slice(0, -1).join(', ')} e ${weekdays.at(-1)}`;
    if (state.periodMode !== 'range') return `${every}, sem data de encerramento.`;
    if (!state.startsOn || !state.endsOn) return `${every} — escolha o início e o fim do período.`;
    const months = fullMonthsBetween(state.startsOn, state.endsOn);
    if (months > 0) return `${every} por ${months} ${months === 1 ? 'mês' : 'meses'}.`;
    return `${every}, de ${shortDate(state.startsOn)} até ${shortDate(state.endsOn)}.`;
  }

  function heading(dialog) {
    const header = element('header', { className: 'wizard-header' });
    header.append(element('div', { text: '' }), element('button', { type: 'button', text: '×', className: 'icon-button', dataset: { wizardClose: '' }, attributes: { 'aria-label': 'Fechar' } }));
    header.firstChild.append(element('p', { className: 'eyebrow', text: `PASSO ${state.step} DE 3` }), element('h2', { text: state.step === 1 ? 'Atividade' : state.step === 2 ? 'Frente' : 'Bloco da rotina' }));
    header.querySelector('[data-wizard-close]').addEventListener('click', close);
    dialog.append(header);
    const progress = element('div', { className: 'wizard-progress', attributes: { 'aria-label': `Passo ${state.step} de 3` } });
    [1, 2, 3].forEach((number) => progress.append(element('i', { className: number <= state.step ? 'is-active' : '' })));
    dialog.append(progress);
  }

  function renderActivity(dialog) {
    const content = element('section', { className: 'wizard-content' });
    content.append(element('p', { className: 'muted', text: 'Agrupe seus blocos em uma atividade, como Inglês ou Trabalho GG.' }));
    if (state.activities.length) {
      const choices = element('div', { className: 'wizard-choices' });
      const existing = controlButton('Usar existente', { activityMode: 'existing' }, state.activityMode === 'existing');
      const create = controlButton('Criar atividade', { activityMode: 'create' }, state.activityMode === 'create');
      existing.addEventListener('click', () => { state.activityMode = 'existing'; state.error = ''; render(); });
      create.addEventListener('click', () => { state.activityMode = 'create'; state.error = ''; render(); });
      choices.append(existing, create);
      content.append(choices);
    }
    if (state.activityMode === 'existing') {
      const select = element('select', { name: 'activityId', value: state.activityId });
      select.append(element('option', { value: '', text: 'Selecione a atividade' }));
      state.activities.forEach((activity) => select.append(element('option', { value: String(activity.id), text: activity.name })));
      select.value = state.activityId;
      content.append(labeled('Atividade', select));
    } else {
      const name = element('input', { name: 'activityName', value: state.activityName, placeholder: 'Ex.: Inglês' });
      const category = element('input', { name: 'activityCategory', value: state.category, placeholder: 'Ex.: Estudo' });
      const goal = element('input', { name: 'weeklyGoalMinutes', type: 'number', value: state.weeklyGoalMinutes, placeholder: 'Meta semanal em minutos (opcional)' });
      const swatches = element('div', { className: 'color-swatches', attributes: { 'aria-label': 'Cor da atividade' } });
      COLORS.forEach((color) => {
        const swatch = element('button', { type: 'button', className: color === state.color ? 'color-swatch is-active' : 'color-swatch', attributes: { style: `--swatch: ${color}`, 'aria-label': `Cor ${color}` } });
        swatch.addEventListener('click', () => { state.color = color; render(); });
        swatches.append(swatch);
      });
      const color = element('input', { name: 'activityColor', type: 'color', value: state.color, attributes: { 'aria-label': 'Cor personalizada' } });
      content.append(labeled('Nome', name), labeled('Categoria', category), labeled('Meta semanal', goal), element('span', { className: 'field-label', text: 'Cor' }), swatches, color);
    }
    dialog.append(content);
  }

  function renderFront(dialog) {
    const content = element('section', { className: 'wizard-content' });
    content.append(element('p', { className: 'muted', text: 'Uma Frente detalha o foco da atividade. Você pode deixar para depois.' }));
    const choices = element('div', { className: 'wizard-choices' });
    [['skip', 'Sem Frente'], ['existing', 'Usar existente'], ['create', 'Criar Frente']].forEach(([mode, label]) => {
      if (mode !== 'existing' || availableFronts().length) {
        const choice = controlButton(label, { frontMode: mode }, state.frontMode === mode);
        choice.addEventListener('click', () => { state.frontMode = mode; state.error = ''; render(); });
        choices.append(choice);
      }
    });
    content.append(choices);
    if (state.frontMode === 'existing') {
      const select = element('select', { name: 'frontId', value: state.frontId });
      select.append(element('option', { value: '', text: 'Selecione a Frente' }));
      availableFronts().forEach((front) => select.append(element('option', { value: String(front.id), text: front.name })));
      select.value = state.frontId;
      content.append(labeled('Frente', select));
    }
    if (state.frontMode === 'create') {
      content.append(
        labeled('Nome', element('input', { name: 'frontName', value: state.frontName, placeholder: 'Ex.: Writing' })),
        labeled('Onde estou', element('textarea', { name: 'currentPoint', value: state.currentPoint, placeholder: 'Ex.: Unidade 3' })),
        labeled('Próximo passo', element('textarea', { name: 'nextStep', value: state.nextStep, placeholder: 'Ex.: Fazer exercício 13' }))
      );
    }
    dialog.append(content);
  }

  function renderRule(dialog) {
    const content = element('section', { className: 'wizard-content' });
    content.append(element('p', { className: 'muted', text: 'Escolha em quais dias o bloco se repete e por quanto tempo a rotina vale.' }));
    const days = element('div', { className: 'weekday-picker', attributes: { 'aria-label': 'Dias da semana' } });
    WEEKDAYS.forEach(([weekday, label]) => {
      const button = controlButton(label, { wizardDay: weekday }, state.weekdays.has(weekday));
      button.addEventListener('click', () => {
        if (state.weekdays.has(weekday)) state.weekdays.delete(weekday);
        else state.weekdays.add(weekday);
        state.error = '';
        render();
      });
      days.append(button);
    });
    const periodChoices = element('div', { className: 'wizard-choices', attributes: { 'aria-label': 'Duração da rotina' } });
    [['open', 'Sem data para terminar'], ['range', 'Definir período']].forEach(([mode, label]) => {
      const choice = controlButton(label, { wizardPeriodMode: mode }, state.periodMode === mode);
      choice.addEventListener('click', () => {
        state.periodMode = mode;
        state.error = '';
        render();
      });
      periodChoices.append(choice);
    });
    const start = element('input', { name: 'startTime', type: 'time', value: state.startTime });
    const end = element('input', { name: 'endTime', type: 'time', value: state.endTime });
    const checklist = element('textarea', { name: 'checklistTemplate', value: state.checklist, placeholder: 'Subtarefas, uma por linha (opcional)' });
    content.append(element('span', { className: 'field-label', text: 'Repetir em' }), days, element('span', { className: 'field-label', text: 'Duração' }), periodChoices);
    if (state.periodMode === 'range') {
      content.append(createDateRangePicker({
        value: { startsOn: state.startsOn, endsOn: state.endsOn },
        onChange: ({ startsOn, endsOn }) => {
          state.startsOn = startsOn;
          state.endsOn = endsOn;
          state.error = '';
          render();
        }
      }));
    }
    content.append(element('p', { className: 'recurrence-summary', text: recurrenceSummary(), attributes: { 'data-recurrence-summary': '' } }));
    content.append(labeled('Início', start), labeled('Término', end), labeled('Checklist', checklist));
    dialog.append(content);
  }

  function footer(dialog) {
    const footer = element('footer', { className: 'wizard-footer' });
    if (state.step > 1) {
      const previous = element('button', { type: 'button', text: 'Voltar', className: 'btn-ghost', dataset: { wizardPrevious: '' } });
      previous.addEventListener('click', () => { state.step -= 1; state.error = ''; render(); });
      footer.append(previous);
    }
    const advance = state.step === 3
      ? element('button', { type: 'button', text: 'Adicionar bloco', className: 'btn-primary', dataset: { wizardSubmit: '' } })
      : element('button', { type: 'button', text: 'Continuar', className: 'btn-primary', dataset: { wizardNext: '' } });
    advance.addEventListener('click', () => {
      const error = state.step === 1 ? validateStepOne(dialog) : state.step === 2 ? validateStepTwo(dialog) : validateStepThree(dialog);
      if (error) return setError(error);
      if (state.step < 3) {
        state.step += 1;
        state.error = '';
        return render();
      }
      const result = onSubmit(draft());
      if (result?.then) result.then(close).catch((failure) => setError(failure.message));
      else close();
    });
    footer.append(advance);
    dialog.append(footer);
  }

  function trapFocus(event) {
    if (event.key === 'Escape') return close();
    if (event.key !== 'Tab') return;
    const focusable = [...root.querySelectorAll('button, input, select, textarea')].filter((node) => !node.disabled);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }

  function render() {
    const backdrop = element('section', { className: 'wizard-backdrop', attributes: { role: 'presentation' } });
    const dialog = element('section', { className: 'wizard-dialog', attributes: { role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Novo bloco da rotina' } });
    heading(dialog);
    if (state.error) dialog.append(element('p', { className: 'wizard-error', text: state.error, attributes: { role: 'alert' } }));
    if (state.step === 1) renderActivity(dialog);
    if (state.step === 2) renderFront(dialog);
    if (state.step === 3) renderRule(dialog);
    footer(dialog);
    backdrop.append(dialog);
    backdrop.addEventListener('keydown', trapFocus);
    root.replaceChildren(backdrop);
    dialog.querySelector('input, select, textarea, button')?.focus();
  }

  return {
    open({ activities = [], fronts = [], trigger = document.activeElement } = {}) {
      Object.assign(state, {
        step: 1, activities, fronts, trigger, error: '', activityMode: activities.length ? 'existing' : 'create',
        activityId: activities.length ? String(activities[0].id) : '', activityName: '', category: '', color: COLORS[0],
        weeklyGoalMinutes: '', frontMode: 'skip', frontId: '', frontName: '', currentPoint: '', nextStep: '',
        weekdays: new Set(), periodMode: 'open', startsOn: null, endsOn: null, startTime: '08:00', endTime: '09:00', checklist: ''
      });
      render();
    },
    close
  };
}
