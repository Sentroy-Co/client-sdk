<p align="center">
  <img src="https://sentroy.com/business/sentroy-logo-light.png" alt="Sentroy" width="240" />
</p>

<h3 align="center">Sentroy Client SDK for TypeScript</h3>

<p align="center">
  Server-side SDK to interact with the Sentroy platform API.<br />
  Manage mail (domains, mailboxes, templates, inbox, send) and storage (buckets, media) from a single entry point.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@sentroy-co/client-sdk"><img src="https://img.shields.io/npm/v/@sentroy-co/client-sdk.svg" alt="npm version" /></a>
  <a href="https://www.npmjs.com/package/@sentroy-co/client-sdk"><img src="https://img.shields.io/npm/dm/@sentroy-co/client-sdk.svg" alt="npm downloads" /></a>
  <a href="https://github.com/Sentroy-Co/client-sdk/blob/main/LICENSE"><img src="https://img.shields.io/npm/l/@sentroy-co/client-sdk.svg" alt="license" /></a>
</p>

---

## Installation

```bash
npm install @sentroy-co/client-sdk
```

## Quick Start

```ts
import { Sentroy } from "@sentroy-co/client-sdk"

const sentroy = new Sentroy({
  baseUrl: "https://sentroy.com",
  companySlug: "my-company",
  accessToken: "stk_...",
})
```

> Access tokens can be created from **Admin > Access Tokens** in the Sentroy dashboard.

## Usage

### Domains

```ts
// List all domains
const domains = await sentroy.domains.list()

// Get a single domain
const domain = await sentroy.domains.get("domain-id")
```

### Mailboxes

```ts
// List all mailbox accounts
const mailboxes = await sentroy.mailboxes.list()
```

### Templates

```ts
// List all templates
const templates = await sentroy.templates.list()

// Get a template by ID
const template = await sentroy.templates.get("template-id")
```

Templates support multiple languages via `LocalizedString`. A field can be a plain string or an object keyed by language code:

```jsonc
// Example template response
{
  "id": "b3f1a2c4-...",
  "name": { "en": "Welcome Email", "tr": "Hosgeldin E-postasi" },
  "subject": { "en": "Welcome, {{name}}!", "tr": "Hosgeldin, {{name}}!" },
  "mjmlBody": { "en": "<mjml>...</mjml>", "tr": "<mjml>...</mjml>" },
  "variables": ["name", "company"],
  "domainId": "a1b2c3d4-...",
  "domainName": "example.com",
  "createdAt": "2026-01-15T10:30:00.000Z",
  "updatedAt": "2026-04-10T14:22:00.000Z"
}
```

Use the `variables` array to know which placeholders (`{{name}}`, `{{company}}`) the template expects.

### Inbox

```ts
// List messages
const messages = await sentroy.inbox.list({
  mailbox: "info@example.com",
  folder: "INBOX",
  page: 1,
  limit: 20,
})

// Get a single message
const message = await sentroy.inbox.get(1234, {
  mailbox: "info@example.com",
})

// List IMAP folders
const folders = await sentroy.inbox.listFolders("info@example.com")

// Get a thread by subject
const thread = await sentroy.inbox.getThread("Re: Project update", "info@example.com")

// Mark as read / unread
await sentroy.inbox.markAsRead(1234, { mailbox: "info@example.com" })
await sentroy.inbox.markAsUnread(1234, { mailbox: "info@example.com" })

// Move message
await sentroy.inbox.move(1234, "Trash", {
  from: "INBOX",
  mailbox: "info@example.com",
})

// Delete message
await sentroy.inbox.delete(1234, { mailbox: "info@example.com" })
```

### Send Email

