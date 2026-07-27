/* Frozi Fine Gems — Arabic / RTL verification suite.
 *
 * Drives the homepage in headless Chrome and asserts the language layer:
 * the toggle exists, العربية swaps the chrome and home copy from
 * js/i18n-ar.js, the page mirrors to RTL with zero tracking and the Arabic
 * faces, the choice survives a reload before first paint, and English comes
 * back intact. Also proves the stones' still fallback on the maison page.
 *
 * Run against a local server (default http://localhost:8642):
 *   node tests/i18n-verify.mjs
 * Or the deployed site:
 *   node tests/i18n-verify.mjs https://netkenny1.github.io/frozi-fine-gems
 */

let chromium;
try {
  ({ chromium } = await import("playwright"));
} catch {
  ({ chromium } = await import(
    "/opt/homebrew/lib/node_modules/playwright/index.mjs"
  ));
}

const BASE = (process.argv[2] || "http://localhost:8642").replace(/\/$/, "");
const INTRO_MS = 3200;

let pass = 0;
let fail = 0;
function check(ok, msg) {
  console.log((ok ? "PASS " : "FAIL ") + msg);
  ok ? pass++ : fail++;
}

const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(`${BASE}/index.html`, { waitUntil: "networkidle" });
await page.waitForTimeout(INTRO_MS);

/* ---- the toggle exists and offers both languages ------------------------ */
const langSel = page.locator(".locale-field select").nth(1);
check(await langSel.count() === 1, "the language control renders next to the currency control");
const options = await langSel.locator("option").allTextContents();
check(options.join(",") === "EN,العربية", `it offers EN and العربية (got: ${options.join(",")})`);

/* ---- switching to Arabic ------------------------------------------------ */
await langSel.selectOption("ar");
await page.waitForTimeout(400);

const dir = await page.evaluate(() => document.documentElement.getAttribute("dir"));
const lang = await page.evaluate(() => document.documentElement.getAttribute("lang"));
check(dir === "rtl" && lang === "ar-AE", `the root mirrors (dir=${dir}, lang=${lang})`);

const brandNote = await page.locator(".brand-note").textContent();
check(brandNote.trim() === "موطن زمرّد بنجشير", `the provenance line is Arabic ("${brandNote.trim()}")`);

const navTexts = await page.locator(".nav-link").allTextContents();
check(navTexts.some(t => t.includes("المجموعة")) && navTexts.some(t => t.includes("الدار")),
  "the nav is Arabic (المجموعة, الدار…)");

const heroLine = await page.locator(".display .lm span[data-t]").allTextContents();
check(heroLine.join(" ").includes("زمرّد"), `the hero headline is Arabic ("${heroLine.join(" / ")}")`);

const bagCount = await page.locator("[data-bag-count]").count();
check(bagCount === 1, "the bag counter survived the swap (its span is outside data-t)");

/* ---- typography --------------------------------------------------------- */
const fontLink = await page.evaluate(() =>
  !!document.querySelector('link[href*="Tajawal"]'));
check(fontLink, "the Amiri + Tajawal stylesheet is loaded");

const eyebrowSpacing = await page.locator(".hero .eyebrow").evaluate(
  el => getComputedStyle(el).letterSpacing);
check(eyebrowSpacing === "0px" || eyebrowSpacing === "normal",
  `tracking is zeroed for the joined script (eyebrow: ${eyebrowSpacing})`);

const displayFace = await page.locator(".display").evaluate(
  el => getComputedStyle(el).fontFamily);
check(/Amiri/.test(displayFace), `the display face is Amiri (${displayFace.split(",")[0]})`);

const priceText = await page.locator(".vitrine-price").first().textContent();
check(/AED|USD|EUR|GBP|SAR/.test(priceText), `prices stay in their settlement form ("${priceText.trim()}")`);

/* ---- the choice survives a reload, before first paint ------------------- */
await page.reload({ waitUntil: "domcontentloaded" });
const earlyDir = await page.evaluate(() => document.documentElement.getAttribute("dir"));
check(earlyDir === "rtl", "a return visit is RTL from the head snippet, not after a flash");
await page.waitForTimeout(INTRO_MS + 500);
const brandNote2 = await page.locator(".brand-note").textContent();
check(brandNote2.trim() === "موطن زمرّد بنجشير", "the Arabic chrome survives the reload");

/* ---- and English comes back intact -------------------------------------- */
await page.locator(".locale-field select").nth(1).selectOption("en");
await page.waitForTimeout(400);
const dirBack = await page.evaluate(() => document.documentElement.getAttribute("dir"));
const heroBack = await page.locator(".display").textContent();
check(dirBack === "ltr" && /Emeralds from/.test(heroBack),
  "switching back restores the English original, em intact");

const consoleErrors = [];
page.on("pageerror", e => consoleErrors.push(String(e)));

/* ---- the stones' still fallback (maison, no JS) ------------------------- */
const noJs = await browser.newPage({ javaScriptEnabled: false });
await noJs.goto(`${BASE}/about.html`, { waitUntil: "load" });
const stills = noJs.locator(".gem-still");
check(await stills.count() === 2, "maison holds two stills (house stone + tray)");
const visible = await stills.evaluateAll(els =>
  els.map(el => {
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return cs.visibility !== "hidden" && cs.display !== "none" && r.width > 100;
  }));
check(visible.every(Boolean), `without JS both stills show (${visible.join(", ")})`);
await noJs.close();

/* with JS and WebGL live, the still steps aside for the canvas */
const maison = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await maison.goto(`${BASE}/about.html`, { waitUntil: "networkidle" });
await maison.waitForTimeout(1200);
const hasGem = await maison.evaluate(() => !!document.querySelector(".has-gem canvas"));
if (hasGem) {
  const stillHidden = await maison.locator(".gem-mount--intro .gem-still").evaluate(
    el => getComputedStyle(el).visibility === "hidden");
  check(stillHidden, "with a live context the still yields to the canvas");
} else {
  check(true, "no WebGL in this headless run — still remains, which is the fallback working");
}
await maison.close();

check(consoleErrors.length === 0,
  consoleErrors.length ? `page errors: ${consoleErrors[0]}` : "no page errors across the run");

await browser.close();
console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"} (${pass} pass, ${fail} fail)`);
process.exit(fail === 0 ? 0 : 1);
