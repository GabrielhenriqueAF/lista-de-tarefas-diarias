// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';

let applyTheme;
let initialUiState;
let renderWeekView;
let renderTodayView;
let refreshElapsedTimers;
let renderHistoryView;
let renderSettingsView;
let showToast;

beforeEach(async () => {
  document.documentElement.removeAttribute('data-theme');
  document.body.innerHTML = '<main id="app"></main>';
  ({ applyTheme, initialUiState, showToast } = await import('../../src/renderer/app.js'));
  ({ renderWeekView } = await import('../../src/renderer/views/week-view.js'));
  ({ renderTodayView, refreshElapsedTimers } = await import('../../src/renderer/views/today-view.js'));
  ({ renderHistoryView } = await import('../../src/renderer/views/history-view.js'));
  ({ renderSettingsView } = await import('../../src/renderer/views/settings-view.js'));
});

describe('routine renderer', () => {
  it('uses Today as the initial tab and renders a transient toast region', () => {
    document.body.innerHTML = '<header><button data-tab="today"></button></header><main id="app"></main><div id="toast" hidden></div>';

    expect(initialUiState()).toMatchObject({ tab: 'today', weekMode: 'calendar' });
    showToast('Bloco criado');

    expect(document.querySelector('#toast')).toMatchObject({ hidden: false, textContent: 'Bloco criado' });
  });

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

  it('switches the same weekly Blocks between table, Kanban and calendar', () => {
    const modes = [];
    const block = {
      id: 7,
      date: '2026-09-08',
      title: 'Inglês — Writing',
      activityName: 'Inglês',
      frontName: 'Writing',
      color: '#6E8FB5',
      status: 'planned',
      plannedStartAt: '2026-09-08T05:00:00',
      plannedEndAt: '2026-09-08T08:00:00'
    };

    renderWeekView(document.querySelector('#app'), {
      weekStart: '2026-09-07',
      blocks: [block],
      mode: 'table',
      onModeChange: (mode) => modes.push(mode)
    });

    expect(document.querySelector('[data-week-table]')).not.toBeNull();
    expect(document.body.textContent).toContain('Inglês');
    document.querySelector('[data-week-mode="kanban"]').click();
    expect(modes).toEqual(['kanban']);
  });

  it('navigates the selected week without changing its current view mode', () => {
    const navigation = [];
    renderWeekView(document.querySelector('#app'), {
      weekStart: '2026-09-07',
      blocks: [],
      mode: 'calendar',
      onPreviousWeek: () => navigation.push('previous'),
      onNextWeek: () => navigation.push('next'),
      onToday: () => navigation.push('today')
    });

    document.querySelector('[data-week-nav="previous"]').click();
    document.querySelector('[data-week-nav="today"]').click();
    document.querySelector('[data-week-nav="next"]').click();

    expect(navigation).toEqual(['previous', 'today', 'next']);
    expect(document.querySelector('[data-week-calendar]')).not.toBeNull();
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

  it('highlights the running Block before the compact day agenda', () => {
    renderTodayView(document.querySelector('#app'), {
      now: new Date('2026-09-08T06:00:00'),
      blocks: [{
        id: 14,
        title: 'Inglês — Reading',
        activityName: 'Inglês',
        color: '#6E8FB5',
        status: 'in_progress',
        startedAt: '2026-09-08T05:10:00',
        plannedStartAt: '2026-09-08T05:00:00',
        plannedEndAt: '2026-09-08T08:00:00'
      }],
      checklists: { 14: [] },
      onOpenCreate: () => {},
      onStart: () => {},
      onFinish: () => {},
      onToggleChecklist: () => {}
    });

    expect(document.querySelector('[data-current-block]')).not.toBeNull();
    expect(document.querySelector('[data-day-agenda]')).not.toBeNull();
  });

  it('preserves the finish form draft when Today is rendered again', () => {
    const drafts = {};
    const block = {
      id: 14,
      title: 'Inglês — Reading',
      status: 'in_progress',
      startedAt: '2026-09-08T05:10:00',
      plannedStartAt: '2026-09-08T05:00:00',
      plannedEndAt: '2026-09-08T08:00:00'
    };
    const render = () => renderTodayView(document.querySelector('#app'), {
      now: new Date('2026-09-08T06:00:00'),
      blocks: [block], checklists: { 14: [] }, finishDrafts: drafts,
      onStart: () => {}, onFinish: () => {}, onToggleChecklist: () => {},
      onFinishDraftChange: ({ id, field, value }) => {
        drafts[id] = { ...drafts[id], [field]: value };
      }
    });

    render();
    const reason = document.querySelector('select[name="finishReason"]');
    const note = document.querySelector('textarea[name="note"]');
    reason.value = 'fatigue';
    reason.dispatchEvent(new Event('change', { bubbles: true }));
    note.value = 'Terminei o capítulo 3 e anotei 12 palavras novas';
    note.dispatchEvent(new Event('input', { bubbles: true }));
    render();

    expect(document.querySelector('select[name="finishReason"]').value).toBe('fatigue');
    expect(document.querySelector('textarea[name="note"]').value).toBe('Terminei o capítulo 3 e anotei 12 palavras novas');
  });

  it('updates only the elapsed number without replacing the active finish form', () => {
    renderTodayView(document.querySelector('#app'), {
      now: new Date('2026-09-08T06:00:00'),
      blocks: [{
        id: 14, title: 'Inglês — Reading', status: 'in_progress', startedAt: '2026-09-08T05:10:00',
        plannedStartAt: '2026-09-08T05:00:00', plannedEndAt: '2026-09-08T08:00:00'
      }],
      checklists: { 14: [] }, onStart: () => {}, onFinish: () => {}, onToggleChecklist: () => {}
    });
    const note = document.querySelector('textarea[name="note"]');
    note.value = 'Rascunho preservado';
    note.focus();

    refreshElapsedTimers(document.querySelector('#app'), new Date('2026-09-08T06:05:00'));

    expect(document.querySelector('textarea[name="note"]')).toBe(note);
    expect(document.activeElement).toBe(note);
    expect(note.value).toBe('Rascunho preservado');
    expect(document.querySelector('[data-elapsed-started-at]').textContent).toBe('0h 55m');
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

  it('renders Frentes as compact continuity rows and keeps the learning Track action', () => {
    renderHistoryView(document.querySelector('#app'), {
      activities: [{ id: 1, name: 'Inglês', color: '#6E8FB5' }],
      fronts: [{ id: 3, activityId: 1, name: 'Writing', currentPoint: 'Parágrafo 2', nextStep: 'Conclusão' }],
      selectedFrontId: 3,
      selectedFront: { id: 3, activityId: 1, name: 'Writing', currentPoint: 'Parágrafo 2', nextStep: 'Conclusão' },
      blocks: [], trackItems: [], onFrontChange: () => {}, onTrackComplete: () => {}, onTrackCreate: () => {}
    });

    expect(document.querySelector('[data-front-row]')).not.toBeNull();
  });

  it('renders a Google sync button and Rotina Gabriel state', () => {
    renderSettingsView(document.querySelector('#app'), {
      calendarName: 'Rotina Gabriel',
      lastSyncedAt: '2026-09-03T12:00:00Z',
      connected: true,
      configured: true,
      theme: 'dark'
    });

    expect(document.querySelector('[data-action="sync-google"]')).not.toBeNull();
    expect(document.body.textContent).toContain('Rotina Gabriel');
  });

  it('renders Google sync as a settings row instead of a full task card', () => {
    renderSettingsView(document.querySelector('#app'), {
      calendarName: 'Rotina Gabriel', configured: true, connected: true, theme: 'dark'
    });

    expect(document.querySelector('[data-setting="google"] [data-action="sync-google"]')).not.toBeNull();
  });

  it('renders archive and restore actions next to activity lifecycle states', () => {
    renderSettingsView(document.querySelector('#app'), {
      theme: 'dark',
      activities: [{ id: 1, name: 'Inglês', category: 'Estudo' }],
      archivedActivities: [{ id: 2, name: 'Trabalho antigo', category: 'Trabalho' }]
    });

    expect(document.querySelector('[data-action="archive-activity"][data-activity-id="1"]')).not.toBeNull();
    expect(document.querySelector('[data-action="restore-activity"][data-activity-id="2"]')).not.toBeNull();
    expect(document.querySelector('[data-action="purge-activity"][data-activity-id="2"]')).not.toBeNull();
  });
});
