import { describe, expect, it } from 'vitest';
import { createHandlers } from '../../src/main/ipc.js';

describe('routine IPC handlers', () => {
  it('rejects an invalid finish reason before it reaches the Block repository', async () => {
    const handlers = createHandlers({ blocks: {} });

    await expect(handlers.finishBlock({
      id: 1,
      finishedAt: '2026-09-08T07:40:00',
      finishReason: 'anything'
    })).rejects.toThrow('Motivo de encerramento inválido');
  });
});
