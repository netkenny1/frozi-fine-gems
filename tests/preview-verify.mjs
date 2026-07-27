/* Frozi Fine Gems — production homepage verification suite.
 *
 * Drives the immersive preview homepage in headless Chrome and asserts the
 * scroll choreography, the reduced-motion/no-JS fallbacks, and mobile frame
 * budget. This is the durable replacement for the old branch-only suite.
 *
 * Prerequisites: Playwright with a Chrome channel installed
 *   npm i -g playwright && npx playwright install chrome
 *
 * Run against a local server (default http://localhost:8642):
 *   cd ~/Projects/Jewelry && python3 -m http.server 8642 &
 *   node tests/preview-verify.mjs
 *
 * Run against the deployed site:
 *   node tests/preview-verify.mjs https://netkenny1.github.io/frozi-fine-gems
 *
 * Exit code is non-zero if any check fails (CI-friendly).
 */

// Resolve Playwright whether it is installed locally or globally.
let chromium;
try {
  ({ chromium } = await import("playwright"));
} catch {
  ({ chromium } = await import(
    "/opt/homebrew/lib/node_modules/playwright/index.mjs"
  ));
}

const BASE = (process.argv[2] || "http://localhost:8642").replace(/\/$/, "");
const URL = `${BASE}/index.html`;
const INTRO_MS = 3200; // let the one-time intro curtain dismiss

let pass = 0;
let fail = 0;
function check(ok, msg) {
  console.log((ok ? "PASS " : "FAIL ") + msg);
  ok ? pass++ : fail++;
}

const browser = await chromium.launch({
  channel: "chrome",
  headless: true,
  args: ["--headless=new"],
});

