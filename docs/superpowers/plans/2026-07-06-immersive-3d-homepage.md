# Into the Stone — Immersive 3D Homepage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild `index.html` as a scroll-driven 3D journey into the maison's emerald, per the approved spec `docs/superpowers/specs/2026-07-06-immersive-3d-homepage-design.md`.

**Architecture:** A fixed full-viewport Three.js canvas renders one continuous scene (emerald exterior → interior world → emergence) whose camera is scrubbed along a spline by smoothed native scroll. All copy is real DOM in six `.chapter` sections that double as the no-WebGL/reduced-motion fallback page. Post-processing is a hand-rolled bright→blur→composite chain on Three render targets (no addon files).

**Tech Stack:** Three.js r170 (self-hosted ES module, the only dependency), hand-rolled scroll rig, existing site CSS tokens, Playwright (global install, `channel: 'chrome'`) for verification.

## Global Constraints

- No CDN, no network calls at runtime beyond same-origin assets and Google Fonts (already present site-wide). Three.js is committed to the repo.
- Footer claim "Site hand-built. No trackers, no cookies." must remain true.
- Native scroll only — never `preventDefault` wheel/touch, no scroll hijack.
- All motion gated: no WebGL **or** `prefers-reduced-motion: reduce` → canvas never mounts, chapters render as a normal stacked page.
- Every other page (collections, product, bag, about, contact, 404) untouched except where this plan says otherwise. `js/gem.js` untouched.
- The view-transition morph (`viewTransitionName = "piece"`, set on click in `js/main.js`) must still fire when clicking a vitrine in chapter 5.
- Palette/type tokens from `css/main.css` (`--noir #0a0c0b`, `--ivory #f1efe8`, `--emerald #0e3d2b`, `--jade #2e6b52`, `--jade-bright #4a9174`, `--sage #aabdb2`, DM Serif Display / Jost) are the only colors and faces.
- DPR cap 1.75. Product textures from existing `assets/img/*.jpg`.
- Verify in a real browser (Playwright, `channel: 'chrome'`, import path `/opt/homebrew/lib/node_modules/playwright/index.mjs`) with the local server `python3 -m http.server 8642` from repo root.

---

### Task 1: Vendor Three.js

**Files:**
- Create: `vendor/three.module.min.js`
- Create: `vendor/LICENSE-three.md`

**Interfaces:**
- Produces: importable module at `/vendor/three.module.min.js` exposing the standard Three.js r170 namespace (`Scene`, `PerspectiveCamera`, `WebGLRenderer`, `ShaderMaterial`, `BufferGeometry`, `InstancedMesh`, `CatmullRomCurve3`, `Raycaster`, `WebGLRenderTarget`, `TextureLoader`, `CanvasTexture`).

- [ ] **Step 1: Download pinned Three.js and its license**

```bash
mkdir -p vendor
curl -fsSL https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.min.js -o vendor/three.module.min.js
curl -fsSL https://cdn.jsdelivr.net/npm/three@0.170.0/LICENSE -o vendor/LICENSE-three.md
ls -la vendor/
```
Expected: `three.module.min.js` ≈ 650–700 KB, license MIT.

- [ ] **Step 2: Smoke-test the module loads in a real browser**

Create `/tmp`-scratch test page not committed — or inline check:

```bash
python3 -m http.server 8642 > /dev/null 2>&1 &
sleep 1
cat > /tmp/three-smoke.mjs <<'EOF'
import { chromium } from '/opt/homebrew/lib/node_modules/playwright/index.mjs';
const b = await chromium.launch({ channel: 'chrome', headless: true });
const p = await b.newPage();
const r = await p.evaluate(async () => {
  const THREE = await import('http://localhost:8642/vendor/three.module.min.js');
  return THREE.REVISION;
});
console.log('THREE revision:', r);
await b.close();
EOF
node /tmp/three-smoke.mjs
```
Expected: `THREE revision: 170`.

- [ ] **Step 3: Commit**

```bash
git add vendor/
git commit -m "Vendor Three.js r170 (self-hosted, MIT)"
```

