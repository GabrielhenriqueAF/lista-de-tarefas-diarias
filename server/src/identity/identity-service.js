import { createHash, randomBytes, randomUUID } from 'node:crypto';
import argon2 from 'argon2';
import { createAuthWorkLimiter } from './auth-work-limiter.js';

const sessionDurationMs = 30 * 24 * 60 * 60 * 1000;

export function unauthenticated() {
  return Object.assign(new Error('Sessão inválida ou expirada.'), {
    code: 'UNAUTHENTICATED', statusCode: 401
  });
}

function invalidInput() {
  return Object.assign(new Error('Preencha os campos obrigatórios corretamente.'), {
    code: 'VALIDATION_ERROR', statusCode: 400
  });
}

function requiredText(value, maxLength) {
  if (typeof value !== 'string') throw invalidInput();
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength) throw invalidInput();
  return normalized;
}

function validatePassword(password) {
  if (typeof password !== 'string' || password.length < 12 || password.length > 128) {
    throw invalidInput();
  }
  return password;
}

function credentials(input) {
  const email = requiredText(input?.email, 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw invalidInput();
  return { email, password: validatePassword(input?.password) };
}

function digest(token) {
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) throw unauthenticated();
  return createHash('sha256').update(token).digest('hex');
}

function publicUser(user) {
  return { id: user.id, email: user.email, displayName: user.displayName };
}

export function createIdentityService({
  repository,
  now = () => new Date(),
  authWorkLimiter = createAuthWorkLimiter()
}) {
  function newSession(userId) {
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(now().getTime() + sessionDurationMs);
    return {
      token, expiresAt,
      stored: { id: randomUUID(), userId, tokenDigest: digest(token), expiresAt }
    };
  }

  return {
    async register(input) {
      const { email, password } = credentials(input);
      const displayName = requiredText(input.displayName, 120);
      const workspaceName = requiredText(input.workspaceName, 120);
      const passwordHash = await authWorkLimiter.run(() => argon2.hash(password));
      const user = { id: randomUUID(), email, displayName, passwordHash };
      const workspace = { id: randomUUID(), name: workspaceName, ownerId: user.id };
      const session = newSession(user.id);
      await repository.createAccount({ user, workspace, session: session.stored });
      return { user: publicUser(user), workspace, token: session.token, expiresAt: session.expiresAt };
    },

    async login(input) {
      const { email, password } = credentials(input);
      const user = await repository.findUserByEmail(email);
      if (!user || !await authWorkLimiter.run(() => argon2.verify(user.passwordHash, password))) {
        throw unauthenticated();
      }
      const session = newSession(user.id);
      await repository.createSession(session.stored);
      return { user: publicUser(user), token: session.token, expiresAt: session.expiresAt };
    },

    async authenticate(bearerToken) {
      const session = await repository.findActiveSession(digest(bearerToken), now());
      if (!session) throw unauthenticated();
      return { userId: session.userId, sessionId: session.sessionId };
    },

    async logout(bearerToken) {
      const revoked = await repository.revokeSession(digest(bearerToken), now());
      if (!revoked) throw unauthenticated();
    },

    async getUser(userId) {
      const user = await repository.findUserById(userId);
      if (!user) throw unauthenticated();
      return publicUser(user);
    }
  };
}
