import { readFile, access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const catalog = JSON.parse(await readFile(path.join(root, "data/catalog.json"), "utf8"));
let pass = 0;
let fail = 0;

function check(condition, message) {
  console.log(`${condition ? "PASS" : "FAIL"} ${message}`);
  condition ? pass++ : fail++;
}

async function text(file) {
  return readFile(path.join(root, file), "utf8");
}

function jsonLd(html) {
  return [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(
    (match) => JSON.parse(match[1])
  );
}

const home = await text("index.html");
const collection = await text("collections.html");
const contact = await text("contact.html");
const robots = await text("robots.txt");
const sitemap = await text("sitemap.xml");
const publicCatalog = JSON.parse(await text("catalog.json"));
const feed = await text("feeds/openai-products.csv");
const productPages = catalog.products.map((product) => `pieces/${product.slug}/index.html`);
const indexablePages = [
  "index.html",
  "collections.html",
  "about.html",
  "contact.html",
  "policies.html",
  "terms.html",
  "privacy.html",
  "returns.html",
  "shipping.html",
  ...productPages
];

check(home.includes("Fine Jewelry in Dubai"), "home title names the Dubai offer");
check(home.includes("private fine-jewelry maison serving clients in Dubai"), "home visibly identifies the Dubai service area");
check(contact.includes("Private appointments in Dubai"), "contact page visibly states the appointment location");
check(home.includes('rel="canonical"'), "home has a canonical URL");
check(home.includes('type="application/json" href="catalog.json"'), "home advertises the machine-readable catalog");
check(robots.includes("OAI-SearchBot") && robots.includes("Sitemap:"), "crawler policy names OAI-SearchBot and the sitemap");
check(!robots.includes("Disallow: /frozi-fine-gems/$"), "canonical site is not blocked");
check(!/product\.html\?ref=/.test(home + collection), "indexable collection links use permanent product URLs");
check(publicCatalog.products.length === catalog.products.length, "public and source catalogs contain the same product count");
check(feed.trim().split("\n").length === catalog.products.length + 1, "OpenAI feed contains one row per product");

const homeGraph = jsonLd(home).flatMap((entry) => entry["@graph"] || [entry]);
check(homeGraph.some((entry) => entry["@type"] === "Organization"), "home defines the Frozi organization entity");
check(homeGraph.some((entry) => entry["@type"] === "WebSite"), "home defines the canonical website entity");

for (const product of catalog.products) {
  const relative = `pieces/${product.slug}/index.html`;
  await access(path.join(root, relative));
  const html = await text(relative);
  const graphs = jsonLd(html).flatMap((entry) => entry["@graph"] || [entry]);
  const schema = graphs.find((entry) => entry["@type"] === "Product");
  check(Boolean(schema), `${product.ref} has Product schema`);
  check(schema?.sku === product.ref, `${product.ref} schema has the stable ledger reference`);
  check(schema?.offers?.price === product.price && schema?.offers?.priceCurrency === "AED", `${product.ref} schema price matches the ledger`);
  check(html.includes(`data-product-ref="${product.ref}"`), `${product.ref} initial page binds the correct product`);
  check(html.includes(product.description), `${product.ref} description is present in initial HTML`);
  check(html.includes('content="index,follow,max-image-preview:large"'), `${product.ref} is indexable`);
  check(sitemap.includes(`pieces/${product.slug}/`), `${product.ref} is present in the sitemap`);
}

let brokenLinks = 0;
for (const page of indexablePages) {
  const html = await text(page);
  const values = [...html.matchAll(/\b(?:href|src)="([^"]*)"/g)].map((match) => match[1]);
  for (const value of values) {
    if (
      !value ||
      value.startsWith("#") ||
      value.startsWith("http://") ||
      value.startsWith("https://") ||
      value.startsWith("mailto:") ||
      value.startsWith("tel:") ||
      value.startsWith("data:")
    ) continue;
    const clean = value.split(/[?#]/)[0];
    let target = path.resolve(root, path.dirname(page), clean);
    if (clean.endsWith("/")) target = path.join(target, "index.html");
    try {
      await access(target);
    } catch {
      brokenLinks++;
      console.log(`FAIL broken local reference in ${page}: ${value}`);
    }
  }
}
check(brokenLinks === 0, "all indexable pages reference existing local files");

/* ---- The legal set ------------------------------------------------------
   These four carry statements a buyer is entitled to rely on, so they are
   checked for the specific disclosures rather than merely for existing. */
const legalPages = ["terms.html", "privacy.html", "returns.html", "shipping.html"];
for (const page of legalPages) {
  const body = await text(page);
  check(
    body.includes(`<link rel="canonical" href="https://netkenny1.github.io/frozi-fine-gems/${page}">`),
    `${page} declares its own canonical URL`
  );
  check(sitemap.includes(`/${page}<`), `${page} is listed in the sitemap`);
  check(
    legalPages.every((other) => page === other || body.includes(`href="${other}"`)),
    `${page} links to the rest of the legal set`
  );
}

/* source HTML wraps mid-sentence, so prose checks read the flattened text */
const flat = (html) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

const terms = flat(await text("terms.html"));
check(/laws of the United Arab Emirates/i.test(terms) && /Dubai courts/i.test(terms),
  "terms name the governing law and forum");
check(/contract is formed when you accept that invoice/i.test(terms),
  "terms say when a contract is actually formed");

const privacy = await text("privacy.html");
check(["frozi-bag-v1", "frozi-currency", "frozi-lang"].every((k) => privacy.includes(k)),
  "privacy names every local-storage key the site writes");
check(/GitHub Pages/.test(privacy) && /Google Fonts/.test(privacy),
  "privacy discloses the two third parties that receive an IP address");
check(/Federal Decree-Law No\. 45 of 2021/.test(privacy),
  "privacy cites the UAE personal data law it grants rights under");

const returns = await text("returns.html");
check(/Federal Law No\. 15 of 2020/.test(returns),
  "returns preserve statutory consumer rights explicitly");

/* the site writes no cookies — the footer claim has to stay true */
const cookieWriters = [];
for (const file of ["js/main.js", "js/store.js", "js/locale.js", "js/gem.js"]) {
  const src = await text(file).catch(() => "");
  if (/document\.cookie\s*=/.test(src)) cookieWriters.push(file);
}
check(cookieWriters.length === 0,
  cookieWriters.length
    ? `cookies are set in ${cookieWriters.join(", ")} but the footer says none`
    : "no script sets a cookie, so the footer claim holds");

console.log(`\n${fail === 0 ? "ALL PASS" : "SOME FAIL"} (${pass} pass, ${fail} fail)`);
process.exit(fail === 0 ? 0 : 1);
