<p align="center">
  <img src="https://sentroy.com/business/sentroy-logo-light.png" alt="Sentroy" width="240" />
</p>

<h3 align="center">Sentroy Client SDK for TypeScript — Full Reference</h3>

<p align="center">
  Comprehensive single-file reference covering every resource, parameter, and response shape.<br />
  Optimised for AI agents and LLMs — feed the raw URL of this file into a context window and the assistant has the complete API surface.
</p>

<p align="center">
  <strong>Humans:</strong> start with the lean <a href="README.md">README</a> or browse <a href="https://docs.sentroy.com">docs.sentroy.com</a> for searchable, interactive docs.
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

#### Creating a template

`name`, `subject`, and `mjmlBody` are each a `LocalizedString` — a plain
string or a `{ tr, en, ... }` map. `domainId` is **required** and must be
the id of a verified sending domain.

```ts
// Create — localized name/subject/mjmlBody
const template = await sentroy.templates.create({
  name: { en: "Welcome Email", tr: "Hosgeldin E-postasi" },
  subject: { en: "Welcome, {{name}}!", tr: "Hosgeldin, {{name}}!" },
  mjmlBody: {
    en: "<mjml><mj-body><mj-section><mj-column><mj-text>Hi {name}</mj-text></mj-column></mj-section></mj-body></mjml>",
    tr: "<mjml><mj-body><mj-section><mj-column><mj-text>Merhaba {name}</mj-text></mj-column></mj-section></mj-body></mjml>",
  },
  domainId: "domain-id",
})

// Update — partial; pass at least one of name / subject / mjmlBody
await sentroy.templates.update(template.id, {
  subject: { en: "Welcome aboard, {{name}}!", tr: "Aramiza hos geldin, {{name}}!" },
})

// Delete
await sentroy.templates.delete(template.id)
```

There is **no** `variables` input — you never declare placeholders. The
platform auto-extracts the variable list from the body (and subject) and
returns it on the resulting `Template` as `variables: string[]`.

Raw HTTP (platform gateway; `Bearer stk_...` token, permission
`templates.manage`). The SDK adds the gateway prefix for you, so SDK
paths are just `/templates` — the full REST paths are:

```bash
# Create → 201 Template
curl -X POST "https://sentroy.com/api/mail/companies/my-company/templates" \
  -H "Authorization: Bearer stk_..." \
  -H "Content-Type: application/json" \
  -d '{
    "name": {"en": "Welcome Email", "tr": "Hosgeldin E-postasi"},
    "subject": {"en": "Welcome, {{name}}!", "tr": "Hosgeldin, {{name}}!"},
    "mjmlBody": {"en": "<mjml>...</mjml>", "tr": "<mjml>...</mjml>"},
    "domainId": "domain-id"
  }'

# Update → 200 Template (partial body, at least one field)
curl -X PATCH "https://sentroy.com/api/mail/companies/my-company/templates/{id}" \
  -H "Authorization: Bearer stk_..." \
  -H "Content-Type: application/json" \
  -d '{"subject": {"en": "Welcome aboard, {{name}}!"}}'

# Delete → { "message": "..." }
curl -X DELETE "https://sentroy.com/api/mail/companies/my-company/templates/{id}" \
  -H "Authorization: Bearer stk_..."
```

#### Template variables

The body uses a Mustache-like, regex-based engine (single-level — nested
sections are **not** supported). Variable names match `\w+` (letters,
digits, underscore; case-sensitive — no dashes or dots) and there is **no**
default-value syntax. An unmatched placeholder is left in the output
verbatim. Both brace forms are equivalent.

| Syntax | Meaning |
|---|---|
| `{name}` / `{{name}}` | Scalar substitution |
| `{#items} ... {/items}` | Array section — repeats once per element; element fields are in scope inside (e.g. `{title}`, `{price}`) |
| `{^name} ... {/^name}` | Inverted section — renders only when `name` is missing / empty / false |

At send time, pass the values in the `variables` object — scalars plus
arrays for sections:

```ts
await sentroy.send.email({
  to: "user@example.com",
  from: "info@example.com",
  subject: "Your receipt",
  domainId: "domain-id",
  templateId: "template-id",
  variables: {
    firstName: "Ada",
    hasItems: true,
    items: [{ title: "Keyboard", price: "$80" }],
  },
})
```

