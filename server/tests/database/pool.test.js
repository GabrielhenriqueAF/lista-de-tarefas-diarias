import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { createPool } from '../../src/database/pool.js';

it('registers a safe listener for idle PostgreSQL errors', () => {
  const pool = new EventEmitter();
  const onIdleError = vi.fn();
  const created = createPool('postgres://ignored', {
    onIdleError,
    Pool: class { constructor() { return pool; } },
  });
  const error = Object.assign(new Error('postgres://secret@host database failed'), { code: '57P01' });

  created.emit('error', error);

  expect(created).toBe(pool);
  expect(onIdleError).toHaveBeenCalledWith({ code: '57P01' });
  expect(onIdleError.mock.calls[0][0]).not.toHaveProperty('message');
});
