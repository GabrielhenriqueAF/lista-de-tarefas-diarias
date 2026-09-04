import { describe, expect, it } from 'vitest';

describe('desktop window options', () => {
  it('keeps native Windows controls while using the compact content title bar', async () => {
    const module = await import('../../src/main/window-options.js').catch(() => null);
    expect(module).not.toBeNull();
    if (!module) return;

    const { desktopWindowOptions } = module;
    const options = desktopWindowOptions('C:\\app\\preload.js');

    expect(options).toMatchObject({
      width: 1280,
      minWidth: 980,
      titleBarStyle: 'hidden',
      titleBarOverlay: { color: '#1A1917', symbolColor: '#EFEAE1', height: 44 },
      webPreferences: { contextIsolation: true, nodeIntegration: false, preload: 'C:\\app\\preload.js' }
    });
  });
});
