const MODEL = 'gemini-2.5-flash';
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const OPEN_FOOD_FACTS_TIMEOUT_MS = 20000;
const OPEN_FOOD_FACTS_FAST_TIMEOUT_MS = 5000;
const OPEN_FOOD_FACTS_SEARCH_FIELDS = 'code,product_name,product_name_de,product_name_en,generic_name,brands';
const OPEN_FOOD_FACTS_PRODUCT_FIELDS = 'code,product_name,product_name_de,product_name_en,generic_name,brands,nutriments,image_url,image_front_url';
const OPEN_FOOD_FACTS_USER_AGENT = 'FitTrackPro/1.0 (support@fittrackpro.app)';
const OPEN_FOOD_FACTS_API_V2_SEARCH_URL = 'https://world.openfoodfacts.org/api/v2/search';
const OPEN_FOOD_FACTS_DE_API_V2_SEARCH_URL = 'https://de.openfoodfacts.org/api/v2/search';
const SEARCH_CACHE_VERSION = 'v3';
const PREWARM_TOP_QUERIES = [
  'apfel', 'banane', 'orange', 'trauben', 'erdbeeren',
  'brot', 'vollkornbrot', 'toast', 'reis', 'nudeln',
  'kartoffel', 'haferflocken', 'muesli', 'quark', 'joghurt',
  'milch', 'kaese', 'butter', 'ei', 'huhn',
  'haehnchenbrust', 'rindfleisch', 'thunfisch', 'lachs', 'tofu',
  'avocado', 'tomate', 'gurke', 'salat', 'brokkoli',
  'paprika', 'zwiebel', 'bohnen', 'linsen', 'kichererbsen',
  'pizza', 'burger', 'pommes', 'pesto', 'nutella',
  'apple', 'banana', 'bread', 'rice', 'pasta',
  'milk', 'yogurt', 'chicken', 'egg', 'protein bar'
];
const FOOD_NUTRITION_FALLBACKS = [
  {
    names: ['apple', 'apfel'],
    values: { calories_per_100g: 52, protein_per_100g: 0.3, carbs_per_100g: 14, fat_per_100g: 0.2 }
  },
  {
    names: ['banana', 'banane'],
    values: { calories_per_100g: 89, protein_per_100g: 1.1, carbs_per_100g: 23, fat_per_100g: 0.3 }
  },
  {
    names: ['orange'],
    values: { calories_per_100g: 47, protein_per_100g: 0.9, carbs_per_100g: 12, fat_per_100g: 0.1 }
  },
  {
    names: ['egg', 'ei'],
    values: { calories_per_100g: 155, protein_per_100g: 13, carbs_per_100g: 1.1, fat_per_100g: 11 }
  },
  {
    names: ['rice', 'reis'],
    values: { calories_per_100g: 130, protein_per_100g: 2.7, carbs_per_100g: 28, fat_per_100g: 0.3 }
  },
  {
    names: ['chicken breast', 'chicken', 'huhn', 'haehnchen', 'hahnchen'],
    values: { calories_per_100g: 165, protein_per_100g: 31, carbs_per_100g: 0, fat_per_100g: 3.6 }
  },
  {
    names: ['bread', 'brot'],
    values: { calories_per_100g: 265, protein_per_100g: 9, carbs_per_100g: 49, fat_per_100g: 3.2 }
  }
];

const json = (data, init = {}) =>
  new Response(JSON.stringify(data), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET,POST,OPTIONS',
      'access-control-allow-headers': 'content-type,x-gemini-api-key'
    },
    ...init
  });

const fetchJsonWithTimeout = async (url, timeoutMs) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      headers: {
        accept: 'application/json',
        'user-agent': OPEN_FOOD_FACTS_USER_AGENT
      },
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`Open Food Facts request failed (${response.status})`);
    }

    return response.json().catch(() => ({}));
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error('Open Food Facts request timed out');
    }

    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
};

const normalizeText = (value) =>
  String(value || '')
    .normalize('NFKD')
    .toLowerCase()
    .trim()
    .replace(/[\u0300-\u036f]/g, '')
    .replaceAll('ß', 'ss');

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
  }

  return null;
};

const llmFallbackResponse = (payload) => {
  const props = payload?.response_json_schema?.properties || {};
  if (props.foods) return { foods: [] };
  if (props.products) return { products: [] };
  return {};
};

