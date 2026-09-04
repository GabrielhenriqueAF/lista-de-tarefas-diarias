import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { google } from 'googleapis';

const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar';

export function encryptGoogleToken(tokens, safeStorage) {
  if (!safeStorage?.isEncryptionAvailable?.()) {
    throw new Error('O cofre seguro do Windows não está disponível para proteger o token Google.');
  }
  const encrypted = safeStorage.encryptString(JSON.stringify(tokens)).toString('base64');
  return JSON.stringify({ version: 1, encrypted }, null, 2);
}

export function decryptGoogleToken(contents, safeStorage) {
  const stored = JSON.parse(contents);
  if (!stored.encrypted) return { tokens: stored, isLegacy: true };
  if (!safeStorage?.isEncryptionAvailable?.()) {
    throw new Error('O cofre seguro do Windows não está disponível para ler o token Google.');
  }
  const decrypted = safeStorage.decryptString(Buffer.from(stored.encrypted, 'base64'));
  return { tokens: JSON.parse(decrypted), isLegacy: false };
}

function credentialsFromFile(credentialsPath) {
  const contents = JSON.parse(readFileSync(credentialsPath, 'utf8'));
  const credentials = contents.installed ?? contents.web;
  if (!credentials?.client_id || !credentials?.client_secret) {
    throw new Error('O arquivo de credenciais Google é inválido.');
  }
  return credentials;
}

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });
}

function waitForAuthorizationCode(server) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => finish(new Error('A autorização do Google expirou. Tente novamente.')), 5 * 60 * 1000);
    function finish(error, code) {
      clearTimeout(timeout);
      server.off('request', onRequest);
      if (error) reject(error);
      else resolve(code);
    }
    function onRequest(request, response) {
      const callback = new URL(request.url, 'http://127.0.0.1');
      if (callback.pathname !== '/oauth2callback') {
        response.writeHead(404).end();
        return;
      }
      const error = callback.searchParams.get('error');
      const code = callback.searchParams.get('code');
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      response.end('<h1>Autorização concluída.</h1><p>Você já pode voltar ao Rotina Gabriel.</p>');
      finish(error ? new Error(`Autorização do Google recusada: ${error}`) : code ? null : new Error('O Google não retornou um código de autorização.'), code);
    }
    server.on('request', onRequest);
  });
}

export function createGoogleAuth({ credentialsPath, tokenPath, openExternal, safeStorage, fileExists = existsSync }) {
  function loadCredentials() {
    if (!fileExists(credentialsPath)) {
      throw new Error('Credenciais Google não encontradas. Adicione credentials.json em Configurações.');
    }
    return credentialsFromFile(credentialsPath);
  }

  function createClient(redirectUri) {
    const credentials = loadCredentials();
    return new google.auth.OAuth2(credentials.client_id, credentials.client_secret, redirectUri);
  }

  function loadToken(client) {
    if (!fileExists(tokenPath)) {
      throw new Error('Conecte sua conta do Google antes de sincronizar.');
    }
    const stored = decryptGoogleToken(readFileSync(tokenPath, 'utf8'), safeStorage);
    if (stored.isLegacy) {
      writeFileSync(tokenPath, encryptGoogleToken(stored.tokens, safeStorage), 'utf8');
    }
    client.setCredentials(stored.tokens);
    return client;
  }

  return {
    credentialsPath,
    tokenPath,

    status() {
      return { configured: fileExists(credentialsPath), connected: fileExists(tokenPath) };
    },

    async connect() {
      const server = http.createServer();
      await listen(server);
      try {
        const port = server.address().port;
        const client = createClient(`http://127.0.0.1:${port}/oauth2callback`);
        const authorizationUrl = client.generateAuthUrl({
          access_type: 'offline',
          prompt: 'consent',
          scope: [CALENDAR_SCOPE]
        });
        const codePromise = waitForAuthorizationCode(server);
        await openExternal(authorizationUrl);
        const code = await codePromise;
        const { tokens } = await client.getToken(code);
        mkdirSync(path.dirname(tokenPath), { recursive: true });
        writeFileSync(tokenPath, encryptGoogleToken(tokens, safeStorage), 'utf8');
        client.setCredentials(tokens);
        return this.status();
      } finally {
        server.close();
      }
    },

    getCalendarApi() {
      const credentials = loadCredentials();
      const redirectUri = credentials.redirect_uris?.[0] ?? 'http://localhost';
      const client = new google.auth.OAuth2(credentials.client_id, credentials.client_secret, redirectUri);
      return google.calendar({ version: 'v3', auth: loadToken(client) });
    }
  };
}
