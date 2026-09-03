import { describe, expect, it } from 'vitest';
import { createHandlers } from '../../src/main/ipc.js';

describe('IPC handlers', () => {
  it('rejects an untrusted create-task payload without a title', async () => {
    const handlers = createHandlers({ tasks: {}, sessions: {} });

    await expect(handlers.createTask({ color: '#2563eb' })).rejects.toThrow('Título obrigatório');
  });
});
