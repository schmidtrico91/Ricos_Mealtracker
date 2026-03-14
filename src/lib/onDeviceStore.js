const DB_NAME = 'fittrack-pro-on-device';
const DB_VERSION = 3;
const ENTITY_STORE = 'entities';
const APP_LOG_STORE = 'app_logs';
const OFF_NAME_CACHE_STORE = 'off_name_cache';

let dbPromise;

const trimDateValue = (value) => {
  if (typeof value !== 'string') {
    return value ?? 0;
  }

  const timestamp = Date.parse(value);
  if (!Number.isNaN(timestamp)) {
    return timestamp;
  }

  return value.toLowerCase();
};

const compareValues = (left, right, desc) => {
  if (left === right) return 0;
  if (left > right) return desc ? -1 : 1;
  return desc ? 1 : -1;
};

const sortRows = (rows, sortKey = '-created_date') => {
  const desc = sortKey.startsWith('-');
  const key = desc ? sortKey.slice(1) : sortKey;

  return [...rows].sort((left, right) =>
    compareValues(trimDateValue(left?.[key]), trimDateValue(right?.[key]), desc)
  );
};

const buildEntityKey = (entityType, id) => `${entityType}:${id}`;

const createError = (message, fallback) => fallback || new Error(message);

const requestToPromise = (request, fallbackMessage) =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(createError(fallbackMessage, request.error));
  });

const transactionDone = (transaction, fallbackMessage) =>
  new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(createError(fallbackMessage, transaction.error));
    transaction.onerror = () => reject(createError(fallbackMessage, transaction.error));
  });

