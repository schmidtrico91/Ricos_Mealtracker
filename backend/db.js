import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export const DEFAULT_ENTITIES = ['UserProfile', 'Food', 'FoodLog', 'SearchHistory'];

export const createDb = (dataDir) => {
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
  }

  const sqlitePath = path.join(dataDir, 'fittrack.db');
  const jsonPath = path.join(dataDir, 'db.json');
  const archivedJsonPath = path.join(dataDir, 'db.migrated.json');

  const db = new DatabaseSync(sqlitePath);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA synchronous = NORMAL;');

  db.exec(`
    CREATE TABLE IF NOT EXISTS entities (
      id TEXT PRIMARY KEY,
      entity_type TEXT NOT NULL,
      data TEXT NOT NULL,
      created_date TEXT NOT NULL,
      updated_date TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_entities_type_created
      ON entities(entity_type, created_date DESC);

    CREATE TABLE IF NOT EXISTS app_logs (
      id TEXT PRIMARY KEY,
      page_name TEXT NOT NULL,
      timestamp TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS search_cache (
      cache_key TEXT PRIMARY KEY,
      query TEXT NOT NULL,
      limit_value INTEGER NOT NULL,
      products_json TEXT NOT NULL,
      source TEXT,
      cached_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_search_cache_expires_at
      ON search_cache(expires_at);
  `);

  const countRows = db.prepare('SELECT COUNT(*) as count FROM entities').get().count;
  if (countRows === 0 && existsSync(jsonPath)) {
    try {
      const json = JSON.parse(readFileSync(jsonPath, 'utf8'));
      const insertEntity = db.prepare(`
        INSERT INTO entities (id, entity_type, data, created_date, updated_date)
        VALUES (@id, @entity_type, @data, @created_date, @updated_date)
      `);
      const insertLog = db.prepare(`
        INSERT INTO app_logs (id, page_name, timestamp)
        VALUES (@id, @page_name, @timestamp)
      `);

      const insertTx = () => {
        db.exec('BEGIN');
        try {
          for (const [entityType, rows] of Object.entries(json.entities || {})) {
            for (const row of rows) {
              const now = new Date().toISOString();
              const withDefaults = {
                id: row.id || randomUUID(),
                ...row,
                created_date: row.created_date || now,
                updated_date: row.updated_date || now
              };
              insertEntity.run({
                id: withDefaults.id,
                entity_type: entityType,
                data: JSON.stringify(withDefaults),
                created_date: withDefaults.created_date,
                updated_date: withDefaults.updated_date
              });
            }
          }

          for (const log of json.logs || []) {
            insertLog.run({
              id: log.id || randomUUID(),
              page_name: log.pageName || 'unknown',
              timestamp: log.timestamp || new Date().toISOString()
            });
          }
          db.exec('COMMIT');
        } catch (error) {
          db.exec('ROLLBACK');
          throw error;
        }
      };

      insertTx();
      renameSync(jsonPath, archivedJsonPath);
    } catch {
      // Keep running; malformed JSON should not block startup.
    }
  }

  return db;
};

const parseRow = (row) => {
  if (!row) return null;
  return JSON.parse(row.data);
};

const compare = (left, right, desc) => {
  if (left === right) return 0;
  if (left > right) return desc ? -1 : 1;
  return desc ? 1 : -1;
};

const toSortable = (value) => {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const ts = Date.parse(value);
    if (!Number.isNaN(ts)) return ts;
    return value.toLowerCase();
  }
  return value ?? 0;
};

const sortInMemory = (rows, sortKey = '-created_date') => {
  const desc = sortKey.startsWith('-');
  const key = desc ? sortKey.slice(1) : sortKey;
  return [...rows].sort((a, b) => compare(toSortable(a[key]), toSortable(b[key]), desc));
};