---

### Task 2: Chapter DOM + fallback page in index.html

Rebuild `index.html` body as six chapters that read as a complete page with no JS at all. This is both the immersive overlay content and the universal fallback.

**Files:**
- Modify: `index.html` (replace `<main>` content; keep `<head>`, header, footer, intro-curtain markup, and script tags; add `js/immersive.js` as `<script type="module">`)
- Modify: `css/main.css` (append an `/* ---- Into the stone (immersive home) ---- */` section)

**Interfaces:**
- Produces: `<canvas class="world" data-world hidden>` fixed behind content; `<div class="chapters">` containing `section.chapter[data-chapter="1..6"]`; body class `is-immersive` added by JS only when the 3D world mounts (CSS keys off it).
- Chapter content (real copy, reusing current homepage copy):
  1. hero: eyebrow "Fine jewelry · Made to order", h1 "Fine jewelry, *quietly* made.", current lede, buttons (collection + story), scroll cue
  2. transition chapter — no copy (spacer, `aria-hidden`)
  3. "A small house with a *deep* green." + viridian line (from about intro, abridged)
  4. method: "Drawn first, *then* made" + the three process steps (copy from current homepage)
  5. vitrines: the four featured pieces as `article.vitrine-plate` each containing `a[href="product.html?ref=FG-0xx"]`, `img` (existing jpg), name, price. These elements are used BOTH as fallback cards and as the click/hover targets over the 3D plates.
  6. CTA: "The atelier sees six clients a week. *Take an hour of it.*" + button

**Key CSS contract (append to main.css):**

```css
/* ---- Into the stone (immersive home) ---- */
.world { position: fixed; inset: 0; z-index: 0; }
.chapters { position: relative; z-index: 1; }
.chapter { min-height: 100vh; display: grid; align-content: center; }
/* fallback mode (default): chapters stack and read normally */
/* immersive mode: JS adds body.is-immersive; chapters become taller scroll
   runway and copy blocks fade via [data-cprog] set from JS */
body.is-immersive .chapter { min-height: 130vh; }
body.is-immersive .chapter-copy { opacity: var(--cop, 0); translate: 0 calc((1 - var(--cop, 0)) * 2rem); }
```

