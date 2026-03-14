import { onDeviceAppLogStore, onDeviceEntityStore, onDeviceOffNameCacheStore } from '@/lib/onDeviceStore';
import { PRESET_FOODS } from '@/lib/presetFoods';
import { getJson } from '@/lib/nativeHttp';
import { getOpenFoodFactsHeaders } from '@/lib/openFoodFactsHeaders';

const readFileAsDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });

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

const normalizeBarcodeValue = (raw) => {
  const text = String(raw || '').trim();
  if (!text) return '';

  const digits = text.replace(/\D/g, '');
  if (digits.length >= 8) {
    return digits;
  }

  return text;
};

const buildBarcodeCandidates = (barcode) => {
  const normalized = normalizeBarcodeValue(barcode);
  if (!normalized) return [];

  const candidates = [normalized];
  const digitsOnly = normalized.replace(/\D/g, '');
  if (digitsOnly.length === 12) {
    candidates.push(`0${digitsOnly}`);
  } else if (digitsOnly.length === 13 && digitsOnly.startsWith('0')) {
    candidates.push(digitsOnly.slice(1));
  }

  return [...new Set(candidates)];
};


let presetFoodsReadyPromise = null;
const FAST_FOOD_PRESET_PREFIXES = ['preset-mcd-', 'preset-bk-', 'preset-kfc-', 'preset-subway-'];

const isFastFoodPresetId = (presetId) =>
  FAST_FOOD_PRESET_PREFIXES.some((prefix) => String(presetId || '').startsWith(prefix));

const resolveFastFoodTag = (presetId) => {
  if (presetId.startsWith('preset-mcd-')) return 'MCD';
  if (presetId.startsWith('preset-bk-')) return 'BK';
  if (presetId.startsWith('preset-kfc-')) return 'KFC';
  if (presetId.startsWith('preset-subway-')) return 'SUB';
  return null;
};

const withFastFoodTag = (preset) => {
  const tag = resolveFastFoodTag(String(preset?.id || ''));
  if (!tag) return preset;
  if (String(preset.name || '').startsWith(`[${tag}] `)) {
    return preset;
  }

  return {
    ...preset,
    name: `[${tag}] ${preset.name}`
  };
};

const ensurePresetFoods = async () => {
  if (!presetFoodsReadyPromise) {
    presetFoodsReadyPromise = (async () => {
      const existingFoods = await onDeviceEntityStore.list('Food', '-created_date');
      const existingById = new Map(existingFoods.map((food) => [food.id, food]));
      const managedPresets = PRESET_FOODS.filter((preset) => !isFastFoodPresetId(preset.id));

      for (const food of existingFoods) {
        const isLocalPreset = food?.source === 'Preset Lokal' && String(food?.id || '').startsWith('preset-');
        if (!isLocalPreset) {
          continue;
        }

        if (isFastFoodPresetId(food.id)) {
          await onDeviceEntityStore.remove('Food', food.id);
          existingById.delete(food.id);
        }
      }

      for (const rawPreset of managedPresets) {
        const preset = withFastFoodTag(rawPreset);
        const existing = existingById.get(preset.id);

        if (existing) {
          const needsUpdate =
            existing.name !== preset.name ||
            Number(existing.calories_per_100g || 0) !== Number(preset.calories_per_100g || 0) ||
            Number(existing.protein_per_100g || 0) !== Number(preset.protein_per_100g || 0) ||
            Number(existing.carbs_per_100g || 0) !== Number(preset.carbs_per_100g || 0) ||
            Number(existing.fat_per_100g || 0) !== Number(preset.fat_per_100g || 0) ||
            existing.source !== 'Preset Lokal' ||
            existing.is_custom !== false;

          if (needsUpdate) {
            await onDeviceEntityStore.update('Food', preset.id, {
              name: preset.name,
              calories_per_100g: preset.calories_per_100g,
              protein_per_100g: preset.protein_per_100g,
              carbs_per_100g: preset.carbs_per_100g,
              fat_per_100g: preset.fat_per_100g,
              source: 'Preset Lokal',
              is_custom: false
            });
          }
          continue;
        }

        await onDeviceEntityStore.create('Food', {
          ...preset,
          source: 'Preset Lokal',
          is_custom: false
        });
      }
    })();
  }

  return presetFoodsReadyPromise;
};

