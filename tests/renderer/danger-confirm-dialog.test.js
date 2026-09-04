// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { createDangerConfirmDialog } from '../../src/renderer/danger-confirm-dialog.js';

describe('permanent deletion confirmation', () => {
  it('requires typing the exact activity name before it calls the destructive action', async () => {
    const deleted = [];
    const dialog = createDangerConfirmDialog({ root: document.body, onConfirm: async (activity) => deleted.push(activity.id) });
    dialog.open({ activity: { id: 3, name: 'Inglês' }, trigger: document.body });

    const confirm = document.querySelector('[data-confirm-purge]');
    expect(confirm.disabled).toBe(true);
    const input = document.querySelector('input[name="activityConfirmation"]');
    input.value = 'Ingles';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(confirm.disabled).toBe(true);
    input.value = 'Inglês';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(confirm.disabled).toBe(false);
    confirm.click();
    await Promise.resolve();

    expect(deleted).toEqual([3]);
  });
});
