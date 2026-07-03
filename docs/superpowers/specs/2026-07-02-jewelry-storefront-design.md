# VIRIDIAN — Jewelry Storefront UI Design

**Date:** 2026-07-02
**Status:** Approved for implementation (user delegated design decisions: "improve this prompt and run")

## Goal

A complete, production-quality storefront UI for a prospective fine-jewelry business.
Placeholder brand: **VIRIDIAN** (viridian = a deep blue-green pigment; ties the name to
the palette). Easy to rename later — the brand name appears only in shared partials.

## Original request

> Complete UI for a friend's prospective jewelry business. Black, white, and dark-green
> color scheme. Smooth scrolling and high-tech hover animations, professional, clean,
> minimalistic, feels like a jewelry product store. Handcrafted, not AI-generated.
> Prioritize UI performance and speed.

## Approach decision

Three approaches considered:

1. **Hand-authored static HTML/CSS/vanilla JS** *(chosen)* — zero dependencies, zero
   build step, fastest possible load, deployable anywhere (Netlify/GitHub Pages/any
   host), and genuinely handcrafted. Best match for "performance and speed" and
   "handcrafted, not AI-generated."
2. Next.js + Tailwind + Framer Motion — componentized but ships a framework payload a
   brochure site doesn't need; Tailwind utility soup reads templated. Rejected.
3. Astro — static output but adds a toolchain a prospective business doesn't need yet.
   Rejected.

## Pages

| File | Purpose |
|---|---|
| `index.html` | Home — hero, collections teaser, featured pieces, craft story, CTA |
| `collections.html` | Shop grid with client-side category filter |
| `product.html` | Product detail template (one exemplar piece) |
| `about.html` | Maison story, materials, craftsmanship |
| `contact.html` | Contact / appointment form (front-end only) |

Shared: `css/main.css`, `js/main.js`, inline SVG artwork per page.

## Art direction

- **Palette:** jewel-box black `#0A0C0B` (green undertone, like velvet case
  lining); warm ivory `#EFEDE6`; deep emerald `#0E3D2B` (signature), jade
  `#2E6B52` (hover); sage/moss muted text tones. **No gold anywhere** — the
  all-green metal stance is a deliberate brand choice that separates the site
  from gold-accented luxury templates. Contrast-checked for WCAG AA.
- **Type:** DM Serif Display (didone character with hairlines sturdy enough
  for light grounds — Bodoni Moda proved unreadable on ivory and survives only
  as a tiny `text=VIRIDAN` subset for the wordmark) + Jost (Futura-like
  geometric sans for body and letter-spaced uppercase micro-labels). Google
  Fonts with preconnect + `display: swap`.
- **Signature element:** every piece is an atelier drawing that draws itself —
  stroke-dashoffset choreography on scroll (`pathLength="1"` normalization).
  Products carry reference codes (`Ref. VR-011`) and vitrine framing — real
  jewelry-catalogue vernacular used structurally. No marquee, no `01/02/03`
  decoration (numerals only where content is truly sequential, e.g. the
  three-step craft process).
- **Imagery:** bespoke fine-line SVG illustrations of jewelry (rings, necklaces,
  earrings, bracelets) drawn for this site. No stock photos, no external image
  requests, no broken links, instant paint.
- **Layout:** generous whitespace, asymmetric editorial grids, hairline rules,
  oversized serif numerals/headlines, alternating dark/light sections.

## Interaction design

- Smooth scrolling: CSS `scroll-behavior: smooth` + eased anchor scrolling.
- Scroll choreography: IntersectionObserver adds `.is-visible`; CSS handles
  staggered fade/rise/clip reveals. Transform/opacity only.
- Custom cursor: small dot + trailing ring; ring expands over links/buttons/cards.
  Hidden on touch devices and under `prefers-reduced-motion` / `pointer: coarse`.
- Hover states: magnetic buttons (subtle translate toward pointer), product cards
  with lift + specular shine sweep + price/CTA reveal, animated link underlines,
  nav items with letter-spacing ease.
- Subtle hero parallax (rAF, transform-only), marquee strip of maison values.
- Full `prefers-reduced-motion` fallback: all motion collapses to opacity or none.

## Performance budget

- 0 JS dependencies, 0 CSS frameworks, 0 raster images.
- ≤2 font families; preconnect; `font-display: swap`.
- Passive scroll listeners, rAF batching, `will-change` only where measured useful.
- Semantic landmarks, keyboard focus states, skip link.

## Error handling / testing

Static site: no runtime errors to handle beyond JS feature-guards
(`IntersectionObserver` guard degrades to visible content). Verification: serve
locally, check each page renders, links resolve, filter works, reduced-motion
honored.

## Addendum — commerce layer & backend (2026-07-02, v5)

The storefront is now a complete system rather than a brochure:

- **Bag**: `js/store.js` owns all state and transport. Items live in
  localStorage (`frozi-bag-v1`) as `{ref, size, qty}`, re-normalized on
  every read (registry-validated refs, digit-only sizes, qty 1–9) so
  nothing hand-edited can reach markup. Header shows a Bag link with a
  count badge on every page.
- **Checkout**: `bag.html` — request-invoice flow (fine-jewelry pattern:
  nothing charged online). Issues an `FZ-` ledger reference on submit.
- **Transport**: one constant (`API_BASE` in store.js). Empty → submissions
  compose a structured mail to the atelier (works on GitHub Pages today).
  Set → POST JSON to `backend/worker.js`, a Cloudflare Worker that
  validates, honeypot-filters, stores to KV, and optionally forwards via
  Resend. Deploy guide in `backend/README.md`.
- **404.html**: branded "Not in the ledger" page (GitHub Pages serves it
  automatically).
- Gotcha for posterity: the `hidden` attribute loses to any class-set
  `display`; a global `[hidden]{display:none!important}` guard now exists.

## Addendum — scroll choreography (2026-07-03, v6)

One rAF scroll frame in main.js drives every scroll-linked layer; all writes
are transform/translate/scale/opacity. Independent `translate`/`scale` CSS
properties are used wherever a class already owns `transform` (hover zooms,
reveal settles) so effects compose instead of fighting.

- Hero cinematic exit: copy rises at 0.38x and dissolves (quadratic), photo
  container scales to 1.10, scroll cue fades first.
- Inner-image parallax: `.img-frame` (except `.stage-photo`) and
  `.category-tile` photos drift inside their crops; `style.scale = 1.12`
  provides the bleed.
- Scroll-scrubbed ledger plate (signature): `.scrub-plate .sd` paths in the
  method section draw stroke-by-stroke with section progress, staggered by
  index, scrubbing both directions. Reduced motion forces them drawn.
- Ghost ref ticker (collections intro): giant hairline-stroked ref codes
  drift against scroll; `.page-intro--ledger` reserves a bottom band so the
  strokes never cross the lede.
- Deep-zoom settle: `data-parallax-zoom` layers scale 1.12 -> 1 across their
  viewport travel (quote bg + all page intros).
- Velocity shear: `.vitrine-media` skews up to 1.8deg with smoothed scroll
  velocity, settling via self-scheduled rAF frames (fine pointers only).
- Headless-testing note: anchor-fragment URLs screenshot as unpainted black
  in this Chrome headless setup — extract sections to a standalone page to
  verify instead.
