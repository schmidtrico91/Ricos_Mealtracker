import { Capacitor, CapacitorHttp } from '@capacitor/core';

const isNativePlatform = Capacitor.isNativePlatform();

const buildUrl = (url, params = {}) => {
  const targetUrl = new URL(url);

  Object.entries(params).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      value.forEach((entry) => targetUrl.searchParams.append(key, entry));
      return;
    }

    if (value !== undefined && value !== null) {
      targetUrl.searchParams.set(key, value);
    }
  });

  return targetUrl.toString();
};

const createRequestError = (message, status) => {
  const error = new Error(message);
  if (status) {
    error.status = status;
  }
  return error;
};

const withTimeout = async (promise, timeoutMs, label) => {
  if (!timeoutMs) {
    return promise;
  }

  let timeoutId;

  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timeoutId = window.setTimeout(() => {
          reject(createRequestError(`${label} timed out`));
        }, timeoutMs);
      })
    ]);
  } finally {
    if (timeoutId) {
      window.clearTimeout(timeoutId);
    }
  }
};

const parseJsonData = (data) => {
  if (typeof data === 'string') {
    return JSON.parse(data);
  }

  return data;
};

const fetchJson = async (url, { params, headers, timeoutMs }) => {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(buildUrl(url, params), {
      headers,
      signal: controller.signal
    });

    if (!response.ok) {
      throw createRequestError(`Request failed with status ${response.status}`, response.status);
    }

    return response.json();
  } finally {
    window.clearTimeout(timeoutId);
  }
};

const shouldPreferWebFetch = (url) => {
  try {
    const parsed = new URL(url);
    const isHttps = parsed.protocol === 'https:';
    const isLocalHost =
      parsed.hostname === 'localhost' ||
      parsed.hostname === '127.0.0.1' ||
      parsed.hostname === '10.0.2.2';

    return isHttps && !isLocalHost;
  } catch {
    return false;
  }
};

const isInsecureHttpUrl = (url) => {
  try {
    return new URL(url).protocol === 'http:';
  } catch {
    return false;
  }
};

export const getJson = async (
  url,
  { params, headers, timeoutMs = 10000, forceNative = false } = {}
) => {
  if (isNativePlatform) {
    if (!forceNative && shouldPreferWebFetch(url)) {
      try {
        return await fetchJson(url, { params, headers, timeoutMs });
      } catch {
        // Keep native fallback for environments where WebView fetch is blocked.
      }
    }

    try {
      const response = await withTimeout(
        CapacitorHttp.get({
          url,
          params,
          headers,
          responseType: 'json',
          connectTimeout: timeoutMs,
          readTimeout: timeoutMs
        }),
        timeoutMs,
        `GET ${url}`
      );

      if (response.status < 200 || response.status >= 300) {
        throw createRequestError(`Request failed with status ${response.status}`, response.status);
      }

      return parseJsonData(response.data);
    } catch {
      if (isInsecureHttpUrl(url)) {
        // Avoid mixed-content fallback for local http endpoints on https WebView origin.
        throw createRequestError(`Native request failed for ${url}`);
      }

      return fetchJson(url, { params, headers, timeoutMs });
    }
  }

  return fetchJson(url, { params, headers, timeoutMs });
};