- [ ] **Step 1: Write the failing check** — Playwright script `scratchpad/immersive-test.mjs` asserting: `/index.html` has 6 `.chapter` sections, all copy visible with JS-created canvas absent when `reducedMotion: 'reduce'`, vitrine links point at the 4 refs, no console errors.
- [ ] **Step 2: Run it** — Expected: FAIL (chapters don't exist yet).
- [ ] **Step 3: Rewrite `index.html` `<main>` + append CSS section** per the interface above. Keep hero photo? No — chapter 1 in fallback shows the noir background with copy (the photography stays on interior pages). Keep the existing intro curtain markup and `.progress`.
- [ ] **Step 4: Re-run check + eyeball screenshots** of fallback (reduced-motion context) at top/middle/bottom. Expected: PASS, page reads cleanly as a stacked page.
- [ ] **Step 5: Commit** — `git commit -m "Immersive home: chapter DOM doubles as universal fallback"`

---

### Task 3: immersive.js skeleton — mount guard, renderer, scroll rig

**Files:**
- Create: `js/immersive.js`
- Modify: `index.html` (add `<script type="module" src="js/immersive.js"></script>`)

**Interfaces:**
- Produces (module-internal, later tasks extend this file):
  - `const rig = { target: 0, progress: 0, velocity: 0 }` updated per frame: `rig.target = scrollY / (docHeight - vh)`, `rig.progress += (rig.target - rig.progress) * 0.07`, `rig.velocity = rig.progress - prev`.
  - `function chapterWindow(p, start, end)` → returns 0..1 progress inside a window with 0 outside: `Math.min(Math.max((p - start) / (end - start), 0), 1)`.
  - `const CHAPTERS = [{el, start: 0.00, end: 0.10}, {el, 0.10, 0.25}, …]` matching spec table; each frame sets `el.style.setProperty('--cop', fade)` where `fade` peaks mid-window (`Math.sin(Math.PI * w)` clamped).
  - Scene/camera/renderer singletons; `mount()` returns false without WebGL or with reduced motion.

- [ ] **Step 1: Mount guard + renderer + a placeholder spinning icosahedron + rig wired to chapter copy fades.** Body gets `is-immersive`; canvas `hidden` removed; camera at z=6 looking at origin.
- [ ] **Step 2: Extend `scratchpad/immersive-test.mjs`:** with normal motion, expect `body.is-immersive`, visible canvas, and `--cop` on chapter 1 near 1 at top and near 0 after scrolling to 30%; with reduced motion expect no `is-immersive`. Run. Expected: PASS.
- [ ] **Step 3: Commit** — `"Immersive home: module skeleton, mount guard, scroll rig"`

---

### Task 4: The emerald and the post chain

**Files:**
- Modify: `js/immersive.js`

**Interfaces:**
- Produces: `buildEmerald()` → `THREE.Mesh` with `BufferGeometry` from the exact ring/tri generator in `js/gem.js:117-152` (same constants) and a `ShaderMaterial` whose GLSL is the `GEM_FS`/`GEM_VS` bodies from `js/gem.js:24-77` adapted to Three built-ins (`modelMatrix`, `viewMatrix`, `projectionMatrix`, `cameraPosition`; keep uniforms `uKey`, `uOrbit`, `uAmp`).
- Produces: `post` — object with `render(scene, camera)` doing: scene→`rtScene` (fullres, depth) → bright-pass→`rtA` (¼) → blurH→`rtB` → blurV→`rtA` → composite (scene + dispersed bloom, shaders ported from `js/gem.js:79-113`) to screen via a fullscreen-triangle `ShaderMaterial` and an orthographic camera. All render targets `THREE.WebGLRenderTarget` with `LinearFilter`/`ClampToEdgeWrapping`; resized on window resize with DPR ≤ 1.75.

- [ ] **Step 1: Replace the icosahedron with `buildEmerald()`; add the walking-light click orbit (raycast the stone, set `uOrbit` timeline exactly as `js/gem.js:296-303`).**
- [ ] **Step 2: Add the post chain.** Verify bloom visually: screenshot at chapter 1 while `uAmp > 0` shows a glowing facet halo.
- [ ] **Step 3: Screenshot compare against the 404 stone for material parity; fix until at least as good. No console errors. Commit** — `"Immersive home: the emerald and the bloom chain"`

---

### Task 5: Camera spline + the six-chapter travel

**Files:**
- Modify: `js/immersive.js`

**Interfaces:**
- Produces: `const path = new THREE.CatmullRomCurve3([...])` with control points staged per spec: `(0,0.3,6.5) → (0,0.25,3.2) → (0,0.15,1.1) → (0,0,-0.4) → (0,-0.1,-2.2) → (0,-0.2,-4.5) → (0,0.1,-8)`; per frame `path.getPointAt(easeInOut(rig.progress))` positions the camera; lookAt eases from the stone (chapters 1–2) to path-tangent (3–6) via a mix factor from `chapterWindow(p, .18, .3)`.
- Produces: fog `THREE.FogExp2(0x07130d)` whose density ramps in chapter 3 window and out in chapter 6; stone `renderOrder`/material `side: THREE.BackSide` clone so the interior reads as green facet walls while inside (the pass-through: at `p≈0.27` the exterior mesh swaps visibility to an inverted-normal interior shell).

- [ ] **Step 1: Implement path + lookAt + fog + interior shell.**
- [ ] **Step 2: Verify with a scripted scroll-through:** screenshots at p = 0.05/0.17/0.32/0.5/0.7/0.92 named `ch1..ch6.png`; each must differ (compare bytes) and none black/blank; zero console errors. Eyeball every one.
- [ ] **Step 3: Commit** — `"Immersive home: camera spline through the stone"`

---

### Task 6: The interior world — particles, ledger plates

**Files:**
- Modify: `js/immersive.js`

**Interfaces:**
- Produces: `buildMotes()` → `THREE.InstancedMesh` (plane sprites, additive, ~400 desktop / 150 mobile via `navigator.maxTouchPoints` heuristic) distributed in a tube along the path from p .25–.85; per frame each mote drifts slowly; scale.y stretches with `Math.min(Math.abs(rig.velocity) * 400, 6)` (velocity streaks).
- Produces: `buildPlates()` → `THREE.Group` of 3 line-art planes at path p ≈ .45/.5/.55, offset alternating left/right. Textures via `THREE.CanvasTexture` from drawing the three existing plate SVG path sets (copy the `d` attributes from `about.html:60-79` / `product.html:49-75`) onto 512² canvases with `strokeStyle = '#2e6b52'`.

- [ ] **Step 1: Implement motes + plates; wire velocity streaks.**
- [ ] **Step 2: Scroll-through screenshots again; chapter 4 must show plates beside the method copy; fast-scroll screenshot shows streaked motes. Commit** — `"Immersive home: motes and ledger plates in the depths"`

---

### Task 7: The vitrines in the depth (chapter 5)

**Files:**
- Modify: `js/immersive.js`
- Modify: `css/main.css` (chapter-5 DOM cards become screen-anchored labels in immersive mode)

**Interfaces:**
- Consumes: `.vitrine-plate` DOM (Task 2) — in immersive mode each card's `img` becomes a `THREE.Mesh` plane (TextureLoader on the same src, 1.2×1.5 units) placed at path p ≈ .62/.67/.72/.77 alternating sides; the DOM card itself is repositioned each frame to its plate's projected screen position (name+price label) and is the actual `<a>` the user clicks.
- Produces: raycast hover → plate tilts toward pointer (lerp rotation ±0.12 rad) + emissive lift + `cursor: pointer`; the DOM label gets `.is-hot`. Because the click lands on the real DOM `<a>` wrapping the real `<img>`, `js/main.js`'s existing view-transition naming fires unchanged.

- [ ] **Step 1: Implement plates + label projection + raycast hover.**
- [ ] **Step 2: Verify:** hover screenshot shows tilt+glow; click navigates to `product.html?ref=FG-011`; assert the clicked DOM img had `viewTransitionName === 'piece'` before navigation (same technique as the earlier motion test). Commit — `"Immersive home: vitrines suspended in the stone"`

---

### Task 8: Emergence, polish, performance, ship

**Files:**
- Modify: `js/immersive.js`, `css/main.css`, `index.html` (only if copy tweaks needed)

**Interfaces:**
- Produces: chapter 6 — camera exits, stone (exterior mesh) re-fades in behind at small scale; CTA copy fades up; pointer parallax (camera offset ≤0.15 units, lerped) active in every chapter; scroll cue fades by p=0.06.

- [ ] **Step 1: Emergence + pointer parallax + idle glint timer (reuse orbit).**
- [ ] **Step 2: Performance pass:** rAF frame-time sampler in the test (main-thread mean < 12ms over 300 frames while auto-scrolling at 1440×900); check `renderer.info.render.calls` < 40; texture sizes ≤ 1024.
- [ ] **Step 3: Full verification suite** (extend `scratchpad/immersive-test.mjs`): six-chapter screenshots, hover/click vitrine → product ref correct, bag badge still works site-wide, fallback (reduced-motion) full-page screenshot, no-WebGL context simulated via `--disable-webgl` launch arg → fallback renders, zero page errors everywhere. Eyeball all screenshots.
- [ ] **Step 4: Commit** — `"Immersive home: emergence, parallax, performance pass"` — then push to main (deploys) after user sees it locally.

---

## Self-review notes

- Spec coverage: chapters 1–6 (Tasks 4–8), scroll rig + velocity (3, 6), DOM-first fallback (2), Three vendored (1), VT morph preserved (7), perf/fallback verification (8). Sound: out of scope per spec. ✓
- Chapter-2 copy is a spacer by design (spec: hero dissolves during approach).
- The old homepage sections (quote band, category tiles) are consciously absent — the spec's six chapters replace them; collection page still carries categories.