If a template references a variable the send call does not provide, the
request is rejected with **HTTP 422** listing the missing names.

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

### Audience

Manage contacts and audience lists from the SDK. Useful for building
your own newsletter signup form, syncing customers from another system,
or assembling segments for a campaign.

```ts
// List + paginate contacts (filter by status / tags)
const { contacts, total, page, limit } = await sentroy.audience.contacts.list({
  page: 1,
  limit: 50,
  status: "active",
  tags: ["customer", "vip"],
})

// Email-prefix autocomplete (capped at 10 server-side)
const matches = await sentroy.audience.contacts.search("alex@")

// Create a contact
const contact = await sentroy.audience.contacts.create({
  email: "user@example.com",
  name: "Jane Doe",
  tags: ["beta-tester"],
  metadata: { signupSource: "landing-2026-q2" },
})

// Patch — pass any subset of fields. Use `status` to mark unsubscribed.
await sentroy.audience.contacts.update(contact.id, { tags: ["customer"] })

// Soft-delete (sets status: "unsubscribed" — record is preserved)
await sentroy.audience.contacts.delete(contact.id)
```

Audience lists are simple groupings; a single contact can belong to many.

```ts
// CRUD audience lists
const lists = await sentroy.audience.lists.list()
const list = await sentroy.audience.lists.create({
  name: "Newsletter — May 2026",
  description: "Opt-ins from the homepage form",
})
await sentroy.audience.lists.delete(list.id)

// Membership — scoped to a single list id
const members = sentroy.audience.lists.members(list.id)
await members.add(contact.id)
const inList = await members.list()
await members.remove(contact.id)
```

### Suppressions

Suppressed addresses are skipped at send time. Bounces and complaints
are added automatically; the API is for manually honoring off-platform
opt-outs or removing a stale entry.

```ts
const suppressions = await sentroy.suppressions.list({
  domainId: "domain-id",
  reason: "complaint",
  page: 1,
  limit: 50,
})

const added = await sentroy.suppressions.add({
  email: "leaving@example.com",
  domainId: "domain-id",
  reason: "manual",
})

await sentroy.suppressions.remove(added.id)
```

### Webhooks

Subscribe to delivery events on a per-domain basis. The `secret`
returned at create time signs every delivery — store it and verify the
HMAC on your endpoint.

```ts
const webhook = await sentroy.webhooks.create({
  url: "https://example.com/webhooks/sentroy",
  events: ["sent", "bounced", "opened", "clicked", "unsubscribed"],
  domainId: "domain-id",
})
console.log(webhook.secret) // Returned ONCE — store it now

const all = await sentroy.webhooks.list()           // every webhook
const scoped = await sentroy.webhooks.list("domain-id")

await sentroy.webhooks.update(webhook.id, { active: false })
await sentroy.webhooks.delete(webhook.id)
```

### Logs

Query the mail log to debug delivery issues, surface per-message status
in your own UI, or build a customer-facing activity timeline.

```ts
const logs = await sentroy.logs.list({
  status: "bounced",
  domainId: "domain-id",
  from: "2026-05-01T00:00:00Z",
  to: "2026-05-31T23:59:59Z",
  page: 1,
  limit: 100,
})

const log = await sentroy.logs.get(logs[0].id)
console.log(log.openedAt, log.clickedAt) // tracking timestamps if enabled
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

#### Thumbnail URL helpers

When you upload an image, the CDN auto-generates several thumbnail
sizes (`media.imageMeta.thumbnails`). Showing the original 4000-px JPG
in a 56-px avatar wastes bandwidth and slows render. Use these helpers
to pick the right URL for the display target:

```ts
import {
  pickThumbnailUrl,
  pickPresetThumbnailUrl,
  THUMBNAIL_PRESETS,
} from "@sentroy-co/client-sdk"

// Manual target (px) — pass display size * 2 for retina
const avatarUrl = pickThumbnailUrl(media, 56 * 2)

