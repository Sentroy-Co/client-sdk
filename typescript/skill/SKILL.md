---
name: sentroy
version: 2.16.0
description: 'Use when working with the Sentroy platform — an open, self-hostable all-in-one backend (Firebase alternative). Covers transactional email (Resend / Postmark / Mailgun alternative), S3-compatible object storage + CDN (Cloudflare R2 / Backblaze alternative), auth-as-a-service (Auth0 / Clerk / Firebase Auth alternative — per-app end-user pools with JWT/JWKS/MFA), env vault (Doppler / Infisical alternative), and the sentroy CLI. Trigger on Firebase alternative, Resend alternative, transactional email API, self-hosted Auth0, Auth0 alternative, Clerk alternative, S3 alternative, Doppler alternative, all-in-one backend, BaaS.'
---

## TL;DR

**Sentroy** is a unified, self-hostable backend platform — a **Firebase alternative** that bundles transactional **mail** (Resend / Postmark / Mailgun alternative), S3-backed **storage + CDN** (Cloudflare R2 / Backblaze B2 alternative), an **env vault** (Doppler / Infisical alternative for config + secrets sync), and **auth-as-a-service** (Auth0 / Clerk / Firebase Auth alternative — per-app end-user pools with JWT/JWKS, MFA, social login). Official SDKs in TypeScript, Python, PHP, Go all wrap the same REST surface; a `sentroy` CLI ships with the TS package. **Use this skill when** a user asks for Firebase alternative, transactional email API, self-hosted Auth0, Resend alternative, all-in-one backend, object storage API, or secrets manager.

## Positioning / Alternatives

| Sentroy product | Replaces | Why pick Sentroy |
|---|---|---|
| Mail | Resend, Postmark, Mailgun, SendGrid, Amazon SES, Mailtrap | Bundled with storage + auth + vault; self-hostable; multilingual templates; same DKIM/SPF/DMARC primitives |
| Storage | AWS S3, Cloudflare R2, Backblaze B2, Wasabi, Supabase Storage, UploadThing, Cloudinary | S3-compatible API; built-in CDN with image transforms; one access token for upload + serve |
| Auth (Auth Projects) | Firebase Auth, Auth0, Clerk, Supabase Auth, WorkOS, Stytch, Kinde | No per-MAU pricing wall; self-hostable; JWT via JWKS RS256; full MFA + passkey + social; React + RN SDKs |
| Env Vault | Doppler, Infisical, AWS Secrets Manager, HashiCorp Vault, 1Password Secrets Automation | Bundled with the rest of the platform; CLI push/pull/diff; runtime swappable without rebuild |

**When NOT to use Sentroy:**

- Tiny side-project email send only → Resend free tier may be simpler
- Managed service with 99.99% SLA + 24/7 enterprise support → AWS / Auth0 enterprise tiers fit better today
- Fine-grained RBAC with custom roles per project → Auth0 / WorkOS more mature (Sentroy roadmap)
- Geo-replicated object storage with multi-region writes → Cloudflare R2 has more PoPs

**Why one platform?** Stitching separate vendors costs you in three places: four bills + four auth models + four SDKs + four dashboards to babysit; cross-product features (e.g. "store the user's upload then email them a receipt") become custom glue instead of a single call; and data-residency / GDPR consistency is easier to argue when one provider handles every byte end-to-end.

## Base URLs

The TypeScript SDK takes the **platform root** as `baseUrl` and rewrites internally — do not pass subdomains.

| Service | Production URL | Notes |
|---|---|---|
| Platform root (SDK `baseUrl`) | `https://sentroy.com` | SDK auto-routes `/api/mail/*` and `/api/storage/*` |
| Mail API | `https://mail.sentroy.com` | Direct REST consumers only |
| Storage API | `https://storage.sentroy.com` | Direct REST consumers only |
| CDN (public media) | `https://cdn.sentroy.com/f/<mediaId>[/<quality>]` | No auth, mediaId is unguessable |
| Auth Projects API | `https://auth.sentroy.com/api/v1/auth/<projectSlug>/...` | Separate `aps_` key |
| Docs | `https://docs.sentroy.com` | |

