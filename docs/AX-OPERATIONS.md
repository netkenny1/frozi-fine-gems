# Frozi AX Operations

The site now publishes one product ledger into five representations:

1. Visible product HTML under `/pieces/<slug>/`
2. Product and organization JSON-LD
3. `/catalog.json` for general agents
4. `/feeds/openai-products.csv` for OpenAI merchant onboarding
5. `/sitemap.xml` and IndexNow URL notifications

Run `node scripts/build-ax.mjs` whenever `data/catalog.json` changes. Commit the
source and generated files together. Run both verification suites before
deployment:

```sh
node tests/ax-verify.mjs
node tests/preview-verify.mjs
```

## Facts still required

Do not add these fields until the business has confirmed them:

- Legal business name and trade-license details
- Public telephone or WhatsApp number
- Physical appointment address, or a precise decision to keep it private
- Public social profiles
- Delivery regions, prices, and transit times
- A final made-to-order cancellation, return, and exchange policy
- Independent reviews, awards, certifications, and gemstone reports

The current schema intentionally uses `Organization` with Dubai as
`areaServed`. It does not claim a public storefront or invent an address.

## Search setup

1. Verify the exact public URL in Google Search Console and submit
   `https://netkenny1.github.io/frozi-fine-gems/sitemap.xml`.
2. Verify the site in Bing Webmaster Tools. After deployment, run
   `node scripts/submit-indexnow.mjs` to notify participating search engines.
3. Create or update the Google Business Profile only with verified business
   details. Keep its name, service area, hours, and contact details identical to
   the visible site.
4. Apply for OpenAI merchant onboarding, then upload
   `/feeds/openai-products.csv`. Checkout is deliberately disabled in the feed.
5. Configure Google Merchant Center only after shipping, returns, and
   availability dates are operationally confirmed. Merchant data must match the
   landing pages exactly.

GitHub project pages are hosted below `/frozi-fine-gems/`, while crawler policy
is normally read only from the origin-level `/robots.txt`. The default GitHub
origin behavior permits crawling, but a custom domain is recommended so Frozi
can own the authoritative robots file, Search Console domain property, and
long-term canonical URLs.

## Measurement

Review monthly:

- Indexed canonical product count
- Search Console impressions for Dubai jewelry queries
- Product rich-result and Merchant listing errors
- Referrals from ChatGPT, Bing, Google, and Google Images
- OAI-SearchBot, Googlebot, and Bingbot requests where logs are available
- Appointment requests attributed to organic discovery
- Mobile LCP, INP, CLS, and animation p95 frame time

No technical change guarantees a ranking. The durable advantage is consistent,
verifiable product and business data combined with legitimate local authority,
reviews, and editorial mentions.