// Semantic preset — avatar / card / preview / hero
const cardUrl = pickPresetThumbnailUrl(media, "card") // → ~500px
const previewUrl = pickPresetThumbnailUrl(media, "preview") // → ~960px
```

The helper picks the smallest thumbnail that still **covers** the
target (so you never upscale), then falls back through:

1. `thumbnail.url` if the backend exposed it directly,
2. CDN-prefix + `thumbnail.fileName` derived from `media.url`,
3. proxy `media.downloadUrl?quality=N` for private buckets,
4. `media.url` / `media.downloadUrl` if no thumbnails exist
   (non-image, or image upload before thumbnails were generated).

Returns `undefined` only when the media has no public URL at all.

| Preset      | Target px | Use case |
|-------------|-----------|----------|
| `avatar`    | 128       | Round chips, 28-64 px display @2x |
| `card`      | 500       | Grid / list cards, 200-300 px |
| `preview`   | 960       | Modal / detail view |
| `hero`      | 1600      | Full-bleed hero, edge cases |

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

## React components (`@sentroy-co/client-sdk/react`)

Optional subpath. Only loaded if you import it; React + react-dom are
declared as **optional peer dependencies** so server-only consumers
don't need to install them.

```bash
npm install react react-dom
```

### `MediaManager`

Drop-in storage browser/uploader for end-user apps. Talks to the same
Sentroy client you already use; renders Tailwind classes (host app's
Tailwind setup is reused — the package ships no styles).

```tsx
"use client"

import { Sentroy } from "@sentroy-co/client-sdk"
import { MediaManager } from "@sentroy-co/client-sdk/react"

const client = new Sentroy({
  baseUrl: "https://sentroy.com",
  companySlug: "my-company",
  accessToken: "stk_...",
})

export default function Page() {
  return (
    <MediaManager
      client={client}
      multiple
      accept="image/*"
      onChange={(selected) => console.log(selected)}
      onSelect={(selected) => console.log("confirmed:", selected)}
    />
  )
}
```

#### Features

- Bucket selector (auto-picks first if `bucketSlug` not provided)
- Search (filename) + file-type filter (image / video / audio / pdf / doc / archive / code)
- Upload via button **and** drag-and-drop
- Single or multi selection (`multiple` prop)
- `initialValue` accepts `Media[]` or `string[]` (id list) — pre-selected
  on mount, fires `onChange` immediately so parent state stays in sync
- Press `Space` while a card is selected → opens it in fullscreen
  **Lightbox** (image / video / audio render natively, others get a
  download fallback). `Esc` closes, `←/→` step through siblings
- Detail pane on the right (large screens) — preview, metadata,
  delete, "Use selection" CTA when `onSelect` provided

#### Props

| Prop                 | Type                                                  | Required | Description |
|----------------------|-------------------------------------------------------|:-:|:--|
| `client`             | `Sentroy`                                             | Yes | The configured client instance |
| `bucketSlug`         | `string`                                              |  | Initial bucket; default = first one in the list |
| `multiple`           | `boolean`                                             |  | Allow multi-selection. Default `false` |
| `maxItems`           | `number`                                              |  | Cap for multi-mode. New selections are silently blocked once reached. Ignored when `multiple=false` |
| `accept`             | `string`                                              |  | File type filter — applies to upload **and** the grid. Same syntax as `<input accept>`: `"image/*"`, `"image/png,image/jpeg"`, `".pdf,.docx"`, comma-separated combos |
| `initialValue`       | `Array<Media \| string>`                              |  | Pre-selected items (objects or ids) |
| `onChange`           | `(selected: Media[]) => void`                         |  | Fires on every selection change |
| `onSelect`           | `(selected: Media[]) => void`                         |  | Fires on confirm — picker dialogs use this |
| `bucketFilter`       | `(b: Bucket) => boolean`                              |  | Filter the bucket dropdown — hide system buckets |
| `showDetailsPane`    | `boolean`                                             |  | Default `true` |
| `showBucketSelector` | `boolean`                                             |  | Default `true` |
| `className`          | `string`                                              |  | Root wrapper class |
| `classNames`         | `MediaManagerClassNames`                              |  | Per-region class overrides (see theming) |

#### Theming

The component uses Tailwind utility classes that consume your design
tokens (`bg-background`, `text-foreground`, `border-border`,
`text-muted-foreground`, `bg-muted`, etc.). Drop-in usage in any
shadcn-style codebase needs no extra setup.

For finer control, override individual sections via `classNames`:

```tsx
<MediaManager
  client={client}
  className="h-[600px] rounded-2xl border-purple-200"
  classNames={{
    toolbar: "bg-purple-50",
    uploadButton: "bg-purple-600 text-white",
    cardSelected: "ring-purple-400 border-purple-400",
    grid: "sm:grid-cols-2 md:grid-cols-3", // override grid density
  }}
