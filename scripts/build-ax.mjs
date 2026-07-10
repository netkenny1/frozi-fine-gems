import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = JSON.parse(await readFile(path.join(root, "data/catalog.json"), "utf8"));
const template = await readFile(path.join(root, "product.html"), "utf8");
const { business, products, lastUpdated, schemaVersion } = source;
const refs = new Set();
const slugs = new Set();

for (const product of products) {
  if (refs.has(product.ref) || slugs.has(product.slug)) {
    throw new Error(`Duplicate product identity: ${product.ref} / ${product.slug}`);
  }
  refs.add(product.ref);
  slugs.add(product.slug);
  for (const field of ["ref", "slug", "name", "category", "price", "currency", "image", "description"]) {
    if (product[field] === undefined || product[field] === "") {
      throw new Error(`Missing ${field} for ${product.ref}`);
    }
  }
}

const byRef = Object.fromEntries(products.map((product) => [product.ref, product]));
for (const product of products) {
  for (const related of product.related) {
    if (!byRef[related]) throw new Error(`Unknown related ref ${related} on ${product.ref}`);
  }
}

const formatPrice = (product) =>
  `${product.currency} ${new Intl.NumberFormat("en-AE").format(product.price)}`;

const escapeHtml = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

const csv = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
const absolute = (relative) => `${business.siteUrl}/${relative.replace(/^\//, "")}`;
const productUrl = (product) => absolute(`pieces/${product.slug}/`);
const imageUrl = (product) => absolute(product.image);
const feedMaterial = (product) => {
  const full = product.materials.join("; ");
  if (full.length <= 100) return full;
  const primary = product.materials[0];
  return primary.toLowerCase().includes("platinum")
    ? primary
    : `${primary}; recycled platinum`;
};

function replaceDataContent(html, attribute, value) {
  const escapedAttribute = attribute.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(
    `(<([a-z0-9]+)[^>]*\\b${escapedAttribute}[^>]*>)[\\s\\S]*?(<\\/\\2>)`,
    "i"
  );
  if (!pattern.test(html)) throw new Error(`Template marker not found: ${attribute}`);
  return html.replace(pattern, `$1${value}$3`);
}

function prefixRelativeUrls(html) {
  return html.replace(/\b(href|src)="([^"]*)"/g, (match, attribute, value) => {
    if (
      !value ||
      value.startsWith("#") ||
      value.startsWith("http://") ||
      value.startsWith("https://") ||
      value.startsWith("mailto:") ||
      value.startsWith("tel:") ||
      value.startsWith("data:") ||
      value.startsWith("../../")
    ) {
      return match;
    }
    return `${attribute}="../../${value}"`;
  });
}

function relatedMarkup(product) {
  return product.related
    .map((ref, index) => {
      const related = byRef[ref];
      return `
          <article class="vitrine reveal" ${index ? `style="--i:${index}" ` : ""}data-tilt>
            <div class="vitrine-top">
              <span class="ref">Ref. ${escapeHtml(related.ref)}</span>
              <span class="ref">${escapeHtml(related.category.replace(/s$/, ""))}</span>
            </div>
            <div class="vitrine-media">
              <img src="../../${escapeHtml(related.image)}" alt="${escapeHtml(related.imageAlt)}" width="${related.imageWidth}" height="${related.imageHeight}" loading="lazy" decoding="async">
            </div>
            <h3 class="vitrine-name"><a href="../../pieces/${escapeHtml(related.slug)}/">${escapeHtml(related.name)}</a></h3>
            <p class="vitrine-sub">${escapeHtml(related.sub)}</p>
            <div class="vitrine-meta">
              <span class="vitrine-price">${escapeHtml(formatPrice(related))}</span>
              <span class="vitrine-cta">View piece</span>
            </div>
          </article>`;
    })
    .join("\n");
}

