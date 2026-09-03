// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';

let renderToday;

beforeEach(async () => {
  document.body.innerHTML = '<main id="app"></main>';
  ({ renderToday } = await import('../../src/renderer/app.js'));
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
