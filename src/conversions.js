import { createHash, randomUUID } from 'node:crypto';
import { isIP } from 'node:net';
import { getClientIp } from './client-ip.js';

export const STANDARD_EVENTS = Object.freeze([
  'PageView', 'ViewContent', 'Search', 'AddToCart', 'AddToWishlist',
  'InitiateCheckout', 'AddPaymentInfo', 'Purchase', 'Lead',
  'CompleteRegistration', 'SubmitApplication', 'Contact', 'FindLocation',
  'Schedule', 'StartTrial', 'Subscribe', 'CustomizeProduct', 'Donate',
]);

const ACTION_SOURCES = new Set([
  'email', 'website', 'app', 'phone_call', 'chat', 'physical_store',
  'system_generated', 'business_messaging', 'other',
]);
const HASHED_FIELDS = new Set(['em', 'ph', 'fn', 'ln', 'db', 'ge', 'ct', 'st', 'zp', 'country', 'external_id']);
const RAW_FIELDS = new Set([
  'client_ip_address', 'client_user_agent', 'fbc', 'fbp', 'subscription_id',
  'fb_login_id', 'lead_id', 'anon_id', 'madid', 'page_id', 'page_scoped_user_id',
  'ctwa_clid', 'ig_account_id', 'ig_sid',
]);
const COUNTRY_CALLING_CODES = Object.freeze({
  TW: '886', US: '1', CA: '1', GB: '44', JP: '81', AU: '61', SG: '65', HK: '852', KR: '82', MY: '60',
  DE: '49', FR: '33', IT: '39', ES: '34', NL: '31', IN: '91', BR: '55', MX: '52', NZ: '64',
  PH: '63', TH: '66', VN: '84', ID: '62', AE: '971', SA: '966', IL: '972', TR: '90', ZA: '27',
});
const COUNTRY_ALIASES = Object.freeze({ taiwan: 'tw', 'united states': 'us', usa: 'us', canada: 'ca', 'united kingdom': 'gb', uk: 'gb', japan: 'jp', australia: 'au', singapore: 'sg', 'hong kong': 'hk', korea: 'kr', malaysia: 'my' });
export const USER_DATA_ALIASES = Object.freeze({
  email: 'em', emailAddress: 'em', email_address: 'em',
  phone: 'ph', phoneNumber: 'ph', phone_number: 'ph',
  firstName: 'fn', first_name: 'fn',
  lastName: 'ln', last_name: 'ln',
  dateOfBirth: 'db', date_of_birth: 'db', birthday: 'db',
  gender: 'ge', city: 'ct', state: 'st',
  zip: 'zp', postalCode: 'zp', postal_code: 'zp',
  countryCode: 'country', country_code: 'country', externalId: 'external_id',
  clientIpAddress: 'client_ip_address', clientUserAgent: 'client_user_agent',
  ipAddress: 'client_ip_address', ip_address: 'client_ip_address',
  userAgent: 'client_user_agent', user_agent: 'client_user_agent',
  browserId: 'fbp', clickId: 'fbc',
  subscriptionId: 'subscription_id', leadId: 'lead_id', fbLoginId: 'fb_login_id',
  anonId: 'anon_id', ctwaClid: 'ctwa_clid',
  pageId: 'page_id', pageScopedUserId: 'page_scoped_user_id',
  igAccountId: 'ig_account_id', igScopedId: 'ig_sid', externalID: 'external_id',
});
export const CUSTOM_DATA_ALIASES = Object.freeze({
  contentCategory: 'content_category', contentIds: 'content_ids', contentName: 'content_name',
  contentType: 'content_type', contentUrl: 'content_url',
  currencyCode: 'currency', currency_code: 'currency', numItems: 'num_items', predictedLtv: 'predicted_ltv',
  searchString: 'search_string', orderId: 'order_id', orderName: 'order_name',
  productId: 'product_id', productName: 'product_name', productBrand: 'product_brand',
  productCategory: 'product_category', deliveryCategory: 'delivery_category',
  leadEventSource: 'lead_event_source', customerSegmentation: 'customer_segmentation',
  netRevenue: 'net_revenue', tax: 'tax', shipping: 'shipping',
  itemPrice: 'item_price', itemCategory: 'item_category',
});