/>
```

Available keys: `root`, `toolbar`, `searchInput`, `filterSelect`,
`uploadButton`, `bucketSelect`, `grid`, `card`, `cardSelected`,
`thumbnail`, `cardMeta`, `empty`, `details`, `dropZoneOverlay`.

When you migrate to a different theme system later, change tokens in
one place — every Tailwind utility resolves through your `globals.css`.

### `MediaManagerTrigger`

A wrapper that turns **any** clickable element into a media picker — when
the user clicks the `trigger`, a portal-rendered modal opens with
`MediaManager` inside, and `onSelect` fires with the confirmed selection.

The use case: you don't want a giant manager taking up real estate on your
profile/settings page — you just want a "Change avatar" button (or even
a clickable avatar thumbnail) that pops the picker on demand.

```tsx
"use client"

import { Sentroy } from "@sentroy-co/client-sdk"
import { MediaManagerTrigger } from "@sentroy-co/client-sdk/react"

const client = new Sentroy({
  baseUrl: "https://sentroy.com",
  companySlug: "my-company",
  accessToken: "stk_...",
})

export function AvatarPicker({
  current,
  onChange,
}: {
  current: string | null
  onChange: (url: string) => void
}) {
  return (
    <MediaManagerTrigger
      client={client}
      maxItems={1}
      accept="image/*"
      title="Choose your avatar"
      description="Pick an existing image or upload a new one."
      trigger={
        <button className="rounded-full ring-2 ring-border hover:ring-primary">
          {current ? (
            <img src={current} alt="" className="size-10 rounded-full" />
          ) : (
            <span className="grid size-10 place-items-center rounded-full bg-muted text-xs">
              ?
            </span>
          )}
        </button>
      }
      onSelect={(media) => {
        if (media[0]?.url) onChange(media[0].url)
      }}
    />
  )
}
```

#### Multi-select with cap

```tsx
<MediaManagerTrigger
  client={client}
  maxItems={5}
  accept="image/*,video/*"
  trigger={<Button>Add gallery items</Button>}
  onSelect={(media) => setGallery(media)}
/>
```

`maxItems > 1` automatically enables multi-mode. Once the user reaches
the cap, additional clicks on unselected cards are silently no-op'd —
they have to deselect something to swap.

#### Controlled mode

If you want the parent to drive open/close (e.g. opening from a context
menu), pass `open` + `onOpenChange`. The `trigger` is still rendered so
its click also opens the modal — to render only the modal, pass an empty
fragment for `trigger`.

```tsx
const [open, setOpen] = useState(false)

<MediaManagerTrigger
  client={client}
  open={open}
  onOpenChange={setOpen}
  trigger={<></>}
  onSelect={(media) => { /* … */ }}
/>
```

#### Props

| Prop               | Type                              | Required | Description |
|--------------------|-----------------------------------|:-:|:--|
| `client`           | `Sentroy`                         | Yes | Same client you pass to `MediaManager` |
| `trigger`          | `ReactNode`                       | Yes | The clickable element. Wrapped in `<span role="button">` with click + keyboard (Enter / Space) handlers |
| `onSelect`         | `(selected: Media[]) => void`     | Yes | Fires when user confirms; modal auto-closes |
| `maxItems`         | `number`                          |  | `1` = single (default), `>1` = multi up to cap |
| `accept`           | `string`                          |  | Same `<input accept>` syntax — applies to upload **and** grid filter |
| `title`            | `string`                          |  | Modal heading. Default `"Select media"` |
| `description`      | `string`                          |  | Subheading under the title |
| `open`             | `boolean`                         |  | Controlled open state |
| `onOpenChange`     | `(open: boolean) => void`         |  | Controlled change handler |
| `disabled`         | `boolean`                         |  | Trigger ignores clicks; visual disabled state |
| `confirmLabel`     | `string`                          |  | Default `"Use selection"` |
| `cancelLabel`      | `string`                          |  | Default `"Cancel"` |
| `modalClassName`   | `string`                          |  | Class on the modal panel |
| `triggerClassName` | `string`                          |  | Class on the trigger wrapper span |
| …                  | rest of `MediaManagerProps`       |  | `bucketSlug`, `bucketFilter`, `showDetailsPane`, `classNames`, etc. forwarded to the inner `MediaManager` |

The modal renders into `document.body` via `react-dom` portal, so it
escapes parent `overflow:hidden` / transform stacking contexts. `Esc`
closes; backdrop click closes; body scroll is locked while open.

#### `Lightbox` (standalone)

Exported separately so you can use it outside `MediaManager` (e.g. in
a feed view):

```tsx
import { Lightbox } from "@sentroy-co/client-sdk/react"