/* ---- Desktop: full choreography ---------------------------------------- */
{
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(URL);
  await page.waitForTimeout(INTRO_MS);
  const VH = 900;

  check(
    (await page.locator("h1").first().innerText()).toLowerCase().includes("own valley"),
    "hero headline is rendered"
  );

  /* The hero CTAs must be hoverable/clickable over their WHOLE box: the
     decorative scroll cue used to sit on top of their lower half. */
  const cueHit = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll(".hero-actions a").forEach((a) => {
      const r = a.getBoundingClientRect();
      const x = Math.round(r.left + r.width / 2);
      let covered = null;
      [0.1, 0.3, 0.5, 0.7, 0.9].forEach((f) => {
        const hit = document.elementFromPoint(x, Math.round(r.top + r.height * f));
        if (hit?.closest("a") !== a) covered = covered || `${a.textContent.trim()} @${f} -> ${hit?.className || hit?.tagName}`;
      });
      if (covered) out.push(covered);
    });
    return out;
  });
  check(cueHit.length === 0, `hero CTAs receive the pointer over their full height${cueHit.length ? " — blocked: " + cueHit.join("; ") : ""}`);

  // Vitrine cards reveal on approach
  await page.evaluate(() => scrollTo(0, 0));
  await page.waitForTimeout(500);
  const doc = await page.evaluate(() => document.documentElement.scrollHeight);
  await page.evaluate((y) => scrollTo(0, y), Math.round(doc * 0.14));
  await page.waitForTimeout(1200);
  const revealed = await page.$$eval(".vitrine", (els) =>
    els.filter((el) => getComputedStyle(el).opacity !== "0").length
  );
  check(revealed === 4, `vitrine cards reveal (${revealed}/4 visible)`);

  // The stone: geometry
  const rot = await page.evaluate(() => {
    const s = document.querySelector("[data-rotator]");
    const r = s.getBoundingClientRect();
    return { top: r.top + scrollY, h: s.offsetHeight };
  });
  const stoneShot = async (y) => {
    await page.evaluate((a) => scrollTo(0, Math.max(0, a)), Math.round(y));
    await page.waitForTimeout(500);
    return page.screenshot({ clip: { x: 520, y: 120, width: 400, height: 640 } });
  };
  const enterA = await stoneShot(rot.top - VH * 0.55);
  const enterB = await stoneShot(rot.top - VH * 0.15);
  const pinMid = await stoneShot(rot.top + (rot.h - VH) * 0.5);
  const exit = await stoneShot(rot.top + (rot.h - VH) + VH * 0.35);
  check(await page.locator(".rotator.rt-ready").count() === 1, "Maison WebGL scroll gem is live");
  check(Buffer.compare(enterA, enterB) !== 0, "stone spins while scrolling IN (entry frames differ)");
  check(Buffer.compare(pinMid, exit) !== 0, "stone spins while scrolling OUT (pin vs exit differ)");
  await page.evaluate((y) => scrollTo(0, y), Math.round(rot.top));
  await page.waitForTimeout(80);
  const scrollStart = await page.evaluate(() => ({
    ry: Number(document.querySelector(".rt-gem canvas").dataset.ry),
    transform: document.querySelector(".rt-stage").style.transform,
  }));
  await page.evaluate((y) => scrollTo(0, y), Math.round(rot.top + rot.h - VH));
  await page.waitForTimeout(80);
  const scrollEnd = await page.evaluate(() => ({
    ry: Number(document.querySelector(".rt-gem canvas").dataset.ry),
    transform: document.querySelector(".rt-stage").style.transform,
  }));
  check(
    scrollStart.transform.includes("6vh") &&
      scrollEnd.transform.includes("-6vh") &&
      Math.abs(scrollEnd.ry - scrollStart.ry) > 4,
    `stone keeps original scroll lift and spin (${scrollStart.ry.toFixed(2)} -> ${scrollEnd.ry.toFixed(2)}rad)`
  );

  // Combined moment: gem on the left, credo on the right, side by side on desktop
  const layout = await page.evaluate(() => {
    const t = document.querySelector(".rt-text").getBoundingClientRect();
    const g = document.querySelector(".rt-stage").getBoundingClientRect();
    return {
      gemRight: Math.round(g.right),
      textLeft: Math.round(t.left),
      sideBySide:
        g.right <= t.left + 24 &&
        Math.abs((t.top + t.bottom) / 2 - (g.top + g.bottom) / 2) < 220,
    };
  });
  check(
    layout.sideBySide,
    `gem left of credo, side by side (gem right ${layout.gemRight} <= text left ${layout.textLeft})`
  );

  // Scroll owns the resting pose, while direct manipulation is free on both
  // model axes before a damped return to that scroll-owned orientation.
  await page.evaluate((y) => scrollTo(0, y), Math.round(rot.top + (rot.h - VH) * 0.5));
  await page.waitForTimeout(400);
  const gemCanvas = page.locator(".rt-gem canvas");
  const canvasBox = await gemCanvas.boundingBox();
  const poseBeforeDrag = await gemCanvas.evaluate((canvas) => ({
    rx: Number(canvas.dataset.rx),
    ry: Number(canvas.dataset.ry),
  }));
  await page.mouse.move(canvasBox.x + canvasBox.width * 0.5, canvasBox.y + canvasBox.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(
    canvasBox.x + canvasBox.width * 0.78,
    canvasBox.y + canvasBox.height * 0.58,
    { steps: 5 }
  );
  const dragState = await page.evaluate(() => ({
    dragging: document.querySelector(".rt-stage").classList.contains("is-dragging"),
    rx: Number(document.querySelector(".rt-gem canvas").dataset.rx),
    ry: Number(document.querySelector(".rt-gem canvas").dataset.ry),
  }));
  check(
    dragState.dragging &&
      Math.abs(dragState.rx - poseBeforeDrag.rx) > 0.02 &&
      Math.abs(dragState.ry - poseBeforeDrag.ry) > 0.02,
    `stone drag is free on both axes (rx ${poseBeforeDrag.rx.toFixed(2)} -> ${dragState.rx.toFixed(2)}, ry ${poseBeforeDrag.ry.toFixed(2)} -> ${dragState.ry.toFixed(2)})`
  );
  // Leaving the document while holding the stone must release the drag and
  // preserve the last angular velocity as a throw.
  await gemCanvas.dispatchEvent("pointerout", {
    bubbles: true,
    pointerId: 1,
    relatedTarget: null,
  });
  await page.waitForTimeout(34);
  const releasePose = await gemCanvas.evaluate((canvas) => ({
    ry: Number(canvas.dataset.ry),
    vy: Number(canvas.dataset.vy),
    dragging: canvas.dataset.dragging,
  }));
  await page.waitForTimeout(180);
  const coastPose = await gemCanvas.evaluate((canvas) => ({
    ry: Number(canvas.dataset.ry),
    targetRy: Number(canvas.dataset.targetRy),
    dragging: canvas.dataset.dragging,
  }));
  await page.mouse.up();
  check(
    releasePose.dragging === "false" &&
      coastPose.dragging === "false" &&
      Math.sign(coastPose.ry - releasePose.ry) === Math.sign(releasePose.vy) &&
      Math.abs(coastPose.ry - releasePose.ry) > 0.04,
    `stone keeps release momentum after pointer exits (${Math.abs(coastPose.ry - releasePose.ry).toFixed(2)}rad coast)`
  );
  await page.waitForTimeout(600);
  const beforeScrollThrow = await gemCanvas.evaluate((canvas) => ({
    ry: Number(canvas.dataset.ry),
    targetRy: Number(canvas.dataset.targetRy),
  }));
  await page.evaluate((y) => scrollTo(0, y), Math.round(rot.top + (rot.h - VH) * 0.75));
  await page.waitForTimeout(34);
  const scrolledThrow = await gemCanvas.evaluate((canvas) => ({
    ry: Number(canvas.dataset.ry),
    targetRy: Number(canvas.dataset.targetRy),
  }));
  const targetShift = scrolledThrow.targetRy - beforeScrollThrow.targetRy;
  const offsetShift =
    (scrolledThrow.ry - scrolledThrow.targetRy) -
    (beforeScrollThrow.ry - beforeScrollThrow.targetRy);
  check(
    Math.abs(targetShift) > 0.5 && Math.abs(offsetShift) < 0.6,
    `scroll choreography remains immediate during momentum (${targetShift.toFixed(2)}rad target shift)`
  );
  await page.waitForTimeout(5000);
  const returnState = await page.evaluate(() => {
    const canvas = document.querySelector(".rt-gem canvas");
    const stage = document.querySelector(".rt-stage");
    const rxDelta = Math.abs(Number(canvas.dataset.rx) - Number(canvas.dataset.targetRx));
    const ryDelta = Math.abs(Number(canvas.dataset.ry) - Number(canvas.dataset.targetRy));
    return { rxDelta, ryDelta, dragging: stage.classList.contains("is-dragging") };
  });
  check(
    !returnState.dragging && returnState.rxDelta < 0.02 && returnState.ryDelta < 0.02,
    `stone returns to scroll pose (rx ${returnState.rxDelta.toFixed(3)}, ry ${returnState.ryDelta.toFixed(3)})`
  );

  // Manifesto scrubs word by word
  const mf = await page.evaluate(() => {
    const s = document.querySelector("[data-manifesto]");
    const r = s.getBoundingClientRect();
    return { top: r.top + scrollY, span: s.offsetHeight - innerHeight };
  });
  await page.evaluate((y) => scrollTo(0, y), Math.round(mf.top + mf.span * 0.4));
  await page.waitForTimeout(700);
  const ink = await page.$$eval(".mf-w", (els) => ({
    first: parseFloat(els[0].style.opacity || "1"),
    last: parseFloat(els[els.length - 1].style.opacity || "1"),
    n: els.length,
  }));
  check(
    ink.n > 10 && ink.first > 0.9 && ink.last < 0.4,
    `manifesto scrubs mid-runway (first ${ink.first}, last ${ink.last})`
  );

  // Method triptych: three plates in one row, no scroll-jack runway
  await page.locator(".method-tri").scrollIntoViewIfNeeded();
  await page.waitForTimeout(900);
  const tri = await page.evaluate(() => {
    const steps = [...document.querySelectorAll(".method-step")];
    const tops = steps.map((s) => Math.round(s.getBoundingClientRect().top));
    const shown = steps.filter((s) => s.classList.contains("is-visible")).length;
    const section = document.querySelector(".method-tri").closest("section");
    return { n: steps.length, oneRow: new Set(tops).size === 1, shown,
             runway: section.offsetHeight < innerHeight * 2 };
  });
  check(tri.n === 3 && tri.oneRow, `method is a single row of three plates (${tri.n})`);
  check(tri.shown === 3, "all three method plates reveal");
  check(tri.runway, "method section has no sticky runway");

  check(errors.length === 0, "desktop: no console errors");
  if (errors.length) console.log("  errors:", errors.slice(0, 3));
  await page.close();
}

