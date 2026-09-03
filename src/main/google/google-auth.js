import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { google } from 'googleapis';

const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar';

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

export function createGoogleAuth({ credentialsPath, tokenPath, openExternal, fileExists = existsSync }) {
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
    client.setCredentials(JSON.parse(readFileSync(tokenPath, 'utf8')));
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
        writeFileSync(tokenPath, JSON.stringify(tokens, null, 2), 'utf8');
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