const sanitizeRawResult = (result) => {
  try {
    return JSON.parse(JSON.stringify(result));
  } catch {
    return { raw: String(result) };
  }
};

const buildSchemaPrompt = (payload) => {
  const hasStructuredOutput = Boolean(payload?.response_json_schema);
  const lines = [];

  if (payload?.prompt) {
    lines.push(payload.prompt);
  }

  lines.push(
    'Antworte nur mit konkreten Datenwerten.',
    'Wenn ein Lebensmittel sichtbar ist, gib mindestens einen Eintrag in foods zurück.',
    'Schätze Portionsgrößen konservativ und plausibel.',
    'Wiederhole niemals ein Schema und keine Felddefinitionen.'
  );

  if (hasStructuredOutput) {
    lines.push('Das Antwortformat wird technisch separat erzwungen.');
  }

  return lines.join('\n\n');
};

const readFileAsDataUrl = async (file) => {
  if (!file) {
    throw new Error('file is required');
  }

  if (file.size > MAX_IMAGE_BYTES) {
    throw new Error('Image is too large. Use files up to 5 MB.');
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = '';
  const chunkSize = 0x8000;

  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }

  const mimeType = file.type || 'image/jpeg';
  return `data:${mimeType};base64,${btoa(binary)}`;
};

const dataUrlToInlineData = (dataUrl) => {
  const match = /^data:(.+?);base64,(.+)$/.exec(dataUrl);
  if (!match) {
    throw new Error('Unsupported image format');
  }

  return {
    mime_type: match[1],
    data: match[2]
  };
};

const resolveGeminiApiKey = (env, request) => {
  const headerKey = String(request?.headers?.get('x-gemini-api-key') || '').trim();
  if (headerKey) {
    return headerKey;
  }

  return String(env.GEMINI_API_KEY || '').trim();
};

const invokeGemini = async (env, request, body) => {
  const apiKey = resolveGeminiApiKey(env, request);
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured');
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-goog-api-key': apiKey
      },
      body: JSON.stringify(body)
    }
  );

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error?.message || `Gemini request failed (${response.status})`);
  }

  return data;
};

const extractGeminiText = (data) => {
  const parts = data?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) {
    return '';
  }

  return parts
    .map((part) => part?.text || '')
    .filter(Boolean)
    .join('\n');
};

const enrichFoodsWithFallbackNutrition = (foods) =>
  foods.map((food) => {
    const currentCalories = Number(food?.calories_per_100g || 0);
    const currentProtein = Number(food?.protein_per_100g || 0);
    const currentCarbs = Number(food?.carbs_per_100g || 0);
    const currentFat = Number(food?.fat_per_100g || 0);

    if (currentCalories > 0 || currentProtein > 0 || currentCarbs > 0 || currentFat > 0) {
      return food;
    }

    const normalizedName = normalizeText(food?.name);
    const fallback = FOOD_NUTRITION_FALLBACKS.find((entry) =>
      entry.names.some((candidate) => normalizedName.includes(normalizeText(candidate)))
    );

    if (!fallback) {
      return food;
    }

    return {
      ...food,
      ...fallback.values
    };
  });

const parseFoodsFromPlainText = (text) => {
  const compact = String(text || '')
    .replace(/\r/g, '\n')
    .split('\n')
    .map((line) => line.replace(/^[-*0-9.)\s]+/, '').trim())
    .filter(Boolean)
    .join(', ');

  if (!compact) {
    return [];
  }

  return compact
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .map((name) => ({
      name,
      estimated_weight_grams: 150,
      calories_per_100g: 0,
      protein_per_100g: 0,
      carbs_per_100g: 0,
      fat_per_100g: 0
    }));
};

const parseNutritionNumber = (value) => {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }
  if (typeof value !== 'string') {
    return 0;
  }

  const normalized = value.replace(',', '.').replace(/[^0-9.-]/g, '').trim();
  if (!normalized) {
    return 0;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};

const readEnergyKcal = (nutriments = {}) => {
  const kcal = parseNutritionNumber(nutriments['energy-kcal_100g'] ?? nutriments['energy-kcal']);
  if (kcal > 0) {
    return kcal;
  }

  const kj = parseNutritionNumber(nutriments.energy_kj_100g ?? nutriments.energy_kj);
  if (kj > 0) {
    return kj / 4.184;
  }

  return 0;
};

