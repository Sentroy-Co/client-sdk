<p align="center">
  <img src="https://sentroy.com/business/sentroy-logo-light.png" alt="Sentroy" width="240" />
</p>

<h3 align="center">Sentroy Client SDK</h3>

<p align="center">
  Official TypeScript SDK for the <a href="https://sentroy.com">Sentroy</a> business mail &amp; storage platform.<br />
  Send transactional and bulk email, manage domains and mailboxes, run an inbox, store and serve media — from one typed client.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@sentroy-co/client-sdk"><img src="https://img.shields.io/npm/v/@sentroy-co/client-sdk.svg" alt="npm version" /></a>
  <a href="https://www.npmjs.com/package/@sentroy-co/client-sdk"><img src="https://img.shields.io/npm/dm/@sentroy-co/client-sdk.svg" alt="npm downloads" /></a>
  <a href="https://github.com/Sentroy-Co/client-sdk/blob/main/LICENSE"><img src="https://img.shields.io/npm/l/@sentroy-co/client-sdk.svg" alt="license" /></a>
</p>

<p align="center">
  <a href="https://docs.sentroy.com"><strong>Documentation</strong></a>
  &nbsp;·&nbsp;
  <a href="https://docs.sentroy.com/mail">Mail</a>
  &nbsp;·&nbsp;
  <a href="https://docs.sentroy.com/storage">Storage</a>
  &nbsp;·&nbsp;
  <a href="https://docs.sentroy.com/react">React components</a>
  &nbsp;·&nbsp;
  <a href="https://status.sentroy.com">Status</a>
</p>

---

## What's in the box

- **Mail** — verified domains, mailboxes, multi-language templates, IMAP-backed inbox, transactional and bulk send, suppressions, webhooks, audience lists, deliverability logs.
- **Storage** — isolated buckets, multipart uploads, image and media transformations, signed download URLs.
- **React drop-ins** — `<MediaManager />` and `<MediaManagerTrigger />` for instant uploaders, no glue code (`@sentroy-co/client-sdk/react`).
- **One client, two backends** — point at `https://sentroy.com` for the hosted platform, or your own deployment for self-hosted. Same API, same types.

## Install

```bash
npm install @sentroy-co/client-sdk
```

## First request

```ts
import { Sentroy } from "@sentroy-co/client-sdk"

const sentroy = new Sentroy({
  baseUrl: "https://sentroy.com",   // or your self-hosted URL
  companySlug: "my-company",
  accessToken: "stk_...",            // Dashboard → Admin → Access Tokens
})

// Send your first transactional email
await sentroy.send.email({
  from: "noreply@yourdomain.com",
  to: ["customer@example.com"],
  subject: "Welcome to Acme",
  html: "<p>Glad you're here.</p>",
})
```

## Upload a file

```ts
const file = new File([blob], "invoice.pdf", { type: "application/pdf" })

const media = await sentroy.media.upload({
  bucketSlug: "invoices",
  file,
})

console.log(media.url) // signed URL, served from the CDN
```

That's the smallest useful surface. Every other resource (`domains`, `mailboxes`, `templates`, `inbox`, `audience`, `webhooks`, `suppressions`, `logs`, `buckets`, `media`) follows the same `sentroy.<resource>.<verb>(...)` shape with full TypeScript types.

## Self-hosted vs hosted

The SDK is identical in both modes. Only `baseUrl` changes:

| Mode | `baseUrl` |
|---|---|
| Sentroy Cloud (hosted) | `https://sentroy.com` |
| Self-hosted | `https://your-sentroy-host` |

Pick the deployment that fits your compliance, latency and cost requirements. Migrate either direction without changing application code.

## Documentation

Full reference, interactive examples, and multi-language code samples (TypeScript, Go, Python, PHP, cURL) live at:

**[docs.sentroy.com](https://docs.sentroy.com)**

Sections: [Quickstart](https://docs.sentroy.com) · [Mail](https://docs.sentroy.com/mail) · [Storage](https://docs.sentroy.com/storage) · [React](https://docs.sentroy.com/react) · [Tools](https://docs.sentroy.com/tools)

## Requirements

- Node.js 18+ (uses native `fetch`)
- React 18+ (only if you import from `/react`)
- Tailwind CSS in the host app (only for React components)

## For AI agents

A single-file, comprehensive reference covering every endpoint, parameter and response shape lives at [`AGENTS.md`](AGENTS.md). Drop the raw URL into a context window:

```
https://raw.githubusercontent.com/Sentroy-Co/client-sdk/refs/heads/main/typescript/AGENTS.md
```

## License

[MIT](LICENSE)