export const EVENT_PARAMETER_ALIASES = Object.freeze({
  event_id: 'eventId', event_time: 'eventTime', action_source: 'actionSource',
  source_url: 'sourceUrl', event_source_url: 'sourceUrl', eventSourceUrl: 'sourceUrl',
  referrer_url: 'referrerUrl',
  user_data: 'userData', hashed_user_data: 'hashedUserData', custom_data: 'customData',
  data_processing_options: 'dataProcessingOptions',
  data_processing_options_country: 'dataProcessingOptionsCountry',
  data_processing_options_state: 'dataProcessingOptionsState',
  opt_out: 'optOut', restricted_data_processing: 'restrictedDataProcessing',
  original_event_data: 'originalEventData', app_data: 'appData',
  customer_segmentation: 'customerSegmentation',
});

const CONTENT_ITEM_ALIASES = Object.freeze({
  contentId: 'id', content_id: 'id', productId: 'id', product_id: 'id',
  itemQuantity: 'quantity', item_quantity: 'quantity',
  itemPrice: 'item_price', price: 'item_price',
  contentName: 'title', content_name: 'title', name: 'title',
  contentCategory: 'category', content_category: 'category',
  deliveryCategory: 'delivery_category', delivery_category: 'delivery_category',
});

const MONETARY_EVENTS = new Set([
  'AddToCart', 'AddToWishlist', 'InitiateCheckout', 'AddPaymentInfo',
  'Purchase', 'Lead', 'StartTrial', 'Subscribe', 'Donate',
]);
const RESERVED_OBJECT_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

export class ConversionError extends Error {
  constructor(code, message, { status = 400, retryable = false, cause } = {}) {
    super(message, { cause });
    this.name = 'ConversionError';
    this.code = code;
    this.status = status;
    this.retryable = retryable;
  }
}

export function normalizeEventName(eventName) {
  if (typeof eventName !== 'string' || !/^[\p{L}\p{N}_-]{1,100}$/u.test(eventName.trim())) {
    throw new ConversionError('invalid_event_name', 'eventName must be 1-100 letters, numbers, underscores, or hyphens.');
  }
  return eventName.trim();
}

export function sha256(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function values(value) {
  return Array.isArray(value) ? value : [value];
}

function normalizeText(value, { compact = false } = {}) {
  if ((typeof value !== 'string' && typeof value !== 'number') || (typeof value === 'number' && !Number.isFinite(value))) return null;
  const text = String(value).normalize('NFKC').trim().toLowerCase();
  if (!text) return null;
  return compact ? text.replace(/[^\p{L}\p{N}]/gu, '') : text.replace(/\s+/gu, ' ');
}

function normalizePhone(value, region) {
  const text = String(value ?? '').trim();
  if (!text) return null;
  let digits = text.replace(/[^\d]/gu, '');
  if (!digits) return null;
  if (text.startsWith('00')) digits = digits.slice(2);
  if (text.startsWith('+')) return digits;
  if (digits.startsWith('0')) {
    if (!region) throw new ConversionError('phone_region_required', 'A phone region is required for local phone numbers.');
    if (!COUNTRY_CALLING_CODES[region]) throw new ConversionError('unsupported_phone_region', `No phone calling code is configured for ${region}. Use an international number or add its region code.`);
    digits = `${COUNTRY_CALLING_CODES[region]}${digits.slice(1)}`;
  }
  return digits;
}

function normalizeIdentifier(field, value, config) {
  if (field === 'ph') return normalizePhone(value, config.metaDefaultPhoneRegion);
  if (field === 'db') return normalizeDate(value);
  if (field === 'ge') return normalizeText(value, { compact: true })?.slice(0, 1) || null;
  if (field === 'country') {
    const text = normalizeText(value);
    return COUNTRY_ALIASES[text] || (text?.length === 2 ? text : null);
  }
  if (field === 'em') return normalizeText(value)?.replace(/\s+/gu, '') || null;
  return normalizeText(value, { compact: ['fn', 'ln', 'ct', 'st', 'zp'].includes(field) });
}

function normalizeDate(value) {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    const year = value.getUTCFullYear();
    const month = value.getUTCMonth() + 1;
    const day = value.getUTCDate();
    return `${year.toString().padStart(4, '0')}${month.toString().padStart(2, '0')}${day.toString().padStart(2, '0')}`;
  }
  const text = String(value ?? '').trim();
  if (!text) return null;
  const parts = text.split(/[./-]/u).map((part) => part.trim());
  let date;
  if (parts.length === 1 && /^\d{8}$/u.test(parts[0])) {
    date = parts[0];
  } else if (parts.length === 3 && parts[0].length === 4) {
    date = `${parts[0]}${parts[1].padStart(2, '0')}${parts[2].padStart(2, '0')}`;
  } else if (parts.length === 3 && parts[2].length === 4) {
    date = `${parts[2]}${parts[0].padStart(2, '0')}${parts[1].padStart(2, '0')}`;
  } else {
    return null;
  }
  if (!/^\d{8}$/u.test(date)) return null;
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(4, 6));
  const day = Number(date.slice(6, 8));
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day ? date : null;
}

