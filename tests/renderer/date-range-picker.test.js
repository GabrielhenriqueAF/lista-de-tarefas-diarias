// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { createDateRangePicker } from '../../src/renderer/date-range-picker.js';

describe('date range picker', () => {
  it('offers period shortcuts and navigates through two consecutive months', () => {
    const changes = [];
    const picker = createDateRangePicker({
      now: new Date('2026-09-04T12:00:00'),
      onChange: (range) => changes.push(range)
    });
    document.body.append(picker);

    picker.querySelector('[data-range-preset="3-months"]').click();
    expect(changes.at(-1)).toEqual({ startsOn: '2026-09-04', endsOn: '2026-12-04' });
    expect(picker.textContent).toMatch(/setembro/i);
    expect(picker.textContent).toMatch(/outubro/i);

    picker.querySelector('[data-range-next]').click();
    expect(picker.textContent).toMatch(/outubro/i);
    expect(picker.textContent).toMatch(/novembro/i);
  });
});