const hasMeaningfulNutrition = (product) => {
  const nutriments = product?.nutriments;
  if (!nutriments || typeof nutriments !== 'object') {
    return false;
  }

  const energy = readEnergyKcal(nutriments);
  const protein = parseNutritionNumber(nutriments.proteins_100g ?? nutriments.proteins);
  const carbs = parseNutritionNumber(nutriments.carbohydrates_100g ?? nutriments.carbohydrates);
  const fat = parseNutritionNumber(nutriments.fat_100g ?? nutriments.fat);
  return energy > 0 || protein > 0 || carbs > 0 || fat > 0;
};

const detectFoodsFallback = async (env, request, imageDataUrl) => {
  const result = await invokeGemini(env, request, {
    contents: [
      {
        parts: [
          {
            inline_data: dataUrlToInlineData(imageDataUrl)
          },
          {
            text: 'Name the visible food items in this image. Return one short food name or a comma-separated list. If no food is visible, answer only with none.'
          }
        ]
      }
    ],
    generationConfig: {
      temperature: 0
    }
  });

  const text = extractGeminiText(result);
  if (!text || /(^|\b)none(\b|$)/i.test(text)) {
    return {
      foods: [],
      raw: sanitizeRawResult(result)
    };
  }

  return {
    foods: enrichFoodsWithFallbackNutrition(parseFoodsFromPlainText(text)),
    raw: sanitizeRawResult(result)
  };
};

const invokeVisionModel = async (env, request, payload) => {
  const firstFileUrl = payload?.file_urls?.find((value) => typeof value === 'string' && value.startsWith('data:'));
  if (!firstFileUrl) {
    throw new Error('No image input provided');
  }

  const requestBody = {
    contents: [
      {
        parts: [
          {
            inline_data: dataUrlToInlineData(firstFileUrl)
          },
          {
            text: buildSchemaPrompt(payload)
          }
        ]
      }
    ],
    generationConfig: {
      temperature: 0.1,
      response_mime_type: 'application/json',
      response_json_schema: payload?.response_json_schema
    }
  };

  let result;
  try {
    result = await invokeGemini(env, request, requestBody);
  } catch (error) {
    const message = error.message || 'unknown error';
    if (!message.toLowerCase().includes('timeout')) {
      throw error;
    }

    result = await invokeGemini(env, request, {
      ...requestBody,
      generationConfig: {
        ...requestBody.generationConfig,
        temperature: 0
      }
    });
  }

  const parsed = tryParseJson(extractGeminiText(result));
  let finalParsed = parsed || llmFallbackResponse(payload);

  if (finalParsed?.foods && Array.isArray(finalParsed.foods)) {
    finalParsed.foods = enrichFoodsWithFallbackNutrition(finalParsed.foods);
  }

  let fallbackRaw = null;
  if (!finalParsed?.foods?.length) {
    const fallback = await detectFoodsFallback(env, request, firstFileUrl);
    fallbackRaw = fallback.raw;
    if (fallback.foods.length) {
      finalParsed = { foods: fallback.foods };
    }
  }

  return {
    parsed: finalParsed,
    raw: sanitizeRawResult(result),
    fallbackRaw
  };
};