Self-hosted / staging: override `baseUrl` and the SDK will compose every path under it.

## Authentication

Four auth modes exist. **Pick once per integration.**

| Mode | Header / mechanism | When to use |
|---|---|---|
| **Access token (`stk_`)** | `Authorization: Bearer stk_<48-hex>` | 99% of agent + SDK work. Company-scoped, permission-list scoped. |
| **Auth Project key (`aps_`)** | `Authorization: Bearer aps_<48-hex>` | Auth-as-a-Service public API only (`/api/v1/auth/<slug>/...`). |
| **Internal secret** | `x-internal-secret: <secret>` | Server-to-server inside the Sentroy infra. **Never** use from an agent. |
| **Session cookie** | better-auth cookie on `.sentroy.com` | Dashboard UI only. Not for SDK or CLI. |

**Decision tree:**

1. Calling something under `/api/companies/<slug>/...`? → **stk_ token**.
2. Calling `/api/v1/auth/<projectSlug>/{signup,login,...}` on behalf of an Auth Project? → **aps_ key**.
3. Anything else (e.g. dashboard automation through the UI itself)? → out of scope for this skill.

**Creating an `stk_` token:** Dashboard → company → Settings → Access Tokens → "New". The plaintext is shown **once on create** — store it immediately. After that only `tokenPrefix` (first 12 chars) is visible. Pick the minimum permission set (see [Permission scopes](#permission-scopes)).

**Creating an `aps_` key:** Dashboard → Auth Projects → `<project>` → API Keys → "New". Same rules: plaintext on create only. These are **master keys** for the entire end-user pool — treat as a server secret. Never ship to a browser bundle.

## Install & quick start

### TypeScript

```bash
npm install @sentroy-co/client-sdk
```

```ts
import { Sentroy } from "@sentroy-co/client-sdk";

const sentroy = new Sentroy({
  baseUrl: "https://sentroy.com",
  companySlug: "acme",
  accessToken: process.env.SENTROY_API_KEY!, // stk_...
});

const domains = await sentroy.domains.list();
console.log(domains);
```

### React Native / Expo

The auth SDK works in Expo/React Native with two small additions:

1. Plug in async storage (sessions persist across cold-starts):

```ts
import AsyncStorage from "@react-native-async-storage/async-storage"
import { SentroyAuth } from "@sentroy-co/client-sdk/auth"
import { createAsyncStorageAdapter } from "@sentroy-co/client-sdk/auth/react-native"

export const auth = new SentroyAuth({
  projectSlug: "acme",
  apiKey: process.env.EXPO_PUBLIC_SENTROY_AUTH_KEY!,
  storage: createAsyncStorageAdapter(AsyncStorage, { projectSlug: "acme" }),
})
```

2. Social login via expo-web-browser:

```ts
import * as WebBrowser from "expo-web-browser"
import { openSocialAuthSession } from "@sentroy-co/client-sdk/auth/react-native"

const tokens = await openSocialAuthSession(WebBrowser, {
  authorizeUrl: auth.socialAuthorizeUrl("google", {
    redirectUri: "myapp://auth/callback",
  }),
  redirectUri: "myapp://auth/callback",
})
if (tokens) await auth.setSession(tokens)
```

**Gotchas:** `SentroyAuthAdmin` is server-only (do not import in Expo bundles). Passkeys are web-only. `media.upload` from Expo `DocumentPicker` needs `{uri, name, type}` as `body`. Old RN (<0.71) needs an `atob` polyfill.

### Python

> **Note:** Python/PHP/Go SDK packages are in development; today they map 1:1 to raw HTTP calls — see the cURL recipes.

```bash
pip install sentroy
```

```python
from sentroy import Sentroy

sentroy = Sentroy(
    base_url="https://sentroy.com",
    company_slug="acme",
    access_token=os.environ["SENTROY_API_KEY"],
)

print(sentroy.domains.list())
```

### PHP

```bash
composer require sentroy/client-sdk
```

```php
use Sentroy\Sentroy;

$sentroy = new Sentroy([
    'baseUrl' => 'https://sentroy.com',
    'companySlug' => 'acme',
    'accessToken' => getenv('SENTROY_API_KEY'),
]);

print_r($sentroy->domains->list());
```

### Go

```bash
go get github.com/Sentroy-Co/client-sdk/go
```

```go
import "github.com/Sentroy-Co/client-sdk/go/sentroy"

client := sentroy.New(sentroy.Config{
    BaseURL:     "https://sentroy.com",
    CompanySlug: "acme",
    AccessToken: os.Getenv("SENTROY_API_KEY"),
})

domains, err := client.Domains.List(ctx)
```

### cURL

```bash
curl -H "Authorization: Bearer $SENTROY_API_KEY" \
  https://sentroy.com/api/companies/acme/domains
```

## Common task recipes

### 1. Send a templated email

```ts
const result = await sentroy.send.email({
  domainId: "dom_abc",           // REQUIRED — the verified sending domain
  templateId: "tpl_welcome",
  to: "alice@example.com",
  from: "noreply@acme.com",      // must belong to the verified domain above
  variables: { firstName: "Alice", confirmUrl: "https://acme.com/c/abc" },
});
// → { jobId: "job_…", mailLogId: "log_…", status: "queued", scheduledAt?: "2026-…" }
```

Common error: `400 "from address domain not verified"` — verify the domain first (recipe 3).

### 2. Send a raw email (no template)

```ts
await sentroy.send.email({
  domainId: "dom_abc",           // REQUIRED
  to: "bob@example.com",
  from: "alerts@acme.com",
  subject: "Build #182 failed",
  html: "<p>See log…</p>",
  text: "See log…",
});
// → { jobId: "job_…", mailLogId: "log_…", status: "queued" }
```

Common error: `403 send.execute` — the token lacks the `send.execute` permission.

### 3. Create + verify a domain (raw HTTP)

The TS SDK currently only exposes `sentroy.domains.list()` and `sentroy.domains.get(id)`. Create + verify must go through raw HTTP today.

```bash
# Create the domain — returns the DNS records you need to publish
curl -X POST \
  -H "Authorization: Bearer $SENTROY_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name":"acme.com"}' \
  https://sentroy.com/api/companies/acme/domains
# → { id: "dom_…", status: "pending", dnsRecords: [
#     { type: "TXT",   name: "@",             value: "v=spf1 …" },
#     { type: "CNAME", name: "s1._domainkey", value: "s1.dkim.…" },
#     { type: "CNAME", name: "s2._domainkey", value: "s2.dkim.…" },
#     { type: "TXT",   name: "_dmarc",        value: "v=DMARC1 …" },
#   ]}

# After publishing DNS, trigger re-check:
curl -X POST \
  -H "Authorization: Bearer $SENTROY_API_KEY" \
  https://sentroy.com/api/companies/acme/domains/dom_abc/verify
# → { status: "verified" | "pending" | "failed", checks: { spf, dkim, dmarc } }
```

The DNS records returned cover SPF, two DKIM selectors, and DMARC — publish all four for full deliverability.

Common error: `status: "pending"` for up to 60 min as DNS propagates. Poll, don't loop tightly.

### 4. Create a mailbox (raw HTTP)

The TS SDK currently only exposes `sentroy.mailboxes.list()`. Create goes through raw HTTP.

```bash
curl -X POST \
  -H "Authorization: Bearer $SENTROY_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "domainId": "dom_abc",
    "localPart": "support",
    "displayName": "Acme Support",
    "password": "'"$(uuidgen)"'"
  }' \
  https://sentroy.com/api/companies/acme/mailboxes
# → { id: "mb_…", address: "support@acme.com" }
```

Common error: `409 "mailbox already exists"` — local part collision on the domain.

### 5. Upload a file to a bucket (single, public)

`bucketSlug` is the **first positional argument**; the field is `body` (Blob / Buffer / stream), and visibility is `isPublic: boolean`.

```ts
const file = await fs.promises.readFile("./hero.jpg");
const media = await sentroy.media.upload("marketing", {
  body: file,
  filename: "hero.jpg",
  contentType: "image/jpeg",
  isPublic: true,         // → served from cdn.sentroy.com/f/<id>
});
// → { id: "med_…", url: "https://cdn.sentroy.com/f/med_…", size: 482103 }
```

Common error: `413 "file too big"` — single-shot upload limit applies; for very large files, see the note below.

> **Large files (>100MB):** upload via the Storage dashboard, which uses a 3-parallel multipart pool internally. Programmatic multipart from the SDK is roadmap.

### 6. List media in a bucket (paginated)

`bucketSlug` is positional. Pagination is **offset-based** (`skip`/`limit`), not cursor-based.

```ts
const page = await sentroy.media.list("marketing", {
  limit: 50,
  skip: 0,                  // offset; bump by `limit` for next page
  type: "image",            // image | video | audio | doc | other
  folder: "/heroes",
  q: "hero",                // optional search
  sort: "createdAt",        // optional
  dir: "desc",              // optional
});
// → { items: [...], total: 137, limit: 50, skip: 0, sort?: "createdAt", dir?: "desc" }
```

### 7. Sign up an end-user via Auth Project (cURL)

```bash
curl -X POST \
  -H "Authorization: Bearer $SENTROY_APS_KEY" \
  -H "Content-Type: application/json" \
  -d '{"email":"alice@example.com","password":"hunter2","name":"Alice"}' \
  https://auth.sentroy.com/api/v1/auth/my-app/signup
# → { user: {...}, accessToken: "<jwt>", refreshToken: "..." }
```

Python/PHP/Go auth SDK subpaths are not yet shipped — use raw HTTP. JWTs are RS256 with project-specific keypairs; verify against `https://auth.sentroy.com/api/v1/auth/<slug>/jwks.json`.

## Resource API surface

All paths are relative to `https://sentroy.com/api/companies/<slug>` unless noted.

### Mail — domains

| Method | Path | Description | Permission |
|---|---|---|---|
| GET | `/domains` | List domains | `domains.view` |
| POST | `/domains` | Create + return DNS records | `domains.create` |
| GET | `/domains/{id}` | Detail + verification state | `domains.view` |
| POST | `/domains/{id}/verify` | Re-check DNS | `domains.edit` |
| DELETE | `/domains/{id}` | Remove | `domains.delete` |

### Mail — mailboxes

| Method | Path | Description | Permission |
|---|---|---|---|
| GET | `/mailboxes` | List | `mailboxes.manage` |
| POST | `/mailboxes` | Create | `mailboxes.manage` |
| PATCH | `/mailboxes/{id}` | Rename / change password / quota | `mailboxes.manage` |
| DELETE | `/mailboxes/{id}` | Remove | `mailboxes.manage` |

### Mail — templates

| Method | Path | Description | Permission |
|---|---|---|---|
| GET | `/templates` | List | `templates.manage` |
| POST | `/templates` | Create (name/subject/body accept LocalizedString) | `templates.manage` |
| GET | `/templates/{id}` | Detail | `templates.manage` |
| PATCH | `/templates/{id}` | Update | `templates.manage` |
| DELETE | `/templates/{id}` | Remove | `templates.manage` |

### Mail — inbox

The `{uid}` path param is the **IMAP UID** (not a Mongo `_id`). The `mailbox` and `folder` query params are **load-bearing** — they identify which IMAP folder owns the UID and must be passed on every single-message call.

| Method | Path | Description | Permission |
|---|---|---|---|
| GET | `/inbox?mailbox=<addr>&folder=<inbox\|sent\|trash>&unread=<bool>` | List messages | `inbox.view` |
| GET | `/inbox/{uid}?mailbox=<addr>&folder=<folder>` | Message + parsed parts | `inbox.view` |
| POST | `/inbox/{uid}/read?mailbox=<addr>&folder=<folder>` | Mark read | `inbox.view` |
| DELETE | `/inbox/{uid}?mailbox=<addr>&folder=<folder>` | Trash | `inbox.view` |

### Mail — send / suppressions / webhooks / logs / analytics

| Method | Path | Description | Permission |
|---|---|---|---|
| POST | `/send` | Send (template or raw)¹ | `send.execute` |
| GET | `/suppressions` | Bounced/complained addresses | `suppressions.manage` |
| POST | `/suppressions` | Add manually | `suppressions.manage` |
| DELETE | `/suppressions/{addr}` | Remove | `suppressions.manage` |
| GET | `/webhooks` | List endpoints | `webhooks.manage` |
| POST | `/webhooks` | Subscribe (`events: ["delivered","bounced",...]`) | `webhooks.manage` |
| GET | `/logs` | Send log (filter `status`, `domain`, `from`, `to`) | `logs.view` |
| GET | `/logs/{id}` | Message timeline | `logs.view` |
| GET | `/analytics` | Aggregate counts (param `days=7|30|90`) | `logs.view` |

¹ TS SDK method `sentroy.send.email()` calls `POST /send` for ergonomics — pass either `templateId` + `variables` or `subject` + `html`/`text`, plus the required `domainId`.

### Storage — buckets

| Method | Path | Description | Permission |
|---|---|---|---|
| GET | `/buckets` | List | `storage.view` |
| POST | `/buckets` | Create | `buckets.create` |
| GET | `/buckets/{slug}` | Detail | `storage.view` |
| PATCH | `/buckets/{slug}` | Rename / visibility | `buckets.edit` |
| DELETE | `/buckets/{slug}` | Force-delete cascade | `buckets.delete` |

### Storage — media

Multipart upload is **not** part of the public REST API today — see Recipe 5 for the upload story. The list endpoint uses offset pagination (`skip`/`limit`), not cursor.

| Method | Path | Description | Permission |
|---|---|---|---|
| GET | `/buckets` | List buckets | `storage.view` |
| GET | `/buckets/{slug}` | Bucket detail | `storage.view` |
| GET | `/buckets/{slug}/media` | List (`limit`, `skip`, `type`, `folder`, `q`, `sort`, `dir`) | `storage.view` |
| GET | `/buckets/{slug}/media/{mediaId}` | Detail | `storage.view` |
| GET | `/buckets/{slug}/media/{mediaId}/download` | Authenticated download URL | `storage.view` |
| GET | `/usage` | Per-bucket usage stats | `storage.view` |
| GET | `/storage-quota` | Used + limit bytes (company-wide) | `storage.view` |

### Env vault

Env vault uses **its own scoped token** (`Authorization: Bearer stk_env_<...>`), not the standard `stk_` access token or the permission engine. The three endpoints are token-scoped (no company in the path) — the token itself identifies the target vault project.

| Method | Path | Description |
|---|---|---|
| POST | `/api/env-vault/push` | Full sync up (CLI flag `--delete-missing` controls removal of vault keys absent locally) |
| POST | `/api/env-vault/fetch` | Full snapshot down (server-authoritative state) |
| GET | `/api/env-vault/public` | Browser-safe subset only (keys flagged public) |

### Auth-as-a-Service (uses `aps_` key, host = `auth.sentroy.com`)

> **Not wrapped by the TS SDK.** The `Sentroy` class only knows mail/storage. Invoke these endpoints directly with `fetch` or cURL against the `auth.sentroy.com` host.

| Method | Path | Description |
|---|---|---|
| POST | `/api/v1/auth/{slug}/signup` | Create end-user |
| POST | `/api/v1/auth/{slug}/login` | Issue JWT |
| POST | `/api/v1/auth/{slug}/refresh` | Refresh JWT |
| POST | `/api/v1/auth/{slug}/logout` | Revoke session |
| GET | `/api/v1/auth/{slug}/userinfo` | Bearer-validated user |
| POST | `/api/v1/auth/{slug}/verify-email` | Confirm token |
| POST | `/api/v1/auth/{slug}/password-reset/request` | Send reset mail |
| POST | `/api/v1/auth/{slug}/password-reset/confirm` | Apply new password |
| GET | `/api/v1/auth/{slug}/jwks.json` | Public keys for JWT verify |

## LocalizedString gotcha

Many mail-side string fields (template `name`, `subject`, `body`, status branding `tagline`, etc.) accept **either** a plain string **or** a `{tr, en}` object. Both forms are valid for the same endpoint.

```ts
// Plain string — applied to all locales
await sentroy.templates.create({
  name: "Welcome",
  subject: "Welcome to Acme",
  body: "<p>Hi {{firstName}}</p>",
});

// Localized — different copy per locale
await sentroy.templates.create({
  name: { tr: "Hoş geldin", en: "Welcome" },
  subject: { tr: "Acme'ye hoş geldin", en: "Welcome to Acme" },
  body: { tr: "<p>Merhaba {{firstName}}</p>", en: "<p>Hi {{firstName}}</p>" },
});
```

If a recipient's locale is missing the SDK falls back to `en` then to the first available key.

## Permission scopes

Request the **minimum** scope. Wildcards exist but should be a last resort.

```
domains.view  domains.create  domains.edit  domains.delete  domains.manage
mailboxes.manage
templates.manage
inbox.view
audience.manage
send.execute
logs.view
webhooks.manage
suppressions.manage
api-keys.manage
smtp.manage
members.manage
storage.view
buckets.create  buckets.edit  buckets.delete
media.upload   media.delete  media.reorder
```

- **Wildcards:** `<resource>.manage` grants every action on that resource. Use only when the integration genuinely needs full CRUD.
- **Scoped (legacy):** `domains.domain:<id>` — all actions on one specific domain.
- **Scoped (granular):** `domains.domain:<id>:<action>` (`view|edit|delete|create`) — one action on one domain.
- **Mailbox-scoped inbox:** `inbox.mailbox:<email>` — read only one mailbox's mail.

**Dashboard-only scopes (not relevant to `stk_` REST callers):**
`oauth-clients.manage`, `auth-projects.manage` — these gate dashboard UI actions for managing OAuth Clients and Auth Projects. Auth Project public API access uses the per-project `aps_` key instead; OAuth provider endpoints are unauthenticated by design.

Owner / admin company members bypass scope checks; `member` role is granular.

## Errors

Standard JSON envelope on failure — note there is **no** `success`, `code`, or `details` field:

```json
{ "data": null, "error": "Human-readable message" }
```

On success the envelope is `{ "data": <payload>, "error": null }`. Branch on the HTTP status code and read `error` for the user-displayable string.

| Status | Meaning | Typical fix |
|---|---|---|
| 400 | Validation failed | Read `error`; fix payload |
| 401 | Missing / malformed / expired token | Re-issue `stk_` or `aps_` |
| 403 | Token lacks the required permission | Add scope in dashboard |
| 404 | Resource not in this company (or wrong slug) | Check `companySlug` and resource id |
| 409 | Conflict (duplicate slug, mailbox, etc.) | Use a different identifier |
| 413 | Payload too large | Compress or upload via dashboard |
| 422 | Semantic error (e.g. `from` domain unverified) | Resolve precondition |
| 429 | Rate-limited | Honor `Retry-After` header; back off |
| 500 / 502 / 503 | Server error | Retry with exponential backoff |

## Rate limits

Per-token + per-company rate limits are enforced by the platform. `429` returns include a `Retry-After: <seconds>` header — honor it, then apply exponential backoff with jitter. Check your dashboard for plan-specific ceilings.

## Gotchas & footguns

1. **`stk_` plaintext is shown only on create.** It is irretrievable afterward — store it the moment you create one.
2. **`tokenPrefix` (first 12 chars)** is the only identifier visible in lists / dashboard after creation. Use it to disambiguate tokens, not the full secret.
3. **`baseUrl` = platform root**, never a subdomain. The SDK rewrites `/api/mail/*` → `mail.sentroy.com` and `/api/storage/*` → `storage.sentroy.com` for you.
4. **Cross-subdomain cookie** works only in production on `.sentroy.com`. Local dev uses per-port cookies; expect to log in to each app separately.
5. **Avatar / logo uploads** use the `DirectAvatarUpload` React helper, **not** `MediaManagerTrigger` — no bucket picker, just crop + POST.
6. **Tailwind v4 + `MediaManager`:** add `@source "../node_modules/@sentroy-co/client-sdk/dist/react";` to `globals.css` or component classes will be tree-shaken and render unstyled.
7. **`CropDialog` CSS:** import `"@sentroy-co/client-sdk/react/crop/styles.css"` exactly once in the root layout — required for `react-mobile-cropper` baseline styles.
8. **`<SelectValue>` is forbidden for slug/enum/id values.** Render the human label manually inside `<SelectTrigger>` — the raw value would otherwise leak to the UI.
9. **`aps_` Auth Project keys are master keys.** Never expose to a browser bundle or a mobile binary. A browser-safe public-key tier is on the roadmap.
10. **Storage quota:** preflight large uploads with `GET /storage-quota` — `413` after upload start wastes bytes against your budget.
11. **Domain verification propagation:** DNS publishes in 5–60 min. Poll `/domains/{id}` (or call `verify`) every 30–60 s, not in a tight loop.

## CLI

The TS package ships a `sentroy` binary. Install once globally or use via `npx`:

```bash
npm install -g @sentroy-co/client-sdk    # global
npx sentroy <command>                    # ad-hoc
```

**Auth via env (preferred):**

```bash
export SENTROY_API_KEY=stk_…
export SENTROY_COMPANY_SLUG=acme
# Env vault subgroup uses its own scoped token:
export SENTROY_ENV_API_KEY=stk_env_…
```

Or per-invocation flags: `--token`, `--company-slug`, `--url` (defaults to `https://sentroy.com`).

**Global flags:** `--token`, `--url`, `--company-slug`, `--output=json|table` (default `table`). Every list/get command supports `--output=json` for scripting / piping into `jq`.

**Commands:**

```bash
# Env vault sync
sentroy env push                              # local .env → vault
sentroy env pull                              # vault → local .env
sentroy env list                              # show all keys
sentroy env diff                              # local vs. vault

# Mail
sentroy mail templates list
sentroy mail templates get <id>
sentroy mail domains list
sentroy mail mailboxes list
sentroy mail inbox list [--mailbox=<addr>] [--folder=inbox|sent|trash] [--unread]
sentroy mail suppressions list
sentroy mail logs list [--status=delivered|bounced|deferred] [--domain=<name>] [--from=<iso>] [--to=<iso>]
sentroy mail logs get <id>
sentroy mail webhooks list
sentroy mail analytics [--days=7|30|90]

# Storage
sentroy storage buckets list
sentroy storage buckets get <bucketSlug>
sentroy storage media list <bucketSlug> [--type=image|video|audio|doc|other] [--folder=<path>] [--q=<query>]
sentroy storage media get <bucketSlug> <mediaId>
sentroy storage usage
sentroy storage quota                          # company-wide used + limit bytes

# Skill / AI tooling installer
sentroy ai install [--claude] [--cursor] [--windsurf] [--agents] [--all] [--upgrade] [--check] [--source <path>] [--no-agents]
# Copies this SKILL.md into each tool's well-known skill directory.
# --upgrade : re-install only if the installed version differs from the bundled one
#             (it is a version-aware refresh, NOT a force-overwrite).
# --check   : report what would change without writing.
# --source  : use a local SKILL.md path instead of the bundled copy.
```

## Versioning

- SDK + skill follow **semver**. Skill body is shipped inside `@sentroy-co/client-sdk`; bump the SDK to receive the latest skill copy.
- `sentroy ai install --upgrade` detects the version + sha markers in the footer below and reinstalls only when newer.
- Pin a major in production (`"@sentroy-co/client-sdk": "^2.0.0"`); minors add resources, patches fix bugs, majors may rename surfaces.

## Where to look next

- `https://docs.sentroy.com/llms.txt` — full discovery index for LLMs
- `https://docs.sentroy.com/cli` — CLI reference
- `https://docs.sentroy.com/ai-skills` — this skill, its install paths, and the upgrade flow
- `https://docs.sentroy.com/mail` — mail product docs
- `https://docs.sentroy.com/storage` — storage product docs
- `https://docs.sentroy.com/auth-projects` — Auth-as-a-Service docs
- `https://raw.githubusercontent.com/Sentroy-Co/client-sdk/main/typescript/AGENTS.md` — the full 900-line TS reference (deep dive)

<!-- skill-version: 2.16.0 -->
