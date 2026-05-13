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
- **Env Vault** — runtime env variable management (`@sentroy-co/client-sdk/vault`) — change a value in the dashboard, your app picks it up on the next read; no rebuild.
- **React drop-ins** — `<MediaManager />`, `<MediaManagerTrigger />` and `<EnvProvider>` / `useEnv()` (`@sentroy-co/client-sdk/react` + `@sentroy-co/client-sdk/vault/react`).
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

## React: CropDialog

A full-screen image crop dialog built on [`react-advanced-cropper`](https://advanced-cropper.github.io/react-advanced-cropper/). Lazy subpath — only imported when you reference it.

**1. Add the stylesheet once** (root layout / `_app` / global CSS entry — anywhere it loads on every page that may open the dialog):

```ts
import "@sentroy-co/client-sdk/react/crop/styles.css"
```

The bundled stylesheet ships the cropper's baseline geometry + a packaged `compact` theme + a few opinionated overrides. You can browse all upstream theme variants at [advanced-cropper themes](https://advanced-cropper.github.io/react-advanced-cropper/docs/guides/themes); if you want a different look, swap our stylesheet for the package's `react-advanced-cropper/dist/style.css` plus your theme of choice — but order matters (baseline first, then theme).

**2. Open the dialog with a `File`:**

```tsx
"use client"
import { useState } from "react"
import dynamic from "next/dynamic"

const CropDialog = dynamic(
  () => import("@sentroy-co/client-sdk/react/crop").then((m) => m.CropDialog),
  { ssr: false },
)

export function UploadButton() {
  const [file, setFile] = useState<File | null>(null)
  return (
    <>
      <input
        type="file"
        accept="image/*"
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
      />
      {file && (
        <CropDialog
          open
          file={file}
          defaultAspect="1:1"
          onClose={(out) => {
            setFile(null)
            if (out) uploadCroppedFile(out) // Apply → cropped File
            // out === null → Cancel; out === file → Use original
          }}
        />
      )}
    </>
  )
}
```

The dialog returns a `File` (cropped or original), `null` on cancel. Aspect presets, rotate (`R` / `Shift+R`), flip, zoom and a live preview are built in.

## Env Vault

Manage your env vars in the dashboard at [vault.sentroy.com](https://vault.sentroy.com), bootstrap your deploy with one token, and read values via a typed helper — no rebuild on change.

```ts
// server side
import { getEnv, getEnvOrThrow, getEnvWithFallback, preloadEnv } from "@sentroy-co/client-sdk/vault"

await preloadEnv() // optional fail-fast at boot
const dbUrl = await getEnv("DATABASE_URL")
const turnstile = await getEnvOrThrow("BETTER_AUTH_TURNSTILE_SECRET")

// Migration helper — vault'tan oku, yoksa process.env fallback.
// Sentroy app'lerini kademeli olarak migrate ederken kullanışlı.
const stripe = await getEnvWithFallback("STRIPE_SECRET_KEY")
```

```tsx
// React: SSR-injected provider + hook (no FOUC)
import { getPublicEnvs } from "@sentroy-co/client-sdk/vault"
import { EnvProvider, useEnv } from "@sentroy-co/client-sdk/vault/react"

// app/layout.tsx (server)
const envs = await getPublicEnvs()
return <EnvProvider envs={envs}>{children}</EnvProvider>

// any "use client" component
const siteKey = useEnv("TURNSTILE_SITE_KEY")
```

Bootstrap is a single env: `SENTROY_ENV_API_KEY`. Public/private split is enforced server-side — the React hook only ever sees `public: true` variables. Full reference at [docs.sentroy.com/env-vault](https://docs.sentroy.com/env-vault).

### Webhooks (real-time invalidation)

Skip the 5-min cache TTL — point the vault at your app and it'll POST whenever any variable changes. The default handler verifies the HMAC-SHA256 signature and refreshes the cache:

```ts
// app/api/sentroy/vault-webhook/route.ts
import { createVaultWebhookHandler } from "@sentroy-co/client-sdk/vault"

export const POST = createVaultWebhookHandler({
  secret: process.env.SENTROY_VAULT_WEBHOOK_SECRET!,
})
```

Configure the receiver URL in the vault dashboard under the project's **Webhooks** tab; the secret comes back once at create-time. Provide your own `onChange` handler for custom logic.

### CLI

The package ships a `sentroy` CLI for syncing local `.env` files to the vault — useful for build pipelines and onboarding.

```bash
# Use SENTROY_ENV_API_KEY (or pass --token=stk_env_...)
npx sentroy env push .env.production --delete-missing
npx sentroy env diff .env.production
npx sentroy env pull .env.staging --force
npx sentroy env list --values --public-only
```

The token's (project, environment) scope is implicit. `--delete-missing` makes the push a full sync — keys not in the local file are removed from the vault. The token must have `write` permission for `push`; everything else only needs `read`.

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