/* ---- Reduced motion: everything static, no errors ---------------------- */
{
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    reducedMotion: "reduce",
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(URL);
  await page.waitForTimeout(1200);
  check(await page.locator(".rotator.rt-live").count() === 0, "reduced-motion: rotator static (no rt-live)");
  check(await page.locator(".manifesto.mf-live").count() === 0, "reduced-motion: manifesto static (no mf-live)");
  check(errors.length === 0, "reduced-motion: no console errors");
  await page.close();
  await ctx.close();
}

/* ---- Mobile: frame budget + no errors ---------------------------------- */
{
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(URL);
  await page.waitForTimeout(INTRO_MS);
  const frameBudget = await page.evaluate(
    () =>
      new Promise((res) => {
        const times = [];
        let last = performance.now();
        let n = 0;
        function step() {
          const now = performance.now();
          times.push(now - last);
          last = now;
          if (++n < 80) {
            // Trackpad/touch flicks move farther than the old gentle 60px
            // sample. The p95 catches intermittent stalls hidden by a median.
            scrollBy(0, 110);
            requestAnimationFrame(step);
          } else {
            times.sort((a, b) => a - b);
            res({
              median: times[Math.floor(times.length / 2)],
              p95: times[Math.floor(times.length * 0.95)],
            });
          }
        }
        requestAnimationFrame(step);
      })
  );
  check(
    frameBudget.median <= 22,
    `mobile: median frame ${frameBudget.median.toFixed(1)}ms <= 22ms`
  );
  check(
    frameBudget.p95 <= 24,
    `mobile: fast-scroll p95 ${frameBudget.p95.toFixed(1)}ms <= 24ms`
  );
  const mobileRotatorTop = await page.evaluate(() => {
    const section = document.querySelector("[data-rotator]");
    return section.getBoundingClientRect().top + scrollY;
  });
  await page.evaluate((y) => scrollTo(0, y), mobileRotatorTop);
  await page.waitForTimeout(2000);
  const mobileRotationFrames = await page.evaluate(() =>
    performance
      .getEntriesByType("resource")
      .filter((entry) => entry.name.includes("/assets/rotation/emerald-")).length
  );
  check(
    mobileRotationFrames <= 1,
    `mobile: live gem loads only its static fallback (${mobileRotationFrames} image)`
  );
  const mobileTri = await page.evaluate(() => {
    const tops = [...document.querySelectorAll(".method-step")]
      .map((s) => Math.round(s.getBoundingClientRect().top));
    return new Set(tops).size;
  });
  check(mobileTri === 3, "mobile: the three method plates stack in one column");
  check(
    await page.locator(".rt-gem canvas").evaluate((canvas) => getComputedStyle(canvas).touchAction === "none"),
    "mobile: gem accepts unrestricted two-axis touch manipulation"
  );
  check(errors.length === 0, "mobile: no console errors");
  await page.close();
  await ctx.close();
}

