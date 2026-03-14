const OPEN_FOOD_FACTS_URL = 'https://world.openfoodfacts.org/api/v2/search';
const OPEN_FOOD_FACTS_FIELDS = 'product_name,product_name_de,product_name_en,brands,code,nutriments,image_url,image_front_url';
const OFF_APP_IDENTITY = 'RicosMealtracker/1.0 (support@ricos-mealtracker.app)';

const fetchJson = async (url, timeoutMs = 12000) => {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'X-User-Agent': OFF_APP_IDENTITY
      },
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}`);
    }

    return response.json();
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error('Open Food Facts request timed out');
    }

    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
};

export const searchOpenFoodFactsDirect = async (query, limit = 10) => {
  const normalizedQuery = String(query || '').trim();
  if (!normalizedQuery) {
    return { products: [], source: 'open-food-facts-direct' };
  }

  const safeLimit = Math.max(1, Math.min(Number(limit) || 10, 20));
  const url =
    `${OPEN_FOOD_FACTS_URL}?search_terms=${encodeURIComponent(normalizedQuery)}` +
    `&countries_tags=de` +
    `&page_size=${safeLimit}` +
    `&fields=${encodeURIComponent(OPEN_FOOD_FACTS_FIELDS)}`;

  try {
    const data = await fetchJson(url);
    return {
      products: Array.isArray(data?.products) ? data.products : [],
      source: 'open-food-facts-direct'
    };
  } catch (error) {
    throw new Error(error?.message || 'Open Food Facts not reachable');
  }
};
