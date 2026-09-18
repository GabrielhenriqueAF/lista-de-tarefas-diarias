const testSessionSecret = 'test-session-secret';

function required(env, name) {
  const value = env[name]?.trim();

  if (!value) {
    throw new Error(`${name} is required`);
  }

  return value;
}

function parsePort(value, nodeEnv) {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) {
    throw new Error('PORT deve ser um inteiro válido.');
  }

  const port = Number(value);
  const minimum = nodeEnv === 'test' ? 0 : 1;
  if (!Number.isSafeInteger(port) || port < minimum || port > 65535) {
    throw new Error('PORT está fora da faixa permitida.');
  }

  return port;
}

export function loadConfig(env) {
  const nodeEnv = env.NODE_ENV ?? 'development';
  const isTest = nodeEnv === 'test';
  const databaseUrl = isTest ? env.DATABASE_URL?.trim() : required(env, 'DATABASE_URL');
  const sessionSecret = isTest ? env.SESSION_SECRET?.trim() || testSessionSecret : required(env, 'SESSION_SECRET');

  if (!isTest && sessionSecret === testSessionSecret) {
    throw new Error('SESSION_SECRET must not use the test session secret outside test mode');
  }

  return {
    nodeEnv,
    port: parsePort(env.PORT ?? '3030', nodeEnv),
    databaseUrl,
    sessionSecret
  };
}
