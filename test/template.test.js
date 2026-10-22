import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { test } from 'node:test';
import Shot from '@hapi/shot';
import { createApp } from '../src/app.js';
import { getClientIp } from '../src/client-ip.js';
import { loadConfig } from '../src/config.js';
import { buildRequestData, checkVisitor, resolveDecision } from '../src/flow.js';

const decision = {
  filter_page: 'white',
  url_white_page: 'pages/white.html',
  url_offer_page: 'pages/offer.html',
  mode_white_page: 'loading',
  mode_offer_page: 'loading',
};

function config(env = {}) {
  return loadConfig({ CLOAKING_LABEL: 'test-label', ...env });
}

function inject(app, options = {}) {
  return Shot.inject((req, res) => {
    // Express replaces prototypes; preserve Shot's in-memory transport.
    for (const method of ['_read', '_destroy']) req[method] = req[method].bind(req);
    for (const method of ['writeHead', 'write', 'end', 'addTrailers']) res[method] = res[method].bind(res);
    req.rawHeaders = Object.entries(req.headers).flatMap(([name, values]) =>
      (Array.isArray(values) ? values : [values]).flatMap((value) => [name, value]));
    return app(req, res);
  }, { url: '/', remoteAddress: '127.0.0.1', ...options });
}

test('Cloaking.House requests preserve the six form fields and raw query', async () => {
  const settings = config();
  const query = 'click=%2f%2F&repeat=1&repeat=2';
  const data = buildRequestData({
    originalUrl: `/?${query}`,
    get: (name) => ({
      'user-agent': 'template-test',
      referer: 'https://example.com/',
      'accept-language': 'zh-TW',
    })[name],
  }, settings.label, '8.8.8.8');
  let request;
  const body = await checkVisitor(settings, data, async (url, options) => {
    request = { url, options };
    return Response.json(decision);
  });

  assert.equal(body.filter_page, 'white');
  assert.equal(request.url, settings.apiUrl);
  assert.equal(request.options.method, 'POST');
  assert.equal(request.options.headers['Content-Type'], 'application/x-www-form-urlencoded');
  assert.deepEqual(Object.fromEntries(new URLSearchParams(request.options.body)), {
    label: 'test-label',
    user_agent: 'template-test',
    referer: 'https://example.com/',
    query,
    lang: 'zh-TW',
    ip_address: '8.8.8.8',
  });
});

test('deployment does not determine the IP source and proxy headers require explicit configuration', async () => {
  assert.equal(config({ NODE_ENV: 'production' }).ipSource, 'socket');
  assert.equal(config({ RAILWAY_ENVIRONMENT_ID: 'example' }).ipSource, 'socket');
  assert.equal(config({ NODE_ENV: 'production', IP_SOURCE: 'x-real-ip' }).ipSource, 'x-real-ip');
  assert.throws(() => config({ IP_SOURCE: 'forwarded' }), /IP_SOURCE/u);
  assert.throws(() => config({ CLOAKING_LABEL: '' }), /CLOAKING_LABEL/u);
  assert.throws(() => config({ PORT: 'not-a-port' }), /PORT/u);
  assert.throws(() => config({ NODE_ENV: 'production', CLOAKING_API_URL: 'http://example.com/check' }), /HTTPS/u);
});

test('socket mode ignores proxy headers and explicit proxy mode validates a single IP', () => {
  const request = {
    socket: { remoteAddress: '::ffff:127.0.0.1' },
    headers: { 'x-real-ip': '8.8.8.8', 'x-forwarded-for': '1.1.1.1' },
    rawHeaders: ['X-Real-IP', '8.8.8.8', 'X-Forwarded-For', '1.1.1.1'],
  };
  assert.equal(getClientIp(request, 'socket'), '127.0.0.1');
  assert.equal(getClientIp(request, 'x-real-ip'), '8.8.8.8');

  for (const value of ['8.8.8.8, 1.1.1.1', 'not-an-ip', 'fe80::1%lo0']) {
    assert.equal(getClientIp({ ...request, headers: { 'x-real-ip': value } }, 'x-real-ip'), null);
  }
  assert.equal(getClientIp({ ...request, rawHeaders: [] }, 'x-real-ip'), null);
  assert.equal(getClientIp({ ...request, rawHeaders: ['X-Real-IP', '8.8.8.8', 'x-real-ip', '1.1.1.1'] }, 'x-real-ip'), null);
});

