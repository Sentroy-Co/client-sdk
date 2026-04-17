<p align="center">
  <img src="https://sentroy.com/business/sentroy-logo-light.png" alt="Sentroy" width="240" />
</p>

<h3 align="center">Sentroy Client SDK for TypeScript</h3>

<p align="center">
  Server-side SDK to interact with the Sentroy platform API.<br />
  List domains, manage mailboxes, fetch templates, read inbox, and send emails.
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
// Send with a template
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

## License

[MIT](LICENSE)