function productGraph(product) {
  const url = productUrl(product);
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Product",
        "@id": `${url}#product`,
        name: product.name,
        description: product.description,
        image: [imageUrl(product)],
        sku: product.ref,
        mpn: product.ref,
        category: `Fine Jewelry > ${product.category}`,
        material: product.materials,
        brand: {
          "@type": "Brand",
          name: business.name
        },
        additionalProperty: [
          {
            "@type": "PropertyValue",
            name: "Made to order",
            value: product.leadTime
          },
          {
            "@type": "PropertyValue",
            name: "Service area",
            value: "Dubai, United Arab Emirates"
          }
        ],
        offers: {
          "@type": "Offer",
          url,
          priceCurrency: product.currency,
          price: product.price,
          availability: "https://schema.org/BackOrder",
          itemCondition: "https://schema.org/NewCondition",
          seller: {
            "@id": `${business.siteUrl}/#organization`
          }
        }
      },
      {
        "@type": "BreadcrumbList",
        "@id": `${url}#breadcrumbs`,
        itemListElement: [
          {
            "@type": "ListItem",
            position: 1,
            name: "Frozi Fine Gems",
            item: `${business.siteUrl}/`
          },
          {
            "@type": "ListItem",
            position: 2,
            name: "Collection",
            item: `${business.siteUrl}/collections.html`
          },
          {
            "@type": "ListItem",
            position: 3,
            name: product.name,
            item: url
          }
        ]
      }
    ]
  };
}

function renderProduct(product) {
  const title = `${product.name} in Dubai | ${business.name}`;
  const description = `${product.sub}. Made to order in Dubai with a ${product.leadTime.toLowerCase()} bench lead time. Ref. ${product.ref} from ${business.name}.`;
  const url = productUrl(product);
  const meta = `
  <link rel="canonical" href="${url}">
  <meta name="robots" content="index,follow,max-image-preview:large">
  <meta property="og:type" content="product">
  <meta property="og:site_name" content="${escapeHtml(business.name)}">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:url" content="${url}">
  <meta property="og:image" content="${imageUrl(product)}">
  <meta property="og:locale" content="en_AE">
  <meta name="twitter:card" content="summary_large_image">
  <script type="application/ld+json">${JSON.stringify(productGraph(product)).replaceAll("<", "\\u003c")}</script>`;

  let html = prefixRelativeUrls(template);
  html = html.replace('  <meta name="robots" content="noindex,follow">\n', "");
  html = html.replace('<html lang="en-AE">', '<html lang="en-AE" data-site-root="../../">');
  html = html.replace("<body>", `<body data-product-ref="${product.ref}">`);
  html = html.replace(/<title>[\s\S]*?<\/title>/, `<title>${escapeHtml(title)}</title>`);
  html = html.replace(
    /<meta name="description" content="[^"]*">/,
    `<meta name="description" content="${escapeHtml(description)}">${meta}`
  );
  html = replaceDataContent(html, 'data-p-mobile="eyebrow"', `Collection · ${escapeHtml(product.category)} · Ref. ${product.ref}`);
  html = replaceDataContent(html, 'data-p-mobile="name"', escapeHtml(product.name));
  html = replaceDataContent(html, 'data-p-mobile="price"', `${escapeHtml(formatPrice(product))}, made to order`);
  html = replaceDataContent(html, 'data-p="eyebrow"', `Collection · ${escapeHtml(product.category)} · Ref. ${product.ref}`);
  html = replaceDataContent(html, 'data-p="name"', escapeHtml(product.name));
  html = replaceDataContent(html, 'data-p="price"', `${escapeHtml(formatPrice(product))}, made to order`);
  html = replaceDataContent(html, 'data-p="desc"', escapeHtml(product.description));
  html = replaceDataContent(html, 'data-p="refcode"', product.ref);
  html = replaceDataContent(
    html,
    'data-p="materials"',
    product.materials.map((material) => `\n                  <li>${escapeHtml(material)}</li>`).join("")
  );
  html = html.replace(
    /<img data-p="photo"[^>]*>/,
    `<img data-p="photo" src="../../${escapeHtml(product.image)}" alt="${escapeHtml(product.imageAlt)}" width="${product.imageWidth}" height="${product.imageHeight}" fetchpriority="high">`
  );
  if (!product.sizes) {
    html = html.replace('data-p="sizes">', 'data-p="sizes" hidden>');
  }
  html = html.replace(
    /<!-- AX:RELATED:START -->[\s\S]*?<!-- AX:RELATED:END -->/,
    `<!-- AX:RELATED:START -->\n${relatedMarkup(product)}\n          <!-- AX:RELATED:END -->`
  );
  return html;
}

const legacyProducts = Object.fromEntries(
  products.map((product) => [
    product.ref,
    {
      ref: product.ref,
      slug: product.slug,
      name: product.name,
      category: product.category,
      price: formatPrice(product),
      priceValue: product.price,
      currency: product.currency,
      sub: product.sub,
      sizes: product.sizes,
      img: product.image,
      imgW: product.imageWidth,
      imgH: product.imageHeight,
      imgAlt: product.imageAlt,
      desc: product.description,
      materials: product.materials,
      plate: product.plate,
      plateBox: product.plateBox,
      related: product.related
    }
  ])
);