function normalizeHashedValue(field, value, config) {
  const normalized = values(value).map((item) => {
    const normalized = normalizeIdentifier(field, item, config);
    if (!normalized) return null;
    return sha256(normalized);
  }).filter(Boolean);
  return Array.isArray(value) ? normalized : normalized[0];
}

function normalizeRawUserData(userData, hashedUserData, config, requestContext) {
  if ((userData !== undefined && (userData === null || typeof userData !== 'object' || Array.isArray(userData))) ||
      (hashedUserData !== undefined && (hashedUserData === null || typeof hashedUserData !== 'object' || Array.isArray(hashedUserData)))) {
    throw new ConversionError('invalid_user_data', 'userData and hashedUserData must be objects.');
  }
  const raw = canonicalizeUserData(userData || {});
  const hashed = canonicalizeUserData(hashedUserData || {});
  const output = {};
  for (const [field, value] of Object.entries(raw)) {
    if (HASHED_FIELDS.has(field)) {
      if (field in hashed) throw new ConversionError('duplicate_user_data', `${field} cannot be supplied in both userData and hashedUserData.`);
      const normalized = normalizeHashedValue(field, value, config);
      if (normalized !== undefined && (!Array.isArray(normalized) || normalized.length)) output[field] = normalized;
    } else if (RAW_FIELDS.has(field)) {
      const rawValues = values(value);
      if (rawValues.some((item) => !['string', 'number'].includes(typeof item) || (typeof item === 'number' && !Number.isFinite(item)))) {
        throw new ConversionError('invalid_user_data', `${field} must contain string or number values.`);
      }
      const normalized = rawValues.map((item) => String(item).trim()).filter(Boolean);
      if (normalized.length) output[field] = normalized.length === 1 ? normalized[0] : normalized;
    }
  }
  for (const field of HASHED_FIELDS) {
    if (!(field in hashed)) continue;
    const normalized = values(hashed[field]).filter((item) => typeof item === 'string' && /^[a-f\d]{64}$/iu.test(item.trim())).map((item) => item.trim().toLowerCase());
    if (!normalized.length || normalized.length !== values(hashed[field]).length) {
      throw new ConversionError('invalid_hashed_user_data', `${field} must contain SHA-256 hexadecimal values.`);
    }
    output[field] = normalized.length === 1 ? normalized[0] : normalized;
  }
  const context = requestContext || {};
  if (context.ip) output.client_ip_address = context.ip;
  if (context.userAgent) output.client_user_agent = context.userAgent;
  if (!output.fbp && context.fbp) output.fbp = context.fbp;
  if (!output.fbc && context.fbc) output.fbc = context.fbc;
  if (output.client_ip_address && !isIP(output.client_ip_address)) {
    throw new ConversionError('invalid_client_ip', 'client_ip_address must be a valid IPv4 or IPv6 address.');
  }
  if (!Object.keys(output).length) throw new ConversionError('missing_user_data', 'At least one user_data value is required.');
  return output;
}