const [active, setActive] = useState<Media | null>(null)

return (
  <>
    {/* …trigger… */}
    {active && (
      <Lightbox media={active} onClose={() => setActive(null)} />
    )}
  </>
)
```

Image / video / audio rendered inline; everything else gets a download
button. `Esc` closes, optional `onPrev` / `onNext` add ←/→ navigation.

#### Helpers

```ts
import {
  cn,           // tiny class joiner
  formatBytes,  // 1234 → "1.21 KB"
  detectKind,   // image | video | audio | pdf | doc | archive | code | other
  matchAccept,  // matchAccept(file, "image/*,.pdf") → boolean
  KIND_LABELS,
  type MediaKind,
} from "@sentroy-co/client-sdk/react"
```

## Env Vault (`@sentroy-co/client-sdk/vault` + `/vault/react`)

Sentroy Env Vault — centralized runtime env management. Bootstrap is a
single env (`SENTROY_ENV_API_KEY`); the rest of your config lives in
the dashboard at `vault.sentroy.com`. Changing a variable does NOT
require an app rebuild — the next read picks up the new value once the
in-memory cache TTL elapses (5 min default).

This module is intentionally **separate** from the main `Sentroy`
client. They use different auth namespaces:

| Surface | Token format | Scope |
|---|---|---|
| `Sentroy` (mail/storage) | `stk_...` | per-company access token |
| Env Vault | `stk_env_...` | per-(project, environment) bootstrap token |

### Server: `getEnv()`

```ts
import {
  configureEnvClient,   // optional one-shot config
  getEnv,               // async, undefined if missing
  getEnvOrThrow,        // async, throws if missing
  getAllEnvs,           // bulk: { KEY: value, ... }
  getPublicEnvs,        // bulk: only `public: true` variables
  preloadEnv,           // eager hydrate at process boot
  refreshEnvCache,      // manual invalidation hook
  setEnvCacheTTL,       // runtime TTL override (seconds)
} from "@sentroy-co/client-sdk/vault"

// Optional — defaults pull from process.env
configureEnvClient({
  baseUrl: "https://sentroy.com",        // or self-hosted Sentroy URL
  apiKey: process.env.SENTROY_ENV_API_KEY, // default
  ttlSeconds: 300,                          // 5 min
  timeoutMs: 5000,
})

await preloadEnv() // optional: fail-fast if token invalid

const dbUrl = await getEnv("DATABASE_URL")          // string | undefined
const turn  = await getEnvOrThrow("TURNSTILE_SECRET") // string
const all   = await getAllEnvs()                     // includes private
const pub   = await getPublicEnvs()                  // public:true only
```

### React: SSR-injected provider + hook

```tsx
// app/layout.tsx (server component)
import { getPublicEnvs } from "@sentroy-co/client-sdk/vault"
import { EnvProvider } from "@sentroy-co/client-sdk/vault/react"

export default async function RootLayout({ children }) {
  const envs = await getPublicEnvs() // public:true only — never leak secrets
  return (
    <html>
      <body>
        <EnvProvider envs={envs}>{children}</EnvProvider>
      </body>
    </html>
  )
}
```

```tsx
// any "use client" component
"use client"
import { useEnv, useAllEnvs, useEnvRefresh } from "@sentroy-co/client-sdk/vault/react"

function CaptchaWidget() {
  const siteKey = useEnv("TURNSTILE_SITE_KEY") // string | undefined
  if (!siteKey) return null
  return <Turnstile siteKey={siteKey} />
}

