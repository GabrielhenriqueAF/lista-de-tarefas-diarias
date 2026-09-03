import { describe, expect, it } from 'vitest';
import { createDatabase } from '../../src/main/database.js';

describe('routine database migration', () => {
  it('creates the Activities table in a fresh local database', () => {
    const database = createDatabase(':memory:');
    const table = database
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'activities'")
      .get();

    expect(table).toEqual({ name: 'activities' });

    database.close();
  });
});
