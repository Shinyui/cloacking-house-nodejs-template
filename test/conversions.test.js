import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadConfig } from '../src/config.js';
import {
  buildEvent,
  createConversions,
  sha256,
  STANDARD_EVENTS,
  ConversionError,
} from '../src/conversions.js';

function config(overrides = {}) {
  return loadConfig({
    CLOAKING_LABEL: 'test-label',
    META_CAPI_ENABLED: 'true',
    META_PIXEL_ID: '123456',
    META_ACCESS_TOKEN: 'secret-token',
    PUBLIC_ORIGIN: 'https://example.com',
    META_DEFAULT_CURRENCY: 'TWD',
    META_DEFAULT_PHONE_REGION: 'TW',
    ...overrides,
  });
}

test('standard event shortcuts cover the complete website event set', () => {
  assert.equal(STANDARD_EVENTS.length, 18);
  const api = createConversions({ config: config(), fetchImpl: async () => Response.json({ events_received: 1 }) });
  for (const eventName of STANDARD_EVENTS) {
    assert.equal(typeof api[eventName[0].toLowerCase() + eventName.slice(1)], 'function');
  }
});

test('buildEvent normalizes and hashes customer data while preserving Meta raw identifiers', () => {
  const event = buildEvent(config(), 'Lead', {
    eventId: 'lead-1',
    sourceUrl: 'https://example.com/landing?x=1',
    userData: {
      email: '  Person@Example.COM ',
      phone: '0912-345-678',
      fbp: 'fb.1.123.456',
      fbc: 'fb.1.123.click',
    },
    customData: { value: 0, currency: 'twd', status: false },
  });
  assert.equal(event.event_name, 'Lead');
  assert.equal(event.event_id, 'lead-1');
  assert.equal(event.event_source_url, 'https://example.com/landing?x=1');
  assert.equal(event.user_data.em, sha256('person@example.com'));
  assert.equal(event.user_data.ph, sha256('886912345678'));
  assert.equal(event.user_data.fbp, 'fb.1.123.456');
  assert.equal(event.user_data.fbc, 'fb.1.123.click');
  assert.equal(event.custom_data.value, 0);
  assert.equal(event.custom_data.status, false);
  assert.equal(event.custom_data.currency, 'TWD');
});

test('the interface accepts snake_case aliases and normalizes purchase contents', () => {
  const event = buildEvent(config(), 'Purchase', {
    event_id: 'order-2',
    source_url: 'https://example.com/checkout',
    user_data: { email_address: 'buyer@example.com', phone_number: '+886 912 345 678' },
    custom_data: {
      value: '1200.50',
      currency_code: 'twd',
      contents: [{ id: 'sku-1', quantity: '2', item_price: '600.25' }],
    },
  });
  assert.equal(event.event_id, 'order-2');
  assert.equal(event.event_source_url, 'https://example.com/checkout');
  assert.equal(event.user_data.em, sha256('buyer@example.com'));
  assert.equal(event.user_data.ph, sha256('886912345678'));
  assert.equal(event.custom_data.value, 1200.5);
  assert.equal(event.custom_data.currency, 'TWD');
  assert.equal(event.custom_data.contents[0].quantity, 2);
  assert.equal(event.custom_data.num_items, 2);
});

test('shared defaults and content aliases are available to direct integrations', () => {
  const calls = [];
  const api = createConversions({
    config: config(),
    defaults: {
      action_source: 'website',
      user_data: { country_code: 'TW' },
      custom_data: { content_type: 'product' },
    },
    fetchImpl: async (_url, options) => {
      calls.push(JSON.parse(options.body));
      return Response.json({ events_received: 1 });
    },
  });
  return api.track('AddToCart', {
    source_url: 'https://example.com/cart',
    userData: { email: 'person@example.com' },
    customData: {
      contents: [{ productId: 'sku-1', itemQuantity: '2', price: '5.5' }],
    },
  }).then(() => {
    const event = calls[0].data[0];
    assert.equal(event.action_source, 'website');
    assert.equal(event.user_data.country, sha256('tw'));
    assert.equal(event.custom_data.content_type, 'product');
    assert.equal(event.custom_data.contents[0].id, 'sku-1');
    assert.equal(event.custom_data.contents[0].quantity, 2);
    assert.equal(event.custom_data.contents[0].item_price, 5.5);
    assert.equal(event.custom_data.num_items, 2);
  });
});

