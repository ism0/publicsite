'use strict';
// Network requests are made straight from the visitor's browser. No cookies, no referrer.

const MAX_BYTES = 3 * 1024 * 1024;

async function fetchWithTimeout(url, ms = 15000) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), ms);
  try {
    return await fetch(url, {
      mode: 'cors',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      signal: ac.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

/** Accepts only http(s) addresses. Adds https:// if the protocol is missing. */
function safeUrl(input) {
  let s = String(input || '').trim();
  if (!s) return null;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(s)) s = 'https://' + s;
  try {
    const u = new URL(s);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u : null;
  } catch {
    return null;
  }
}
