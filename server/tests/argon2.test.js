import argon2 from 'argon2';
import { describe, expect, it } from 'vitest';

describe('argon2', () => {
  it('hashes and verifies a credential secret', async () => {
    const hash = await argon2.hash('credential-secret-for-test-only');

    await expect(argon2.verify(hash, 'credential-secret-for-test-only')).resolves.toBe(true);
    await expect(argon2.verify(hash, 'wrong-credential-secret')).resolves.toBe(false);
  });
});