function canonicalizeUserData(input) {
  const result = {};
  for (const [key, value] of Object.entries(input)) {
    if (RESERVED_OBJECT_KEYS.has(key)) continue;
    const canonical = USER_DATA_ALIASES[key] || key;
    if (RESERVED_OBJECT_KEYS.has(canonical)) continue;
    if (key !== canonical && Object.prototype.hasOwnProperty.call(input, canonical)) continue;
    result[canonical] = value;
  }
  return result;
}

function canonicalizeEventParams(input) {
  const result = {};
  for (const [key, value] of Object.entries(input || {})) {
    if (RESERVED_OBJECT_KEYS.has(key)) continue;
    const canonical = EVENT_PARAMETER_ALIASES[key] || key;
    if (RESERVED_OBJECT_KEYS.has(canonical)) continue;
    if (key !== canonical && Object.prototype.hasOwnProperty.call(input, canonical)) continue;
    if (result[canonical] === undefined || key === canonical) result[canonical] = value;
  }
  return result;
}

function requireObject(value, name, code) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ConversionError(code, `${name} must be an object.`);
  }
  return value;
}

function mergeAliasedData(defaults, input, aliases) {
  return {
    ...canonicalizeAliasedObject(defaults, aliases),
    ...canonicalizeAliasedObject(input, aliases),
  };
}

function canonicalizeAliasedObject(input, aliases) {
  const result = {};
  for (const [key, value] of Object.entries(input || {})) {
    const canonical = aliases[key] || key;
    if (key !== canonical && Object.prototype.hasOwnProperty.call(input, canonical)) continue;
    if (result[canonical] === undefined || key === canonical) result[canonical] = value;
  }
  return result;
}

function mergeEventParams(defaults, input) {
  const base = canonicalizeEventParams(defaults);
  const override = canonicalizeEventParams(input);
  const result = { ...base, ...override };
  for (const key of ['userData', 'hashedUserData', 'customData']) {
    if (base[key] !== undefined || override[key] !== undefined) {
      const baseValue = nestedEventData(base[key], key);
      const overrideValue = nestedEventData(override[key], key);
      const aliases = key === 'customData' ? CUSTOM_DATA_ALIASES : USER_DATA_ALIASES;
      result[key] = mergeAliasedData(baseValue, overrideValue, aliases);
    }
  }
  return result;
}

function nestedEventData(value, key) {
  if (value === undefined || (key === 'customData' && value === null)) return {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    const code = key === 'customData' ? 'invalid_custom_data' : 'invalid_user_data';
    throw new ConversionError(code, `${key} must be an object.`);
  }
  return value;
}

function cleanObject(input, depth = 0) {
  if (depth > 5) throw new ConversionError('invalid_custom_data', 'Event data is nested too deeply.');
  if (Array.isArray(input)) return input.map((item) => cleanObject(item, depth + 1)).filter((item) => item !== undefined);
  if (input === undefined || input === null) return undefined;
  if (typeof input !== 'object') {
    if (['bigint', 'function', 'symbol'].includes(typeof input)) throw new ConversionError('invalid_custom_data', 'Event data contains an unsupported value.');
    if (typeof input === 'number' && !Number.isFinite(input)) throw new ConversionError('invalid_custom_data', 'Event data contains a non-finite number.');
    return input;
  }
  if (input instanceof Date) {
    if (Number.isNaN(input.getTime())) throw new ConversionError('invalid_custom_data', 'Event data contains an invalid date.');
    return input.toISOString();
  }
  const result = {};
  for (const [key, value] of Object.entries(input)) {
    if (!key || key.length > 100 || RESERVED_OBJECT_KEYS.has(key) || value === undefined || value === null) continue;
    const cleaned = cleanObject(value, depth + 1);
    if (cleaned !== undefined) result[key] = cleaned;
  }
  return result;
}

