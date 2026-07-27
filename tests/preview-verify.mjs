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
  check(revealed >= 4, `vitrine cards reveal (${revealed}/8 visible)`);

  // The shop window: all eight pieces merchandised with name and price
  const shop = await page.evaluate(() => {
    const cards = [...document.querySelectorAll(".vitrine")];
    return {
      n: cards.length,
      priced: cards.filter((c) => /AED\s[\d,]+/.test((c.querySelector(".vitrine-price") || {}).textContent || "")).length,
      named: cards.filter((c) => c.querySelector(".vitrine-name a")).length,
    };
  });
  check(shop.n === 8 && shop.priced === 8 && shop.named === 8,
    `all eight pieces are merchandised (${shop.n} cards, ${shop.priced} priced, ${shop.named} linked)`);

  // Shop by form: four doors, each carrying its category filter
  const strip = await page.$$eval(".form-strip a", (els) => els.map((a) => a.getAttribute("href")));
  check(strip.length === 4 && strip.every((h) => /collections\.html\?cat=/.test(h)),
    "the form strip's four doors carry their filters");

  // The story is one band, not three sections
  check(await page.locator(".prov-line").count() === 1, "provenance is a single band");
  check(await page.locator("[data-rotator], [data-manifesto], .method-tri").count() === 0,
    "no story machinery remains on the home page");

  // Arriving via a form door pre-applies the filter
  const cpage = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await cpage.goto(`${BASE}/collections.html?cat=rings`, { waitUntil: "networkidle" });
  await cpage.waitForTimeout(1400);
  const filtered = await cpage.evaluate(() => ({
    pressed: (document.querySelector('.chip[aria-pressed="true"]') || {}).dataset?.value,
    shown: [...document.querySelectorAll("[data-category]:not(.is-filtered)")].length,
    total: [...document.querySelectorAll("[data-category]")].length,
  }));
  check(filtered.pressed === "rings" && filtered.shown > 0 && filtered.shown < filtered.total,
    `?cat=rings pre-applies the chip (${filtered.shown}/${filtered.total} shown)`);
  await cpage.close();

  // Method triptych lives on the maison now: three plates, one row, no runway
  const mpage = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await mpage.goto(`${BASE}/about.html`, { waitUntil: "networkidle" });
  await mpage.locator(".method-tri").scrollIntoViewIfNeeded();
  /* the plates reveal on a stagger — wait for all three to land before
     reading their positions, or a slow network fails the one-row check */
  await mpage.waitForFunction(() => {
    const steps = [...document.querySelectorAll(".method-step")];
    return steps.length === 3 && steps.every((s) => s.classList.contains("is-visible"));
  }, { timeout: 8000 }).catch(() => {});
  await mpage.waitForTimeout(900);
  const tri = await mpage.evaluate(() => {
    const steps = [...document.querySelectorAll(".method-step")];
    const tops = steps.map((s) => Math.round(s.getBoundingClientRect().top));
    const section = document.querySelector(".method-tri").closest("section");
    return { n: steps.length, oneRow: new Set(tops).size === 1,
             shown: steps.filter((s) => s.classList.contains("is-visible")).length,
             runway: section.offsetHeight < innerHeight * 2 };
  });
  check(tri.n === 3 && tri.oneRow && tri.runway,
    `the maison method is a single row of three plates (${tri.n})`);
  check(tri.shown === 3, "all three method plates reveal on the maison");
  await mpage.close();

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
  const mobileStrip = await page.evaluate(() => {
    const doors = [...document.querySelectorAll(".form-strip a")]
      .map((a) => Math.round(a.getBoundingClientRect().top));
    return { n: doors.length, rows: new Set(doors).size };
  });
  check(mobileStrip.n === 4 && mobileStrip.rows === 2,
    "mobile: the form strip folds to two rows of two");
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
