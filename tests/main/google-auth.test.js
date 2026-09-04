import { describe, expect, it } from 'vitest';
import { createGoogleAuth, decryptGoogleToken, encryptGoogleToken } from '../../src/main/google/google-auth.js';
import { createGoogleAdapter } from '../../src/main/google/google-adapter.js';

describe('Google OAuth configuration', () => {
  it('encrypts OAuth tokens with the Windows secure storage and reads them back', () => {
    const safeStorage = {
      isEncryptionAvailable: () => true,
      encryptString: (value) => Buffer.from(`protected:${value}`, 'utf8'),
      decryptString: (value) => Buffer.from(value).toString('utf8').replace(/^protected:/, '')
    };
    const tokens = { access_token: 'access-secret', refresh_token: 'refresh-secret' };

    const stored = encryptGoogleToken(tokens, safeStorage);

    expect(stored).not.toContain('refresh-secret');
    expect(decryptGoogleToken(stored, safeStorage)).toEqual({ tokens, isLegacy: false });
  });

  it('recognizes an existing plaintext token so it can be migrated safely', () => {
    const tokens = { refresh_token: 'old-token' };

    expect(decryptGoogleToken(JSON.stringify(tokens), { isEncryptionAvailable: () => true })).toEqual({ tokens, isLegacy: true });
  });

  it('stores the OAuth token under application data', () => {
    const auth = createGoogleAuth({
      credentialsPath: 'C:/app/credentials.json',
      tokenPath: 'C:/app/data/google-token.json',
      openExternal: async () => {}
    });

    expect(auth.tokenPath).toBe('C:/app/data/google-token.json');
  });

  it('reports whether credentials and a private token are available', () => {
    const auth = createGoogleAuth({
      credentialsPath: 'C:/app/credentials.json',
      tokenPath: 'C:/app/data/google-token.json',
      openExternal: async () => {},
      fileExists: (file) => file.endsWith('credentials.json')
    });

    expect(auth.status()).toEqual({ configured: true, connected: false });
  });

  it('creates the dedicated calendar through the isolated adapter', async () => {
    const calls = [];
    const adapter = createGoogleAdapter({
      calendarList: { list: async () => { calls.push(['listCalendars']); return { data: { items: [] } }; } },
      calendars: { insert: async (input) => { calls.push(input); return { data: { id: 'calendar-1' } }; } },
      events: {
        list: async (input) => { calls.push(['listEvents', input]); },
        insert: async (input) => { calls.push(['insertEvent', input]); },
        patch: async (input) => { calls.push(['patchEvent', input]); },
        delete: async (input) => { calls.push(['deleteEvent', input]); }
      }
    });

    await adapter.listCalendars();
    await adapter.createCalendar('Rotina Gabriel');
    await adapter.listEvents('calendar-1', { showDeleted: true });
    await adapter.insertEvent('calendar-1', { summary: 'Writing' });
    await adapter.patchEvent('calendar-1', 'event-1', { summary: 'Writing II' });
    await adapter.deleteEvent('calendar-1', 'event-1');

    expect(calls).toEqual([
      ['listCalendars'],
      { requestBody: { summary: 'Rotina Gabriel' } },
      ['listEvents', { calendarId: 'calendar-1', showDeleted: true }],
      ['insertEvent', { calendarId: 'calendar-1', requestBody: { summary: 'Writing' } }],
      ['patchEvent', { calendarId: 'calendar-1', eventId: 'event-1', requestBody: { summary: 'Writing II' } }],
      ['deleteEvent', { calendarId: 'calendar-1', eventId: 'event-1' }]
    ]);
  });
});