function requestContext(req, config) {
  if (!req) return {};
  const cookies = parseCookies(req.headers?.cookie);
  const query = new URL(req.originalUrl || req.url || '/', 'http://request.invalid').searchParams;
  const fbclid = query.get('fbclid');
  const fbc = cookies._fbc || (fbclid ? `fb.1.${Date.now()}.${fbclid}` : undefined);
  const sourceUrl = config.publicOrigin ? new URL(req.originalUrl || req.url || '/', config.publicOrigin).href : undefined;
  return {
    ip: getClientIp(req, config.ipSource),
    userAgent: req.get?.('user-agent') || req.headers?.['user-agent'],
    referrer: req.get?.('referer') || req.headers?.referer,
    sourceUrl,
    fbp: cookies._fbp,
    fbc,
  };
}

function parseCookies(header) {
  const result = {};
  if (typeof header !== 'string') return result;
  for (const pair of header.split(';')) {
    const index = pair.indexOf('=');
    if (index < 1) continue;
    try {
      result[pair.slice(0, index).trim()] = decodeURIComponent(pair.slice(index + 1).trim());
    } catch {
      // Ignore malformed cookies; they must never prevent a page or event from working.
    }
  }
  return result;
}

export function captureAttribution(req, res) {
  if (!req || typeof req !== 'object') return;
  let query;
  try { query = new URL(req.originalUrl || req.url || '/', 'http://request.invalid').searchParams; } catch { return; }
  const fbclid = query.get('fbclid');
  if (!fbclid || !res || typeof res.append !== 'function') return;
  const cookies = parseCookies(req.headers?.cookie);
  if (!cookies._fbc) res.append('Set-Cookie', `_fbc=${encodeURIComponent(`fb.1.${Date.now()}.${fbclid}`)}; Max-Age=7776000; Path=/; SameSite=Lax${req.secure ? '; Secure' : ''}`);
}

function eventTime(value) {
  if (value === undefined || value === null) return Math.floor(Date.now() / 1000);
  let parsed;
  if (value instanceof Date) {
    parsed = Math.floor(value.getTime() / 1000);
  } else if (typeof value === 'number') {
    parsed = value;
  } else if (typeof value === 'string') {
    const text = value.trim();
    parsed = /^\d+$/u.test(text) ? Number(text) : Math.floor(new Date(text).getTime() / 1000);
  } else {
    parsed = NaN;
  }
  const now = Math.floor(Date.now() / 1000);
  if (!Number.isInteger(parsed) || parsed > now + 60 || parsed < now - 7 * 86400) {
    throw new ConversionError('invalid_event_time', 'eventTime must be within the last seven days and not in the future.');
  }
  return parsed;
}

function sourceUrl(value, context, config) {
  const candidate = value ?? context.sourceUrl ?? config.publicOrigin;
  if (!candidate) throw new ConversionError('missing_event_source_url', 'sourceUrl or PUBLIC_ORIGIN is required for website events.');
  let parsed;
  try { parsed = new URL(candidate); } catch { throw new ConversionError('invalid_event_source_url', 'sourceUrl must be an absolute HTTP(S) URL.'); }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) {
    throw new ConversionError('invalid_event_source_url', 'sourceUrl must be an absolute HTTP(S) URL without credentials.');
  }
  return parsed.href;
}