```ts
// Send with a template (uses default language)
const result = await sentroy.send.email({
  to: "user@example.com",
  from: "info@example.com",
  subject: "Welcome!",
  domainId: "domain-id",
  templateId: "template-id",
  variables: {
    name: "John",
    company: "Acme",
  },
})

// Send with a specific language
const result = await sentroy.send.email({
  to: "user@example.com",
  from: "info@example.com",
  subject: "Hosgeldin!",
  domainId: "domain-id",
  templateId: "template-id",
  lang: "tr",
  variables: { name: "Ahmet" },
})

// Send with raw HTML
const result = await sentroy.send.email({
  to: ["user1@example.com", "user2@example.com"],
  from: "info@example.com",
  subject: "Hello",
  domainId: "domain-id",
  html: "<h1>Hello World</h1>",
})

// Send with attachments
const result = await sentroy.send.email({
  to: "user@example.com",
  from: "info@example.com",
  subject: "Invoice",
  domainId: "domain-id",
  html: "<p>Please find your invoice attached.</p>",
  attachments: [
    {
      filename: "invoice.pdf",
      content: base64String,
      contentType: "application/pdf",
    },
  ],
})
```

### Buckets

Storage is organized into **buckets** — isolated containers with their own
visibility (public vs private) and usage counters.

```ts
// List all buckets in the company
const buckets = await sentroy.buckets.list()

// Get a single bucket by its slug
const bucket = await sentroy.buckets.get("product-assets")

// Create a bucket (slug auto-derived from name if omitted)
const created = await sentroy.buckets.create({
  name: "User Uploads",
  description: "Avatars and profile media",
  isPublic: false,
})

// Update a bucket — toggling isPublic cascades to every file's ACL
await sentroy.buckets.update("product-assets", { isPublic: true })

// Delete a bucket (409 if it has files; use force to purge everything)
await sentroy.buckets.delete("product-assets", { force: true })
```

### Media

Upload, list, download, and delete files inside a bucket. The same token
that authorizes mail calls also authorizes storage calls.

```ts
// List files in a bucket
const { items, total } = await sentroy.media.list("product-assets", {
  type: "image",
  limit: 50,
})

// Get a single media record
const media = await sentroy.media.get("product-assets", mediaId)

// Upload — browser (File from <input>)
const input = document.querySelector<HTMLInputElement>("input[type=file]")!
const file = input.files![0]
const uploaded = await sentroy.media.upload("product-assets", {
  body: file,
  folder: "products",
  tags: ["v1", "cover"],
})
console.log(uploaded.url) // Public URL from the CDN

// Upload — Node.js (Blob from fs)
import { openAsBlob } from "node:fs"
const blob = await openAsBlob("./photo.jpg")
const uploaded = await sentroy.media.upload("product-assets", {
  body: blob,
  filename: "photo.jpg",
  isPublic: true,
})

// Download — streams from the storage backend; works for both public
// and private buckets (auth-gated for private).
const blob = await sentroy.media.download("product-assets", mediaId)
// Variant: ask for a pre-generated thumbnail width (falls back to
// original if that size wasn't generated for this file).
const thumb = await sentroy.media.download("product-assets", mediaId, {
  quality: 500,
})

// Delete — removes S3 objects (original + thumbnails) + Media record
await sentroy.media.delete("product-assets", mediaId)
```

## Error Handling

```ts
import { Sentroy, SentroyError } from "@sentroy-co/client-sdk"

try {
  await sentroy.send.email({ ... })
} catch (err) {
  if (err instanceof SentroyError) {
    console.error(err.statusCode) // 401, 403, 500, etc.
    console.error(err.message)    // Human-readable error
  }
}
```

## Configuration

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `baseUrl` | `string` | Yes | Sentroy instance URL (e.g. `https://sentroy.com`) |
| `companySlug` | `string` | Yes | Your company slug |
| `accessToken` | `string` | Yes | Access token (`stk_...`) |
| `timeout` | `number` | No | Request timeout in ms (default: `30000`) |

## Requirements

- Node.js 18+ (uses native `fetch`)
- Server-side only

## Raw Documentation

For AI agents and LLMs — plain-text version of this document:

```
https://raw.githubusercontent.com/Sentroy-Co/client-sdk/refs/heads/main/typescript/README.md
```

## License

[MIT](LICENSE)
