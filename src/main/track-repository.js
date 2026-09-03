function mapTrackItem(row) {
  return {
    id: row.id,
    frontId: row.front_id,
    position: row.position,
    title: row.title,
    status: row.status,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function createTrackRepository(database) {
  const findById = database.prepare('SELECT * FROM track_items WHERE id = ?');
  const insert = database.prepare(`
    INSERT INTO track_items (front_id, position, title, created_at, updated_at)
    VALUES (@frontId, @position, @title, @timestamp, @timestamp)
  `);
  const complete = database.prepare(`
    UPDATE track_items
    SET status = 'completed', completed_at = @completedAt, updated_at = @updatedAt
    WHERE id = @id
  `);
  const listByFront = database.prepare('SELECT * FROM track_items WHERE front_id = ? ORDER BY position');
  const countProgress = database.prepare(`
    SELECT count(*) AS total, sum(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed
    FROM track_items WHERE front_id = ?
  `);

  return {
    create({ frontId, position, title }) {
      const timestamp = new Date().toISOString();
      const result = insert.run({ frontId, position, title, timestamp });
      return mapTrackItem(findById.get(result.lastInsertRowid));
    },

    complete(id, completedAt) {
      complete.run({ id, completedAt, updatedAt: new Date().toISOString() });
      return mapTrackItem(findById.get(id));
    },

    listByFront(frontId) {
      return listByFront.all(frontId).map(mapTrackItem);
    },

    progressForFront(frontId) {
      const result = countProgress.get(frontId);
      const total = result.total;
      const completed = result.completed ?? 0;
      return { completed, total, percent: total === 0 ? 0 : Math.round((completed / total) * 100) };
    }
  };
}
