import { onDeviceOffNameCacheStore } from '@/lib/onDeviceStore';

const STATUS_STORAGE_KEY = 'fittrack_off_cache_status_v2';
const INITIALIZED_STORAGE_KEY = 'fittrack_off_cache_initialized_v2';
const MANIFEST_URL = '/off-cache/manifest.json';

const listeners = new Set();
let runPromise = null;
let stopRequested = false;

const defaultStatus = {
  running: false,
  progressPercent: 0,
  processedChunks: 0,
  totalChunks: 0,
  cachedProducts: 0,
  failedChunks: 0,
  currentChunk: '',
  completed: false,
  error: ''
};

const readStatus = () => {
  try {
    const raw = window.localStorage.getItem(STATUS_STORAGE_KEY);
    if (!raw) return { ...defaultStatus };
    return {
      ...defaultStatus,
      ...(JSON.parse(raw) || {})
    };
  } catch {
    return { ...defaultStatus };
  }
};

const emitStatus = (status) => {
  for (const listener of listeners) {
    listener(status);
  }
};

const writeStatus = (patch) => {
  const next = {
    ...readStatus(),
    ...(patch || {})
  };
  try {
    window.localStorage.setItem(STATUS_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Ignore storage errors.
  }
  emitStatus(next);
  return next;
};

const calculateProgress = (processedChunks, totalChunks) => {
  if (!totalChunks) return 0;
  const percent = Math.round((processedChunks / totalChunks) * 100);
  if (processedChunks > 0 && percent === 0) return 1;
  return Math.max(0, Math.min(100, percent));
};

const fetchJson = async (url) => {
  const response = await fetch(url, { headers: { accept: 'application/json' } });
  if (!response.ok) {
    throw new Error(`Cache asset request failed (${response.status})`);
  }
  return response.json();
};

const runImportLoop = async () => {
  writeStatus({ running: true, error: '' });

  const manifest = await fetchJson(MANIFEST_URL);
  const chunkFiles = Array.isArray(manifest?.chunks) ? manifest.chunks : [];
  const totalChunks = chunkFiles.length;
  if (totalChunks === 0) {
    throw new Error('Cache manifest has no chunks');
  }

  let processedChunks = 0;
  let failedChunks = 0;
  let cachedProducts = 0;

  writeStatus({
    totalChunks,
    processedChunks: 0,
    failedChunks: 0,
    cachedProducts: 0,
    progressPercent: 0,
    completed: false,
    currentChunk: ''
  });

  for (const chunkFile of chunkFiles) {
    if (stopRequested) {
      writeStatus({
        running: false,
        currentChunk: '',
        processedChunks,
        failedChunks,
        cachedProducts
      });
      return;
    }

    writeStatus({ currentChunk: chunkFile });
    try {
      const rows = await fetchJson(`/off-cache/${chunkFile}`);
      const normalizedRows = Array.isArray(rows)
        ? rows.map((entry) => ({
            barcode: String(entry?.barcode || ''),
            name: String(entry?.name || ''),
            brand: String(entry?.brand || ''),
            country: String(entry?.country || '')
          }))
        : [];

      const upserted = await onDeviceOffNameCacheStore.bulkUpsert(normalizedRows);
      cachedProducts += upserted;
    } catch (error) {
      failedChunks += 1;
      writeStatus({
        error: `Chunk fehlgeschlagen: ${chunkFile} (${error?.message || 'unknown'})`
      });
    }

    processedChunks += 1;
    writeStatus({
      processedChunks,
      failedChunks,
      cachedProducts,
      progressPercent: calculateProgress(processedChunks, totalChunks),
      error: ''
    });
  }

  const uniqueCount = await onDeviceOffNameCacheStore.count();
  writeStatus({
    running: false,
    completed: true,
    currentChunk: '',
    processedChunks: totalChunks,
    totalChunks,
    failedChunks,
    cachedProducts: uniqueCount,
    progressPercent: 100,
    error: ''
  });
};

export const subscribeOffCacheStatus = (listener) => {
  if (typeof listener !== 'function') {
    return () => {};
  }
  listeners.add(listener);
  listener(readStatus());
  return () => listeners.delete(listener);
};

export const getOffCacheStatus = () => readStatus();

export const isOffCacheInitialized = () => {
  try {
    return window.localStorage.getItem(INITIALIZED_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
};

export const ensureOffCacheBackgroundStarted = () => {
  if (isOffCacheInitialized()) {
    return;
  }

  try {
    window.localStorage.setItem(INITIALIZED_STORAGE_KEY, '1');
  } catch {
    // Ignore storage errors.
  }

  void startOffCacheSync();
};

export const startOffCacheSync = () => {
  if (runPromise) {
    return runPromise;
  }

  const current = readStatus();
  if (current.completed || current.progressPercent >= 100) {
    writeStatus({ ...defaultStatus });
  }

  stopRequested = false;
  runPromise = runImportLoop()
    .catch((error) => {
      writeStatus({
        running: false,
        error: error?.message || 'Cache import failed'
      });
    })
    .finally(() => {
      runPromise = null;
      stopRequested = false;
    });
  return runPromise;
};

export const stopOffCacheSync = () => {
  stopRequested = true;
};