// ---- Canonical product + bag flow -------------------------------------
{
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));

  await page.goto(`${BASE}/pieces/vipera-emerald-ring/`);
  await page.waitForTimeout(500);
  check((await page.title()).includes("Vipera Ring in Dubai"), "canonical product has product-specific metadata");
  check(await page.locator(".product-mobile-head h1").isVisible(), "mobile product heading is visible");
  check(
    (await page.locator('[data-p="photo"]').getAttribute("src")).includes("vipera.jpg"),
    "initial and hydrated product image agree"
  );
  await page.locator(".size").filter({ hasText: "54" }).click();
  await page.locator("[data-add-to-bag]").click();
  await page.goto(`${BASE}/bag.html`);
  await page.waitForTimeout(250);
  check((await page.locator(".bag-row-name").innerText()) === "Vipera Ring", "canonical product can be added to the bag");
  check(
    (await page.locator(".bag-row-name a").getAttribute("href")).includes("pieces/vipera-emerald-ring/"),
    "bag links back to the canonical product URL"
  );

  await page.goto(`${BASE}/pieces/thalis-emerald-drop-earrings/`);
  await page.waitForTimeout(250);
  check(
    (await page.locator(".product-mobile-head h1").innerText()) === "Thalis Drops",
    "non-ring canonical URL hydrates the correct product"
  );
  check(!(await page.locator('[data-p="sizes"]').isVisible()), "ring sizes remain hidden for earrings");
  check(errors.length === 0, "canonical product and bag flows have no page errors");
  await page.close();
  await ctx.close();
}

