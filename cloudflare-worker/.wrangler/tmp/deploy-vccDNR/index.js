var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/index.js
var MODEL = "gemini-2.5-flash";
var MAX_IMAGE_BYTES = 5 * 1024 * 1024;
var OPEN_FOOD_FACTS_TIMEOUT_MS = 6e3;
var OPEN_FOOD_FACTS_FIELDS = "code,product_name,product_name_de,product_name_en,generic_name,brands,nutriments,image_url,image_front_url";
var OPEN_FOOD_FACTS_USER_AGENT = "FitTrackPro/1.0 (support@fittrackpro.app)";
var FATSECRET_TOKEN_URL = "https://oauth.fatsecret.com/connect/token";
var FATSECRET_API_URL = "https://platform.fatsecret.com/rest/server.api";
var FATSECRET_TIMEOUT_MS = 7e3;
var FOOD_NUTRITION_FALLBACKS = [
  {
    names: ["apple", "apfel"],
    values: { calories_per_100g: 52, protein_per_100g: 0.3, carbs_per_100g: 14, fat_per_100g: 0.2 }
  },
  {
    names: ["banana", "banane"],
    values: { calories_per_100g: 89, protein_per_100g: 1.1, carbs_per_100g: 23, fat_per_100g: 0.3 }
  },
  {
    names: ["orange"],
    values: { calories_per_100g: 47, protein_per_100g: 0.9, carbs_per_100g: 12, fat_per_100g: 0.1 }
  },
  {
    names: ["egg", "ei"],
    values: { calories_per_100g: 155, protein_per_100g: 13, carbs_per_100g: 1.1, fat_per_100g: 11 }
  },
  {
    names: ["rice", "reis"],
    values: { calories_per_100g: 130, protein_per_100g: 2.7, carbs_per_100g: 28, fat_per_100g: 0.3 }
  },
  {
    names: ["chicken breast", "chicken", "huhn", "haehnchen", "hahnchen"],
    values: { calories_per_100g: 165, protein_per_100g: 31, carbs_per_100g: 0, fat_per_100g: 3.6 }
  },
  {
    names: ["bread", "brot"],
    values: { calories_per_100g: 265, protein_per_100g: 9, carbs_per_100g: 49, fat_per_100g: 3.2 }
  }
];
var json = /* @__PURE__ */ __name((data, init = {}) => new Response(JSON.stringify(data), {
  headers: {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type"
  },
  ...init
}), "json");
var fetchJsonWithTimeout = /* @__PURE__ */ __name(async (url, timeoutMs) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      headers: {
        accept: "application/json",
        "user-agent": OPEN_FOOD_FACTS_USER_AGENT
      },
      signal: controller.signal
    });
    if (!response.ok) {
      throw new Error(`Open Food Facts request failed (${response.status})`);
    }
    return response.json().catch(() => ({}));
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error("Open Food Facts request timed out");
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}, "fetchJsonWithTimeout");
var fetchJsonWithTimeoutAndOptions = /* @__PURE__ */ __name(async (url, options, timeoutMs) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data?.error?.message || `Request failed (${response.status})`);
    }
    return data;
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error("Request timed out");
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}, "fetchJsonWithTimeoutAndOptions");
var parseNumber = /* @__PURE__ */ __name((value) => {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value !== "string") return 0;
  const normalized = value.replace(",", ".").replace(/[^0-9.-]/g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}, "parseNumber");
