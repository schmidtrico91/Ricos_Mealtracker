import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import multer from 'multer';
import { appLogStore, createDb, entityStore, searchCacheStore } from './db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

dotenv.config({ path: path.join(projectRoot, '.env.local') });
dotenv.config({ path: path.join(projectRoot, '.env') });

const dataDir = path.join(__dirname, 'data');
const uploadsDir = path.join(dataDir, 'uploads');
const port = Number(process.env.LOCAL_API_PORT || 8787);
const app = express();

if (!existsSync(uploadsDir)) {
  mkdirSync(uploadsDir, { recursive: true });
}

const db = createDb(dataDir);
const entities = entityStore(db);
const logs = appLogStore(db);
const searchCache = searchCacheStore(db);
const offNameCachePath = path.join(dataDir, 'off_name_cache_de_us.sqlite');
const offNameCacheDb = existsSync(offNameCachePath) ? new DatabaseSync(offNameCachePath, { readonly: true }) : null;

const uploadStorage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, uploadsDir),
  filename: (_, file, cb) => {
    const ext = path.extname(file.originalname || '') || '.bin';
    cb(null, `${Date.now()}-${randomUUID()}${ext}`);
  }
});
const upload = multer({ storage: uploadStorage });

app.use(cors());
app.use(express.json({ limit: '20mb' }));
app.use('/uploads', express.static(uploadsDir));