function validateCustomData(customData, config, eventName) {
  if (customData !== undefined && customData !== null && (typeof customData !== 'object' || Array.isArray(customData))) {
    throw new ConversionError('invalid_custom_data', 'customData must be an object.');
  }
  if (customData && customData.contents !== undefined) {
    if (!Array.isArray(customData.contents) || customData.contents.some((item) => !item || typeof item !== 'object' || Array.isArray(item))) {
      throw new ConversionError('invalid_contents', 'customData.contents must contain objects.');
    }
  }
  const cleaned = cleanObject(customData || {});
  if (!cleaned || typeof cleaned !== 'object' || Array.isArray(cleaned)) {
    throw new ConversionError('invalid_custom_data', 'customData must be an object.');
  }
  const result = canonicalizeCustomData(cleaned);
  if (result.currency !== undefined) {
    result.currency = String(result.currency).toUpperCase();
    if (!/^[A-Z]{3}$/u.test(result.currency)) throw new ConversionError('invalid_currency', 'currency must be a three-letter ISO 4217 code.');
  } else if (config.metaDefaultCurrency && (result.value !== undefined || MONETARY_EVENTS.has(eventName))) {
    result.currency = config.metaDefaultCurrency;
  }
  if (result.value !== undefined && !isNonNegativeNumber(result.value)) {
    throw new ConversionError('invalid_value', 'customData.value must be a non-negative number.');
  }
  if (result.value !== undefined) result.value = Number(result.value);
  if (result.num_items !== undefined && !isNonNegativeInteger(result.num_items)) {
    throw new ConversionError('invalid_num_items', 'customData.num_items must be a non-negative integer.');
  }
  if (result.num_items !== undefined) result.num_items = Number(result.num_items);
  if (eventName === 'Purchase' && (result.currency === undefined || result.value === undefined)) {
    throw new ConversionError('purchase_value_required', 'Purchase requires customData.value and customData.currency.');
  }
  if (result.contents !== undefined && !Array.isArray(result.contents)) {
    throw new ConversionError('invalid_contents', 'customData.contents must be an array.');
  }
  if (Array.isArray(result.contents)) {
    result.contents = result.contents.map((item) => canonicalizeContentItem(item));
  }
  if (result.contents !== undefined && result.contents.some((item) => !item || typeof item !== 'object' || Array.isArray(item) || item.id === undefined || item.quantity === undefined || !isPositiveNumber(item.quantity))) {
    throw new ConversionError('invalid_contents', 'customData.contents items require id and quantity.');
  }
  if (Array.isArray(result.contents)) {
    result.contents = result.contents.map((item) => {
      const normalized = { ...item, quantity: Number(item.quantity) };
      if (normalized.item_price !== undefined) {
        if (!isNonNegativeNumber(normalized.item_price)) {
          throw new ConversionError('invalid_contents', 'customData.contents item_price must be a non-negative number.');
        }
        normalized.item_price = Number(normalized.item_price);
      }
      return normalized;
    });
    if (result.num_items === undefined) result.num_items = result.contents.reduce((sum, item) => sum + item.quantity, 0);
  }
  return result;
}

function isNumberInput(value) {
  return typeof value === 'number' || (typeof value === 'string' && value.trim() !== '');
}

function isNonNegativeNumber(value) {
  return isNumberInput(value) && !['boolean', 'bigint'].includes(typeof value) && Number.isFinite(Number(value)) && Number(value) >= 0;
}

function isNonNegativeInteger(value) {
  return isNonNegativeNumber(value) && Number.isInteger(Number(value));
}

function isPositiveNumber(value) {
  return isNumberInput(value) && !['boolean', 'bigint'].includes(typeof value) && Number.isFinite(Number(value)) && Number(value) > 0;
}

function canonicalizeCustomData(input) {
  const result = {};
  for (const [key, value] of Object.entries(input)) {
    if (RESERVED_OBJECT_KEYS.has(key)) continue;
    const canonical = CUSTOM_DATA_ALIASES[key] || key;
    if (RESERVED_OBJECT_KEYS.has(canonical)) continue;
    if (key !== canonical && Object.prototype.hasOwnProperty.call(input, canonical)) continue;
    result[canonical] = value;
  }
  return result;
}

function canonicalizeContentItem(input) {
  const result = {};
  for (const [key, value] of Object.entries(input || {})) {
    if (RESERVED_OBJECT_KEYS.has(key)) continue;
    const canonical = CONTENT_ITEM_ALIASES[key] || key;
    if (RESERVED_OBJECT_KEYS.has(canonical)) continue;
    if (key !== canonical && Object.prototype.hasOwnProperty.call(input, canonical)) continue;
    if (result[canonical] === undefined || key === canonical) result[canonical] = value;
  }
  return result;
}

