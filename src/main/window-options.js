export function desktopWindowOptions(preload) {
  return {
    width: 1280,
    height: 820,
    minWidth: 980,
    minHeight: 680,
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#1A1917', symbolColor: '#EFEAE1', height: 44 },
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload
    }
  };
}
