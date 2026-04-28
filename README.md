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

The CTA form posts to `https://formspree.io/f/REPLACE_ME`. You'll need to create a Formspree form (or any other form provider — Web3Forms, Netlify Forms, custom Worker, etc.) and replace the placeholder in `src/components/CTA.astro`.