export function buildEvent(config, eventName, params = {}, context = {}) {
  const name = normalizeEventName(eventName);
  if (!params || typeof params !== 'object' || Array.isArray(params)) throw new ConversionError('invalid_event_params', 'Event parameters must be an object.');
  params = canonicalizeEventParams(params);
  const eventContext = context && typeof context === 'object' ? context : {};
  const reqContext = requestContext(eventContext.req || eventContext.request, config);
  const eventIdInput = params.eventId ?? params.event_id;
  const eventId = eventIdInput === undefined || eventIdInput === null ? randomUUID() : String(eventIdInput);
  if (eventIdInput !== undefined && eventIdInput !== null && !['string', 'number'].includes(typeof eventIdInput)) {
    throw new ConversionError('invalid_event_id', 'eventId must be a string or number.');
  }
  if (typeof eventIdInput === 'number' && !Number.isFinite(eventIdInput)) {
    throw new ConversionError('invalid_event_id', 'eventId must be a finite string or number.');
  }
  if (!/^[\x20-\x7e]{1,100}$/u.test(eventId)) throw new ConversionError('invalid_event_id', 'eventId must be a printable string of 1-100 characters.');
  const actionSource = String(params.actionSource ?? params.action_source ?? 'website').trim().toLowerCase();
  if (!ACTION_SOURCES.has(actionSource)) throw new ConversionError('invalid_action_source', 'actionSource is not supported by Meta.');
  const event = {
    event_name: name,
    event_time: eventTime(params.eventTime ?? params.event_time),
    event_id: eventId,
    action_source: actionSource,
    user_data: normalizeRawUserData(params.userData ?? params.user_data, params.hashedUserData ?? params.hashed_user_data, config, reqContext),
    custom_data: validateCustomData(params.customData ?? params.custom_data, config, name),
  };
  const suppliedSourceUrl = params.sourceUrl ?? params.source_url ?? params.event_source_url;
  if (actionSource === 'website' || suppliedSourceUrl) {
    event.event_source_url = sourceUrl(suppliedSourceUrl, reqContext, config);
  }
  const referrer = params.referrerUrl ?? params.referrer_url ?? reqContext.referrer;
  if (referrer) event.referrer_url = String(referrer);
  for (const [key, metaKey] of Object.entries({
    dataProcessingOptions: 'data_processing_options',
    data_processing_options: 'data_processing_options',
    dataProcessingOptionsCountry: 'data_processing_options_country',
    data_processing_options_country: 'data_processing_options_country',
    dataProcessingOptionsState: 'data_processing_options_state',
    data_processing_options_state: 'data_processing_options_state',
    originalEventData: 'original_event_data',
    original_event_data: 'original_event_data',
    appData: 'app_data',
    app_data: 'app_data',
  })) {
    if (params[key] !== undefined) event[metaKey] = cleanObject(params[key]);
  }
  for (const [key, metaKey] of Object.entries({
    optOut: 'opt_out',
    opt_out: 'opt_out',
    restrictedDataProcessing: 'restricted_data_processing',
    restricted_data_processing: 'restricted_data_processing',
  })) {
    if (params[key] !== undefined) {
      if (typeof params[key] !== 'boolean') throw new ConversionError('invalid_event_option', `${key} must be a boolean.`);
      event[metaKey] = params[key];
    }
  }
  validateProcessingOptions(event);
  if (params.customerSegmentation !== undefined) event.custom_data.customer_segmentation = cleanObject(params.customerSegmentation);
  if (params.customer_segmentation !== undefined) event.custom_data.customer_segmentation = cleanObject(params.customer_segmentation);
  return event;
}