function ConfigPanel() {
  const all = useAllEnvs() // Record<string, string> — public envs only
  const { refresh, loading } = useEnvRefresh()
  return <button onClick={refresh} disabled={loading}>Refresh config</button>
}
```

### `EnvProvider` props

| Prop | Type | Default | Notes |
|---|---|---|---|
| `envs` | `Record<string, string>` | required | SSR-fetched public envs |
| `refreshUrl` | `string` | `/api/env-vault/public` | Endpoint for client polling |
| `apiKey` | `string` | `process.env.NEXT_PUBLIC_SENTROY_ENV_API_KEY` | Bearer token for browser polling |
| `refreshIntervalMs` | `number` | `300000` (5 min) | `0` to disable polling |

### Debug logging (`SENTROY_ENV_DEBUG`)

Set `SENTROY_ENV_DEBUG=1` (or `true`) on the consuming app to surface every fetch, cache hit, and fallback through `console.log`. Sample output:

```
[env-vault] fetching https://sentroy.com/api/env-vault/fetch
[env-vault] fetched 7 var(s) from sentroy-core/prod in 234ms
[env-vault] BETTER_AUTH_TURNSTILE_SECRET: vault hit
[env-vault] IPINFO_TOKEN: vault miss → process.env fallback
[env-vault] AI_GATEWAY_API_KEY: vault error (...) → process.env fallback
```

Default is off — turn on temporarily after a deploy to verify migrations are reading from the right source, then turn off to keep prod logs clean.

### Migration helper: `getEnvWithFallback(key)`

For codebases moving from `process.env` to vault gradually, use `getEnvWithFallback` — it tries vault first, falls back to `process.env[key]` on cache miss / fetch failure / missing token. The point is *zero downtime*: deploy the code change before populating the vault, and nothing breaks; fill the vault later, and the same code starts reading from there.

```ts
import { getEnvWithFallback } from "@sentroy-co/client-sdk/vault"

// Old:                     process.env.STRIPE_SECRET_KEY
const stripeKey = await getEnvWithFallback("STRIPE_SECRET_KEY")
```

After the value is in the vault and you've verified it's being read, swap the call to `getEnv` (or `getEnvOrThrow`) so a future `process.env` re-introduction doesn't silently shadow the vault value.

Bootstrap path (no `SENTROY_ENV_API_KEY` set) skips the fetch entirely and goes straight to `process.env` — so an app deployed without vault credentials still boots and reads its envs the legacy way. This is intentional: the vault is opt-in, not a hard requirement.

### Security notes

- `useEnv()` only ever returns variables marked `public: true` in the dashboard. Server-only secrets stay server-side.
- The provider's polling is best-effort; network failures keep the previous values (fail-soft).
- The bootstrap token is per-(project, environment). A `prod` token cannot read `staging` and vice versa.
- Variable values are AES-256-GCM encrypted at rest in the Sentroy vault DB. Decryption happens server-side just before the fetch endpoint streams the response.

### Webhooks (`createVaultWebhookHandler`)

Variable changes can push directly to your app instead of waiting on the 5-min cache TTL. Configure a webhook in the dashboard under a project's **Webhooks** tab — Sentroy will POST to your URL on every `variable.create | variable.update | variable.delete`.

```ts
// app/api/sentroy/vault-webhook/route.ts
import { createVaultWebhookHandler } from "@sentroy-co/client-sdk/vault"