const catalogJs = `// Generated by scripts/build-ax.mjs from data/catalog.json.
(function () {
  "use strict";
  var products = ${JSON.stringify(legacyProducts, null, 2)};
  var root = document.documentElement.getAttribute("data-site-root") || "";
  Object.keys(products).forEach(function (ref) {
    products[ref].img = root + products[ref].img;
    products[ref].href = root + "pieces/" + products[ref].slug + "/";
  });
  window.FROZI_CATALOG = { products: products };
})();
`;
await writeFile(path.join(root, "js/catalog.js"), catalogJs);

const publicCatalog = {
  schemaVersion,
  lastUpdated,
  business,
  products: products.map((product) => ({
    ...product,
    priceLabel: formatPrice(product),
    canonicalUrl: productUrl(product),
    imageUrl: imageUrl(product)
  }))
};
await writeFile(path.join(root, "catalog.json"), `${JSON.stringify(publicCatalog, null, 2)}\n`);

for (const product of products) {
  const output = path.join(root, "pieces", product.slug);
  await mkdir(output, { recursive: true });
  await writeFile(path.join(output, "index.html"), renderProduct(product));
}

const feedHeaders = [
  "is_eligible_search",
  "is_eligible_checkout",
  "item_id",
  "title",
  "description",
  "url",
  "brand",
  "condition",
  "product_category",
  "material",
  "image_url",
  "price",
  "availability",
  "listing_has_variations",
  "seller_name",
  "seller_url",
  "return_policy",
  "is_digital",
  "related_product_id",
  "target_countries",
  "store_country"
];
const feedRows = products.map((product) => ({
  is_eligible_search: "true",
  is_eligible_checkout: "false",
  item_id: product.ref,
  title: product.name,
  description: product.description,
  url: productUrl(product),
  brand: business.name,
  condition: "new",
  product_category: `Jewelry > ${product.category}`,
  material: feedMaterial(product),
  image_url: imageUrl(product),
  price: `${product.price.toFixed(2)} ${product.currency}`,
  availability: "backorder",
  listing_has_variations: product.sizes ? "true" : "false",
  seller_name: business.name,
  seller_url: `${business.siteUrl}/`,
  return_policy: `${business.siteUrl}/policies.html`,
  is_digital: "false",
  related_product_id: product.related.join(","),
  target_countries: "AE",
  store_country: "AE"
}));
const feed = [
  feedHeaders.map(csv).join(","),
  ...feedRows.map((row) => feedHeaders.map((header) => csv(row[header])).join(","))
].join("\n");
await writeFile(path.join(root, "feeds/openai-products.csv"), `${feed}\n`);

const sitemapPages = [
  "",
  "collections.html",
  "about.html",
  "jewelry-dubai.html",
  "contact.html",
  "policies.html",
  "catalog.json",
  ...products.map((product) => `pieces/${product.slug}/`)
];
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemapPages
  .map(
    (page) =>
      `  <url><loc>${business.siteUrl}/${page}</loc><lastmod>${lastUpdated}</lastmod></url>`
  )
  .join("\n")}
</urlset>
`;
await writeFile(path.join(root, "sitemap.xml"), sitemap);

const llms = `# ${business.name}

> ${business.description}

- Canonical site: ${business.siteUrl}/
- Dubai jewelry guide: ${business.siteUrl}/jewelry-dubai.html
- Collection: ${business.siteUrl}/collections.html
- Product catalog (JSON): ${business.siteUrl}/catalog.json
- Appointments: ${business.siteUrl}/contact.html
- Service and order policies: ${business.siteUrl}/policies.html

## Products

${products
  .map(
    (product) =>
      `- [${product.name}](${productUrl(product)}): ${product.sub}; ${formatPrice(product)}; made to order in ${product.leadTime.toLowerCase()}.`
  )
  .join("\n")}

All prices are in AED. The maison serves clients in Dubai by private appointment. Product facts, pricing, and availability should be verified against the canonical product page.
`;
await writeFile(path.join(root, "llms.txt"), llms);

console.log(`Generated ${products.length} product pages, catalog, feed, sitemap, and llms.txt`);
