import { describe, expect, it } from 'vitest';
import { createAuthWorkLimiter } from '../../src/identity/auth-work-limiter.js';

function deferred() {
  let resolve;
  const promise = new Promise((next) => { resolve = next; });
  return { promise, resolve };
}

describe('authentication work limiter', () => {
  it('rejects an operation immediately when two jobs are active', async () => {
    const limiter = createAuthWorkLimiter({ maxConcurrent: 2 });
    const first = deferred();
    const second = deferred();
    const firstRun = limiter.run(() => first.promise);
    const secondRun = limiter.run(() => second.promise);

    await expect(limiter.run(async () => 'third')).rejects.toMatchObject({ code: 'AUTH_BUSY' });

    first.resolve('first');
    second.resolve('second');
    await expect(Promise.all([firstRun, secondRun])).resolves.toEqual(['first', 'second']);
  });
});