test('per-event aliases override conflicting shared defaults', async () => {
  const payloads = [];
  const api = createConversions({
    config: config(),
    defaults: { custom_data: { currency: 'TWD' }, user_data: { email: 'default@example.com' } },
    fetchImpl: async (_url, options) => {
      payloads.push(JSON.parse(options.body));
      return Response.json({ events_received: 1 });
    },
  });
  await api.track('Lead', {
    custom_data: { currency_code: 'USD' },
    user_data: { email_address: 'event@example.com' },
  });
  const event = payloads[0].data[0];
  assert.equal(event.custom_data.currency, 'USD');
  assert.equal(event.user_data.em, sha256('event@example.com'));
});

test('purchase requires value and currency, while configured currency fills other value events', () => {
  assert.throws(() => buildEvent(config({ META_DEFAULT_CURRENCY: '' }), 'Purchase', {
    sourceUrl: 'https://example.com/',
    userData: { email: 'person@example.com' },
  }), (error) => error instanceof ConversionError && error.code === 'purchase_value_required');
  const event = buildEvent(config(), 'Subscribe', {
    sourceUrl: 'https://example.com/',
    userData: { email: 'person@example.com' },
    customData: { value: 29 },
  });
  assert.equal(event.custom_data.currency, 'TWD');
});

test('pre-hashed values are accepted and duplicate raw/hashed values are rejected', () => {
  const hashed = sha256('person@example.com');
  const event = buildEvent(config(), 'Lead', {
    sourceUrl: 'https://example.com/',
    hashedUserData: { em: hashed },
  });
  assert.equal(event.user_data.em, hashed);
  assert.throws(() => buildEvent(config(), 'Lead', {
    sourceUrl: 'https://example.com/',
    userData: { em: 'person@example.com' },
    hashedUserData: { em: hashed },
  }), (error) => error.code === 'duplicate_user_data');
});

test('CAPI sends the event payload and retries a transient response with the same event id', async () => {
  const calls = [];
  const api = createConversions({
    config: config({ META_CAPI_RETRIES: '1' }),
    fetchImpl: async (url, options) => {
      calls.push({ url, options, payload: JSON.parse(options.body) });
      return calls.length === 1 ? new Response('busy', { status: 503 }) : Response.json({ events_received: 1 });
    },
  });
  const result = await api.track('Lead', {
    eventId: 'retry-1',
    sourceUrl: 'https://example.com/',
    userData: { email: 'person@example.com' },
  });
  assert.equal(result.status, 'sent');
  assert.equal(calls.length, 2);
  assert.equal(calls[0].payload.data[0].event_id, 'retry-1');
  assert.equal(calls[1].payload.data[0].event_id, 'retry-1');
  assert.match(calls[0].url, /access_token=secret-token/u);
});

test('disabled CAPI does not call Meta and returns a stable no-op result', async () => {
  let calls = 0;
  const api = createConversions({
    config: loadConfig({ CLOAKING_LABEL: 'test-label' }),
    fetchImpl: async () => { calls += 1; return Response.json({}); },
  });
  assert.deepEqual(await api.track('PageView'), { status: 'disabled', eventId: null });
  assert.equal(calls, 0);
});

test('invalid processing options and empty identifiers fail before sending', () => {
  assert.throws(() => buildEvent(config(), 'Lead', {
    sourceUrl: 'https://example.com/',
    userData: { email: '' },
  }), (error) => error.code === 'missing_user_data');
  assert.throws(() => buildEvent(config(), 'Lead', {
    sourceUrl: 'https://example.com/',
    userData: { email: 'person@example.com' },
    dataProcessingOptions: ['INVALID'],
  }), (error) => error.code === 'invalid_data_processing_options');
  assert.throws(() => buildEvent(config(), 'Lead', {
    sourceUrl: 'https://example.com/',
    userData: { email: 'person@example.com' },
    dataProcessingOptions: ['LDU'],
    dataProcessingOptionsCountry: 1,
  }), (error) => error.code === 'missing_data_processing_options_state');
  assert.throws(() => buildEvent(config(), 'Lead', {
    sourceUrl: 'https://example.com/',
    userData: { email: 'person@example.com' },
    customData: { value: true },
  }), (error) => error.code === 'invalid_value');
  assert.throws(() => buildEvent(config(), 'Lead', {
    sourceUrl: 'https://example.com/',
    userData: { email: 'person@example.com' },
    eventTime: 'not-a-date',
  }), (error) => error.code === 'invalid_event_time');
});