test('white and offer loading return their local blank templates', async () => {
  const settings = config();
  for (const page of ['white', 'offer']) {
    const expected = await readFile(`${settings.rootDir}/pages/${page}.html`, 'utf8');
    const result = await resolveDecision(settings, { ...decision, filter_page: page }, 'template-test');
    assert.equal(result.page, page);
    assert.equal(result.mode, 'loading');
    assert.equal(result.html.toString(), expected);
    assert.match(expected, /<body>\s*<\/body>/u);
    assert.doesNotMatch(result.html.toString(), /fbq|facebook\.com\/tr|Conversions API/i);
  }
});

test('remote loading forwards the visitor user agent and preserves relative assets with a base URL', async () => {
  for (const page of ['white', 'offer']) {
    const target = 'https://example.com/landing/index.html?a=1&b=2';
    const result = await resolveDecision(config(), {
      ...decision,
      filter_page: page,
      [`url_${page}_page`]: target,
    }, 'template-browser', async (url, options) => {
      assert.equal(url, target);
      assert.equal(options.headers['User-Agent'], 'template-browser');
      assert.equal(options.redirect, 'follow');
      return new Response('<html><head><base href="https://other.example/"></head><body><img src="image.png"></body></html>');
    });
    assert.match(result.html, /<head><base href="https:\/\/example\.com\/landing\/index\.html\?a=1&amp;b=2">/u);
    assert.match(result.html, /<img src="image\.png">/u);
  }
});

test('redirect, offer iframe, and white-mode restrictions follow the Cloaking.House decision', async () => {
  const settings = config();
  const redirect = await resolveDecision(settings, {
    ...decision,
    filter_page: 'offer',
    mode_offer_page: 'redirect',
    url_offer_page: 'https://example.com/offer',
  }, 'template-test');
  assert.equal(redirect.target, 'https://example.com/offer');

  const iframe = await resolveDecision(settings, {
    ...decision,
    filter_page: 'offer',
    mode_offer_page: 'iframe',
    url_offer_page: 'https://example.com/offer?a=1&b=2',
  }, 'template-test');
  assert.match(iframe.html, /<iframe/u);
  assert.match(iframe.html, /a=1&amp;b=2/u);

  await assert.rejects(
    resolveDecision(settings, { ...decision, mode_white_page: 'iframe' }, 'template-test'),
    (error) => error.code === 'unsupported_page_mode',
  );
});

test('the app serves both blank pages without added tracking and keeps private routes closed', async () => {
  const calls = [];
  let pageName = 'white';
  const app = await createApp({
    config: config(),
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return Response.json({ ...decision, filter_page: pageName });
    },
    logger: () => {},
  });
  const page = await inject(app);
  assert.equal(page.statusCode, 200);
  assert.match(page.payload, /<title>White Page<\/title>/u);
  assert.match(page.headers['cache-control'], /no-store/u);
  assert.equal(calls.length, 1);

  pageName = 'offer';
  const offer = await inject(app, { url: '/?preview=white', headers: { 'if-none-match': 'previous-offer' } });
  assert.equal(offer.statusCode, 200);
  assert.equal(offer.payload, await readFile(new URL('../pages/offer.html', import.meta.url), 'utf8'));
  assert.equal(offer.headers.etag, undefined);
  assert.equal(calls.length, 2);

  for (const path of ['/api/meta-event', '/api/line-click', '/pages/offer.html', '/src/config.js', '/.env', '/index.php', '/home', '/articles']) {
    const response = await inject(app, { method: 'POST', url: path });
    assert.equal(response.statusCode, 404);
    assert.equal((await inject(app, { url: path })).statusCode, 404);
  }
  assert.equal(calls.length, 2);

  const health = await inject(app, { url: '/healthz' });
  assert.equal(health.statusCode, 200);
  assert.equal(health.payload, JSON.stringify({ status: 'ok' }));
  assert.equal(calls.length, 2);
});