export const createOnDeviceClient = ({ integrationRequest, searchRequest }) => ({
  auth: {
    me: async () => ({
      id: 'device-user',
      email: 'device@fittrack.app',
      role: 'owner',
      storage: 'on-device'
    }),
    logout: (redirectTo) => {
      window.localStorage.removeItem('fittrack_access_token');
      window.localStorage.removeItem('token');
      if (redirectTo) {
        window.location.assign(redirectTo);
      }
    },
    redirectToLogin: () => {
      window.location.assign('/');
    }
  },

  appLogs: {
    logUserInApp: (pageName) =>
      onDeviceAppLogStore.create({
        pageName,
        timestamp: new Date().toISOString()
      })
  },

  integrations: {
    Core: {
      UploadFile: async ({ file }) => {
        if (!file) {
          throw new Error('UploadFile requires a file');
        }

        if (!integrationRequest) {
          return { file_url: await readFileAsDataUrl(file) };
        }

        const formData = new FormData();
        formData.append('file', file);
        return integrationRequest('/integrations/core/upload-file', {
          method: 'POST',
          body: formData
        });
      },

      InvokeLLM: async (payload) => {
        if (!integrationRequest) {
          throw new Error('Native AI integration is not configured');
        }

        return integrationRequest('/integrations/core/invoke-llm', {
          method: 'POST',
          body: JSON.stringify(payload || {})
        });
      }
    }
  },
  search: {
    openFoodFacts: async (query, limit = 8, options = {}) => {
      const localProducts = await onDeviceOffNameCacheStore.search(query, limit, {
        locale: options?.locale
      });
      return {
        products: localProducts,
        source: 'off-local-cache'
      };
    },
    openFoodFactsProduct: async (code) => {
      const fetchDirectProduct = async (rawCode) => {
        const codeCandidates = buildBarcodeCandidates(rawCode);
        if (codeCandidates.length === 0) {
          throw new Error('code is required');
        }

        const fields = 'code,product_name,product_name_de,product_name_en,generic_name,brands,nutriments,image_url,image_front_url';
        const endpoints = [
          {
            baseUrl: 'https://world.openfoodfacts.org/api/v2/product',
            params: { fields },
            suffix: '',
            parse: (data) => data?.product || null
          },
          {
            baseUrl: 'https://de.openfoodfacts.org/api/v2/product',
            params: { fields },
            suffix: '',
            parse: (data) => data?.product || null
          },
          {
            baseUrl: 'https://world.openfoodfacts.org/api/v0/product',
            params: undefined,
            suffix: '.json',
            parse: (data) => (data?.status === 1 ? data.product : null)
          },
          {
            baseUrl: 'https://de.openfoodfacts.org/api/v0/product',
            params: undefined,
            suffix: '.json',
            parse: (data) => (data?.status === 1 ? data.product : null)
          }
        ];

        let bestProduct = null;
        let bestScore = -1;

        const scoreProduct = (product) => {
          if (!product) return -1;
          const hasName = Boolean(
            product.product_name ||
            product.product_name_de ||
            product.product_name_en ||
            product.generic_name
          );
          const hasBrand = Boolean(product.brands);
          return (hasMeaningfulNutrition({ product }) ? 100 : 0) + (hasName ? 10 : 0) + (hasBrand ? 3 : 0);
        };

        const runRound = async (timeoutMs) => {
          for (const candidate of codeCandidates) {
            const calls = endpoints.map(async (endpoint) => {
              const url = `${endpoint.baseUrl}/${encodeURIComponent(candidate)}${endpoint.suffix || ''}`;
              const data = await getJson(url, {
                params: endpoint.params,
                headers: getOpenFoodFactsHeaders(),
                timeoutMs,
                forceNative: true
              });
              const parsed = endpoint.parse(data);
              if (!parsed) {
                throw new Error('Product not found');
              }
              return parsed;
            });

            const settled = await Promise.allSettled(calls);
            for (const entry of settled) {
              if (entry.status !== 'fulfilled') continue;
              const product = entry.value;
              const score = scoreProduct(product);
              if (score > bestScore) {
                bestScore = score;
                bestProduct = product;
              }
            }

            if (bestProduct && scoreProduct(bestProduct) >= 100) {
              return bestProduct;
            }
          }

          return null;
        };

        const fast = await runRound(5000);
        if (fast) {
          return {
            product: fast,
            source: 'open-food-facts'
          };
        }

        const full = await runRound(14000);
        if (full) {
          return {
            product: full,
            source: 'open-food-facts'
          };
        }

        if (bestProduct) {
          return {
            product: bestProduct,
            source: 'open-food-facts'
          };
        }

        throw new Error('Product not found');
      };

      const hasMeaningfulNutrition = (payload) => {
        const nutriments = payload?.product?.nutriments;
        if (!nutriments || typeof nutriments !== 'object') {
          return false;
        }

        const energy = readEnergyKcal(nutriments);
        const protein = parseNutritionNumber(nutriments.proteins_100g ?? nutriments.proteins);
        const carbs = parseNutritionNumber(nutriments.carbohydrates_100g ?? nutriments.carbohydrates);
        const fat = parseNutritionNumber(nutriments.fat_100g ?? nutriments.fat);
        return energy > 0 || protein > 0 || carbs > 0 || fat > 0;
      };

      if (searchRequest) {
        try {
          const result = await searchRequest(`/search/open-food-facts/product?code=${encodeURIComponent(code)}`);
          if (hasMeaningfulNutrition(result)) {
            return result;
          }
        } catch {
          // Fall back to direct OFF lookup below.
        }
      }
      return fetchDirectProduct(code);
    }
  },

  entities: new Proxy(
    {},
    {
      get: (_, entityName) => ({
        list: async (sort = '-created_date', limit) => {
          const type = String(entityName);
          if (type === 'Food') {
            await ensurePresetFoods();
          }
          return onDeviceEntityStore.list(type, sort, limit);
        },
        filter: async (filter = {}, sort = '-created_date', limit) => {
          const type = String(entityName);
          if (type === 'Food') {
            await ensurePresetFoods();
          }
          return onDeviceEntityStore.filter(type, filter, sort, limit);
        },
        create: (data) => onDeviceEntityStore.create(String(entityName), data || {}),
        update: (id, data) => onDeviceEntityStore.update(String(entityName), id, data || {}),
        delete: (id) => onDeviceEntityStore.remove(String(entityName), id)
      })
    }
  )
});
