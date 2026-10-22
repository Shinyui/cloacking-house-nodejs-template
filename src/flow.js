import { readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { defaultTreeAdapter, parse, serialize } from 'parse5';

const successCodes = new Set([200, 201, 204, 206]);
const subscriptionErrors = new Set(['subscription_expired', 'flow_deleted', 'flow_banned']);

export class FlowError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

export function buildRequestData(req, label, ip) {
  const queryIndex = req.originalUrl.indexOf('?');
  return new URLSearchParams({
    label,
    user_agent: req.get('user-agent') ?? '',
    referer: req.get('referer') ?? '',
    query: queryIndex < 0 ? '' : req.originalUrl.slice(queryIndex + 1),
    lang: req.get('accept-language') ?? '',
    ip_address: ip,
  });
}

export async function checkVisitor(config, data, fetchImpl = fetch) {
  const signal = AbortSignal.timeout(config.apiTimeoutMs);
  let response;
  try {
    response = await fetchImpl(config.apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: data.toString(),
      redirect: 'manual',
      signal,
    });
  } catch {
    throw new FlowError(signal.aborted ? 'api_timeout' : 'api_unavailable');
  }

  if (!successCodes.has(response.status)) {
    await response.body?.cancel();
    throw new FlowError('api_http_error');
  }

  try {
    return await response.json();
  } catch {
    throw new FlowError(signal.aborted ? 'api_timeout' : 'invalid_api_json');
  }
}

function absoluteUrl(target) {
  try {
    return new URL(target);
  } catch {
    return null;
  }
}

function assertHttpUrl(url) {
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new FlowError('unsupported_page_url');
  }
}

export async function readLocalPage(config, target) {
  if (typeof target !== 'string' || !['.html', '.htm'].includes(path.extname(target).toLowerCase())) {
    throw new FlowError('unsupported_local_page');
  }

  try {
    const pagesRoot = await realpath(config.pagesDir);
    const filename = await realpath(path.resolve(config.rootDir, target));
    const relative = path.relative(pagesRoot, filename);
    if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
      throw new FlowError('local_page_outside_pages');
    }
    if (!['.html', '.htm'].includes(path.extname(filename).toLowerCase())) {
      throw new FlowError('unsupported_local_page');
    }
    return await readFile(filename);
  } catch (error) {
    if (error instanceof FlowError) throw error;
    throw new FlowError('local_page_unavailable');
  }
}

function addBase(html, href) {
  const document = parse(html);
  const root = document.childNodes.find((node) => node.tagName === 'html');
  const head = root.childNodes.find((node) => node.tagName === 'head');
  const base = defaultTreeAdapter.createElement('base', 'http://www.w3.org/1999/xhtml', [
    { name: 'href', value: href },
  ]);
  if (head.childNodes.length) {
    defaultTreeAdapter.insertBefore(head, base, head.childNodes[0]);
  } else {
    defaultTreeAdapter.appendChild(head, base);
  }
  return serialize(document);
}

async function loadRemotePage(config, url, userAgent, fetchImpl) {
  assertHttpUrl(url);
  const signal = AbortSignal.timeout(config.pageTimeoutMs);
  try {
    const response = await fetchImpl(url.href, {
      headers: { 'User-Agent': userAgent },
      redirect: 'follow',
      signal,
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new FlowError('remote_page_http_error');
    }
    return addBase(await response.text(), url.href);
  } catch (error) {
    if (error instanceof FlowError) throw error;
    throw new FlowError(signal.aborted ? 'remote_page_timeout' : 'remote_page_unavailable');
  }
}

function browserTarget(target) {
  if (/[\u0000-\u0020\u007f]/u.test(target)) throw new FlowError('invalid_browser_target');
  let url;
  try {
    url = new URL(target, 'https://relative-target.invalid/');
  } catch {
    throw new FlowError('invalid_browser_target');
  }
  assertHttpUrl(url);
  return target;
}

function escapeAttribute(value) {
  return value.replace(/[&<>"']/gu, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

function iframePage(target) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Offer</title><style>html,body{height:100%;padding:0;margin:0}iframe{display:block;width:100%;height:100%;border:0}</style></head><body><iframe title="Offer" src="${escapeAttribute(target)}" width="100%" height="100%"></iframe></body></html>`;
}

export async function resolveDecision(config, body, userAgent, fetchImpl = fetch) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new FlowError('invalid_api_body');
  }
  if (subscriptionErrors.has(body.filter_type)) throw new FlowError(body.filter_type);
  if (![body.url_white_page, body.url_offer_page].every((value) => typeof value === 'string' && value.trim())) {
    throw new FlowError('missing_page_configuration');
  }

  const page = body.filter_page;
  if (!['white', 'offer'].includes(page)) throw new FlowError('invalid_filter_page');
  const target = body[`url_${page}_page`];
  const mode = body[`mode_${page}_page`];

  if (mode === 'loading') {
    const url = absoluteUrl(target);
    const html = url
      ? await loadRemotePage(config, url, userAgent, fetchImpl)
      : await readLocalPage(config, target);
    return { page, mode, html };
  }
  if (mode === 'redirect') return { page, mode, target: browserTarget(target) };
  if (page === 'offer' && mode === 'iframe') {
    return { page, mode, html: iframePage(browserTarget(target)) };
  }
  throw new FlowError('unsupported_page_mode');
}
