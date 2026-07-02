# Frozi Fine Gems — backend

GitHub Pages serves the site but cannot run server code, so the storefront
ships with two transports:

- **Today (no setup):** submitting the bag or the appointment form composes
  a structured email to the atelier in the visitor's mail app, and the
  on-page confirmation still shows. Orders live in the visitor's outbox.
- **Live business:** deploy this worker, flip one constant, and every
  order and appointment note is stored server-side (and optionally
  forwarded to your inbox).

## Deploy in five minutes

Requires a free [Cloudflare](https://dash.cloudflare.com/sign-up) account
and Node.js.

```sh
cd backend
npx wrangler login
npx wrangler kv namespace create INQUIRIES
# paste the printed id into wrangler.toml, then:
npx wrangler deploy
```

Wrangler prints the worker URL, e.g. `https://frozi-api.<account>.workers.dev`.

## Connect the site

In `js/store.js`, set the constant at the top:

```js
var API_BASE = "https://frozi-api.<account>.workers.dev";
```

Commit and push — that is the whole switch. Submissions now POST to
`/api/inquiries` and are stored in KV. Read them any time:

```sh
npx wrangler kv key list --binding INQUIRIES --remote
npx wrangler kv key get --binding INQUIRIES --remote "<key>"
```

## Optional: email notifications

Create a free [Resend](https://resend.com) account, verify your domain,
then:

```sh
npx wrangler secret put RESEND_API_KEY
npx wrangler secret put NOTIFY_EMAIL     # where notifications go
npx wrangler secret put FROM_EMAIL       # a sender on your verified domain
```

Every inquiry is then forwarded to your inbox with reply-to set to the
client, and the KV record remains the source of truth.

## Notes

- `ALLOWED_ORIGINS` in `wrangler.toml` controls CORS; add your custom
  domain there when you have one (comma-separated).
- The hidden `website` field in both forms is a honeypot; the worker
  accepts-and-drops anything that fills it.
- Bodies over 10 KB are rejected. There is no GET API on purpose —
  inquiries are read with wrangler, not over the open web.
