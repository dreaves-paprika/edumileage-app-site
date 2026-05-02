/**
 * Cloudflare Worker entry — handles /api/notify POST for the launch
 * waitlist and proxies everything else to the static asset bundle
 * built by Astro into ./dist.
 *
 * Hardening:
 *  - Origin / Referer must match the site host
 *  - Per-IP rate limit (one write per 30 seconds, KV-backed)
 *  - Honeypot field rejects naive bots
 *  - Form payload capped at 2 KB
 *  - Security headers added to all responses
 */

interface Env {
  ASSETS: Fetcher;
  WAITLIST: KVNamespace;
  LOOPS_API_KEY: string;
}

const ALLOWED_HOSTS = new Set(['edumileage.app', 'www.edumileage.app']);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_BODY_BYTES = 2 * 1024;
const RATE_LIMIT_WINDOW_SECONDS = 60; // Cloudflare KV minimum TTL is 60s

const SECURITY_HEADERS: Record<string, string> = {
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'geolocation=(), camera=(), microphone=(), interest-cohort=()',
  'X-Frame-Options': 'DENY',
  // Report-Only CSP — monitoring violations before enforcement.
  // Hashes cover the two is:inline scripts (GA4 config + Clarity init).
  // Bundled Astro scripts are covered by 'self'. strict-dynamic lets hashed
  // scripts load child scripts (gtag.js, clarity.ms) without a domain allowlist.
  // https: fallback covers browsers that don't support strict-dynamic.
  'Content-Security-Policy-Report-Only':
    "default-src 'self'; " +
    "script-src 'self' " +
      "'sha256-FQ2sp7fTUWx4icCfKDESNl6O9o0Mcjs3vg8/X/+ZVGw=' " +
      "'sha256-8r49ch0nUeIbr6ZR5sZnlO2u0FCTVu/1sVAmlDHKfJw=' " +
      "'strict-dynamic' https:; " +
    "object-src 'none'; " +
    "base-uri 'none'; " +
    "frame-ancestors 'none'; " +
    "upgrade-insecure-requests;",
};

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    let response: Response;

    if (url.pathname === '/api/notify' && request.method === 'POST') {
      response = await handleNotify(request, env, ctx);
    } else {
      response = await env.ASSETS.fetch(request);
    }

    return withSecurityHeaders(response);
  },
};

async function handleNotify(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  // Origin / Referer check — both should originate from our domain.
  if (!isAllowedOrigin(request)) {
    return redirect(request.url, '?notified=error');
  }

  // Cap payload size before parsing.
  const lenHeader = request.headers.get('content-length');
  if (lenHeader && Number(lenHeader) > MAX_BODY_BYTES) {
    return redirect(request.url, '?notified=error');
  }

  // Per-IP rate limit — KV TTL key keyed by hashed IP.
  const ip = request.headers.get('cf-connecting-ip') ?? '';
  const rateKey = `ratelimit::${ip}`;
  if (ip) {
    const recent = await env.WAITLIST.get(rateKey);
    if (recent !== null) {
      return redirect(request.url, '?notified=error');
    }
  }

  let email = '';
  let honeypot = '';

  try {
    const formData = await request.formData();
    const rawEmail = formData.get('email');
    const rawHoney = formData.get('website'); // honeypot — real users leave it empty
    if (typeof rawEmail === 'string') email = rawEmail.trim().toLowerCase();
    if (typeof rawHoney === 'string') honeypot = rawHoney.trim();
  } catch {
    return redirect(request.url, '?notified=error');
  }

  // Bots fill every field; humans never see this one.
  if (honeypot.length > 0) {
    return redirect(request.url, '?notified=ok#cta');
  }

  if (!email || email.length > 320 || !EMAIL_RE.test(email)) {
    return redirect(request.url, '?notified=error');
  }

  const timestamp = new Date().toISOString();
  const cf = (request as Request & { cf?: { country?: string } }).cf ?? {};
  const record = {
    email,
    timestamp,
    country: cf.country ?? '',
    userAgent: request.headers.get('user-agent') ?? '',
    referer: request.headers.get('referer') ?? '',
  };

  // Key prefix `${timestamp}::${email}` keeps KV listing chronological
  // and makes accidental duplicates from the same address visible rather
  // than overwriting silently.
  const key = `${timestamp}::${email}`;

  try {
    await env.WAITLIST.put(key, JSON.stringify(record));
  } catch {
    return redirect(request.url, '?notified=error');
  }

  // Rate limit write is best-effort — never blocks a successful signup.
  if (ip) {
    env.WAITLIST.put(rateKey, '1', { expirationTtl: RATE_LIMIT_WINDOW_SECONDS }).catch(() => {});
  }

  // Add contact to Loops and fire waitlist_signup event.
  // waitUntil keeps the Worker alive until the fetch completes without
  // delaying the redirect response to the user.
  if (env.LOOPS_API_KEY) {
    ctx.waitUntil(
      fetch('https://app.loops.so/api/v1/events/send', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.LOOPS_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, eventName: 'waitlist_signup' }),
      }).catch(() => {}),
    );
  }

  return redirect(request.url, '?notified=ok#cta');
}

function isAllowedOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (origin) {
    try {
      const host = new URL(origin).host;
      if (ALLOWED_HOSTS.has(host)) return true;
    } catch {
      return false;
    }
  }

  const referer = request.headers.get('referer');
  if (referer) {
    try {
      const host = new URL(referer).host;
      if (ALLOWED_HOSTS.has(host)) return true;
    } catch {
      return false;
    }
  }

  return false;
}

function redirect(currentUrl: string, search: string): Response {
  const dest = new URL(currentUrl);
  dest.pathname = '/';
  dest.search = '';
  dest.hash = '';

  const queryPart = search.split('#')[0] ?? '';
  const hashPart = search.includes('#') ? search.split('#')[1] : '';

  if (queryPart && queryPart.startsWith('?')) {
    dest.search = queryPart.slice(1);
  }
  if (hashPart) {
    dest.hash = hashPart;
  }

  return Response.redirect(dest.toString(), 303);
}

function withSecurityHeaders(response: Response): Response {
  // Response.redirect returns immutable responses; clone before setting headers.
  const clone = new Response(response.body, response);
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    clone.headers.set(name, value);
  }
  return clone;
}