// ---- With JavaScript unavailable, the site must still be readable ------
//      A curtain or an entrance animation that waits for a script it never
//      gets leaves a blank page. This is the guard against that.
{
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    javaScriptEnabled: false,
  });
  const page = await ctx.newPage();
  for (const path of ["/index.html", "/about.html", "/collections.html"]) {
    await page.goto(`${BASE}${path}`);
    await page.waitForTimeout(3200);   // the CSS curtain lift is 1.5s + 0.9s
    const state = await page.evaluate(() => {
      const intro = document.querySelector(".intro");
      const cs = intro ? getComputedStyle(intro) : null;
      /* Only elements that carry content: a decorative WebGL host with
         nothing to render is meant to collapse without its script. */
      const hidden = [...document.querySelectorAll("h1, .reveal, .lm > span")]
        .filter((el) => el.textContent.trim() && el.getAttribute("aria-hidden") !== "true")
        .filter((el) => {
          const s = getComputedStyle(el);
          const r = el.getBoundingClientRect();
          return s.opacity === "0" || s.visibility === "hidden" || r.height === 0 ||
            (s.transform !== "none" && Math.abs(new DOMMatrix(s.transform).f) > 4);
        }).length;
      return {
        curtain: cs ? cs.display !== "none" && cs.visibility !== "hidden" : false,
        centre: (() => {
          const el = document.elementFromPoint(innerWidth / 2, innerHeight / 2);
          return el ? el.tagName : "none";
        })(),
        hidden,
        h1: (document.querySelector("h1") || {}).innerText || "",
      };
    });
    check(!state.curtain, `no-JS ${path}: the intro curtain lifts on its own`);
    check(
      state.hidden === 0 && state.h1.length > 0,
      `no-JS ${path}: nothing stays hidden waiting for a script (${state.hidden} hidden)`
    );
  }
  await page.close();
  await ctx.close();
}

