// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';

let renderToday;
let renderProgress;
let renderHistory;
let renderWeek;

beforeEach(async () => {
  document.body.innerHTML = '<main id="app"></main>';
  ({ renderToday, renderProgress, renderHistory, renderWeek } = await import('../../src/renderer/app.js'));
});

describe('progress and history views', () => {
  it('renders real monthly hours and active days', async () => {
    await renderProgress({ realMinutes: 1120, activeDays: 8, subtasks: [] });

    expect(document.body.textContent).toContain('18h 40m');
    expect(document.body.textContent).toContain('8 dias ativos');
  });

  it('renders the last continuation point in history', async () => {
    await renderHistory([{
      subtaskTitle: 'Writing',
      continuationPoint: 'Começar no exercício 13',
      createdAt: '2026-09-08T07:40:00'
    }]);

    expect(document.body.textContent).toContain('Começar no exercício 13');
  });
});

describe('daily view', () => {
  it('renders the actual start time and a finish button for an active session', async () => {
    await renderToday([{
      title: 'Estudar inglês',
      subtaskTitle: 'Writing',
      session: { status: 'in_progress', startedAt: '2026-09-08T05:18:00' }
    }]);

    expect(document.body.textContent).toContain('Iniciado às 05:18');
    expect(document.querySelector('[data-action="finish-session"]')).not.toBeNull();
  });
});

describe('weekly planning view', () => {
  it('offers a form to create a task and its recurring weekly schedule', async () => {
    await renderWeek([]);

    expect(document.querySelector('[data-form="create-schedule"]')).not.toBeNull();
  });
});