const searchOpenFoodFacts = async (query, limit = 8) => {
  const normalizedQuery = String(query || '').trim();
  if (!normalizedQuery) return [];

  const normalizedForRequest = normalizedQuery.length > 1
    ? normalizedQuery.slice(1)
    : normalizedQuery;
  if (!normalizedForRequest) return [];

  const safeLimit = Math.max(1, Math.min(Number(limit) || 8, 20));
  const apiV2Params = new URLSearchParams({
    search_terms: normalizedForRequest,
    page_size: String(safeLimit),
    sort_by: 'popularity_key',
    fields: OPEN_FOOD_FACTS_SEARCH_FIELDS
  });

  const endpoints = [
    `${OPEN_FOOD_FACTS_DE_API_V2_SEARCH_URL}?${apiV2Params.toString()}`,
    `${OPEN_FOOD_FACTS_API_V2_SEARCH_URL}?${apiV2Params.toString()}`
  ];

  const dedupeAndKey = (product) => {
    const key = String(product?.code || product?.product_name || '').trim().toLowerCase();
    return key || null;
  };

  const normalizeForSearch = (value) =>
    String(value || '')
      .normalize('NFKD')
      .toLowerCase()
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();

  const queryNormalized = normalizeForSearch(normalizedForRequest);

  const buildNameHaystack = (product) =>
    normalizeForSearch([
      product?.product_name,
      product?.product_name_de,
      product?.product_name_en,
      product?.generic_name
    ].filter(Boolean).join(' '));

  const scoreProduct = (product) => {
    const nameHaystack = buildNameHaystack(product);
    if (!nameHaystack) return -1;
    if (!queryNormalized) return -1;

    // Test mode requested: only contains on normalized product_name fields.
    if (!nameHaystack.includes(queryNormalized)) {
      return -1;
    }

    // Keep mild prioritization by shorter distance to match start.
    const firstIndex = nameHaystack.indexOf(queryNormalized);
    const proximityBoost = Math.max(0, 500 - firstIndex * 10);
    return 1000 + proximityBoost;
  };

  const rankBatch = (batch) => {
    const byKey = new Map();
    for (const product of batch) {
      const key = dedupeAndKey(product);
      if (!key || byKey.has(key)) continue;
      byKey.set(key, product);
    }

    const uniqueProducts = Array.from(byKey.values());

    return uniqueProducts
      .map((product) => ({ product, score: scoreProduct(product) }))
      .filter((entry) => entry.score >= 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, safeLimit)
      .map((entry) => entry.product);
  };

  const pickFirstNonEmptyRanked = (settledResults) => {
    for (const result of settledResults) {
      if (result.status !== 'fulfilled') continue;
      const batch = Array.isArray(result.value?.products) ? result.value.products : [];
      const ranked = rankBatch(batch);
      if (ranked.length > 0) {
        return ranked;
      }
    }
    return null;
  };

  // Fast path first: API v2 with short timeout for quick UI feedback.
  const fastSettled = await Promise.allSettled(
    endpoints.slice(0, 2).map((endpoint) => fetchJsonWithTimeout(endpoint, OPEN_FOOD_FACTS_FAST_TIMEOUT_MS))
  );
  const fastRanked = pickFirstNonEmptyRanked(fastSettled);
  if (fastRanked) {
    return fastRanked;
  }

  const fullSettled = await Promise.allSettled(
    endpoints.map((endpoint) => fetchJsonWithTimeout(endpoint, OPEN_FOOD_FACTS_TIMEOUT_MS))
  );
  const fullRanked = pickFirstNonEmptyRanked(fullSettled);
  if (fullRanked) {
    return fullRanked;
  }

  const hadSuccessfulResponse = fullSettled.some((entry) => entry.status === 'fulfilled');
  if (hadSuccessfulResponse) {
    return [];
  }

  const firstRejected = fullSettled.find((entry) => entry.status === 'rejected');
  throw (firstRejected?.reason || new Error('Open Food Facts not reachable'));
};

const buildSearchCacheRequest = (baseUrl, query, limit) => {
  const cacheUrl = new URL('/api/search/open-food-facts', baseUrl);
  cacheUrl.searchParams.set('q', String(query || '').trim());
  cacheUrl.searchParams.set('limit', String(limit));
  cacheUrl.searchParams.set('__cv', SEARCH_CACHE_VERSION);
  return new Request(cacheUrl.toString(), { method: 'GET' });
};

const prewarmOpenFoodFactsCache = async (requestUrl, limit = 8) => {
  const cache = caches.default;
  const safeLimit = Math.max(1, Math.min(Number(limit) || 8, 20));
  const results = [];

  for (const query of PREWARM_TOP_QUERIES) {
    try {
      const products = await searchOpenFoodFacts(query, safeLimit);
      const cacheKey = buildSearchCacheRequest(requestUrl, query, safeLimit);
      const response = json(
        { products, source: 'open-food-facts', prewarmed: true },
        {
          headers: {
            'content-type': 'application/json; charset=utf-8',
            'access-control-allow-origin': '*',
            'access-control-allow-methods': 'GET,POST,OPTIONS',
            'access-control-allow-headers': 'content-type',
            'cache-control': 'public, max-age=1800'
          }
        }
      );
      await cache.put(cacheKey, response);
      results.push({ query, ok: true, count: products.length });
    } catch (error) {
      results.push({ query, ok: false, error: error?.message || 'unknown error' });
    }
  }

  return results;
};

