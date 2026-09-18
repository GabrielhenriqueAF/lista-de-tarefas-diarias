import { createHash, randomBytes, randomUUID } from 'node:crypto';
import argon2 from 'argon2';

const sessionDurationMs = 30 * 24 * 60 * 60 * 1000;

export function unauthenticated() {
  return Object.assign(new Error('Sessão inválida ou expirada.'), {
    code: 'UNAUTHENTICATED', statusCode: 401
  });
}

function invalidInput() {
  return Object.assign(new Error('Preencha os campos obrigatórios corretamente.'), {
    code: 'INVALID_INPUT', statusCode: 400
  });
}

function requiredText(value) {
  if (typeof value !== 'string' || !value.trim()) throw invalidInput();
  return value.trim();
}

function credentials(input) {
  const email = requiredText(input?.email).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw invalidInput();
  requiredText(input?.password);
  return { email, password: input.password };
}

function digest(token) {
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) throw unauthenticated();
  return createHash('sha256').update(token).digest('hex');
}

function publicUser(user) {
  return { id: user.id, email: user.email, displayName: user.displayName };
}

export function createIdentityService({ repository, now = () => new Date() }) {
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
      const displayName = requiredText(input.displayName);
      const workspaceName = requiredText(input.workspaceName);
      const user = { id: randomUUID(), email, displayName, passwordHash: await argon2.hash(password) };
      const workspace = { id: randomUUID(), name: workspaceName, ownerId: user.id };
      const session = newSession(user.id);
      await repository.createAccount({ user, workspace, session: session.stored });
      return { user: publicUser(user), workspace, token: session.token, expiresAt: session.expiresAt };
    },

    async login(input) {
      const { email, password } = credentials(input);
      const user = await repository.findUserByEmail(email);
      if (!user || !await argon2.verify(user.passwordHash, password)) throw unauthenticated();
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
