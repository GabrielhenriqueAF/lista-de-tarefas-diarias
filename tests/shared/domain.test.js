import { describe, expect, it } from 'vitest';
import { minutesBetween } from '../../src/shared/domain.js';

describe('minutesBetween', () => {
  it('calcula a duração real de uma sessão encerrada antes do horário planejado', () => {
    expect(minutesBetween('2026-09-03T08:00:00', '2026-09-03T10:15:00')).toBe(135);
  });
});