var parseFatSecretDescription = /* @__PURE__ */ __name((description) => {
  const text = String(description || "");
  const calories = parseNumber((/calories?\s*:\s*([0-9.,]+)/i.exec(text) || [])[1]);
  const fat = parseNumber((/(?:fat|fett)\s*:\s*([0-9.,]+)/i.exec(text) || [])[1]);
  const carbs = parseNumber((/(?:carbs?|carbohydrates?|kohlenhydrate)\s*:\s*([0-9.,]+)/i.exec(text) || [])[1]);
  const protein = parseNumber((/(?:protein|eiwei[ßs])\s*:\s*([0-9.,]+)/i.exec(text) || [])[1]);
  return {
    calories,
    protein,
    carbs,
    fat
  };
}, "parseFatSecretDescription");
var normalizeFatSecretItems = /* @__PURE__ */ __name((response) => {
  const possibleCollections = [
    response?.foods_search?.results?.food,
    response?.foods?.food,
    response?.foods_search?.food,
    response?.food
  ];
  const firstCollection = possibleCollections.find((candidate) => candidate !== void 0 && candidate !== null);
  if (!firstCollection) return [];
  return Array.isArray(firstCollection) ? firstCollection : [firstCollection];
}, "normalizeFatSecretItems");
var mapFatSecretFoodToProduct = /* @__PURE__ */ __name((food) => {
  const parsed = parseFatSecretDescription(food?.food_description);
  return {
    code: String(food?.food_id || food?.id || ""),
    product_name: food?.food_name || food?.name || "Unknown product",
    product_name_de: food?.food_name || food?.name || "Unknown product",
    product_name_en: food?.food_name || food?.name || "Unknown product",
    brands: food?.brand_name || "",
    nutriments: {
      "energy-kcal_100g": parsed.calories,
      proteins_100g: parsed.protein,
      carbohydrates_100g: parsed.carbs,
      fat_100g: parsed.fat
    },
    image_url: "",
    image_front_url: ""
  };
}, "mapFatSecretFoodToProduct");
var getFatSecretAccessToken = /* @__PURE__ */ __name(async (env) => {
  const clientId = env.FATSECRET_CLIENT_ID;
  const clientSecret = env.FATSECRET_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("FatSecret credentials are not configured");
  }
  const basicAuth = btoa(`${clientId}:${clientSecret}`);
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    scope: "basic"
  }).toString();
  const tokenResponse = await fetchJsonWithTimeoutAndOptions(
    FATSECRET_TOKEN_URL,
    {
      method: "POST",
      headers: {
        authorization: `Basic ${basicAuth}`,
        "content-type": "application/x-www-form-urlencoded"
      },
      body
    },
    FATSECRET_TIMEOUT_MS
  );
  const token = tokenResponse?.access_token;
  if (!token) {
    throw new Error("Unable to retrieve FatSecret access token");
  }
  return token;
}, "getFatSecretAccessToken");
var searchFatSecretFoods = /* @__PURE__ */ __name(async (env, query, limit, region) => {
  const token = await getFatSecretAccessToken(env);
  const safeLimit = Math.max(1, Math.min(Number(limit) || 8, 20));
  const language = region === "DE" ? "de" : "en";
  const methods = ["foods.search.v3", "foods.search"];
  for (const method of methods) {
    const body = new URLSearchParams({
      method,
      format: "json",
      search_expression: query,
      max_results: String(safeLimit),
      region,
      language
    }).toString();
    try {
      const response = await fetchJsonWithTimeoutAndOptions(
        FATSECRET_API_URL,
        {
          method: "POST",
          headers: {
            authorization: `Bearer ${token}`,
            "content-type": "application/x-www-form-urlencoded"
          },
          body
        },
        FATSECRET_TIMEOUT_MS
      );
      const items = normalizeFatSecretItems(response);
      if (items.length) {
        return items.map(mapFatSecretFoodToProduct);
      }
    } catch {
    }
  }
  return [];
}, "searchFatSecretFoods");
var normalizeText = /* @__PURE__ */ __name((value) => String(value || "").normalize("NFKD").toLowerCase().trim().replace(/[\u0300-\u036f]/g, "").replaceAll("\xDF", "ss"), "normalizeText");
var tryParseJson = /* @__PURE__ */ __name((content) => {
  if (!content || typeof content !== "string") return null;
  try {
    return JSON.parse(content);
  } catch {
    const start = content.indexOf("{");
    const end = content.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(content.slice(start, end + 1));
      } catch {
        return null;
      }
    }
  }
  return null;
}, "tryParseJson");
var llmFallbackResponse = /* @__PURE__ */ __name((payload) => {
  const props = payload?.response_json_schema?.properties || {};
  if (props.foods) return { foods: [] };
  if (props.products) return { products: [] };
  return {};
}, "llmFallbackResponse");
var sanitizeRawResult = /* @__PURE__ */ __name((result) => {
  try {
    return JSON.parse(JSON.stringify(result));
  } catch {
    return { raw: String(result) };
  }
}, "sanitizeRawResult");
var buildSchemaPrompt = /* @__PURE__ */ __name((payload) => {
  const hasStructuredOutput = Boolean(payload?.response_json_schema);
  const lines = [];
  if (payload?.prompt) {
    lines.push(payload.prompt);
  }
  lines.push(
    "Antworte nur mit konkreten Datenwerten.",
    "Wenn ein Lebensmittel sichtbar ist, gib mindestens einen Eintrag in foods zur\xFCck.",
    "Sch\xE4tze Portionsgr\xF6\xDFen konservativ und plausibel.",
    "Wiederhole niemals ein Schema und keine Felddefinitionen."
  );
  if (hasStructuredOutput) {
    lines.push("Das Antwortformat wird technisch separat erzwungen.");
  }
  return lines.join("\n\n");
}, "buildSchemaPrompt");
var readFileAsDataUrl = /* @__PURE__ */ __name(async (file) => {
  if (!file) {
    throw new Error("file is required");
  }
  if (file.size > MAX_IMAGE_BYTES) {
    throw new Error("Image is too large. Use files up to 5 MB.");
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  const chunkSize = 32768;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  const mimeType = file.type || "image/jpeg";
  return `data:${mimeType};base64,${btoa(binary)}`;
}, "readFileAsDataUrl");
var dataUrlToInlineData = /* @__PURE__ */ __name((dataUrl) => {
  const match = /^data:(.+?);base64,(.+)$/.exec(dataUrl);
  if (!match) {
    throw new Error("Unsupported image format");
  }
  return {
    mime_type: match[1],
    data: match[2]
  };
}, "dataUrlToInlineData");
var invokeGemini = /* @__PURE__ */ __name(async (env, body) => {
  if (!env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not configured");
  }
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": env.GEMINI_API_KEY
      },
      body: JSON.stringify(body)
    }
  );
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error?.message || `Gemini request failed (${response.status})`);
  }
  return data;
}, "invokeGemini");
var extractGeminiText = /* @__PURE__ */ __name((data) => {
  const parts = data?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) {
    return "";
  }
  return parts.map((part) => part?.text || "").filter(Boolean).join("\n");
}, "extractGeminiText");
var enrichFoodsWithFallbackNutrition = /* @__PURE__ */ __name((foods) => foods.map((food) => {
  const currentCalories = Number(food?.calories_per_100g || 0);
  const currentProtein = Number(food?.protein_per_100g || 0);
  const currentCarbs = Number(food?.carbs_per_100g || 0);
  const currentFat = Number(food?.fat_per_100g || 0);
  if (currentCalories > 0 || currentProtein > 0 || currentCarbs > 0 || currentFat > 0) {
    return food;
  }
  const normalizedName = normalizeText(food?.name);
  const fallback = FOOD_NUTRITION_FALLBACKS.find(
    (entry) => entry.names.some((candidate) => normalizedName.includes(normalizeText(candidate)))
  );
  if (!fallback) {
    return food;
  }
  return {
    ...food,
    ...fallback.values
  };
}), "enrichFoodsWithFallbackNutrition");
var parseFoodsFromPlainText = /* @__PURE__ */ __name((text) => {
  const compact = String(text || "").replace(/\r/g, "\n").split("\n").map((line) => line.replace(/^[-*0-9.)\s]+/, "").trim()).filter(Boolean).join(", ");
  if (!compact) {
    return [];
  }
  return compact.split(",").map((item) => item.trim()).filter(Boolean).map((name) => ({
    name,
    estimated_weight_grams: 150,
    calories_per_100g: 0,
    protein_per_100g: 0,
    carbs_per_100g: 0,
    fat_per_100g: 0
  }));
}, "parseFoodsFromPlainText");
var detectFoodsFallback = /* @__PURE__ */ __name(async (env, imageDataUrl) => {
  const result = await invokeGemini(env, {
    contents: [
      {
        parts: [
          {
            inline_data: dataUrlToInlineData(imageDataUrl)
          },
          {
            text: "Name the visible food items in this image. Return one short food name or a comma-separated list. If no food is visible, answer only with none."
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
}, "detectFoodsFallback");
var invokeVisionModel = /* @__PURE__ */ __name(async (env, payload) => {
  const firstFileUrl = payload?.file_urls?.find((value) => typeof value === "string" && value.startsWith("data:"));
  if (!firstFileUrl) {
    throw new Error("No image input provided");
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
      response_mime_type: "application/json",
      response_json_schema: payload?.response_json_schema
    }
  };
  let result;
  try {
    result = await invokeGemini(env, requestBody);
  } catch (error) {
    const message = error.message || "unknown error";
    if (!message.toLowerCase().includes("timeout")) {
      throw error;
    }
    result = await invokeGemini(env, {
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
    const fallback = await detectFoodsFallback(env, firstFileUrl);
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
}, "invokeVisionModel");
var searchOpenFoodFacts = /* @__PURE__ */ __name(async (query, limit = 8) => {
  const normalizedQuery = String(query || "").trim();
  if (!normalizedQuery) return [];
  const safeLimit = Math.max(1, Math.min(Number(limit) || 8, 20));
  const url = `https://world.openfoodfacts.org/api/v2/search?search_terms=${encodeURIComponent(normalizedQuery)}&countries_tags=de&page_size=${safeLimit}&fields=${encodeURIComponent(OPEN_FOOD_FACTS_FIELDS)}`;
  const data = await fetchJsonWithTimeout(url, OPEN_FOOD_FACTS_TIMEOUT_MS);
  return Array.isArray(data?.products) ? data.products : [];
}, "searchOpenFoodFacts");
var index_default = {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") {
      return json({ ok: true });
    }
    if (url.pathname === "/api/health") {
      return json({
        ok: true,
        provider: "gemini-api-via-cloudflare-worker",
        model: MODEL
      });
    }
    if (url.pathname === "/api/integrations/core/upload-file" && request.method === "POST") {
      try {
        const formData = await request.formData();
        const file = formData.get("file");
        if (!(file instanceof File)) {
          return json({ error: "file is required" }, { status: 400 });
        }
        const dataUrl = await readFileAsDataUrl(file);
        return json({ file_url: dataUrl });
      } catch (error) {
        return json({
          error: "Upload failed",
          message: error.message || "unknown error"
        }, { status: 400 });
      }
    }
    if (url.pathname === "/api/integrations/core/invoke-llm" && request.method === "POST") {
      const payload = await request.json().catch(() => ({}));
      try {
        const result = await invokeVisionModel(env, payload || {});
        return json({
          ...result.parsed,
          _debug: url.searchParams.get("debug") === "1" ? {
            raw_model_response: result.raw,
            fallback_model_response: result.fallbackRaw
          } : void 0
        });
      } catch (error) {
        return json({
          error: "LLM invocation failed",
          message: error.message || "unknown error",
          raw_model_response: url.searchParams.get("debug") === "1" ? sanitizeRawResult(error) : void 0,
          fallback: llmFallbackResponse(payload)
        }, { status: 502 });
      }
    }
    if (url.pathname === "/api/debug/vision-food" && request.method === "POST") {
      try {
        const payload = await request.json().catch(() => ({}));
        const result = await invokeVisionModel(env, payload || {});
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
          error: "Vision debug failed",
          message: error.message || "unknown error",
          raw_model_response: sanitizeRawResult(error)
        }, { status: 502 });
      }
    }
    if (url.pathname === "/api/search/open-food-facts" && request.method === "GET") {
      const q = String(url.searchParams.get("q") || "").trim();
      const limit = Number(url.searchParams.get("limit") || 8);
      const regionParam = String(url.searchParams.get("region") || "").trim().toUpperCase();
      const region = regionParam === "US" || regionParam === "DE" ? regionParam : String(env.SEARCH_DEFAULT_REGION || "DE").trim().toUpperCase();
      if (!q) {
        return json({ error: "q is required" }, { status: 400 });
      }
      try {
        const cache = caches.default;
        const cacheKey = new Request(url.toString(), { method: "GET" });
        const cached = await cache.match(cacheKey);
        if (cached) {
          return cached;
        }
        const configuredProvider = String(env.SEARCH_PROVIDER || "fatsecret").trim().toLowerCase();
        const shouldFallbackToOff = String(env.SEARCH_FALLBACK_TO_OFF || "true").trim().toLowerCase() !== "false";
        let source = "open-food-facts";
        let products = [];
        if (configuredProvider === "fatsecret") {
          try {
            products = await searchFatSecretFoods(env, q, limit, region === "US" ? "US" : "DE");
            source = "fatsecret";
          } catch (error) {
            if (!shouldFallbackToOff) {
              throw error;
            }
          }
        }
        if (!products.length) {
          products = await searchOpenFoodFacts(q, limit);
          source = configuredProvider === "fatsecret" ? "open-food-facts-fallback" : "open-food-facts";
        }
        const response = json({ products, source }, {
          headers: {
            "content-type": "application/json; charset=utf-8",
            "access-control-allow-origin": "*",
            "access-control-allow-methods": "GET,POST,OPTIONS",
            "access-control-allow-headers": "content-type",
            "cache-control": "public, max-age=1800"
          }
        });
        await cache.put(cacheKey, response.clone());
        return response;
      } catch (error) {
        return json({
          error: "Open Food Facts search failed",
          message: error.message || "unknown error",
          products: []
        }, { status: 502 });
      }
    }
    return json({ error: "Not found" }, { status: 404 });
  }
};
export {
  index_default as default
};
//# sourceMappingURL=index.js.map
