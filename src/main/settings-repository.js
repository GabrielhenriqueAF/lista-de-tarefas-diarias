const VALID_THEMES = new Set(['system', 'light', 'dark']);

export function createSettingsRepository(database) {
  const getValue = database.prepare('SELECT value FROM settings WHERE key = ?');
  const saveValue = database.prepare(`
    INSERT INTO settings (key, value, updated_at)
    VALUES (@key, @value, @updatedAt)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `);

  return {
    get(key, fallback = null) {
      return getValue.get(key)?.value ?? fallback;
    },

    set(key, value) {
      saveValue.run({ key, value: String(value), updatedAt: new Date().toISOString() });
      return value;
    },

    getTheme() {
      const theme = getValue.get('theme')?.value ?? 'system';
      return VALID_THEMES.has(theme) ? theme : 'system';
    },

    setTheme(theme) {
      if (!VALID_THEMES.has(theme)) {
        throw new Error('Tema inválido.');
      }
      this.set('theme', theme);
      return theme;
    }
  };
}