const buildBarcodeCandidates = (rawCode) => {
  const normalizedCode = String(rawCode || '').trim();
  if (!normalizedCode) {
    return [];
  }

  const candidates = [normalizedCode];
  const digits = normalizedCode.replace(/\D/g, '');
  if (digits.length >= 8) {
    candidates.push(digits);
  }
  if (digits.length === 12) {
    candidates.push(`0${digits}`);
  } else if (digits.length === 13 && digits.startsWith('0')) {
    candidates.push(digits.slice(1));
  }

  return [...new Set(candidates.filter(Boolean))];
};

const scoreProductQuality = (product) => {
  if (!product) return -1;
  const hasName = Boolean(
    product.product_name ||
    product.product_name_de ||
    product.product_name_en ||
    product.generic_name
  );
  const hasBrand = Boolean(product.brands);
  const nutrition = hasMeaningfulNutrition(product) ? 100 : 0;
  return nutrition + (hasName ? 10 : 0) + (hasBrand ? 3 : 0);
};

const extractProductFromPayload = (endpointType, payload) => {
  if (endpointType === 'v0') {
    return payload?.status === 1 ? payload?.product || null : null;
  }
  return payload?.product || null;
};

const fetchOpenFoodFactsProductByCode = async (code) => {
  const barcodeCandidates = buildBarcodeCandidates(code);
  if (barcodeCandidates.length === 0) {
    throw new Error('code is required');
  }

  const buildV2Url = (host, candidate) => {
    const params = new URLSearchParams({ fields: OPEN_FOOD_FACTS_PRODUCT_FIELDS });
    return `https://${host}.openfoodfacts.org/api/v2/product/${encodeURIComponent(candidate)}?${params.toString()}`;
  };

  const buildV0Url = (host, candidate) =>
    `https://${host}.openfoodfacts.org/api/v0/product/${encodeURIComponent(candidate)}.json`;

  const endpointTemplates = [
    { host: 'world', type: 'v2' },
    { host: 'de', type: 'v2' },
    { host: 'world', type: 'v0' },
    { host: 'de', type: 'v0' }
  ];

  let bestProduct = null;
  let bestScore = -1;

  const tryRound = async (timeoutMs) => {
    for (const candidate of barcodeCandidates) {
      const calls = endpointTemplates.map(async (endpoint) => {
        const url = endpoint.type === 'v2'
          ? buildV2Url(endpoint.host, candidate)
          : buildV0Url(endpoint.host, candidate);
        const data = await fetchJsonWithTimeout(url, timeoutMs);
        const product = extractProductFromPayload(endpoint.type, data);
        if (!product) {
          throw new Error('Product not found');
        }
        return product;
      });

      const settled = await Promise.allSettled(calls);
      for (const entry of settled) {
        if (entry.status !== 'fulfilled') continue;
        const product = entry.value;
        const score = scoreProductQuality(product);
        if (score > bestScore) {
          bestProduct = product;
          bestScore = score;
        }
      }

      if (bestProduct && hasMeaningfulNutrition(bestProduct)) {
        return bestProduct;
      }
    }

    return null;
  };

  const fastResult = await tryRound(4500);
  if (fastResult) {
    return fastResult;
  }

  const fullResult = await tryRound(OPEN_FOOD_FACTS_TIMEOUT_MS);
  if (fullResult) {
    return fullResult;
  }

  if (bestProduct) {
    return bestProduct;
  }

  throw new Error('Product not found');
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return json({ ok: true });
    }

    if (url.pathname === '/api/health') {
      return json({
        ok: true,
        provider: 'gemini-api-via-cloudflare-worker',
        model: MODEL
      });
    }

    if (url.pathname === '/api/integrations/core/upload-file' && request.method === 'POST') {
      try {
        const formData = await request.formData();
        const file = formData.get('file');
        if (!(file instanceof File)) {
          return json({ error: 'file is required' }, { status: 400 });
        }

        const dataUrl = await readFileAsDataUrl(file);
        return json({ file_url: dataUrl });
      } catch (error) {
        return json({
          error: 'Upload failed',
          message: error.message || 'unknown error'
        }, { status: 400 });
      }
    }

    if (url.pathname === '/api/integrations/core/invoke-llm' && request.method === 'POST') {
      const payload = await request.json().catch(() => ({}));

      try {
        const result = await invokeVisionModel(env, request, payload || {});
        return json({
          ...result.parsed,
          _debug: url.searchParams.get('debug') === '1'
            ? {
                raw_model_response: result.raw,
                fallback_model_response: result.fallbackRaw
              }
            : undefined
        });
      } catch (error) {
        return json({
          error: 'LLM invocation failed',
          message: error.message || 'unknown error',
          raw_model_response: url.searchParams.get('debug') === '1' ? sanitizeRawResult(error) : undefined,
          fallback: llmFallbackResponse(payload)
        }, { status: 502 });
      }
    }

    if (url.pathname === '/api/debug/vision-food' && request.method === 'POST') {
      try {
        const payload = await request.json().catch(() => ({}));
        const result = await invokeVisionModel(env, request, payload || {});
        return json({
          ok: true,
          model: MODEL,
          parsed: result.parsed,
          raw_model_response: result.raw,
          fallback_model_response: result.fallbackRaw
        });
      } catch (error) {
        return json({
          ok: false,
          model: MODEL,
          error: 'Vision debug failed',
          message: error.message || 'unknown error',
          raw_model_response: sanitizeRawResult(error)
        }, { status: 502 });
      }
    }

    if (url.pathname === '/api/search/open-food-facts' && request.method === 'GET') {
      const q = String(url.searchParams.get('q') || '').trim();
      const limit = Number(url.searchParams.get('limit') || 8);
      const disableCache = url.searchParams.get('nocache') === '1';

      if (!q) {
        return json({ error: 'q is required' }, { status: 400 });
      }

      try {
        const cache = caches.default;
        const cacheUrl = new URL(url.toString());
        cacheUrl.searchParams.set('__cv', SEARCH_CACHE_VERSION);
        const cacheKey = new Request(cacheUrl.toString(), { method: 'GET' });
        if (!disableCache) {
          const cached = await cache.match(cacheKey);
          if (cached) {
            return cached;
          }
        }

        const products = await searchOpenFoodFacts(q, limit);
        const hasProducts = Array.isArray(products) && products.length > 0;

        const response = json({ products, source: 'open-food-facts' }, {
          headers: {
            'content-type': 'application/json; charset=utf-8',
            'access-control-allow-origin': '*',
            'access-control-allow-methods': 'GET,POST,OPTIONS',
            'access-control-allow-headers': 'content-type',
            'cache-control': disableCache || !hasProducts ? 'no-store' : 'public, max-age=1800'
          }
        });
        if (!disableCache && hasProducts) {
          await cache.put(cacheKey, response.clone());
        }
        return response;
      } catch (error) {
        return json({
          error: 'Open Food Facts search failed',
          message: error.message || 'unknown error',
          products: []
        }, { status: 502 });
      }
    }

    if (url.pathname === '/api/search/prewarm' && request.method === 'POST') {
      const limit = Number(url.searchParams.get('limit') || 8);
      const startedAt = Date.now();
      const results = await prewarmOpenFoodFactsCache(request.url, limit);
      const successful = results.filter((item) => item.ok);
      const failed = results.filter((item) => !item.ok);

      return json({
        ok: true,
        cache_version: SEARCH_CACHE_VERSION,
        total_queries: PREWARM_TOP_QUERIES.length,
        successful_queries: successful.length,
        failed_queries: failed.length,
        elapsed_ms: Date.now() - startedAt,
        results
      });
    }

    if (url.pathname === '/api/search/open-food-facts/product' && request.method === 'GET') {
      const code = String(url.searchParams.get('code') || '').trim();
      if (!code) {
        return json({ error: 'code is required' }, { status: 400 });
      }

      try {
        const cache = caches.default;
        const cacheUrl = new URL(url.toString());
        cacheUrl.searchParams.set('__cv', 'p2');
        const cacheKey = new Request(cacheUrl.toString(), { method: 'GET' });
        const cached = await cache.match(cacheKey);
        if (cached) {
          return cached;
        }

        const product = await fetchOpenFoodFactsProductByCode(code);
        const response = json(
          { product, source: 'open-food-facts' },
          {
            headers: {
              'content-type': 'application/json; charset=utf-8',
              'access-control-allow-origin': '*',
              'access-control-allow-methods': 'GET,POST,OPTIONS',
              'access-control-allow-headers': 'content-type',
              'cache-control': hasMeaningfulNutrition(product) ? 'public, max-age=604800' : 'public, max-age=86400'
            }
          }
        );
        await cache.put(cacheKey, response.clone());
        return response;
      } catch (error) {
        return json({
          error: 'Open Food Facts product lookup failed',
          message: error.message || 'unknown error'
        }, { status: 502 });
      }
    }

    return json({ error: 'Not found' }, { status: 404 });
  }
};
