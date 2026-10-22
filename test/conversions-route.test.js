import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import Shot from '@hapi/shot';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';

const decision = {
  filter_page: 'white',
  url_white_page: 'pages/white.html',
  url_offer_page: 'pages/offer.html',
  mode_white_page: 'loading',
  mode_offer_page: 'loading',
};

function config(overrides = {}) {
  return loadConfig({
    CLOAKING_LABEL: 'test-label',
    META_CAPI_ENABLED: 'true',
    META_PIXEL_ID: '123456',
    META_ACCESS_TOKEN: 'secret-token',
    PUBLIC_ORIGIN: 'https://example.com',
    ...overrides,
  });
}

function inject(app, options = {}) {
  return Shot.inject((req, res) => {
    for (const method of ['_read', '_destroy']) req[method] = req[method].bind(req);
    for (const method of ['writeHead', 'write', 'end', 'addTrailers']) res[method] = res[method].bind(res);
    req.rawHeaders = Object.entries(req.headers).flatMap(([name, values]) =>
      (Array.isArray(values) ? values : [values]).flatMap((value) => [name, value]));
    return app(req, res);
  }, { url: '/', remoteAddress: '127.0.0.1', ...options });
}

test('POST /api/conversions enforces same-origin and forwards the shared event interface', async () => {
  const calls = [];
  const app = await createApp({
    config: config(),
    fetchImpl: async () => Response.json(decision),
    conversions: {
      async track(eventName, params, context) {
        calls.push({ eventName, params, context });
        return { status: 'sent', eventId: params.eventId, response: { events_received: 1 } };
      },
    },
    logger: () => {},
  });

  const response = await inject(app, {
    method: 'POST',
    url: '/api/conversions',
    headers: {
      origin: 'https://example.com',
      'content-type': 'application/json',
    },
    payload: JSON.stringify({
      event_name: 'Lead',
      eventId: 'lead-1',
      userData: { email: 'person@example.com' },
    }),
  });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(JSON.parse(response.payload), {
    status: 'sent',
    eventId: 'lead-1',
    response: { events_received: 1 },
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].eventName, 'Lead');
  assert.equal(calls[0].params.userData.email, 'person@example.com');
  assert.equal(calls[0].context.req.method, 'POST');

  const rejected = await inject(app, {
    method: 'POST',
    url: '/api/conversions',
    headers: {
      origin: 'https://attacker.example',
      'content-type': 'application/json',
    },
    payload: JSON.stringify({ eventName: 'Lead', userData: { email: 'person@example.com' } }),
  });
  assert.equal(rejected.statusCode, 403);
  assert.equal(JSON.parse(rejected.payload).error, 'invalid_origin');
  assert.equal(calls.length, 1);
});

test('POST /api/conversions applies the per-IP limit and disabled mode remains a no-op', async () => {
  let calls = 0;
  const app = await createApp({
    config: config({ META_CAPI_RATE_LIMIT: '1' }),
    fetchImpl: async () => Response.json(decision),
    conversions: {
      async track() {
        calls += 1;
        return { status: 'sent', eventId: 'one' };
      },
    },
    logger: () => {},
  });
  const request = {
    method: 'POST',
    url: '/api/conversions',
    headers: { origin: 'https://example.com', 'content-type': 'application/json' },
    payload: JSON.stringify({ eventName: 'Contact', userData: { email: 'person@example.com' } }),
  };
  assert.equal((await inject(app, request)).statusCode, 200);
  const limited = await inject(app, request);
  assert.equal(limited.statusCode, 429);
  assert.equal(JSON.parse(limited.payload).error, 'rate_limited');
  assert.equal(calls, 1);

  const disabledApp = await createApp({
    config: loadConfig({ CLOAKING_LABEL: 'test-label', PUBLIC_ORIGIN: 'https://example.com' }),
    fetchImpl: async () => Response.json(decision),
    logger: () => {},
  });
  const disabled = await inject(disabledApp, {
    ...request,
    payload: JSON.stringify({ eventName: 'PageView' }),
  });
  assert.equal(disabled.statusCode, 200);
  assert.deepEqual(JSON.parse(disabled.payload), { status: 'disabled', eventId: null });
});

test('entry requests capture fbclid in an attribution cookie', async () => {
  const app = await createApp({
    config: config(),
    fetchImpl: async () => Response.json(decision),
    logger: () => {},
  });
  const response = await inject(app, { url: '/?fbclid=test-click' });
  assert.equal(response.statusCode, 200);
  assert.match(response.headers['set-cookie'], /_fbc=fb\.1\.\d+\.test-click/u);
  assert.equal(response.payload, await readFile(new URL('../pages/white.html', import.meta.url), 'utf8'));
});

test('POST /api/conversions returns structured errors for malformed and oversized JSON', async () => {
  const app = await createApp({
    config: config(),
    fetchImpl: async () => Response.json(decision),
    conversions: { async track() { throw new Error('should not be called'); } },
    logger: () => {},
  });
  const malformed = await inject(app, {
    method: 'POST',
    url: '/api/conversions',
    headers: { origin: 'https://example.com', 'content-type': 'application/json' },
    payload: '{"eventName":',
  });
  assert.equal(malformed.statusCode, 400);
  assert.equal(JSON.parse(malformed.payload).error, 'invalid_request');

  const oversized = await inject(app, {
    method: 'POST',
    url: '/api/conversions',
    headers: { origin: 'https://example.com', 'content-type': 'application/json' },
    payload: JSON.stringify({ eventName: 'Lead', userData: { email: 'a'.repeat(40_000) } }),
  });
  assert.equal(oversized.statusCode, 413);
  assert.equal(JSON.parse(oversized.payload).error, 'request_too_large');
});
