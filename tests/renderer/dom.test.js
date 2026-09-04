// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { dateOnly } from '../../src/renderer/views/dom.js';

describe('dateOnly', () => {
  it('keeps the São Paulo calendar date after 21:00 local time', () => {
    expect(dateOnly(new Date('2026-09-04T21:30:00-03:00'))).toBe('2026-09-04');
  });
});