const tryParseJson = (content) => {
  if (!content || typeof content !== 'string') return null;
  try {
    return JSON.parse(content);
  } catch {
    const start = content.indexOf('{');
    const end = content.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(content.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
};

const extractText = (data) => {
  if (!data) return '';
  if (typeof data === 'string') return data;
  if (Array.isArray(data.message?.content)) {
    return data.message.content
      .map((part) => (typeof part === 'string' ? part : part?.text || ''))
      .join('\n');
  }
  if (typeof data.message?.content === 'string') return data.message.content;
  if (typeof data.response === 'string') return data.response;
  if (typeof data.output_text === 'string') return data.output_text;
  if (Array.isArray(data.choices) && data.choices[0]?.message?.content) {
    return data.choices[0].message.content;
  }
  return JSON.stringify(data);
};

const buildSchemaPrompt = (payload) => {
  const schema = payload?.response_json_schema
    ? JSON.stringify(payload.response_json_schema, null, 2)
    : null;
  const lines = [];
  if (payload?.prompt) lines.push(payload.prompt);
  if (schema) {
    lines.push('Return valid JSON only. The JSON must satisfy this schema:');
    lines.push(schema);
  }
  if (payload?.file_urls?.length) {
    lines.push(`Attached file URLs: ${payload.file_urls.join(', ')}`);
  }
  return lines.join('\n\n');
};

const toAbsoluteUploadPath = (fileUrl) => {
  try {
    const parsed = new URL(fileUrl);
    if (!parsed.pathname.startsWith('/uploads/')) {
      return null;
    }

    const fileName = decodeURIComponent(parsed.pathname.slice('/uploads/'.length));
    if (!fileName || fileName.includes('..') || fileName.includes('/') || fileName.includes('\\')) {
      return null;
    }

    return path.join(uploadsDir, fileName);
  } catch {
    return null;
  }
};

const toDataUrl = (buffer, mimeType = 'image/jpeg') =>
  `data:${mimeType};base64,${buffer.toString('base64')}`;

const resolveImageInputs = (fileUrls = []) =>
  fileUrls
    .map((fileUrl) => {
      if (typeof fileUrl !== 'string' || !fileUrl.trim()) {
        return null;
      }

      if (fileUrl.startsWith('data:')) {
        return {
          dataUrl: fileUrl,
          base64: fileUrl.split(',')[1] || null
        };
      }

      const uploadPath = toAbsoluteUploadPath(fileUrl);
      if (!uploadPath || !existsSync(uploadPath)) {
        return null;
      }

      try {
        const extension = path.extname(uploadPath).toLowerCase();
        const mimeType = extension === '.png' ? 'image/png' : 'image/jpeg';
        const buffer = readFileSync(uploadPath);
        return {
          dataUrl: toDataUrl(buffer, mimeType),
          base64: buffer.toString('base64')
        };
      } catch {
        return null;
      }
    })
    .filter(Boolean);

const invokeWithOllama = async (payload) => {
  const baseUrl = (process.env.LOCAL_LLM_OLLAMA_URL || 'http://127.0.0.1:11434').replace(/\/$/, '');
  const model = process.env.LOCAL_LLM_MODEL || 'llama3.1:8b';
  const imageInputs = resolveImageInputs(payload?.file_urls);
  const response = await fetch(`${baseUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      stream: false,
      format: 'json',
      messages: [{
        role: 'user',
        content: buildSchemaPrompt(payload),
        ...(imageInputs.length ? { images: imageInputs.map((image) => image.base64).filter(Boolean) } : {})
      }]
    })
  });
  if (!response.ok) {
    throw new Error(`Ollama request failed (${response.status})`);
  }
  const data = await response.json();
  const parsed = tryParseJson(extractText(data));
  return parsed || {};
};

const invokeWithOpenAICompat = async (payload) => {
  const baseUrl = (process.env.LOCAL_LLM_OPENAI_URL || 'http://127.0.0.1:1234/v1').replace(/\/$/, '');
  const apiKey = process.env.LOCAL_LLM_OPENAI_KEY || 'not-needed';
  const model = process.env.LOCAL_LLM_MODEL || 'local-model';
  const imageInputs = resolveImageInputs(payload?.file_urls);
  const content = [{ type: 'text', text: buildSchemaPrompt(payload) }];

  imageInputs.forEach((image) => {
    content.push({
      type: 'image_url',
      image_url: {
        url: image.dataUrl
      }
    });
  });

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content }],
      temperature: 0.2
    })
  });
  if (!response.ok) {
    throw new Error(`OpenAI-compatible request failed (${response.status})`);
  }
  const data = await response.json();
  const parsed = tryParseJson(extractText(data));
  return parsed || {};
};

const llmFallbackResponse = (payload) => {
  const props = payload?.response_json_schema?.properties || {};
  if (props.foods) return { foods: [] };
  if (props.products) return { products: [] };
  return {};
};

const normalizeText = (value) =>
  String(value || '')
    .normalize('NFKD')
    .toLowerCase()
    .trim()
    .replace(/[\u0300-\u036f]/g, '')
    .replaceAll('ß', 'ss');

const filterProductsByQuery = (products, query) => {
  const normalizedQuery = normalizeText(query);
  if (!normalizedQuery) return products;

  const tokens = normalizedQuery.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return products;

  return products.filter((product) => {
    const haystack = normalizeText([
      product?.product_name,
      product?.product_name_de,
      product?.product_name_en,
      product?.generic_name,
      product?.brands
    ].filter(Boolean).join(' '));

    return tokens.every((token) => haystack.includes(token));
  });
};

const fetchOffSource = async (urlWithQuery, timeoutMs) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(urlWithQuery, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'FitTrackPro-LocalBackend/1.0 (+https://localhost)'
      }
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    return Array.isArray(data?.products) ? data.products : [];
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
};

const fetchOpenFoodFactsProductByCode = async (code, timeoutMs = 10000) => {
  const normalizedCode = String(code || '').trim();
  if (!normalizedCode) {
    throw new Error('code is required');
  }

  const params = new URLSearchParams({
    fields: 'code,product_name,product_name_de,product_name_en,generic_name,brands,nutriments,image_url,image_front_url'
  });
  const url = `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(normalizedCode)}?${params.toString()}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'FitTrackPro-LocalBackend/1.0 (+https://localhost)'
      }
    });

    if (!response.ok) {
      throw new Error(`Open Food Facts request failed (${response.status})`);
    }

    const data = await response.json();
    if (!data?.product) {
      throw new Error('Product not found');
    }

    return data.product;
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error('Open Food Facts product request timed out');
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
};

const searchFromLocalOffCache = (query, limit = 8) => {
  if (!offNameCacheDb) {
    throw new Error('Local OFF cache database not found');
  }

  const normalizedQuery = String(query || '').trim().toLowerCase();
  if (!normalizedQuery) {
    return [];
  }

  const safeLimit = Math.max(1, Math.min(Number(limit) || 8, 50));
  const containsPattern = `%${normalizedQuery}%`;
  const startsWithPattern = `${normalizedQuery}%`;
  const wordPattern = `% ${normalizedQuery}%`;

  const stmt = offNameCacheDb.prepare(`
    SELECT
      barcode AS code,
      name AS product_name,
      brand AS brands,
      country
    FROM off_name_cache
    WHERE lower(name) LIKE @contains OR lower(brand) LIKE @contains
    ORDER BY
      CASE
        WHEN lower(name) = @exact THEN 0
        WHEN lower(name) LIKE @startsWith THEN 1
        WHEN lower(name) LIKE @word THEN 2
        WHEN lower(name) LIKE @contains THEN 3
        WHEN lower(brand) LIKE @startsWith THEN 4
        WHEN lower(brand) LIKE @contains THEN 5
        ELSE 6
      END,
      length(name) ASC
    LIMIT @limit
  `);

  return stmt.all({
    exact: normalizedQuery,
    startsWith: startsWithPattern,
    word: wordPattern,
    contains: containsPattern,
    limit: safeLimit
  });
};

