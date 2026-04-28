# edumileage.app marketing site

Marketing website for **EDU Mileage+**, the iOS app. Built with Astro + Tailwind. Deploys to Cloudflare Workers (Static Assets) on push to `main`.

## Local development

```bash
npm install
npm run dev      # http://localhost:4321
```

## Build

```bash
npm run build    # outputs to ./dist
npm run preview  # serves the production build locally
```

## Deployment

Connected to Cloudflare Workers via Git integration on `dreaves-paprika/edumileage-app-site`. Cloudflare auto-builds on push to `main`.

Cloudflare build settings should be:

- **Build command:** `npm run build`
- **Build output directory:** `dist`
- **Root directory:** *(leave default)*

The site serves at https://edumileage.app and https://www.edumileage.app via custom domain bindings on the Worker.

## Project structure

```
src/
  components/      # Astro components, one per section
  layouts/         # Base HTML layout
  pages/
    index.astro    # The single marketing page
public/
  screenshots/     # iPhone 6.9" screenshots from the app
  video/           # Demo-final.mov (App Preview)
  icon.png         # 1024×1024 app icon
  favicon.png      # 256×256 favicon
```

## Sections (in order)

1. **Hero** — headline + value prop + autoplay video + CTA
2. **AudienceClarity** — who the app is for
3. **LeadFeatures** — three lead features with screenshots
4. **HowItWorks** — three-step explanation
5. **SecondaryFeatures** — eight feature cards
6. **Pricing** — Monthly + Annual + add-on note
7. **FAQ** — twelve questions mirrored from the app's `HelpContent.swift`
8. **CTA** — email capture for launch notification
9. **Footer** — links to support/privacy/contact

## Email capture

The CTA form posts to `/api/notify`, handled by the Worker entry at `src/worker.ts`. Submissions are written to the Cloudflare KV namespace `edumileage-waitlist` (id `459b678b89e3436eb5cea10d3a6d86cf`).

Hardening in place:
- Origin / Referer must match `edumileage.app` or `www.edumileage.app`
- Per-IP rate limit: one submission per 30 seconds (KV TTL)
- Honeypot field (`name="website"`) silently rejects naive bots
- Body capped at 2 KB
- All responses get HSTS, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, `X-Frame-Options`

Inspecting submissions:
```bash
# CLI
npx wrangler kv:key list --namespace-id=459b678b89e3436eb5cea10d3a6d86cf

# Or via dashboard:
# Cloudflare → Workers & Pages → Storage & Databases → KV → edumileage-waitlist
```

## Asset generation scripts

Re-run these after updating the icon, headline, or screenshots:

```bash
node scripts/generate-og.mjs           # public/og-image.png (1200x630)
node scripts/optimize-screenshots.mjs  # public/screenshots/*.png -> .webp
```

## Cloudflare deployment configuration

Build configuration set in the Cloudflare dashboard:

| Field | Value |
|---|---|
| Build command | `npm run build` |
| Deploy command | `npm run build && npx wrangler deploy` |
| Root directory | (default) |

`wrangler.jsonc` declares the entry point (`src/worker.ts`), the static assets directory (`./dist`), the KV binding (`WAITLIST`), and `nodejs_compat` for the Worker runtime.
