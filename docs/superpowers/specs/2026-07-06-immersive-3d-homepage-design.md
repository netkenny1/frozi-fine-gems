# Into the Stone — immersive 3D scroll homepage

**Date:** 2026-07-06
**Status:** Approved
**Decisions made with user:** homepage rebuild (not a side page, not the whole
site) · journey = "into the stone" · engine = Three.js self-hosted, scroll rig
hand-rolled.

## Concept

`index.html` becomes a single continuous scroll journey into the maison's
emerald. The visitor starts in darkness facing the stone, travels through a
crown facet into its green interior, meets the maison's story, drawings, and
the four featured pieces suspended in the depth, and emerges out the pavilion
to the appointment CTA. Scroll is never hijacked: native scrollbar, camera
smoothed toward scroll position. Scroll velocity feeds the world (particle
streaking, light stir).

The rest of the site (collections, product, bag, about, contact, 404) is
untouched. Header/nav/bag remain live DOM over the canvas. The existing
view-transition morph from vitrine photo → product stage must keep working
from the 3D vitrine chapter.

## The six chapters (scroll timeline over ~800vh)

| # | Range | Scene | DOM copy |
|---|-------|-------|----------|
| 1 | 0–10% | Small emerald center-frame, one glint, particles idle | Eyebrow + "Fine jewelry, quietly made" + lede + CTA buttons; scroll cue |
| 2 | 10–25% | Camera flies in; stone grows to fill frame; facet approaches | Hero copy parallaxes up and dissolves |
| 3 | 25–40% | Pass through the crown facet: refraction flash, caustic shimmer, green fog | "A small house with a deep green" floats past in depth |
| 4 | 40–60% | Ledger drawings (existing SVG plates as line-art textures) drift in parallax layers | Method copy: drawn first, then made (3 steps) |
| 5 | 60–80% | Four vitrine plates (product JPGs, lit, floating) glide past; raycast hover tilts, click → product.html?ref=… | Piece names/prices anchored to plates |
| 6 | 80–100% | Exit through pavilion; stone recedes to a point behind | Appointment CTA; normal footer below |

## Architecture

- `vendor/three.module.min.js` — pinned Three.js (r1xx), committed to the
  repo. No CDN. Footer "no trackers, no cookies" claim remains true.
- `js/immersive.js` — ES module. Owns: scene graph, emerald mesh (same
  procedural step-cut as js/gem.js), interior groups (facet tunnel, plate
  sprites, vitrine plates), particle motes (InstancedMesh), camera on a
  Catmull-Rom spline scrubbed by smoothed scroll progress, pointer parallax,
  raycaster hover for vitrines, UnrealBloom + vignette post, DPR cap 1.75.
- `index.html` — fixed full-viewport canvas behind a normal document flow of
  `.chapter` sections (total height drives scroll length). All copy is real
  DOM: selectable, accessible, SEO-intact. The scroll rig positions/fades
  chapters; without JS/WebGL they render as a clean stacked page.
- Scroll rig (hand-rolled, in immersive.js): `target = scrollY / max`;
  `progress += (target - progress) * k` per frame; chapter windows map
  progress → camera spline t, opacities, scene events. Velocity =
  d(progress)/frame feeds particle streak + light stir.

## Interaction inventory

- Scroll: camera travel, chapter copy fade/translate, stone rotation, fog
  density, light orbit.
- Scroll velocity: particle streak length/speed, facet shimmer pulse.
- Pointer: subtle camera parallax everywhere; raycast hover on vitrine plates
  (tilt toward pointer + glow + cursor change); click navigates to product
  page (View Transition morph still fires — plate img is a DOM overlay at
  click time or the plate maps to a hidden DOM img named `piece`).
- Click on the stone in chapter 1: the walking-light orbit (ported from
  gem.js).

## Performance & fallbacks

- Budget: 60fps desktop, 40+ mobile. Low-poly geometry, one bloom pass,
  existing JPGs downsized to ≤1024px textures, instanced particles.
- Mobile: full experience, reduced particle count and bloom resolution.
- No WebGL: canvas never mounts; chapters render as a static stacked page.
- `prefers-reduced-motion`: same static stacked page, no scroll scrubbing.
- First paint: chapter 1 DOM paints immediately; scene initializes behind it
  and fades in.

## Out of scope

- Other pages joining the 3D world.
- Sound.
- Replacing gem.js on 404/about (they stay as-is).

## Verification

Playwright scroll-through: screenshots at each chapter midpoint; JS error
watch; rAF frame-pacing sample; hover + click a vitrine plate → lands on
product.html with correct ref; bag flow unaffected; fallback render with
WebGL disabled; reduced-motion render; Lighthouse sanity on first paint.
