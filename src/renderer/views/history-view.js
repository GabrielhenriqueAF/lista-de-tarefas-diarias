import { element, emptyState, formatClock, formatMinutes, labeled } from './dom.js';

function frontRows(fronts, activities, selectedFrontId, onFrontChange) {
  const list = element('section', { className: 'front-list', attributes: { 'aria-label': 'Frentes de trabalho' } });
  const byId = new Map(activities.map((activity) => [activity.id, activity]));
  if (!fronts.length) {
    list.append(emptyState('Crie uma atividade e uma Frente para registrar sua continuidade.'));
    return list;
  }
  fronts.forEach((front) => {
    const activity = byId.get(front.activityId);
    const row = element('button', {
      type: 'button', className: 'front-row', dataset: { frontRow: String(front.id) },
      attributes: { 'aria-current': String(front.id === selectedFrontId) }
    });
    row.style.setProperty('--front-color', activity?.color ?? '#e0a33c');
    const detail = [front.currentPoint, front.nextStep].filter(Boolean).join(' · ') || 'Ainda sem ponto de continuidade';
    row.append(
      element('span', { className: 'front-color' }),
      element('strong', { text: front.name }),
      element('span', { className: 'muted', text: activity?.name ?? 'Atividade' }),
      element('span', { className: 'front-detail', text: detail })
    );
    row.addEventListener('click', () => onFrontChange(front.id));
    list.append(row);
  });
  return list;
}

function renderTrack(selectedFront, trackItems, onTrackComplete, onTrackCreate) {
  const track = element('section', { className: 'track-list' });
  track.append(element('h3', { text: 'Trilha de aprendizado' }));
  const trackForm = element('form', { className: 'track-form', attributes: { 'data-form': 'track-item' } });
  const trackTitle = element('input', { name: 'trackTitle', placeholder: 'Ex.: Capítulo 2' });
  const trackPosition = element('input', { type: 'number', name: 'trackPosition', value: String(trackItems.length + 1) });
  trackForm.append(labeled('Novo item', trackTitle), labeled('Ordem', trackPosition), element('button', { type: 'submit', text: 'Adicionar', className: 'btn-primary' }));
  trackForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    await onTrackCreate({ position: Number(trackPosition.value), title: trackTitle.value });
  });
  track.append(trackForm);
  if (!trackItems.length) track.append(emptyState('Nenhum item de Trilha registrado.'));
  trackItems.forEach((item) => {
    const row = element('label', { className: 'check-row' });
    const checkbox = element('input', { type: 'checkbox' });
    checkbox.checked = item.status === 'completed';
    checkbox.addEventListener('change', () => { if (checkbox.checked) onTrackComplete(item.id); });
    row.append(checkbox, element('span', { text: item.title }));
    track.append(row);
  });
  return track;
}

export function renderHistoryView(root, {
  activities = [], fronts = [], selectedFrontId = null, selectedFront = null, blocks = [], trackItems = [],
  onFrontChange = () => {}, onTrackComplete = () => {}, onTrackCreate = () => {}
}) {
  const section = element('section', { className: 'fronts-view' });
  const heading = element('header', { className: 'view-heading' });
  const title = element('div');
  title.append(element('p', { className: 'eyebrow', text: 'CONTINUIDADE' }), element('h1', { text: 'Frentes' }), element('p', { className: 'muted', text: 'Retome cada estudo ou projeto exatamente de onde parou.' }));
  heading.append(title);
  section.append(heading, frontRows(fronts, activities, selectedFrontId, onFrontChange));

  if (!selectedFront) {
    root.replaceChildren(section);
    return;
  }

  const continuity = element('article', { className: 'continuity-card' });
  continuity.append(
    element('h2', { text: selectedFront.name }),
    element('p', { className: 'muted', text: 'Onde eu parei' }),
    element('p', { text: selectedFront.currentPoint || 'Ainda não registrado.' }),
    element('p', { className: 'muted', text: 'Próximo passo' }),
    element('p', { text: selectedFront.nextStep || 'Ainda não registrado.' })
  );
  section.append(continuity, renderTrack(selectedFront, trackItems, onTrackComplete, onTrackCreate));

  const history = element('section', { className: 'history-list' });
  history.append(element('h3', { text: 'Sessões anteriores' }));
  if (!blocks.length) history.append(emptyState('Nenhum Bloco concluído nesta Frente.'));
  blocks.forEach((block) => {
    const row = element('article', { className: 'history-row' });
    row.append(
      element('strong', { text: block.date }),
      element('span', { className: 'num', text: formatMinutes(block.realMinutes) }),
      element('p', { text: block.continuationPoint || block.note || 'Sem anotação.' }),
      element('span', { className: 'muted num', text: block.startedAt ? `${formatClock(block.startedAt)}–${formatClock(block.finishedAt)}` : '' })
    );
    history.append(row);
  });
  section.append(history);
  root.replaceChildren(section);
}
