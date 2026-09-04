import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';

const preloadPath = resolve('src/preload.js');

describe('preload bridge', () => {
  it('loads as an Electron preload and exposes the routine API', async () => {
    let exposedKey;
    let exposedApi;
    const calls = [];
    const electron = {
      contextBridge: {
        exposeInMainWorld: (key, api) => {
          exposedKey = key;
          exposedApi = api;
        }
      },
      ipcRenderer: {
        invoke: async (channel, value) => {
          calls.push({ channel, value });
          return { channel, value };
        }
      }
    };

    vm.runInNewContext(readFileSync(preloadPath, 'utf8'), {
      require: (moduleName) => {
        if (moduleName === 'electron') return electron;
        throw new Error(`Módulo inesperado: ${moduleName}`);
      }
    });

    expect(exposedKey).toBe('routineApi');
    expect(exposedApi).toEqual(expect.objectContaining({
      activities: expect.any(Object),
      settings: expect.any(Object),
      google: expect.any(Object)
    }));
    await expect(exposedApi.settings.getTheme()).resolves.toEqual({ channel: 'settings:get-theme', value: undefined });
    await expect(exposedApi.activities.create({ name: 'Inglês' })).resolves.toEqual({ channel: 'activities:create', value: { name: 'Inglês' } });
    expect(calls).toEqual([
      { channel: 'settings:get-theme', value: undefined },
      { channel: 'activities:create', value: { name: 'Inglês' } }
    ]);
  });
});
