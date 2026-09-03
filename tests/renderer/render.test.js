// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';

let applyTheme;
let renderWeekView;
let renderTodayView;
let renderHistoryView;

beforeEach(async () => {
  document.documentElement.removeAttribute('data-theme');
  document.body.innerHTML = '<main id="app"></main>';
  ({ applyTheme } = await import('../../src/renderer/app.js'));
  ({ renderWeekView } = await import('../../src/renderer/views/week-view.js'));
  ({ renderTodayView } = await import('../../src/renderer/views/today-view.js'));
  ({ renderHistoryView } = await import('../../src/renderer/views/history-view.js'));
});

describe('routine renderer', () => {
  it('applies the saved light theme and renders a weekday Writing Block', () => {
    applyTheme('light');
    renderWeekView(document.querySelector('#app'), {
      weekStart: '2026-09-07',
      blocks: [{
        date: '2026-09-08',
        title: 'Inglês — Writing',
        frontName: 'Writing',
        color: '#2563eb',
        status: 'planned',
        plannedStartAt: '2026-09-08T05:00:00'
      }]
    });

    expect(document.documentElement.dataset.theme).toBe('light');
    expect(document.body.textContent).toContain('Inglês — Writing');
  });

  it('renders a block checklist and saves a completed subtask', () => {
    const completed = [];
    renderTodayView(document.querySelector('#app'), {
      blocks: [{
        id: 14,
        title: 'Inglês — Reading',
        status: 'planned',
        plannedStartAt: '2026-09-08T05:00:00',
        plannedEndAt: '2026-09-08T08:00:00'
      }],
      checklists: { 14: [{ id: 4, title: 'Leitura ativa', completed: false }] },
      onStart: () => {},
      onFinish: () => {},
      onToggleChecklist: (item) => completed.push(item)
    });

    const checkbox = document.querySelector('input[type="checkbox"]');
    expect(document.body.textContent).toContain('Leitura ativa');
    checkbox.click();
    expect(completed).toEqual([{ id: 4, completed: true }]);
  });

  it('adds a new learning Track item beneath the selected Front', () => {
    const created = [];
    renderHistoryView(document.querySelector('#app'), {
      fronts: [{ id: 3, name: 'Reading' }],
      selectedFrontId: 3,
      selectedFront: { id: 3, name: 'Reading', currentPoint: '', nextStep: '' },
      blocks: [],
      trackItems: [],
      onFrontChange: () => {},
      onTrackComplete: () => {},
      onTrackCreate: (input) => created.push(input)
    });

    document.querySelector('input[name="trackTitle"]').value = 'Capítulo 2';
    document.querySelector('form[data-form="track-item"]').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    expect(created).toEqual([{ position: 1, title: 'Capítulo 2' }]);
  });
});
