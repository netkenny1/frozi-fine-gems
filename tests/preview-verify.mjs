/* Frozi Fine Gems — preview homepage verification suite.
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
const URL = `${BASE}/preview/index.html`;
const INTRO_MS = 3200; // let the one-time intro curtain dismiss

let pass = 0;
let fail = 0;
function check(ok, msg) {
  console.log((ok ? "PASS " : "FAIL ") + msg);
  ok ? pass++ : fail++;
}

const browser = await chromium.launch({ channel: "chrome", headless: true });

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
    (await page.locator("h1").first().innerText()).toLowerCase().includes("fine jewelry"),
    "hero headline is rendered"
  );

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
  await page.mouse.up();
  check(
    dragState.dragging &&
      Math.abs(dragState.rx - poseBeforeDrag.rx) > 0.02 &&
      Math.abs(dragState.ry - poseBeforeDrag.ry) > 0.02,
    `stone drag is free on both axes (rx ${poseBeforeDrag.rx.toFixed(2)} -> ${dragState.rx.toFixed(2)}, ry ${poseBeforeDrag.ry.toFixed(2)} -> ${dragState.ry.toFixed(2)})`
  );
  await page.waitForTimeout(2400);
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

  // Method cinema: counter walks and photographs change
  const cin = await page.evaluate(() => {
    const s = document.querySelector("[data-cinema]");
    const r = s.getBoundingClientRect();
    return { top: r.top + scrollY, span: s.offsetHeight - innerHeight };
  });
  check(await page.locator(".method-cinema.mc-live").count() === 1, "cinema section is live (JS enhanced)");
  const counters = [];
  const frames = [];
  for (const f of [0.15, 0.5, 0.85]) {
    await page.evaluate((y) => scrollTo(0, y), Math.round(cin.top + cin.span * f));
    await page.waitForTimeout(900);
    counters.push(await page.locator("[data-mc-counter]").innerText());
    frames.push(await page.screenshot({ clip: { x: 0, y: 0, width: 1440, height: 900 } }));
  }
  check(
    counters.join(",") === "01,02,03",
    `cinema counter walks 01 -> 02 -> 03 (got ${counters.join(",")})`
  );
  check(
    Buffer.compare(frames[0], frames[1]) !== 0 && Buffer.compare(frames[1], frames[2]) !== 0,
    "cinema photographs change between acts (frame pixels differ)"
  );

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
  check(await page.locator(".method-cinema.mc-live").count() === 0, "reduced-motion: cinema static (no mc-live)");
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
  const mobileCinemaMid = await page.evaluate(() => {
    const section = document.querySelector("[data-cinema]");
    const rect = section.getBoundingClientRect();
    return rect.top + scrollY + (section.offsetHeight - innerHeight) * 0.33;
  });
  await page.evaluate((y) => scrollTo(0, y), mobileCinemaMid);
  await page.waitForTimeout(200);
  const curtainStyle = await page.locator('[data-mc-frame="1"]').getAttribute("style");
  check(
    Boolean(curtainStyle && curtainStyle.includes("translate3d")),
    "mobile: cinema curtain uses a compositor transform"
  );
  check(
    await page.locator(".rt-gem canvas").evaluate((canvas) => getComputedStyle(canvas).touchAction === "none"),
    "mobile: gem accepts unrestricted two-axis touch manipulation"
  );
  check(errors.length === 0, "mobile: no console errors");
  await page.close();
  await ctx.close();
}

await browser.close();
console.log(`\n${fail === 0 ? "ALL PASS" : "SOME FAIL"} (${pass} pass, ${fail} fail)`);
process.exit(fail === 0 ? 0 : 1);
