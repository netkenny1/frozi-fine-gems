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
- **Type:** Bodoni Moda (extreme-contrast Didone display — hairlines echo fine
  metalwork) + Jost (Futura-like geometric sans for body and letter-spaced
  uppercase micro-labels). Max two families, Google Fonts with preconnect +
  `display: swap`.
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
