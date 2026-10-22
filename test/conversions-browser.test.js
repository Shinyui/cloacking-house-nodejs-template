import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { test } from 'node:test';

async function loadBrowserApi({ response = { status: 'sent' } } = {}) {
  const source = await readFile(new URL('../public/assets/conversions/capi.js', import.meta.url), 'utf8');
  const listeners = new Map();
  const requests = [];
  let cookieHeader = '';
  const document = {
    get cookie() { return cookieHeader; },
    set cookie(value) {
      const pair = value.split(';', 1)[0];
      cookieHeader = cookieHeader ? `${pair}; ${cookieHeader}` : pair;
    },
    referrer: 'https://example.com/referrer',
    addEventListener(name, handler) { listeners.set(name, handler); },
  };
  const window = {
    document,
    location: {
      href: 'https://example.com/landing?fbclid=click-1',
      origin: 'https://example.com',
      protocol: 'https:',
      search: '?fbclid=click-1',
    },
    crypto: { randomUUID: () => 'generated-event-id' },
    fetch: async (url, options) => {
      requests.push({ url, options, body: JSON.parse(options.body) });
      return { ok: true, status: 200, json: async () => response };
    },
  };
  vm.runInNewContext(source, { window, document, URL, URLSearchParams });
  return { api: window.CAPI, listeners, requests, get cookies() { return cookieHeader; } };
}

test('browser CAPI merges defaults, aliases, and attribution before sending', async () => {
  const browser = await loadBrowserApi();
  browser.api.init({
    autoPageView: false,
    defaults: {
      event_id: 'default-event',
      user_data: { email: 'default@example.com' },
      custom_data: { currency: 'twd' },
    },
  });
  const result = await browser.api.track('Lead', {
    event_id: 'lead-1',
    user_data: { phone: '+886912345678' },
    custom_data: { value: 12 },
  });

  assert.deepEqual(result, { status: 'sent' });
  assert.equal(browser.requests.length, 1);
  assert.equal(browser.requests[0].body.eventName, 'Lead');
  assert.equal(browser.requests[0].body.eventId, 'lead-1');
  assert.deepEqual(browser.requests[0].body.userData, {
    email: 'default@example.com',
    phone: '+886912345678',
    fbp: browser.requests[0].body.userData.fbp,
    fbc: browser.requests[0].body.userData.fbc,
  });
  assert.equal(browser.requests[0].body.customData.currency, 'twd');
  assert.equal(browser.requests[0].body.customData.value, 12);
  assert.match(browser.cookies, /_fbc=fb\.1\.\d+\.click-1/u);
  assert.match(browser.cookies, /_fbp=fb\.1\.\d+\.\d+/u);
});

test('browser CAPI rejects invalid setup and does not auto-send when disabled', async () => {
  const browser = await loadBrowserApi();
  assert.throws(() => browser.api.init({ endpoint: 'https://attacker.example/api/conversions' }), /same origin/u);
  browser.api.init({ autoPageView: false });
  assert.equal(browser.requests.length, 0);
  await assert.rejects(browser.api.track('Lead', []), /Event parameters must be an object/u);
});

test('browser CAPI exposes mutable shared defaults with per-event overrides', async () => {
  const browser = await loadBrowserApi();
  browser.api.init({ autoPageView: false, defaults: { userData: { countryCode: 'TW' } } });
  browser.api.setDefaults({ customData: { contentType: 'product' } });
  assert.equal(browser.api.getDefaults().customData.contentType, 'product');
  await browser.api.track('ViewContent', {
    userData: { email: 'person@example.com' },
    customData: { contentName: 'Item' },
  });
  assert.equal(browser.requests[0].body.userData.countryCode, 'TW');
  assert.equal(browser.requests[0].body.userData.email, 'person@example.com');
  assert.equal(browser.requests[0].body.customData.contentType, 'product');
  assert.equal(browser.requests[0].body.customData.contentName, 'Item');
});
