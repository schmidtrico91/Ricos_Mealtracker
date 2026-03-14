import { Capacitor } from '@capacitor/core';
import { createOnDeviceClient } from '@/lib/onDeviceClient';

const GEMINI_API_KEY_STORAGE_KEY = 'fittrack_gemini_api_key';
const nativeDataMode = import.meta.env.VITE_NATIVE_DATA_MODE || 'ondevice';
const isNativeAndroid = Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
const useOnDeviceData = isNativeAndroid && nativeDataMode !== 'host-backend';
const configuredNativeIntegrationsUrl = import.meta.env.VITE_NATIVE_INTEGRATIONS_API_URL;
const configuredSearchApiUrl = import.meta.env.VITE_SEARCH_API_URL;

const trimTrailingSlash = (value) => value.replace(/\/$/, '');

const resolveLocalApiUrl = () => {
  const configuredDefault = import.meta.env.VITE_LOCAL_API_URL || 'http://127.0.0.1:8787';
  const configuredAndroid = import.meta.env.VITE_LOCAL_API_URL_ANDROID;

  if (isNativeAndroid) {
    return trimTrailingSlash(configuredAndroid || 'http://10.0.2.2:8787');
  }

  return trimTrailingSlash(configuredDefault);
};

const resolveIntegrationApiUrl = () => {
  if (Capacitor.isNativePlatform() && configuredNativeIntegrationsUrl) {
    return trimTrailingSlash(configuredNativeIntegrationsUrl);
  }

  return resolveLocalApiUrl();
};

const localApiUrl = resolveLocalApiUrl();
const searchApiUrl = configuredSearchApiUrl
  ? trimTrailingSlash(configuredSearchApiUrl)
  : (configuredNativeIntegrationsUrl ? resolveIntegrationApiUrl() : localApiUrl);
const shouldUseIntegrationApi = !(useOnDeviceData && !configuredNativeIntegrationsUrl);
const integrationApiUrl = shouldUseIntegrationApi ? resolveIntegrationApiUrl() : null;

const parseJson = async (response) => {
  if (!response.ok) {
    const text = await response.text();
    let message = text || `Request failed with status ${response.status}`;

    if (text) {
      try {
        const parsed = JSON.parse(text);
        message = parsed?.message || parsed?.error || message;
      } catch {
        // Keep raw text when the response is not JSON.
      }
    }

    const error = new Error(message);
    error.status = response.status;
    throw error;
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
};

export const getStoredGeminiApiKey = () => {
  try {
    return window.localStorage.getItem(GEMINI_API_KEY_STORAGE_KEY) || '';
  } catch {
    return '';
  }
};

export const setStoredGeminiApiKey = (value) => {
  const normalized = String(value || '').trim();
  try {
    if (normalized) {
      window.localStorage.setItem(GEMINI_API_KEY_STORAGE_KEY, normalized);
    } else {
      window.localStorage.removeItem(GEMINI_API_KEY_STORAGE_KEY);
    }
  } catch {
    // Ignore storage errors (private mode / quota issues).
  }

  return normalized;
};

const requestJson = async (baseUrl, path, options = {}) => {
  const headers = {
    ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
    ...(options.headers || {})
  };

  const response = await fetch(`${baseUrl}/api${path}`, {
    ...options,
    headers
  });

  return parseJson(response);
};

const localRequest = (path, options = {}) => requestJson(localApiUrl, path, options);
const integrationRequest = (path, options = {}) => {
  if (!integrationApiUrl) {
    throw new Error('Native AI integration endpoint is not configured');
  }

  const apiKey = getStoredGeminiApiKey();
  return requestJson(integrationApiUrl, path, {
    ...options,
    headers: {
      ...(options.headers || {}),
      ...(apiKey ? { 'x-gemini-api-key': apiKey } : {})
    }
  });
};

const createEntityApi = (entityName) => ({
  list: (sort = '-created_date', limit) => {
    const params = new URLSearchParams();
    if (sort) params.set('sort', sort);
    if (typeof limit === 'number') params.set('limit', String(limit));
    const query = params.toString();
    return localRequest(`/entities/${entityName}${query ? `?${query}` : ''}`);
  },
  filter: (filter = {}, sort = '-created_date', limit) =>
    localRequest(`/entities/${entityName}/filter`, {
      method: 'POST',
      body: JSON.stringify({ filter, sort, limit })
    }),
  create: (data) =>
    localRequest(`/entities/${entityName}`, {
      method: 'POST',
      body: JSON.stringify(data || {})
    }),
  update: (id, data) =>
    localRequest(`/entities/${entityName}/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data || {})
    }),
  delete: (id) =>
    localRequest(`/entities/${entityName}/${id}`, {
      method: 'DELETE'
    })
});

const localClient = {
  auth: {
    me: () => localRequest('/auth/me'),
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
      localRequest('/app-logs', {
        method: 'POST',
        body: JSON.stringify({ pageName, timestamp: new Date().toISOString() })
      })
  },
  integrations: {
    Core: {
      UploadFile: async ({ file }) => {
        if (!file) {
          throw new Error('UploadFile requires a file');
        }

        const formData = new FormData();
        formData.append('file', file);
        return integrationRequest('/integrations/core/upload-file', {
          method: 'POST',
          body: formData
        });
      },
      InvokeLLM: (payload) =>
        integrationRequest('/integrations/core/invoke-llm', {
          method: 'POST',
          body: JSON.stringify(payload || {})
        })
    }
  },
  search: {
    openFoodFacts: (query, limit = 8, options = {}) => {
      const params = new URLSearchParams({
        q: String(query || ''),
        limit: String(limit)
      });
      if (options?.nocache) {
        params.set('nocache', '1');
      }

      return requestJson(searchApiUrl, `/search/open-food-facts?${params.toString()}`);
    },
    openFoodFactsProduct: (code) =>
      requestJson(
        searchApiUrl,
        `/search/open-food-facts/product?code=${encodeURIComponent(code)}`
      )
  },
  entities: new Proxy(
    {},
    {
      get: (_, entityName) => createEntityApi(String(entityName))
    }
  )
};

const onDeviceClient = createOnDeviceClient({
  integrationRequest: integrationApiUrl ? integrationRequest : null,
  searchRequest: (path, options = {}) => requestJson(searchApiUrl, path, options)
});

export const appClient = useOnDeviceData ? onDeviceClient : localClient;
