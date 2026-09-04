// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { createBlockWizard } from '../../src/renderer/block-wizard.js';

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('block creation wizard', () => {
  it('does not advance until the new activity has a name', () => {
    const wizard = createBlockWizard({ root: document.body, onSubmit: () => {} });
    wizard.open({ activities: [], fronts: [], trigger: document.body });

    document.querySelector('[data-wizard-next]').click();

    expect(document.body.textContent).toContain('Dê um nome para a atividade.');
  });

  it('submits a multi-day rule without a Front', () => {
    const drafts = [];
    const wizard = createBlockWizard({ root: document.body, onSubmit: (draft) => drafts.push(draft) });
    wizard.open({ activities: [], fronts: [], trigger: document.body });

    document.querySelector('input[name="activityName"]').value = 'Inglês';
    document.querySelector('[data-wizard-next]').click();
    document.querySelector('[data-front-mode="skip"]').click();
    document.querySelector('[data-wizard-next]').click();
    document.querySelector('[data-wizard-day="1"]').click();
    document.querySelector('[data-wizard-day="3"]').click();
    document.querySelector('input[name="startTime"]').value = '05:00';
    document.querySelector('input[name="endTime"]').value = '08:00';
    document.querySelector('[data-wizard-submit]').click();

    expect(drafts).toEqual([{
      activity: { mode: 'create', name: 'Inglês', category: '', color: '#6E8FB5', weeklyGoalMinutes: null },
      front: { mode: 'skip' },
      weekdays: [1, 3],
      startTime: '05:00',
      endTime: '08:00',
      checklistTemplate: [],
      startsOn: null,
      endsOn: null,
      scheduleMode: 'recurring',
      date: null
    }]);
  });

  it('includes a selected weekday period in the rule draft', () => {
    const drafts = [];
    const wizard = createBlockWizard({ root: document.body, onSubmit: (draft) => drafts.push(draft) });
    wizard.open({ activities: [], fronts: [], trigger: document.body });
    document.querySelector('input[name="activityName"]').value = 'Inglês';
    document.querySelector('[data-wizard-next]').click();
    document.querySelector('[data-wizard-next]').click();
    document.querySelector('[data-wizard-day="2"]').click();
    document.querySelector('[data-wizard-period-mode="range"]').click();
    document.querySelector('input[data-range-start]').value = '2026-09-08';
    document.querySelector('input[data-range-start]').dispatchEvent(new Event('change', { bubbles: true }));
    document.querySelector('input[data-range-end]').value = '2026-12-08';
    document.querySelector('input[data-range-end]').dispatchEvent(new Event('change', { bubbles: true }));
    document.querySelector('[data-wizard-submit]').click();

    expect(drafts).toHaveLength(1);
    expect(drafts[0]).toMatchObject({ weekdays: [2], startsOn: '2026-09-08', endsOn: '2026-12-08' });
  });

  it('makes a single weekday within six months explicit to the user', () => {
    const wizard = createBlockWizard({ root: document.body, onSubmit: () => {} });
    wizard.open({ activities: [], fronts: [], trigger: document.body });
    document.querySelector('input[name="activityName"]').value = 'Inglês';
    document.querySelector('[data-wizard-next]').click();
    document.querySelector('[data-wizard-next]').click();
    document.querySelector('[data-wizard-day="2"]').click();
    document.querySelector('[data-wizard-period-mode="range"]').click();
    document.querySelector('[data-range-preset="6-months"]').click();

    expect(document.querySelector('[data-recurrence-summary]').textContent).toMatch(/Toda terça-feira por 6 meses/i);
  });

  it('submits a one-time Block for a specific date without weekly recurrence', () => {
    const drafts = [];
    const wizard = createBlockWizard({ root: document.body, onSubmit: (draft) => drafts.push(draft) });
    wizard.open({ activities: [], fronts: [], trigger: document.body });
    document.querySelector('input[name="activityName"]').value = 'Saúde';
    document.querySelector('[data-wizard-next]').click();
    document.querySelector('[data-wizard-next]').click();
    document.querySelector('[data-wizard-schedule-mode="single"]').click();
    document.querySelector('input[name="singleDate"]').value = '2026-10-15';
    document.querySelector('input[name="startTime"]').value = '14:00';
    document.querySelector('input[name="endTime"]').value = '15:00';
    document.querySelector('[data-wizard-submit]').click();

    expect(drafts).toHaveLength(1);
    expect(drafts[0]).toMatchObject({ scheduleMode: 'single', date: '2026-10-15', weekdays: [], startsOn: null, endsOn: null });
  });
});