const generateId = () => {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  return `local-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const ensureIndexedDb = () => {
  if (typeof indexedDB === 'undefined') {
    throw new Error('IndexedDB is not available on this device');
  }
};

const openDb = async () => {
  ensureIndexedDb();

  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;

        if (!db.objectStoreNames.contains(ENTITY_STORE)) {
          const store = db.createObjectStore(ENTITY_STORE, { keyPath: 'pk' });
          store.createIndex('entityType', 'entityType', { unique: false });
        }

        if (!db.objectStoreNames.contains(APP_LOG_STORE)) {
          const store = db.createObjectStore(APP_LOG_STORE, { keyPath: 'id' });
          store.createIndex('timestamp', 'timestamp', { unique: false });
        }

        if (!db.objectStoreNames.contains(OFF_NAME_CACHE_STORE)) {
          const store = db.createObjectStore(OFF_NAME_CACHE_STORE, { keyPath: 'barcode' });
          store.createIndex('nameLower', 'nameLower', { unique: false });
          store.createIndex('brandLower', 'brandLower', { unique: false });
          store.createIndex('country', 'country', { unique: false });
        }
      };

      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => db.close();
        resolve(db);
      };

      request.onerror = () => reject(createError('Failed to open on-device database', request.error));
    });
  }

  return dbPromise;
};

const toEntityRow = (entityType, entity, existingRow) => ({
  pk: buildEntityKey(entityType, entity.id),
  entityType,
  id: entity.id,
  created_date: existingRow?.created_date || entity.created_date,
  updated_date: entity.updated_date,
  data: entity
});

const getRowsByEntityType = async (entityType) => {
  const db = await openDb();
  const transaction = db.transaction(ENTITY_STORE, 'readonly');
  const store = transaction.objectStore(ENTITY_STORE);
  const index = store.index('entityType');
  const request = index.getAll(entityType);
  const rows = await requestToPromise(request, `Failed to load ${entityType} rows`);
  await transactionDone(transaction, `Failed to finish reading ${entityType} rows`);
  return rows.map((row) => row.data);
};

export const onDeviceEntityStore = {
  async list(entityType, sort = '-created_date', limit) {
    const rows = await getRowsByEntityType(entityType);
    const sorted = sortRows(rows, sort);
    return typeof limit === 'number' ? sorted.slice(0, limit) : sorted;
  },

  async filter(entityType, filterObject = {}, sort = '-created_date', limit) {
    const rows = await this.list(entityType, sort);
    const filtered = rows.filter((item) =>
      Object.entries(filterObject).every(([key, value]) => item?.[key] === value)
    );
    return typeof limit === 'number' ? filtered.slice(0, limit) : filtered;
  },

  async create(entityType, data = {}) {
    const db = await openDb();
    const now = new Date().toISOString();
    const entity = {
      id: data.id || generateId(),
      ...data,
      created_date: data.created_date || now,
      updated_date: now
    };

    const transaction = db.transaction(ENTITY_STORE, 'readwrite');
    const store = transaction.objectStore(ENTITY_STORE);
    store.put(toEntityRow(entityType, entity));
    await transactionDone(transaction, `Failed to create ${entityType}`);
    return entity;
  },

  async update(entityType, id, patch = {}) {
    const db = await openDb();
    const transaction = db.transaction(ENTITY_STORE, 'readwrite');
    const store = transaction.objectStore(ENTITY_STORE);
    const key = buildEntityKey(entityType, id);
    const existingRow = await requestToPromise(store.get(key), `Failed to load ${entityType}:${id}`);

    if (!existingRow) {
      await transactionDone(transaction, `Failed to finish loading ${entityType}:${id}`);
      return null;
    }

    const updated = {
      ...existingRow.data,
      ...patch,
      id: existingRow.data.id,
      updated_date: new Date().toISOString()
    };

    store.put(toEntityRow(entityType, updated, existingRow));
    await transactionDone(transaction, `Failed to update ${entityType}:${id}`);
    return updated;
  },

  async remove(entityType, id) {
    const db = await openDb();
    const transaction = db.transaction(ENTITY_STORE, 'readwrite');
    const store = transaction.objectStore(ENTITY_STORE);
    const key = buildEntityKey(entityType, id);
    const existingRow = await requestToPromise(store.get(key), `Failed to load ${entityType}:${id}`);

    if (!existingRow) {
      await transactionDone(transaction, `Failed to finish loading ${entityType}:${id}`);
      return false;
    }

    store.delete(key);
    await transactionDone(transaction, `Failed to delete ${entityType}:${id}`);
    return true;
  }
};

export const onDeviceAppLogStore = {
  async create(log = {}) {
    const db = await openDb();
    const transaction = db.transaction(APP_LOG_STORE, 'readwrite');
    const store = transaction.objectStore(APP_LOG_STORE);
    const row = {
      id: log.id || generateId(),
      pageName: log.pageName || 'unknown',
      timestamp: log.timestamp || new Date().toISOString()
    };

    store.put(row);
    await transactionDone(transaction, 'Failed to create on-device app log');
    return row;
  },

  async list(limit = 100) {
    const db = await openDb();
    const transaction = db.transaction(APP_LOG_STORE, 'readonly');
    const store = transaction.objectStore(APP_LOG_STORE);
    const rows = await requestToPromise(store.getAll(), 'Failed to list app logs');
    await transactionDone(transaction, 'Failed to finish reading app logs');
    return sortRows(rows, '-timestamp').slice(0, limit);
  }
};

const normalizeSearchText = (value) =>
  String(value || '')
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export const onDeviceOffNameCacheStore = {
  async bulkUpsert(items = []) {
    if (!Array.isArray(items) || items.length === 0) {
      return 0;
    }

    const db = await openDb();
    const transaction = db.transaction(OFF_NAME_CACHE_STORE, 'readwrite');
    const store = transaction.objectStore(OFF_NAME_CACHE_STORE);
    let upserted = 0;

    for (const item of items) {
      const barcode = String(item?.barcode || '').trim();
      if (!barcode) continue;

      const name = String(item?.name || '').trim();
      const brand = String(item?.brand || '').trim();
      const country = String(item?.country || '').trim().toLowerCase();
      const nowIso = new Date().toISOString();

      store.put({
        barcode,
        name,
        brand,
        country,
        nameLower: normalizeSearchText(name),
        brandLower: normalizeSearchText(brand),
        updatedAt: nowIso
      });
      upserted += 1;
    }

    await transactionDone(transaction, 'Failed to upsert OFF name cache entries');
    return upserted;
  },

  async count() {
    const db = await openDb();
    const transaction = db.transaction(OFF_NAME_CACHE_STORE, 'readonly');
    const store = transaction.objectStore(OFF_NAME_CACHE_STORE);
    const value = await requestToPromise(store.count(), 'Failed to count OFF name cache entries');
    await transactionDone(transaction, 'Failed to finish OFF name cache count');
    return Number(value || 0);
  },

  async clear() {
    const db = await openDb();
    const transaction = db.transaction(OFF_NAME_CACHE_STORE, 'readwrite');
    const store = transaction.objectStore(OFF_NAME_CACHE_STORE);
    store.clear();
    await transactionDone(transaction, 'Failed to clear OFF name cache');
  },

  async getByBarcode(barcode) {
    const normalized = String(barcode || '').trim();
    if (!normalized) {
      return null;
    }

    const db = await openDb();
    const transaction = db.transaction(OFF_NAME_CACHE_STORE, 'readonly');
    const store = transaction.objectStore(OFF_NAME_CACHE_STORE);
    const row = await requestToPromise(store.get(normalized), 'Failed to load OFF cache barcode');
    await transactionDone(transaction, 'Failed to finish OFF cache barcode lookup');

    if (!row) {
      return null;
    }

    return {
      code: row.barcode,
      product_name: row.name,
      brands: row.brand || '',
      country: row.country || ''
    };
  },

  async search(query, limit = 10, options = {}) {
    const normalizedQuery = normalizeSearchText(query);
    if (!normalizedQuery) {
      return [];
    }

    const tokens = normalizedQuery.split(' ').filter(Boolean);
    if (tokens.length === 0) {
      return [];
    }

    const safeLimit = Math.max(1, Math.min(Number(limit) || 10, 50));
    const requestedLocale = String(options?.locale || '').toLowerCase();
    const preferredCountry = requestedLocale.startsWith('de') ? 'de' : 'us';
    const db = await openDb();
    const transaction = db.transaction(OFF_NAME_CACHE_STORE, 'readonly');
    const store = transaction.objectStore(OFF_NAME_CACHE_STORE);
    const seen = new Set();
    const results = [];
    const candidatesByMode = {
      preferred: [],
      fallback: []
    };
    const candidateSeenByMode = {
      preferred: new Set(),
      fallback: new Set()
    };

    const shouldIncludeCountry = (rowCountry, mode) => {
      const country = String(rowCountry || '').toLowerCase();
      if (mode === 'preferred') {
        return country === preferredCountry;
      }
      return country !== preferredCountry;
    };

    const addCandidate = (mode, row) => {
      const barcode = String(row?.barcode || '');
      if (!barcode || candidateSeenByMode[mode].has(barcode)) {
        return;
      }
      candidateSeenByMode[mode].add(barcode);
      candidatesByMode[mode].push(row);
    };

    const collectFromIndexPrefix = async (indexName, token, mode, hardCap = 350) => {
      const index = store.index(indexName);
      const range = IDBKeyRange.bound(token, `${token}\uffff`, false, false);
      const request = index.openCursor(range);
      let collected = 0;
      await new Promise((resolve, reject) => {
        request.onsuccess = () => {
          const cursor = request.result;
          if (!cursor || collected >= hardCap) {
            resolve();
            return;
          }

          const row = cursor.value;
          if (shouldIncludeCountry(row?.country, mode)) {
            addCandidate(mode, row);
            collected += 1;
          }
          cursor.continue();
        };
        request.onerror = () => reject(createError('Failed to query OFF cache index', request.error));
      });
    };

    const pushMatchedCandidates = (mode) => {
      if (results.length >= safeLimit) return;
      const candidates = candidatesByMode[mode];
      for (const row of candidates) {
        if (results.length >= safeLimit) break;
        const key = row?.barcode;
        if (!key || seen.has(key)) continue;

        const name = String(row?.nameLower || '');
        const brand = String(row?.brandLower || '');
        const haystack = `${name} ${brand}`.trim();
        const matchesAllTokens = tokens.every((token) => haystack.includes(token));
        if (!matchesAllTokens) continue;

        seen.add(key);
        results.push({
          code: row.barcode,
          product_name: row.name,
          brands: row.brand || '',
          country: row.country || ''
        });
      }
    };

    const collectContainsFallback = async (mode, hardCap = 1200) => {
      if (results.length >= safeLimit) return;
      const request = store.openCursor();
      let scanned = 0;
      await new Promise((resolve, reject) => {
        request.onsuccess = () => {
          const cursor = request.result;
          if (!cursor || scanned >= hardCap) {
            resolve();
            return;
          }

          const row = cursor.value;
          scanned += 1;
          if (shouldIncludeCountry(row?.country, mode)) {
            const name = String(row?.nameLower || '');
            const brand = String(row?.brandLower || '');
            const haystack = `${name} ${brand}`.trim();
            const matchesAllTokens = tokens.every((token) => haystack.includes(token));
            if (matchesAllTokens) {
              addCandidate(mode, row);
            }
          }
          cursor.continue();
        };
        request.onerror = () => reject(createError('Failed to scan OFF cache entries', request.error));
      });
    };

    const sortedTokens = [...tokens].sort((a, b) => b.length - a.length);
    const primaryToken = sortedTokens[0];
    const secondaryToken = sortedTokens[1];

    await collectFromIndexPrefix('nameLower', primaryToken, 'preferred');
    await collectFromIndexPrefix('brandLower', primaryToken, 'preferred');
    if (secondaryToken) {
      await collectFromIndexPrefix('nameLower', secondaryToken, 'preferred', 200);
      await collectFromIndexPrefix('brandLower', secondaryToken, 'preferred', 200);
    }
    pushMatchedCandidates('preferred');
    if (results.length < safeLimit) {
      await collectContainsFallback('preferred');
      pushMatchedCandidates('preferred');
    }

    if (results.length < safeLimit) {
      await collectFromIndexPrefix('nameLower', primaryToken, 'fallback');
      await collectFromIndexPrefix('brandLower', primaryToken, 'fallback');
      if (secondaryToken) {
        await collectFromIndexPrefix('nameLower', secondaryToken, 'fallback', 200);
        await collectFromIndexPrefix('brandLower', secondaryToken, 'fallback', 200);
      }
      pushMatchedCandidates('fallback');
      if (results.length < safeLimit) {
        await collectContainsFallback('fallback');
        pushMatchedCandidates('fallback');
      }
    }

    await transactionDone(transaction, 'Failed to finish OFF cache search');
    return results.slice(0, safeLimit);
  }
};