export const POST = createVaultWebhookHandler({
  secret: process.env.SENTROY_VAULT_WEBHOOK_SECRET!,
  // optional — default behaviour: await refreshEnvCache()
  async onChange(payload) {
    console.log("vault changed", payload.action, payload.keys)
    // your invalidation logic, then:
    await refreshEnvCache()
  },
  // optional — replay-window check, default 5 min
  maxAgeMs: 5 * 60 * 1000,
})
```

Payload (signed):
```json
{
  "event": "vault.variable.changed",
  "project": "<projectId>",
  "environment": "prod",
  "action": "create" | "update" | "delete",
  "keys": ["DATABASE_URL", "..."],
  "timestamp": 1731430000000
}
```

Headers Sentroy sends: `X-Sentroy-Signature: sha256=<hex>` (HMAC over the raw body), `X-Sentroy-Event: vault.variable.changed`, `X-Sentroy-Webhook-Id: <id>`.

The handler returns:
- `200` with `{ ok: true }` after a verified signature + completed `onChange`
- `401` for missing/malformed/invalid signature, or timestamp outside the replay window
- `400` for an invalid JSON body
- `500` if `onChange` throws

Delivery is fire-and-forget on the Sentroy side with a 5 sec timeout; the dashboard records the last delivery's status + error string per webhook for visibility. Failed deliveries are not auto-retried (admin can flip the enabled toggle to retry manually by re-saving a variable, or we'll add a "resend" button later).

The vault webhook secret namespace is `whsec_*` — distinct from access tokens (`stk_*` / `stk_env_*`).

### CLI (`sentroy mail templates ...`)

The `sentroy` binary also manages mail templates. Auth is `SENTROY_API_KEY` (`stk_...`) plus `SENTROY_COMPANY_SLUG`.

```bash
# Create — body comes from --mjml-file, inline --mjml, or stdin.
# --domain is the verified sending domain id.
sentroy mail templates create --name="Welcome" --subject="Welcome, {{name}}!" \
  --domain=<domainId> --mjml-file=./welcome.mjml

cat welcome.mjml | sentroy mail templates create --name="Welcome" \
  --subject="Welcome!" --domain=<domainId>

# Localized --name / --subject accept a plain string OR a JSON object string.
sentroy mail templates create \
  --name='{"en":"Welcome","tr":"Hos geldin"}' \
  --subject='{"en":"Welcome, {{name}}!","tr":"Hos geldin, {{name}}!"}' \
  --domain=<domainId> --mjml='<mjml>...</mjml>'

# Update — pass any subset; --mjml or --mjml-file replaces the body.
sentroy mail templates update <id> --subject="Welcome aboard, {{name}}!"

# Delete
sentroy mail templates delete <id>
```

> Note: the Go, Python, and PHP SDKs expose templates **read-only** (`list`/`get`). Create / update / delete is available via the TypeScript SDK, the `sentroy` CLI, or the REST endpoint.

### CLI (`sentroy env ...`)

The package ships a `sentroy` binary. After `npm install` (or `npm install -g`) it's available on `PATH`; `npx sentroy ...` works without a global install.

Auth is the same `SENTROY_ENV_API_KEY` used by `getEnv()` (or pass `--token=stk_env_...`). Base URL defaults to `https://sentroy.com` (override with `SENTROY_ENV_API_URL` or `--url=`). The token's (project, environment) scope is implicit — never specified on the CLI.

```bash
# Push a local file to the vault. Without --delete-missing it's upsert-only.
# With --delete-missing it's a full sync — any vault key not in the file
# is removed (CLI prompts for confirmation interactively).
sentroy env push .env.production --delete-missing
sentroy env push .env.production --dry-run     # show diff, no writes

# Diff local vs vault without writing.
sentroy env diff .env.production --delete-missing

# Pull the vault into a local file. Refuses to overwrite without --force.
sentroy env pull .env.staging --force

# List keys (or KEY=value with --values; only public-flagged with --public-only).
sentroy env list
sentroy env list --values
sentroy env list --public-only
```

`push` requires the token to have `write` permission (toggle when generating the token in the dashboard). `pull`, `list`, and `diff` only need `read`.

The CLI parses the same `.env` flavour as the dashboard's developer mode:

- blank line resets pending description / public flag
- `# any comment` above a key becomes the variable's description
- `# @public` on its own line marks the next key as browser-readable
- `KEY="quoted with spaces"` and `KEY='single quoted'` both supported
- `export KEY=value` prefix is stripped

REST endpoint behind `push`: `POST /api/env-vault/push` with body `{ entries: [{key, value, public?, description?}], deleteMissing?: boolean }` and `Authorization: Bearer stk_env_...`. Response: `{ added, updated, unchanged, deleted, total, project, environment }`. Each insert/update/delete writes one audit log entry (checksum, no plaintext) tagged `source: "cli-push"`.

## Requirements

- Node.js 18+ (uses native `fetch`)
- React 18+ (only if you import from `/react` or `/vault/react`)
- Tailwind CSS in the host app (only for React UI components like `<MediaManager />`)

## Raw URL — for LLM/agent context windows

```
https://raw.githubusercontent.com/Sentroy-Co/client-sdk/refs/heads/main/typescript/AGENTS.md
```

## License

[MIT](LICENSE)
