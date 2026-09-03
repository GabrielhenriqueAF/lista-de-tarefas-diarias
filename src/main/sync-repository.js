function mapOperation(row) {
  return {
    id: row.id,
    operation: row.operation,
    payload: JSON.parse(row.payload),
    attempts: row.attempts,
    lastError: row.last_error,
    createdAt: row.created_at
  };
}

export function createSyncRepository(database) {
  const insert = database.prepare(`
    INSERT INTO sync_queue (operation, payload, created_at)
    VALUES (@operation, @payload, @createdAt)
  `);
  const pending = database.prepare('SELECT * FROM sync_queue ORDER BY id');
  const findById = database.prepare('SELECT * FROM sync_queue WHERE id = ?');
  const remove = database.prepare('DELETE FROM sync_queue WHERE id = ?');
  const fail = database.prepare('UPDATE sync_queue SET attempts = attempts + 1, last_error = ? WHERE id = ?');
  const getState = database.prepare('SELECT value FROM sync_state WHERE key = ?');
  const setState = database.prepare(`
    INSERT INTO sync_state (key, value, updated_at)
    VALUES (@key, @value, @updatedAt)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `);

  return {
    enqueue(operation, payload) {
      const result = insert.run({ operation, payload: JSON.stringify(payload), createdAt: new Date().toISOString() });
      return mapOperation(findById.get(result.lastInsertRowid));
    },

    pending() {
      return pending.all().map(mapOperation);
    },

    markDone(id) {
      remove.run(id);
    },

    markFailed(id, error) {
      fail.run(error.message, id);
    },

    getState(key) {
      return getState.get(key)?.value ?? null;
    },

    setState(key, value) {
      setState.run({ key, value: String(value), updatedAt: new Date().toISOString() });
    }
  };
}
