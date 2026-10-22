import { isIP } from 'node:net';

function normalizeIp(value) {
  if (typeof value !== 'string') return null;
  const address = value.trim();
  if (address.includes('%') || !isIP(address)) return null;

  if (address.toLowerCase().startsWith('::ffff:')) {
    const ipv4 = address.slice(7);
    if (isIP(ipv4) === 4) return ipv4;
  }
  return address;
}

export function getClientIp(req, source) {
  if (!req || typeof req !== 'object') return null;
  if (source === 'socket') return normalizeIp(req.socket?.remoteAddress);
  if (source !== 'x-real-ip') return null;

  let count = 0;
  const rawHeaders = Array.isArray(req.rawHeaders) ? req.rawHeaders : [];
  for (let i = 0; i < rawHeaders.length; i += 2) {
    if (typeof rawHeaders[i] === 'string' && rawHeaders[i].toLowerCase() === 'x-real-ip') count += 1;
  }
  if (count !== 1) return null;

  return normalizeIp(req.headers?.['x-real-ip']);
}
