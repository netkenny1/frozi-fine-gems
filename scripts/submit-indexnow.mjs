import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const key = "4422e8b0b084010de7ff20a2f56d556a";
const site = "https://netkenny1.github.io/frozi-fine-gems";
const sitemap = await readFile(path.join(root, "sitemap.xml"), "utf8");
const urlList = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);

if (!urlList.length) throw new Error("No sitemap URLs found");

const response = await fetch("https://api.indexnow.org/indexnow", {
  method: "POST",
  headers: {"content-type": "application/json; charset=utf-8"},
  body: JSON.stringify({
    host: "netkenny1.github.io",
    key,
    keyLocation: `${site}/${key}.txt`,
    urlList
  })
});

if (![200, 202].includes(response.status)) {
  throw new Error(`IndexNow returned HTTP ${response.status}: ${await response.text()}`);
}

console.log(`IndexNow accepted ${urlList.length} canonical URLs (HTTP ${response.status})`);