function validateProcessingOptions(event) {
  const options = event.data_processing_options;
  if (options === undefined) return;
  if (!Array.isArray(options) || options.some((item) => item !== 'LDU')) {
    throw new ConversionError('invalid_data_processing_options', 'dataProcessingOptions only supports the LDU value.');
  }
  if (options.includes('LDU')) {
    if (event.data_processing_options_country !== undefined && ![0, 1].includes(Number(event.data_processing_options_country))) {
      throw new ConversionError('invalid_data_processing_options_country', 'dataProcessingOptionsCountry must be 0 or 1.');
    }
    if (event.data_processing_options_state !== undefined && ![0, 1000].includes(Number(event.data_processing_options_state))) {
      throw new ConversionError('invalid_data_processing_options_state', 'dataProcessingOptionsState must be 0 or 1000.');
    }
    if (event.data_processing_options_country !== undefined && event.data_processing_options_state === undefined) {
      throw new ConversionError('missing_data_processing_options_state', 'dataProcessingOptionsState is required when a country is provided.');
    }
    if (event.data_processing_options_country !== undefined) event.data_processing_options_country = Number(event.data_processing_options_country);
    if (event.data_processing_options_state !== undefined) event.data_processing_options_state = Number(event.data_processing_options_state);
  }
}

function retryableStatus(status) {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

async function responseBody(response) {
  try { return await response.json(); } catch { return null; }
}

export function createConversions({ config, fetchImpl = fetch, logger = () => {}, defaults = {} }) {
  let sharedDefaults = mergeEventParams({}, requireObject(defaults, 'defaults', 'invalid_defaults'));
  async function track(eventName, params = {}, context = {}) {
    const safeParams = params && typeof params === 'object' && !Array.isArray(params) ? params : {};
    if (!config.capiEnabled) {
      const disabledParams = mergeEventParams(sharedDefaults, safeParams);
      return { status: 'disabled', eventId: disabledParams.eventId ?? null };
    }
    const inputParams = requireObject(params, 'Event parameters', 'invalid_event_params');
    const mergedParams = mergeEventParams(sharedDefaults, inputParams);
    const event = buildEvent(config, eventName, mergedParams, context);
    const endpoint = new URL(`${config.metaApiBaseUrl.replace(/\/$/u, '')}/${config.metaApiVersion}/${encodeURIComponent(config.metaPixelId)}/events`);
    endpoint.searchParams.set('access_token', config.metaAccessToken);
    const payload = { data: [event] };
    if (config.metaTestEventCode) payload.test_event_code = config.metaTestEventCode;
    let lastError;
    for (let attempt = 0; attempt <= config.capiRetries; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), config.capiTimeoutMs);
      try {
        const response = await fetchImpl(endpoint.href, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });
        const body = await responseBody(response);
        clearTimeout(timeout);
        if (response.ok) {
          logger({ event: 'conversion_sent', event_name: event.event_name, event_id: event.event_id, status: response.status });
          return { status: 'sent', eventId: event.event_id, response: body };
        }
        const retryable = retryableStatus(response.status);
        lastError = new ConversionError('meta_api_error', `Meta CAPI returned HTTP ${response.status}.`, { status: retryable ? 502 : 400, retryable });
        if (!retryable || attempt >= config.capiRetries) break;
      } catch (error) {
        clearTimeout(timeout);
        const timedOut = error?.name === 'AbortError';
        lastError = new ConversionError(timedOut ? 'meta_api_timeout' : 'meta_api_unavailable', timedOut ? 'Meta CAPI request timed out.' : 'Meta CAPI request failed.', { status: timedOut ? 504 : 502, retryable: true, cause: error });
        if (attempt >= config.capiRetries) break;
      }
    }
    logger({ event: 'conversion_failed', event_name: event.event_name, event_id: event.event_id, code: lastError.code, retryable: lastError.retryable });
    throw lastError;
  }
  const api = {
    track,
    getDefaults: () => mergeEventParams({}, sharedDefaults),
    setDefaults(nextDefaults = {}) {
      sharedDefaults = mergeEventParams(sharedDefaults, requireObject(nextDefaults, 'defaults', 'invalid_defaults'));
      return api;
    },
  };
  for (const name of STANDARD_EVENTS) api[name[0].toLowerCase() + name.slice(1)] = (params, context) => track(name, params, context);
  return api;
}

export function conversionErrorResponse(error) {
  if (error instanceof ConversionError) return { status: error.status, body: { error: error.code, message: error.message, retryable: error.retryable } };
  return { status: 500, body: { error: 'conversion_failed', message: 'Conversion event could not be sent.', retryable: false } };
}