export const entityStore = (db) => {
  const selectByType = db.prepare(`
    SELECT data FROM entities WHERE entity_type = ? ORDER BY created_date DESC
  `);
  const selectById = db.prepare(`
    SELECT id, entity_type, data FROM entities WHERE entity_type = ? AND id = ?
  `);
  const insertEntity = db.prepare(`
    INSERT INTO entities (id, entity_type, data, created_date, updated_date)
    VALUES (@id, @entity_type, @data, @created_date, @updated_date)
  `);
  const updateEntity = db.prepare(`
    UPDATE entities
      SET data = @data,
          updated_date = @updated_date
      WHERE entity_type = @entity_type AND id = @id
  `);
  const deleteEntity = db.prepare(`
    DELETE FROM entities WHERE entity_type = ? AND id = ?
  `);

  const list = (entityType, sort = '-created_date', limit) => {
    const rows = selectByType.all(entityType).map(parseRow);
    const sorted = sortInMemory(rows, sort);
    if (typeof limit === 'number') return sorted.slice(0, limit);
    return sorted;
  };

  const filter = (entityType, filterObject = {}, sort = '-created_date', limit) => {
    const filtered = list(entityType, sort).filter((item) =>
      Object.entries(filterObject).every(([key, value]) => item[key] === value)
    );
    if (typeof limit === 'number') return filtered.slice(0, limit);
    return filtered;
  };

  const create = (entityType, data = {}) => {
    const now = new Date().toISOString();
    const entity = {
      id: data.id || randomUUID(),
      ...data,
      created_date: data.created_date || now,
      updated_date: now
    };

    insertEntity.run({
      id: entity.id,
      entity_type: entityType,
      data: JSON.stringify(entity),
      created_date: entity.created_date,
      updated_date: entity.updated_date
    });
    return entity;
  };

  const update = (entityType, id, patch = {}) => {
    const row = selectById.get(entityType, id);
    if (!row) return null;
    const existing = parseRow(row);
    const updated = {
      ...existing,
      ...patch,
      id: existing.id,
      updated_date: new Date().toISOString()
    };
    updateEntity.run({
      id,
      entity_type: entityType,
      data: JSON.stringify(updated),
      updated_date: updated.updated_date
    });
    return updated;
  };

  const remove = (entityType, id) => deleteEntity.run(entityType, id).changes > 0;

  return { list, filter, create, update, remove };
};

export const appLogStore = (db) => {
  const insertLog = db.prepare(`
    INSERT INTO app_logs (id, page_name, timestamp)
    VALUES (@id, @page_name, @timestamp)
  `);
  const listLogs = db.prepare(`
    SELECT id, page_name as pageName, timestamp
    FROM app_logs
    ORDER BY timestamp DESC
    LIMIT ?
  `);

  const create = (log = {}) => {
    const row = {
      id: log.id || randomUUID(),
      page_name: log.pageName || 'unknown',
      timestamp: log.timestamp || new Date().toISOString()
    };
    insertLog.run(row);
    return {
      id: row.id,
      pageName: row.page_name,
      timestamp: row.timestamp
    };
  };

  return {
    create,
    list: (limit = 100) => listLogs.all(limit)
  };
};

export const searchCacheStore = (db) => {
  const selectFresh = db.prepare(`
    SELECT cache_key, query, limit_value as limitValue, products_json as productsJson, source, cached_at as cachedAt, expires_at as expiresAt
    FROM search_cache
    WHERE cache_key = ? AND expires_at > ?
    LIMIT 1
  `);
  const upsert = db.prepare(`
    INSERT INTO search_cache (cache_key, query, limit_value, products_json, source, cached_at, expires_at)
    VALUES (@cache_key, @query, @limit_value, @products_json, @source, @cached_at, @expires_at)
    ON CONFLICT(cache_key) DO UPDATE SET
      products_json = excluded.products_json,
      source = excluded.source,
      cached_at = excluded.cached_at,
      expires_at = excluded.expires_at
  `);
  const deleteExpired = db.prepare(`
    DELETE FROM search_cache WHERE expires_at <= ?
  `);

  const getFresh = (cacheKey, nowIso = new Date().toISOString()) => {
    const row = selectFresh.get(cacheKey, nowIso);
    if (!row) return null;
    try {
      return {
        key: row.cache_key,
        query: row.query,
        limitValue: row.limitValue,
        products: JSON.parse(row.productsJson),
        source: row.source,
        cachedAt: row.cachedAt,
        expiresAt: row.expiresAt
      };
    } catch {
      return null;
    }
  };

  const set = ({
    key,
    query,
    limitValue,
    products,
    source = 'unknown',
    cachedAtIso = new Date().toISOString(),
    expiresAtIso
  }) => {
    upsert.run({
      cache_key: key,
      query,
      limit_value: limitValue,
      products_json: JSON.stringify(Array.isArray(products) ? products : []),
      source,
      cached_at: cachedAtIso,
      expires_at: expiresAtIso
    });
  };

  const purgeExpired = (nowIso = new Date().toISOString()) => deleteExpired.run(nowIso).changes;

  return { getFresh, set, purgeExpired };
};
