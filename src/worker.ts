/**
 * Cloudflare Worker entry — handles /api/notify POST for the launch
 * waitlist and proxies everything else to the static asset bundle
 * built by Astro into ./dist.
 */

interface Env {
  ASSETS: Fetcher;
  WAITLIST: KVNamespace;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/api/notify' && request.method === 'POST') {
      return handleNotify(request, env);
    }

    return env.ASSETS.fetch(request);
  },
};

async function handleNotify(request: Request, env: Env): Promise<Response> {
  let email = '';

  try {
    const formData = await request.formData();
    const raw = formData.get('email');
    if (typeof raw === 'string') email = raw.trim().toLowerCase();
  } catch {
    return redirect(request.url, '?notified=error');
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

  return redirect(request.url, '?notified=ok#cta');
}

function redirect(currentUrl: string, search: string): Response {
  const dest = new URL(currentUrl);
  dest.pathname = '/';
  dest.search = search.startsWith('?') ? search.split('#')[0] : '';
  if (search.includes('#')) dest.hash = search.split('#')[1];
  return Response.redirect(dest.toString(), 303);
}