// ---- The maison lockup + the tray of five stones -----------------------
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  await page.goto(`${BASE}/about.html`);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(900);

  /* The lockup is the house's own logo now (assets/brand), so what matters
     is that both marks actually load and are legible, not glyph alignment. */
  const lockup = await page.evaluate(() => {
    const imgs = [...document.querySelectorAll(".site-header .wordmark img")];
    const footer = document.querySelector(".footer-grid .wm-lockup");
    return {
      count: imgs.length,
      loaded: imgs.filter((i) => i.complete && i.naturalWidth > 0).length,
      markHeight: imgs[0] ? Math.round(imgs[0].getBoundingClientRect().height) : 0,
      footerSrc: footer ? footer.getAttribute("src") : null,
      srcs: imgs.map((i) => i.src.split("/").pop()),
    };
  });
  check(
    lockup.count === 2 && lockup.loaded === 2 && lockup.markHeight >= 30 &&
      /frozi-lockup\.png$/.test(lockup.footerSrc || ""),
    `the house logo loads in header and footer (${lockup.srcs.join(" + ")}, mark ${lockup.markHeight}px)`
  );
  check(
    (await page.locator(".brand-note").textContent()).trim().toLowerCase() === "home of panjshir emeralds",
    "the provenance line ships in the chrome (folded away at phone width)"
  );

  /* six stones, six different cuts, in one straight evenly spaced row */
  const currency = await page.evaluate(() => {
    const menu = document.querySelector(".locale-field--currency .locale-menu");
    return { control: !!menu,
             options: menu ? [...menu.querySelectorAll("[role='option']")].map((o) => o.dataset.value) : [] };
  });
  check(
    currency.control && currency.options.join(",") === "AED,USD,EUR,GBP,SAR,RUB",
    `the currency control offers the six currencies (${currency.options.join(", ")})`
  );

  await page.locator(".stone-tray").scrollIntoViewIfNeeded();
  await page.waitForTimeout(1400);
  const tray = await page.evaluate(() => {
    const host = document.querySelector(".stone-tray");
    const ctrl = host._froziGemController;
    return {
      canvases: document.querySelectorAll(".stone-tray canvas").length,
      names: ctrl ? ctrl.stones.map((s) => s.name) : [],
      spread: ctrl ? ctrl.stones.map((s) => Math.round(s.sx)) : [],
      radius: ctrl ? Math.round(ctrl.stones[0].sr) : 0,
      cuts: ctrl ? ctrl.stones.map((s) => s.spec.cut) : [],
      rows: ctrl ? [...new Set(ctrl.stones.map((s) => Math.round(s.sy)))] : [],
      meshes: ctrl ? new Set(ctrl.stones.map((s) => s.mesh)).size : 0,
    };
  });
  check(
    tray.canvases === 1 &&
      tray.names.join(",") === "emerald,sapphire,ruby,diamond,tourmaline,kunzite",
    `all six stones share one canvas (${tray.canvases} canvas, ${tray.names.length} stones)`
  );
  check(
    tray.spread.every((x, i) => i === 0 || x > tray.spread[i - 1] + tray.radius),
    `stones are laid out clear of each other (${tray.spread.join(", ")})`
  );
  // evenly spaced: every gap within a pixel of the others
  const gaps = tray.spread.slice(1).map((x, i) => x - tray.spread[i]);
  check(
    Math.max(...gaps) - Math.min(...gaps) <= 2 && tray.rows.length === 1,
    `the row is straight and evenly spaced (gaps ${gaps.join(", ")}, ${tray.rows.length} row)`
  );
  check(
    new Set(tray.cuts).size === 6 && tray.meshes === 6,
    `each stone is its own cut (${tray.cuts.join(", ")})`
  );

  // drag the middle stone: only that stone may turn
  const box = await page.locator(".stone-tray").boundingBox();
  const mid = await page.evaluate(() =>
    document.querySelector(".stone-tray")._froziGemController.stones[2]
  ).then(() => page.evaluate(() => {
    const s = document.querySelector(".stone-tray")._froziGemController.stones[2];
    return { sx: s.sx, sy: s.sy };
  }));
  const before = await page.evaluate(() =>
    document.querySelector(".stone-tray")._froziGemController.stones.map((s) => s.ry)
  );
  await page.mouse.move(box.x + mid.sx, box.y + mid.sy);
  await page.mouse.down();
  for (let i = 1; i <= 12; i++) {
    await page.mouse.move(box.x + mid.sx + i * 6, box.y + mid.sy);
    await page.waitForTimeout(16);
  }
  await page.mouse.up();
  await page.waitForTimeout(120);
  const after = await page.evaluate(() =>
    document.querySelector(".stone-tray")._froziGemController.stones.map((s) => s.ry)
  );
  const moved = after.map((v, i) => Math.abs(v - before[i]));
  check(
    moved[2] > 0.3 && moved.filter((d, i) => i !== 2).every((d) => d < moved[2] / 3),
    `dragging one stone turns only that stone (${moved.map((d) => d.toFixed(2)).join(", ")})`
  );

  const trayFrames = await page.evaluate(async () => {
    const t = [];
    let last = performance.now();
    await new Promise((resolve) => {
      let n = 0;
      const tick = () => {
        const now = performance.now();
        t.push(now - last);
        last = now;
        if (++n < 90) requestAnimationFrame(tick);
        else resolve();
      };
      requestAnimationFrame(tick);
    });
    t.sort((a, b) => a - b);
    return t[Math.floor(t.length / 2)];
  });
  check(trayFrames <= 22, `five live stones hold frame budget (median ${trayFrames.toFixed(1)}ms)`);
  check(errors.length === 0, "maison page has no console errors");
  await page.close();
  await ctx.close();
}

// ---- The tray under reduced motion ------------------------------------
{
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    reducedMotion: "reduce",
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  await page.goto(`${BASE}/about.html`);
  await page.locator(".stone-tray").scrollIntoViewIfNeeded();
  await page.waitForTimeout(1200);
  /* Read the canvas back rather than screenshotting it: a page screenshot of
     a GPU-composited canvas is not byte-stable between captures even when
     nothing has redrawn, which made this check flake 1 run in 3. */
  const still = await page.evaluate(async () => {
    const canvas = document.querySelector(".stone-tray canvas");
    const before = canvas.toDataURL();
    await new Promise((r) => setTimeout(r, 700));
    return { same: canvas.toDataURL() === before };
  });
  check(still.same, "reduced-motion: the tray holds still");
  check(errors.length === 0, "reduced-motion: maison page has no console errors");
  await page.close();
  await ctx.close();
}

await browser.close();
console.log(`\n${fail === 0 ? "ALL PASS" : "SOME FAIL"} (${pass} pass, ${fail} fail)`);
process.exit(fail === 0 ? 0 : 1);
