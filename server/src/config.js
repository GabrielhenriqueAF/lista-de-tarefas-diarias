const testSessionSecret = 'test-session-secret';

function required(env, name) {
  const value = env[name]?.trim();

  if (!value) {
    throw new Error(`${name} is required`);
  }

  return value;
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
    port: Number(env.PORT ?? 3030),
    databaseUrl,
    sessionSecret
  };
}