const searchOpenFoodFacts = async (query, limit = 8) => {
  return searchFromLocalOffCache(query, limit);
};

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, mode: 'local', storage: 'sqlite' });
});

app.get('/', (_req, res) => {
  res.type('text/plain').send(
    'FitTrack local backend is running.\nUse /api/health for status and run the frontend with npm run dev.'
  );
});

app.get('/api/auth/me', (_req, res) => {
  res.json({
    id: 'local-user',
    email: 'local@fittrack.app',
    role: 'admin'
  });
});

app.post('/api/app-logs', (req, res) => {
  logs.create(req.body || {});
  res.status(201).json({ ok: true });
});

app.post('/api/integrations/core/upload-file', upload.single('file'), (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: 'file is required' });
    return;
  }
  const fileUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;
  res.status(201).json({ file_url: fileUrl });
});

app.post('/api/integrations/core/invoke-llm', async (req, res) => {
  const payload = req.body || {};
  const provider = (process.env.LOCAL_LLM_PROVIDER || 'ollama').toLowerCase();

  try {
    let result;
    if (provider === 'openai') {
      result = await invokeWithOpenAICompat(payload);
    } else if (provider === 'none') {
      result = llmFallbackResponse(payload);
    } else {
      result = await invokeWithOllama(payload);
    }
    res.json(result);
  } catch (error) {
    res.status(502).json({
      error: 'LLM invocation failed',
      message: error.message,
      fallback: llmFallbackResponse(payload)
    });
  }
});

app.get('/api/search/open-food-facts', async (req, res) => {
  const q = String(req.query.q || '').trim();
  const limit = req.query.limit ? Number(req.query.limit) : 8;

  if (!q) {
    res.status(400).json({ error: 'q is required' });
    return;
  }

  try {
    const cacheKey = `${q.toLowerCase()}::${limit}`;
    const cached = searchCache.getFresh(cacheKey);
    if (cached) {
      res.json({ products: cached.products, cached: true, source: cached.source });
      return;
    }

    const products = await searchOpenFoodFacts(q, limit);
    searchCache.purgeExpired();
    searchCache.set({
      key: cacheKey,
      query: q,
      limitValue: limit,
      products,
      source: 'open-food-facts',
      expiresAtIso: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    });
    res.json({ products, cached: false, source: 'open-food-facts' });
  } catch (error) {
    res.status(502).json({
      error: 'Open Food Facts search failed',
      message: error.message || 'unknown error',
      products: []
    });
  }
});

app.get('/api/search/open-food-facts/product', async (req, res) => {
  const code = String(req.query.code || '').trim();
  if (!code) {
    res.status(400).json({ error: 'code is required' });
    return;
  }

  try {
    const product = await fetchOpenFoodFactsProductByCode(code);
    res.json({ product, source: 'open-food-facts' });
  } catch (error) {
    res.status(502).json({
      error: 'Open Food Facts product lookup failed',
      message: error.message || 'unknown error'
    });
  }
});

app.get('/api/entities/:entityName', (req, res) => {
  const { entityName } = req.params;
  const sort = req.query.sort || '-created_date';
  const limit = req.query.limit ? Number(req.query.limit) : undefined;
  const rows = entities.list(entityName, sort, Number.isFinite(limit) ? limit : undefined);
  res.json(rows);
});

app.post('/api/entities/:entityName/filter', (req, res) => {
  const { entityName } = req.params;
  const { filter = {}, sort = '-created_date', limit } = req.body || {};
  const rows = entities.filter(entityName, filter, sort, typeof limit === 'number' ? limit : undefined);
  res.json(rows);
});

app.post('/api/entities/:entityName', (req, res) => {
  const { entityName } = req.params;
  const entity = entities.create(entityName, req.body || {});
  res.status(201).json(entity);
});

app.patch('/api/entities/:entityName/:id', (req, res) => {
  const { entityName, id } = req.params;
  const entity = entities.update(entityName, id, req.body || {});
  if (!entity) {
    res.status(404).json({ error: 'Entity not found' });
    return;
  }
  res.json(entity);
});

app.delete('/api/entities/:entityName/:id', (req, res) => {
  const { entityName, id } = req.params;
  const removed = entities.remove(entityName, id);
  if (!removed) {
    res.status(404).json({ error: 'Entity not found' });
    return;
  }
  res.status(204).end();
});

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Local FitTrack API running on http://127.0.0.1:${port} (SQLite)`);
});
