import { element, emptyState, formatClock, formatMinutes, labeled } from './dom.js';

export function renderHistoryView(root, { fronts = [], selectedFrontId = null, selectedFront = null, blocks = [], trackItems = [], onFrontChange, onTrackComplete, onTrackCreate = () => {} }) {
  const section = element('section');
  section.append(element('h2', { text: 'Histórico' }), element('p', { className: 'muted', text: 'Retome a próxima sessão exatamente de onde parou.' }));
  const filter = element('select', { name: 'frontId' });
  filter.append(element('option', { value: '', text: 'Escolha uma Frente' }));
  fronts.forEach((front) => {
    const option = element('option', { value: String(front.id), text: front.name });
    option.selected = front.id === selectedFrontId;
    filter.append(option);
  });
  filter.addEventListener('change', () => onFrontChange(filter.value ? Number(filter.value) : null));
  section.append(labeled('Frente', filter));

  if (!selectedFront) {
    section.append(emptyState('Escolha uma Frente para ver seu ponto atual e sua Trilha.'));
    root.replaceChildren(section);
    return;
  }

  const continuity = element('article', { className: 'continuity-card' });
  continuity.append(
    element('h3', { text: selectedFront.name }),
    element('p', { text: `Ponto atual: ${selectedFront.currentPoint || 'Ainda não registrado.'}` }),
    element('p', { text: `Próximo passo: ${selectedFront.nextStep || 'Ainda não registrado.'}` })
  );
  section.append(continuity);

  const track = element('section', { className: 'track-list' });
  track.append(element('h3', { text: 'Trilha' }));
  const trackForm = element('form', { className: 'track-form', attributes: { 'data-form': 'track-item' } });
  const trackTitle = element('input', { name: 'trackTitle', placeholder: 'Ex.: Capítulo 2' });
  const trackPosition = element('input', { type: 'number', name: 'trackPosition', value: String(trackItems.length + 1) });
  trackForm.append(labeled('Novo item', trackTitle), labeled('Ordem', trackPosition), element('button', { type: 'submit', text: 'Adicionar à Trilha' }));
  trackForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    await onTrackCreate({ position: Number(trackPosition.value), title: trackTitle.value });
  });
  track.append(trackForm);
  if (!trackItems.length) track.append(emptyState('Nenhum item de Trilha registrado.'));
  trackItems.forEach((item) => {
    const row = element('label', { className: 'check-row' });
    const checkbox = element('input', { type: 'checkbox', attributes: { checked: item.status === 'completed' ? 'checked' : '' } });
    checkbox.checked = item.status === 'completed';
    checkbox.addEventListener('change', () => { if (checkbox.checked) onTrackComplete(item.id); });
    row.append(checkbox, element('span', { text: item.title }));
    track.append(row);
  });
  section.append(track);

  const history = element('section', { className: 'history-list' });
  history.append(element('h3', { text: 'Blocos anteriores' }));
  if (!blocks.length) history.append(emptyState('Nenhum Bloco concluído nesta Frente.'));
  blocks.forEach((block) => {
    const row = element('article', { className: 'history-row' });
    row.append(
      element('strong', { text: block.date }),
      element('span', { text: formatMinutes(block.realMinutes) }),
      element('p', { text: block.continuationPoint || block.note || 'Sem anotação.' }),
      element('span', { className: 'muted', text: block.startedAt ? `${formatClock(block.startedAt)}–${formatClock(block.finishedAt)}` : '' })
    );
    history.append(row);
  });
  section.append(history);
  root.replaceChildren(section);
}
