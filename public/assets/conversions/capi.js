(function installConversionsApi(global) {
  'use strict';

  const STANDARD_EVENTS = [
    'PageView', 'ViewContent', 'Search', 'AddToCart', 'AddToWishlist',
    'InitiateCheckout', 'AddPaymentInfo', 'Purchase', 'Lead',
    'CompleteRegistration', 'SubmitApplication', 'Contact', 'FindLocation',
    'Schedule', 'StartTrial', 'Subscribe', 'CustomizeProduct', 'Donate',
  ];
  const state = {
    endpoint: '/api/conversions',
    autoPageView: true,
    initialized: false,
    defaults: {},
  };
  const PARAM_ALIASES = {
    event_id: 'eventId', event_time: 'eventTime', action_source: 'actionSource',
    source_url: 'sourceUrl', event_source_url: 'sourceUrl', referrer_url: 'referrerUrl',
    eventSourceUrl: 'sourceUrl',
    user_data: 'userData', hashed_user_data: 'hashedUserData', custom_data: 'customData',
    data_processing_options: 'dataProcessingOptions',
    data_processing_options_country: 'dataProcessingOptionsCountry',
    data_processing_options_state: 'dataProcessingOptionsState',
    opt_out: 'optOut', restricted_data_processing: 'restrictedDataProcessing',
    original_event_data: 'originalEventData', app_data: 'appData',
    customer_segmentation: 'customerSegmentation',
  };
  const USER_DATA_ALIASES = {
    emailAddress: 'email', email_address: 'email', em: 'email',
    phoneNumber: 'phone', phone_number: 'phone', ph: 'phone',
    firstName: 'firstName', first_name: 'firstName', fn: 'firstName',
    lastName: 'lastName', last_name: 'lastName', ln: 'lastName',
    dateOfBirth: 'dateOfBirth', date_of_birth: 'dateOfBirth', db: 'dateOfBirth',
    gender: 'gender', ge: 'gender', city: 'city', ct: 'city', state: 'state', st: 'state',
    zip: 'zip', postalCode: 'zip', postal_code: 'zip', zp: 'zip',
    countryCode: 'countryCode', country_code: 'countryCode', country: 'countryCode',
    externalId: 'externalId', external_id: 'externalId',
    clientIpAddress: 'clientIpAddress', client_ip_address: 'clientIpAddress',
    clientUserAgent: 'clientUserAgent', client_user_agent: 'clientUserAgent',
    browserId: 'fbp', clickId: 'fbc',
    subscriptionId: 'subscriptionId', subscription_id: 'subscriptionId',
    leadId: 'leadId', lead_id: 'leadId', fbLoginId: 'fbLoginId', fb_login_id: 'fbLoginId',
    anonId: 'anonId', anon_id: 'anonId', madid: 'madid', pageId: 'pageId', page_id: 'pageId',
    pageScopedUserId: 'pageScopedUserId', page_scoped_user_id: 'pageScopedUserId',
    ctwaClid: 'ctwaClid', ctwa_clid: 'ctwaClid', igAccountId: 'igAccountId', ig_account_id: 'igAccountId',
    igScopedId: 'igScopedId', ig_sid: 'igScopedId',
  };
  const CUSTOM_DATA_ALIASES = {
    currencyCode: 'currency', currency_code: 'currency',
    contentCategory: 'contentCategory', content_category: 'contentCategory',
    contentIds: 'contentIds', content_ids: 'contentIds',
    contentName: 'contentName', content_name: 'contentName',
    contentType: 'contentType', content_type: 'contentType',
    contentUrl: 'contentUrl', content_url: 'contentUrl',
    numItems: 'numItems', num_items: 'numItems',
    predictedLtv: 'predictedLtv', predicted_ltv: 'predictedLtv',
    orderId: 'orderId', order_id: 'orderId',
    orderName: 'orderName', order_name: 'orderName',
    productId: 'productId', product_id: 'productId', productName: 'productName', product_name: 'productName',
    productBrand: 'productBrand', product_brand: 'productBrand', productCategory: 'productCategory', product_category: 'productCategory',
    deliveryCategory: 'deliveryCategory', delivery_category: 'deliveryCategory',
    leadEventSource: 'leadEventSource', lead_event_source: 'leadEventSource',
    customerSegmentation: 'customerSegmentation', customer_segmentation: 'customerSegmentation',
    netRevenue: 'netRevenue', net_revenue: 'netRevenue', tax: 'tax', shipping: 'shipping',
    itemPrice: 'itemPrice', item_price: 'itemPrice', itemCategory: 'itemCategory', item_category: 'itemCategory',
    searchString: 'searchString', search_string: 'searchString',
  };

  function uuid() {
    if (global.crypto?.randomUUID) return global.crypto.randomUUID();
    return `${Date.now()}-${Math.random().toString(16).slice(2)}-${Math.random().toString(16).slice(2)}`;
  }

  function cookie(name) {
    const item = document.cookie.split(';').map((entry) => entry.trim()).find((entry) => entry.startsWith(`${name}=`));
    if (!item) return undefined;
    try { return decodeURIComponent(item.slice(name.length + 1)); } catch { return undefined; }
  }

  function setCookie(name, value) {
    document.cookie = `${name}=${encodeURIComponent(value)}; Max-Age=7776000; Path=/; SameSite=Lax${global.location.protocol === 'https:' ? '; Secure' : ''}`;
  }

  function attribution() {
    let fbp = cookie('_fbp');
    if (!fbp) {
      fbp = `fb.1.${Date.now()}.${Math.floor(Math.random() * 1e10)}`;
      setCookie('_fbp', fbp);
    }
    let fbc = cookie('_fbc');
    const fbclid = new URLSearchParams(global.location.search).get('fbclid');
    if (fbclid && fbc?.split('.').slice(3).join('.') !== fbclid) {
      fbc = `fb.1.${Date.now()}.${fbclid}`;
      setCookie('_fbc', fbc);
    }
    return { ...(fbp ? { fbp } : {}), ...(fbc ? { fbc } : {}) };
  }

  function objectValue(value, name) {
    if (value === undefined) return {};
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${name} must be an object.`);
    return value;
  }

  function normalizeParams(value, name) {
    const input = { ...objectValue(value, name) };
    for (const [alias, key] of Object.entries(PARAM_ALIASES)) {
      if (input[key] === undefined && input[alias] !== undefined) input[key] = input[alias];
      delete input[alias];
    }
    for (const key of ['userData', 'hashedUserData', 'customData']) {
      if (input[key] !== undefined) input[key] = { ...objectValue(input[key], key) };
    }
    return input;
  }

  function mergeData(defaults, input, aliases = {}) {
    return { ...canonicalizeData(defaults, aliases), ...canonicalizeData(input, aliases) };
  }

  function canonicalizeData(input, aliases) {
    const result = {};
    for (const [key, value] of Object.entries(input || {})) {
      const canonical = aliases[key] || key;
      if (key !== canonical && Object.prototype.hasOwnProperty.call(input, canonical)) continue;
      if (result[canonical] === undefined || key === canonical) result[canonical] = value;
    }
    return result;
  }

  function mergeParams(defaults, input) {
    const result = { ...defaults, ...input };
    for (const key of ['userData', 'hashedUserData', 'customData']) {
      if (defaults[key] !== undefined || input[key] !== undefined) {
        const aliases = key === 'customData' ? CUSTOM_DATA_ALIASES : USER_DATA_ALIASES;
        result[key] = mergeData(defaults[key] || {}, input[key] || {}, aliases);
      }
    }
    return result;
  }

  async function track(eventName, params) {
    if (typeof eventName !== 'string' || !eventName.trim()) throw new TypeError('eventName is required.');
    const input = normalizeParams(params, 'Event parameters');
    const defaults = state.defaults;
    const body = {
      ...defaults,
      ...input,
      eventName: eventName.trim(),
    };
    for (const key of ['userData', 'hashedUserData', 'customData']) {
      if (defaults[key] !== undefined || input[key] !== undefined) {
        const aliases = key === 'customData' ? CUSTOM_DATA_ALIASES : USER_DATA_ALIASES;
        body[key] = mergeData(defaults[key] || {}, input[key] || {}, aliases);
      }
    }
    body.userData = mergeData(attribution(), body.userData || {}, USER_DATA_ALIASES);
    body.eventId ??= uuid();
    body.eventTime ??= Math.floor(Date.now() / 1000);
    body.sourceUrl ??= global.location.href;
    body.referrerUrl ??= document.referrer || undefined;
    delete body.defaults;
    const response = await global.fetch(state.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      credentials: 'same-origin',
      keepalive: true,
      body: JSON.stringify(body),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(result.message || 'Conversion event failed.');
      error.code = result.error || 'conversion_failed';
      error.status = response.status;
      error.retryable = result.retryable === true;
      error.eventId = body.eventId;
      throw error;
    }
    return result;
  }

  function init(options) {
    const settings = objectValue(options, 'CAPI.init options');
    if (settings.autoPageView !== undefined && typeof settings.autoPageView !== 'boolean') throw new TypeError('autoPageView must be a boolean.');
    let endpoint;
    if (settings.endpoint !== undefined) {
      endpoint = new URL(settings.endpoint, global.location.origin);
      if (endpoint.origin !== global.location.origin || endpoint.username || endpoint.password) throw new TypeError('endpoint must use the same origin as the page.');
    }
    const defaults = settings.defaults === undefined ? state.defaults : normalizeParams(settings.defaults, 'defaults');
    if (endpoint) state.endpoint = endpoint.href;
    if (settings.autoPageView !== undefined) state.autoPageView = settings.autoPageView;
    state.defaults = defaults;
    if (!state.initialized) {
      state.initialized = true;
      document.addEventListener('click', (event) => {
        const target = event.target?.closest?.('[data-capi-event]');
        if (!target || target.tagName === 'FORM' || event.defaultPrevented) return;
        if (target.closest?.('form[data-capi-event]')) return;
        const name = target.getAttribute('data-capi-event');
        let params = {};
        try { params = JSON.parse(target.getAttribute('data-capi-params') || '{}'); } catch { return; }
        void track(name, params).catch(() => {});
      });
      document.addEventListener('submit', (event) => {
        const form = event.target;
        if (event.defaultPrevented) return;
        const name = form.getAttribute?.('data-capi-event');
        if (!name) return;
        let params = {};
        try { params = JSON.parse(form.getAttribute('data-capi-params') || '{}'); } catch { return; }
        void track(name, params).catch(() => {});
      });
      if (state.autoPageView) void track('PageView').catch(() => {});
    }
    return api;
  }

  const api = {
    init,
    track,
    getDefaults() {
      return mergeParams({}, state.defaults);
    },
    setDefaults(nextDefaults) {
      state.defaults = mergeParams(state.defaults, normalizeParams(nextDefaults, 'defaults'));
      return api;
    },
  };
  for (const name of STANDARD_EVENTS) {
    api[name[0].toLowerCase() + name.slice(1)] = (params) => track(name, params);
  }
  global.CAPI = api;
}(window));
