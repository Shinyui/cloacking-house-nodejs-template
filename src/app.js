import { randomUUID } from 'node:crypto';
import express from 'express';
import { getClientIp } from './client-ip.js';
import { captureAttribution, conversionErrorResponse, createConversions } from './conversions.js';
import { buildRequestData, checkVisitor, FlowError, readLocalPage, resolveDecision } from './flow.js';

const defaultLogger = (entry) => console.log(JSON.stringify(entry));

export async function createApp({ config, fetchImpl = fetch, logger = defaultLogger, conversions = createConversions({ config, fetchImpl, logger }) }) {
  const fallbackHtml = await readLocalPage(config, config.fallbackPage);
  await readLocalPage(config, config.offerPage);

  const app = express();
  app.disable('x-powered-by');
  app.disable('etag');
  app.set('trust proxy', false);

  app.use((_req, res, next) => {
    res.set('X-Content-Type-Options', 'nosniff');
    next();
  });
  app.use(express.json({ limit: '32kb' }));
  app.get('/healthz', (_req, res) => {
    res.set('Cache-Control', 'no-store').json({ status: 'ok' });
  });
  app.use('/assets', express.static(config.assetsDir, {
    dotfiles: 'deny',
    index: false,
    redirect: false,
    maxAge: '1h',
    fallthrough: true,
  }));

  const rateBuckets = new Map();
  app.post('/api/conversions', async (req, res) => {
    const origin = req.get('origin');
    if (config.publicOrigin && origin && !sameOrigin(origin, config.publicOrigin)) {
      return res.status(403).json({ error: 'invalid_origin', message: 'The request origin is not allowed.' });
    }
    if (config.publicOrigin && !origin) {
      const referer = req.get('referer');
      if (!referer || !sameOrigin(referer, config.publicOrigin)) {
        return res.status(403).json({ error: 'invalid_origin', message: 'The request origin is not allowed.' });
      }
    }
    const ip = getClientIp(req, config.ipSource) || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    const bucket = rateBuckets.get(ip) || { started: now, count: 0 };
    if (now - bucket.started >= 60_000) {
      bucket.started = now;
      bucket.count = 0;
    }
    bucket.count += 1;
    rateBuckets.set(ip, bucket);
    if (bucket.count > config.capiRateLimit) return res.status(429).json({ error: 'rate_limited', message: 'Too many conversion events.' });

    try {
      const body = req.body;
      if (!body || typeof body !== 'object' || Array.isArray(body)) {
        return res.status(400).json({ error: 'invalid_request', message: 'A JSON object is required.' });
      }
      const eventName = body.eventName || body.event_name;
      const { eventName: _eventName, event_name: _event_name, ...params } = body;
      const result = await conversions.track(eventName, params, { req });
      return res.status(200).json(result);
    } catch (error) {
      const response = conversionErrorResponse(error);
      return res.status(response.status).json(response.body);
    }
  });

  app.all('/', async (req, res) => {
    const started = performance.now();
    delete req.headers['if-none-match'];
    delete req.headers['if-modified-since'];
    const requestId = randomUUID();
    res.set({ 'Cache-Control': 'private, no-store', 'X-Request-Id': requestId });
    captureAttribution(req, res);

    let result;
    let reason;
    try {
      const ip = getClientIp(req, config.ipSource);
      if (!ip) throw new FlowError('invalid_client_ip');
      const data = buildRequestData(req, config.label, ip);
      const body = await checkVisitor(config, data, fetchImpl);
      result = await resolveDecision(config, body, req.get('user-agent') ?? '', fetchImpl);
    } catch (error) {
      reason = error instanceof FlowError ? error.code : 'unexpected_error';
      result = { page: 'white', mode: 'fallback', html: fallbackHtml };
    }

    if (result.mode === 'redirect') {
      res.status(302).location(result.target).end();
    } else {
      res.type('html').send(result.html);
    }

    logger({
      event: 'page_decision',
      request_id: requestId,
      page: result.page,
      mode: result.mode,
      ...(reason ? { reason } : {}),
      duration_ms: Math.round(performance.now() - started),
    });
  });

  app.use((_req, res) => {
    res.status(404).set('Cache-Control', 'no-store').type('text').send('Not found.');
  });
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    if (req.path === '/api/conversions') {
      const status = error?.status === 413 ? 413 : 400;
      return res.status(status).json({
        error: status === 413 ? 'request_too_large' : 'invalid_request',
        message: status === 413 ? 'The conversion request is too large.' : 'Invalid JSON request.',
      });
    }
    res.status(400).set('Cache-Control', 'no-store').type('text').send('Invalid request.');
  });

  return app;
}

function sameOrigin(value, expected) {
  try {
    return new URL(value).origin === expected;
  } catch {
    return false;
  }
}
