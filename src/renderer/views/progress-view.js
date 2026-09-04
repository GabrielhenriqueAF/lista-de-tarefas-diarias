import { element, emptyState, formatMinutes, labeled } from './dom.js';
import { renderBarChart, renderLineChart } from './chart-view.js';

export function renderProgressView(root, { activities = [], fronts = [], filter, report, onFilter }) {
  const section = element('section', { className: 'progress-view' });
  const heading = element('header', { className: 'view-heading' });
  const title = element('div');
  title.append(element('p', { className: 'eyebrow', text: 'RELATÓRIOS' }), element('h1', { text: 'Progresso' }), element('p', { className: 'muted', text: 'Horas reais, consistência e aderência de horário.' }));
  heading.append(title);
  section.append(heading);

  const form = element('form', { className: 'filter-row' });
  const activity = element('select', { name: 'activityId' });
  activity.append(element('option', { value: '', text: 'Todas as atividades' }));
  activities.forEach((item) => {
    const option = element('option', { value: String(item.id), text: item.name });
    option.selected = item.id === filter.activityId;
    activity.append(option);
  });
  const front = element('select', { name: 'frontId' });
  front.append(element('option', { value: '', text: 'Todas as frentes' }));
  fronts.forEach((item) => {
    const option = element('option', { value: String(item.id), text: item.name });
    option.selected = item.id === filter.frontId;
    front.append(option);
  });
  const from = element('input', { type: 'date', name: 'from', value: filter.from });
  const to = element('input', { type: 'date', name: 'to', value: filter.to });
  form.append(labeled('Atividade', activity), labeled('Frente', front), labeled('De', from), labeled('Até', to));
  form.append(element('button', { type: 'submit', text: 'Atualizar', className: 'btn-primary' }));
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    onFilter({ activityId: activity.value ? Number(activity.value) : null, frontId: front.value ? Number(front.value) : null, from: from.value, to: to.value });
  });
  section.append(form);

  if (!report) {
    section.append(emptyState('Escolha um período para carregar os indicadores.'));
    root.replaceChildren(section);
    return;
  }

  const cards = element('section', { className: 'metric-grid' });
  [['Horas reais', formatMinutes(report.summary.realMinutes)], ['Dias ativos', String(report.summary.activeDays)], ['Sessões', String(report.summary.sessions)]]
    .forEach(([label, value]) => {
      const card = element('article', { className: 'metric-card' });
      card.append(element('span', { className: 'muted', text: label }), element('strong', { text: value }));
      cards.append(card);
    });
  section.append(cards);

  const charts = element('section', { className: 'charts-grid' });
  const byActivity = element('article', { className: 'chart-card' });
  byActivity.append(element('h3', { text: 'Horas por atividade' }), renderBarChart(report.hoursByActivity));
  const weekly = element('article', { className: 'chart-card' });
  weekly.append(element('h3', { text: 'Evolução semanal' }), renderLineChart(report.weeklyHours));
  const byFront = element('article', { className: 'chart-card' });
  byFront.append(element('h3', { text: 'Distribuição por frente' }), renderBarChart(report.hoursByFront));
  const adherence = element('article', { className: 'chart-card' });
  adherence.append(element('h3', { text: 'Aderência de horário' }), renderBarChart(report.adherence));
  charts.append(byActivity, weekly, byFront, adherence);
  section.append(charts);
  root.replaceChildren(section);
}

