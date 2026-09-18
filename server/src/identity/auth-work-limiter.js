export function createAuthWorkLimiter({ maxConcurrent = 2 } = {}) {
  let active = 0;

  return {
    async run(work) {
      if (active >= maxConcurrent) {
        const error = new Error('Authentication service is busy.');
        error.code = 'AUTH_BUSY';
        throw error;
      }

      active += 1;
      try {
        return await work();
      } finally {
        active -= 1;
      }
    },
  };
}