test('white and offer redirects use the configured target without appending entry parameters', async () => {
  for (const page of ['white', 'offer']) {
    const app = await createApp({
      config: config(),
      fetchImpl: async () => Response.json({
        ...decision,
        filter_page: page,
        [`mode_${page}_page`]: 'redirect',
        [`url_${page}_page`]: 'https://example.com/target?configured=1',
      }),
      logger: () => {},
    });
    const response = await inject(app, { url: '/?entry=2' });
    assert.equal(response.statusCode, 302);
    assert.equal(response.headers.location, 'https://example.com/target?configured=1');
    assert.match(response.headers['cache-control'], /no-store/u);
  }
});

test('API errors and unsupported page configurations fall back to the local white page', async (t) => {
  const outsideDir = await mkdtemp(path.join(tmpdir(), 'blank-template-outside-'));
  t.after(() => rm(outsideDir, { recursive: true, force: true }));
  const outsidePage = path.join(outsideDir, 'outside.html');
  await writeFile(outsidePage, '<h1>Private file outside pages</h1>');
  const cases = [
    { reason: 'api_unavailable', fetchImpl: async () => { throw new Error('offline'); } },
    { reason: 'api_http_error', fetchImpl: async () => new Response(null, { status: 503 }) },
    { reason: 'invalid_api_json', fetchImpl: async () => new Response('not json') },
    { reason: 'invalid_api_body', body: null },
    { reason: 'subscription_expired', body: { ...decision, filter_type: 'subscription_expired' } },
    { reason: 'missing_page_configuration', body: { ...decision, url_offer_page: '' } },
    { reason: 'invalid_filter_page', body: { ...decision, filter_page: 'unknown' } },
    { reason: 'local_page_unavailable', body: { ...decision, filter_page: 'offer', url_offer_page: 'pages/missing.html' } },
    { reason: 'local_page_outside_pages', body: { ...decision, url_white_page: outsidePage } },
    { reason: 'unsupported_page_url', body: { ...decision, mode_white_page: 'redirect', url_white_page: 'javascript:alert(1)' } },
  ];

  for (const item of cases) {
    await t.test(item.reason, async () => {
      const logs = [];
      const app = await createApp({
        config: config(),
        fetchImpl: item.fetchImpl ?? (async () => Response.json(item.body)),
        logger: (entry) => logs.push(entry),
      });
      const response = await inject(app);
      assert.equal(response.statusCode, 200);
      assert.equal(response.payload, await readFile(new URL('../pages/white.html', import.meta.url), 'utf8'));
      assert.equal(logs[0].reason, item.reason);
      assert.equal(logs[0].page, 'white');
      assert.equal(logs[0].mode, 'fallback');
    });
  }
});

test('a timed out API request returns the local white page', async () => {
  const logs = [];
  const app = await createApp({
    config: { ...config(), apiTimeoutMs: 5 },
    fetchImpl: async (_url, { signal }) => {
      await delay(100, null, { signal });
      return Response.json({ ...decision, filter_page: 'offer' });
    },
    logger: (entry) => logs.push(entry),
  });
  const response = await inject(app);
  assert.equal(response.statusCode, 200);
  assert.match(response.payload, /<title>White Page<\/title>/u);
  assert.equal(logs[0].reason, 'api_timeout');
});

test('an invalid proxy IP returns white without calling Cloaking.House', async () => {
  let requests = 0;
  const app = await createApp({
    config: config({ IP_SOURCE: 'x-real-ip' }),
    fetchImpl: async () => {
      requests += 1;
      return Response.json({ ...decision, filter_page: 'offer' });
    },
    logger: () => {},
  });
  for (const headers of [{}, { 'x-real-ip': 'bad-ip' }, { 'x-real-ip': ['8.8.8.8', '1.1.1.1'] }]) {
    const response = await inject(app, { headers });
    assert.equal(response.statusCode, 200);
    assert.match(response.payload, /<title>White Page<\/title>/u);
  }
  assert.equal(requests, 0);
  const valid = await inject(app, { headers: { 'x-real-ip': '8.8.8.8' } });
  assert.match(valid.payload, /<title>Offer Page<\/title>/u);
  assert.equal(requests, 1);
});
