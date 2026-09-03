import { element, emptyState, formatClock, formatMinutes } from './dom.js';

function finishForm(block, onFinish) {
  const form = element('form', { className: 'finish-form' });
  const reason = element('select', { name: 'finishReason' });
  [['goal_completed', 'Objetivo concluído'], ['fatigue', 'Cansaço'], ['interruption', 'Interrupção'], ['unexpected', 'Imprevisto'], ['other', 'Outro']]
    .forEach(([value, label]) => reason.append(element('option', { value, text: label })));
  const note = element('textarea', { name: 'note', placeholder: 'O que você fez?' });
  const continuation = element('textarea', { name: 'continuationPoint', placeholder: 'Onde continuar depois?' });
  form.append(
    element('label', { text: 'Motivo do encerramento' }),
    reason,
    element('label', { text: 'Avanço / nota' }),
    note,
    element('label', { text: 'Próximo passo' }),
    continuation
  );
  const submit = element('button', { type: 'submit', text: 'Finalizar agora', dataset: { action: 'finish-block' } });
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

export function renderTodayView(root, { blocks = [], checklists = {}, onStart, onFinish, onToggleChecklist = () => {} }) {
  const section = element('section');
  section.append(element('h2', { text: 'Hoje' }), element('p', { className: 'muted', text: 'Use o horário real para acompanhar sua rotina.' }));
  if (!blocks.length) {
    section.append(emptyState('Nenhum bloco planejado para hoje.'));
    root.replaceChildren(section);
    return;
  }

  const list = element('section', { className: 'today-list' });
  for (const block of blocks) {
    const card = element('article', { className: 'task-card' });
    card.style.setProperty('--task-color', block.color ?? '#2563eb');
    card.append(
      element('h3', { text: block.title }),
      element('p', { className: 'muted', text: `Previsto: ${formatClock(block.plannedStartAt)}–${formatClock(block.plannedEndAt)}` })
    );
    const blockChecklist = checklist(checklists[block.id] ?? [], onToggleChecklist);
    if (blockChecklist) card.append(blockChecklist);
    if (block.status === 'planned') {
      const button = element('button', { type: 'button', text: 'Começar', dataset: { action: 'start-block' } });
      button.addEventListener('click', () => onStart(block));
      card.append(button);
    } else if (block.status === 'in_progress') {
      card.append(element('p', { text: `Iniciado às ${formatClock(block.startedAt)}` }), finishForm(block, onFinish));
    } else if (block.status === 'completed') {
      card.append(element('p', { text: `Concluído: ${formatMinutes(block.realMinutes)}` }));
    } else {
      card.append(element('p', { className: 'muted', text: 'Cancelado' }));
    }
    list.append(card);
  }
  section.append(list);
  root.replaceChildren(section);
}
