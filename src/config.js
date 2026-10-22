import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));

export function loadConfig(env = process.env) {
  const label = env.CLOAKING_LABEL?.trim();
  if (!label || label === 'replace-with-your-cloaking-house-label') {
    throw new Error('Set CLOAKING_LABEL to your Cloaking.House label.');
  }

  const port = Number(env.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error('PORT must be an integer between 0 and 65535.');
  }

  const isProduction = env.NODE_ENV === 'production';
  const ipSource = env.IP_SOURCE ?? 'socket';
  if (!['socket', 'x-real-ip'].includes(ipSource)) {
    throw new Error('IP_SOURCE must be socket or x-real-ip.');
  }

  const apiUrl = new URL(env.CLOAKING_API_URL ?? 'https://cloakit.house/api/v1/check');
  if (!['http:', 'https:'].includes(apiUrl.protocol) || apiUrl.username || apiUrl.password) {
    throw new Error('CLOAKING_API_URL must be an HTTP(S) URL without credentials.');
  }
  if (isProduction && apiUrl.protocol !== 'https:') {
    throw new Error('The production API endpoint must use HTTPS.');
  }

  const capiEnabled = parseBoolean(env.META_CAPI_ENABLED, false);
  const metaPixelId = env.META_PIXEL_ID?.trim() || '';
  const metaAccessToken = env.META_ACCESS_TOKEN?.trim() || '';
  const configuredMetaApiVersion = env.META_API_VERSION?.trim() || 'v24.0';
  const metaApiVersion = (/^v/iu.test(configuredMetaApiVersion) ? configuredMetaApiVersion : `v${configuredMetaApiVersion}`).toLowerCase();
  if (!/^v\d+\.\d+$/u.test(metaApiVersion)) {
    throw new Error('META_API_VERSION must look like v24.0.');
  }
  const metaApiBaseUrl = env.META_API_BASE_URL?.trim() || 'https://graph.facebook.com';
  let metaApiBase;
  try {
    metaApiBase = new URL(metaApiBaseUrl);
  } catch {
    throw new Error('META_API_BASE_URL must be an absolute HTTP(S) URL.');
  }
  if (!['http:', 'https:'].includes(metaApiBase.protocol) || metaApiBase.username || metaApiBase.password ||
      metaApiBase.pathname !== '/' || metaApiBase.search || metaApiBase.hash) {
    throw new Error('META_API_BASE_URL must be an HTTP(S) URL without credentials, query, or hash.');
  }
  const publicOriginInput = env.PUBLIC_ORIGIN?.trim() || '';
  let publicOrigin = '';
  if (publicOriginInput) {
    let origin;
    try {
      origin = new URL(publicOriginInput);
    } catch {
      throw new Error('PUBLIC_ORIGIN must be an absolute HTTP(S) URL.');
    }
    if (!['http:', 'https:'].includes(origin.protocol) || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash) {
      throw new Error('PUBLIC_ORIGIN must be an absolute HTTP(S) origin without credentials or a path.');
    }
    publicOrigin = origin.origin;
  }
  if (capiEnabled && (!metaPixelId || !metaAccessToken || !publicOrigin)) {
    throw new Error('META_PIXEL_ID, META_ACCESS_TOKEN, and PUBLIC_ORIGIN are required when META_CAPI_ENABLED=true.');
  }

  const defaultCurrency = (env.META_DEFAULT_CURRENCY?.trim() || '').toUpperCase();
  if (defaultCurrency && !/^[A-Z]{3}$/u.test(defaultCurrency)) {
    throw new Error('META_DEFAULT_CURRENCY must be a three-letter ISO 4217 code.');
  }
  const defaultPhoneRegion = (env.META_DEFAULT_PHONE_REGION?.trim() || '').toUpperCase();
  if (defaultPhoneRegion && !/^[A-Z]{2}$/u.test(defaultPhoneRegion)) {
    throw new Error('META_DEFAULT_PHONE_REGION must be a two-letter country code.');
  }
  const capiTimeoutMs = positiveInteger(env.META_CAPI_TIMEOUT_MS, 3_000, 'META_CAPI_TIMEOUT_MS');
  const capiRetries = integerInRange(env.META_CAPI_RETRIES, 1, 0, 2, 'META_CAPI_RETRIES');
  const capiRateLimit = integerInRange(env.META_CAPI_RATE_LIMIT, 60, 1, 10000, 'META_CAPI_RATE_LIMIT');

  return {
    rootDir: projectRoot,
    pagesDir: path.join(projectRoot, 'pages'),
    assetsDir: path.join(projectRoot, 'public/assets'),
    fallbackPage: 'pages/white.html',
    offerPage: 'pages/offer.html',
    label,
    apiUrl: apiUrl.href,
    apiTimeoutMs: 15_000,
    pageTimeoutMs: 15_000,
    ipSource,
    port,
    capiEnabled,
    metaPixelId,
    metaAccessToken,
    metaApiVersion,
    metaApiBaseUrl: metaApiBase.origin,
    publicOrigin: publicOrigin || null,
    metaDefaultCurrency: defaultCurrency || null,
    metaDefaultPhoneRegion: defaultPhoneRegion || null,
    metaTestEventCode: env.META_TEST_EVENT_CODE?.trim() || null,
    capiTimeoutMs,
    capiRetries,
    capiRateLimit,
  };
}

function parseBoolean(value, fallback) {
  if (value === undefined || value === '') return fallback;
  if (['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase())) return true;
  if (['0', 'false', 'no', 'off'].includes(String(value).toLowerCase())) return false;
  throw new Error('META_CAPI_ENABLED must be a boolean.');
}

function positiveInteger(value, fallback, name) {
  const parsed = value === undefined || value === '' ? fallback : Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) throw new Error(`${name} must be a positive integer.`);
  return parsed;
}

function integerInRange(value, fallback, minimum, maximum, name) {
  const parsed = value === undefined || value === '' ? fallback : Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum}.`);
  }
  return parsed;
}
