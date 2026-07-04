<p align="center">
  <img src="https://sentroy.com/business/sentroy-logo-light.png" alt="Sentroy" width="240" />
</p>

<h3 align="center">Sentroy Client SDK for Go</h3>

<p align="center">
  Server-side SDK to interact with the Sentroy platform API.<br />
  Manage mail (domains, mailboxes, templates, inbox, send, audience, suppressions, webhooks, logs), storage (buckets, media, quota) and WhatsApp Santral from a single entry point — plus a standalone Auth-as-a-Service client.
</p>

<p align="center">
  <a href="https://pkg.go.dev/github.com/Sentroy-Co/client-sdk/go"><img src="https://pkg.go.dev/badge/github.com/Sentroy-Co/client-sdk/go.svg" alt="Go Reference" /></a>
  <a href="https://github.com/Sentroy-Co/client-sdk/blob/main/LICENSE"><img src="https://img.shields.io/github/license/Sentroy-Co/client-sdk.svg" alt="license" /></a>
</p>

---

## Installation

```bash
go get github.com/Sentroy-Co/client-sdk/go
```

## Quick Start

```go
package main

import (
    "fmt"
    "log"

    sentroy "github.com/Sentroy-Co/client-sdk/go"
)

func main() {
    client := sentroy.New(sentroy.Config{
        BaseURL:     "https://sentroy.com",
        CompanySlug: "my-company",
        AccessToken: "stk_...",
    })

    domains, err := client.Domains.List()
    if err != nil {
        log.Fatal(err)
    }
    fmt.Println(domains)
}
```

> Access tokens can be created from **Admin > Access Tokens** in the Sentroy dashboard.

## Usage

### Domains

```go
// List all domains
domains, err := client.Domains.List()

// Get a single domain
domain, err := client.Domains.Get("domain-id")
```

### Mailboxes

```go
// List all mailbox accounts
mailboxes, err := client.Mailboxes.List()
```

### Templates

```go
// List all templates
templates, err := client.Templates.List()

// List templates tied to a single sending domain
templates, err = client.Templates.ListByDomain("domain-id")

// Get a template by ID
template, err := client.Templates.Get("template-id")

// Create — name/subject/mjmlBody accept a flat string or a
// map[string]string keyed by language code. The platform extracts
// the variable list from the body (returned on Template.Variables).
// Requires the templates.manage permission.
created, err := client.Templates.Create(sentroy.CreateTemplateParams{
    Name:     map[string]string{"en": "Welcome Email", "tr": "Hosgeldin E-postasi"},
    Subject:  map[string]string{"en": "Welcome, {{name}}!", "tr": "Hosgeldin, {{name}}!"},
    MJMLBody: "<mjml>...</mjml>",
    DomainID: "domain-id",
})

// Update (partial — send only the fields you want to change)
updated, err := client.Templates.Update("template-id", sentroy.UpdateTemplateParams{
    Subject: "New subject",
})

// Delete
err = client.Templates.Delete("template-id")
```

Templates support multiple languages. A field like `Name` or `Subject` can be a plain string or a `map[string]string` keyed by language code:

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

Use the `Variables` field to know which placeholders (`{{name}}`, `{{company}}`) the template expects.

### Inbox

```go
// List messages
messages, err := client.Inbox.List(&sentroy.InboxListParams{
    Mailbox: "info@example.com",
    Folder:  "INBOX",
    Page:    1,
    Limit:   20,
})

// Get a single message
message, err := client.Inbox.Get(1234, &sentroy.InboxGetOptions{
    Mailbox: "info@example.com",
})

// List IMAP folders
folders, err := client.Inbox.ListFolders("info@example.com")

// Get a thread by subject
thread, err := client.Inbox.GetThread("Re: Project update", "info@example.com")

// Mark as read / unread
err = client.Inbox.MarkAsRead(1234, &sentroy.InboxGetOptions{Mailbox: "info@example.com"})
err = client.Inbox.MarkAsUnread(1234, &sentroy.InboxGetOptions{Mailbox: "info@example.com"})

// Move message
err = client.Inbox.Move(1234, "Trash", &sentroy.InboxMoveOptions{
    From:    "INBOX",
    Mailbox: "info@example.com",
})

// Delete message
err = client.Inbox.Delete(1234, &sentroy.InboxGetOptions{Mailbox: "info@example.com"})
```

### Send Email

```go
// Send with a template
result, err := client.Send.Email(sentroy.SendParams{
    To:         "user@example.com",
    From:       "info@example.com",
    Subject:    "Welcome!",
    DomainID:   "domain-id",
    TemplateID: "template-id",
    Variables: map[string]string{
        "name":    "John",
        "company": "Acme",
    },
})

// Send with a specific language
result, err = client.Send.Email(sentroy.SendParams{
    To:         "user@example.com",
    From:       "info@example.com",
    Subject:    "Hosgeldin!",
    DomainID:   "domain-id",
    TemplateID: "template-id",
    Lang:       "tr",
    Variables:  map[string]string{"name": "Ahmet"},
})

// Send with raw HTML
result, err := client.Send.Email(sentroy.SendParams{
    To:       []string{"user1@example.com", "user2@example.com"},
    From:     "info@example.com",
    Subject:  "Hello",
    DomainID: "domain-id",
    HTML:     "<h1>Hello World</h1>",
})

// Send with attachments
result, err := client.Send.Email(sentroy.SendParams{
    To:       "user@example.com",
    From:     "info@example.com",
    Subject:  "Invoice",
    DomainID: "domain-id",
    HTML:     "<p>Please find your invoice attached.</p>",
    Attachments: []sentroy.Attachment{
        {
            Filename:    "invoice.pdf",
            Content:     base64String,
            ContentType: "application/pdf",
        },
    },
})
```

### Audience (Contacts & Lists)

Manage the company-wide contact pool and named audience lists.

```go
// ── Contacts ──

// Paginated contact list (filter by status / tags)
result, err := client.Audience.Contacts.List(&sentroy.ContactListParams{
    Page:   1,
    Limit:  50,
    Status: sentroy.ContactStatusActive,
    Tags:   []string{"newsletter", "vip"}, // comma-joined on the wire
})

// Email-prefix autocomplete (server-capped at 10 results)
matches, err := client.Audience.Contacts.Search("john@")

// Get / create / update
contact, err := client.Audience.Contacts.Get("contact-id")
contact, err = client.Audience.Contacts.Create(sentroy.CreateContactParams{
    Email: "user@example.com",
    Name:  "John Doe",
    Tags:  []string{"newsletter"},
})
contact, err = client.Audience.Contacts.Update("contact-id", sentroy.UpdateContactParams{
    Status: sentroy.ContactStatusUnsubscribed,
})

// Soft-delete: marks the contact unsubscribed; the record is kept
// for mail-log integrity
err = client.Audience.Contacts.Delete("contact-id")

// ── Lists ──

lists, err := client.Audience.Lists.List()
list, err := client.Audience.Lists.Get("list-id")
list, err = client.Audience.Lists.Create(sentroy.CreateAudienceListParams{
    Name:        "Newsletter",
    Description: "Monthly digest subscribers",
})
err = client.Audience.Lists.Delete("list-id") // contacts stay in the company

// ── List members (scoped sub-resource) ──

members := client.Audience.Lists.Members("list-id")
contacts, err := members.List()
err = members.Add("contact-id")
err = members.Remove("contact-id") // contact record preserved
```

### Suppressions

Suppressed recipients are skipped at send time. Bounces and complaints are
added automatically by the mail server; use `Add` for manual opt-outs.

```go
// List (optionally filtered)
suppressions, err := client.Suppressions.List(&sentroy.SuppressionListParams{
    Page:     1,
    Limit:    50,
    DomainID: "domain-id",
})

// Manually suppress an address
sup, err := client.Suppressions.Add(sentroy.AddSuppressionParams{
    Email:    "user@example.com",
    Reason:   "manual",
    DomainID: "domain-id",
})

// Remove — the address becomes eligible to receive mail again
err = client.Suppressions.Remove("suppression-id")
```

### Webhooks

```go
// List (pass "" for all domains, or a domain id to scope)
webhooks, err := client.Webhooks.List("")

// Get one (secret is NOT returned on reads)
webhook, err := client.Webhooks.Get("webhook-id")

// Create — the response includes Secret ONLY here; store it for
// HMAC verification of deliveries
created, err := client.Webhooks.Create(sentroy.CreateWebhookParams{
    URL:      "https://example.com/hooks/mail",
    Events:   []sentroy.WebhookEvent{sentroy.WebhookEventSent, sentroy.WebhookEventBounced},
    DomainID: "domain-id",
})
fmt.Println(created.Secret)

// Update / delete
updated, err := client.Webhooks.Update("webhook-id", sentroy.UpdateWebhookParams{
    Active: sentroy.Ptr(false),
})
err = client.Webhooks.Delete("webhook-id")

// Fire a custom test payload at the webhook's current URL
dispatch, err := client.Webhooks.Test("webhook-id", sentroy.WebhookTestParams{
    Event:   "sent",
    Payload: map[string]interface{}{"messageId": "test-123"},
})

// Delivery log (test/replay dispatches only)
deliveries := client.Webhooks.Deliveries("webhook-id")
page, err := deliveries.List(&sentroy.WebhookDeliveryListParams{Limit: 20})
row, err := deliveries.Get("delivery-id") // full payload + response body (4 KB cap)
replayed, err := deliveries.Replay("delivery-id") // re-fires at the CURRENT URL
```

### Mail Logs

```go
// List with filters (paginated)
logs, err := client.Logs.List(&sentroy.LogListParams{
    Page:     1,
    Limit:    50,
    Status:   sentroy.MailLogStatusSent,
    DomainID: "domain-id",
    From:     "2026-01-01T00:00:00Z", // ISO, inclusive
    To:       "2026-02-01T00:00:00Z",
})

// Get a single entry
entry, err := client.Logs.Get("log-id")
```

### Buckets

Storage is organized into **buckets** — isolated containers with their own
visibility (public vs private) and usage counters.

```go
// List all buckets
buckets, err := client.Buckets.List()

// Get a single bucket by its slug
bucket, err := client.Buckets.Get("product-assets")

// Create (slug auto-derived from name if omitted)
bucket, err := client.Buckets.Create(sentroy.CreateBucketParams{
    Name:        "User Uploads",
    Description: "Avatars and profile media",
    IsPublic:    false,
})

// Update — toggling IsPublic cascades to every file's ACL
bucket, err := client.Buckets.Update("product-assets", sentroy.UpdateBucketParams{
    IsPublic: sentroy.Ptr(true),
})

// Delete (use Force to purge files before removing)
err := client.Buckets.Delete("product-assets", &sentroy.DeleteOptions{Force: true})
```

### Media

Upload, list, download, and delete files. The same access token that
authorizes mail calls also authorizes storage.

```go
import "os"

// List files in a bucket
result, err := client.Media.List("product-assets", &sentroy.MediaListParams{
    Type:  sentroy.MediaTypeImage,
    Limit: 50,
})

// Get a single media record
media, err := client.Media.Get("product-assets", "media-id")

// Upload
f, err := os.Open("./photo.jpg")
defer f.Close()
uploaded, err := client.Media.Upload("product-assets", sentroy.UploadMediaParams{
    Filename: "photo.jpg",
    Body:     f,
    Folder:   "products",
    Tags:     []string{"v1", "cover"},
    IsPublic: sentroy.Ptr(true),
})

// Download — returns raw bytes + Content-Type
bytes, contentType, err := client.Media.Download("product-assets", "media-id", nil)

// Download a thumbnail variant (500px wide)
thumb, _, err := client.Media.Download("product-assets", "media-id",
    &sentroy.DownloadOptions{Quality: 500})

// Delete
err := client.Media.Delete("product-assets", "media-id")
```

#### Video processing

Two opt-in flags trigger server-side video processing on upload:

```go
uploaded, err := client.Media.Upload("clips", sentroy.UploadMediaParams{
    Filename: "demo.mp4",
    Body:     f,
    // Light single-pass H.264 re-encode at source resolution
    // (30-60% smaller, synchronous — upload waits for the encode).
    CompressVideo: true,
    // 144p/480p/720p/1080p variant ladder, generated ASYNCHRONOUSLY.
    // Implies CompressVideo. The response returns immediately with
    // Processing.Status == "queued".
    TranscodeVideo: true,
})

// Poll until the ladder is complete
for {
    m, err := client.Media.Get("clips", uploaded.ID)
    if err != nil || m.Processing == nil ||
        m.Processing.Status == "completed" || m.Processing.Status == "failed" {
        break
    }
    time.Sleep(4 * time.Second)
}
```

### Storage Quota & Usage

```go
// Plan quota — mail and storage share the same byte pool.
// Limit of 0 means unlimited.
quota, err := client.Storage.Quota()
fmt.Println(quota.Used, quota.Limit, quota.MailUsed, quota.PlanName)

// Combined dashboard payload: quota + per-bucket counters + per-type
// aggregation, in a single round-trip
usage, err := client.Storage.Usage()
```

### Thumbnail Helpers

Pure URL helpers for picking the right pre-generated thumbnail for a
display target (no network calls):

```go
// Smallest pre-generated thumbnail covering 112px (56px display @2x retina)
avatarURL := sentroy.PickThumbnailURL(media, 56*2)

// Semantic presets: avatar (128), card (500), preview (960), hero (1600)
cardURL := sentroy.PickPresetThumbnailURL(media, sentroy.ThumbnailPresetCard)
```

Non-images (or media without thumbnails) fall back to `media.URL` /
`media.DownloadURL`; the helper returns `""` when no URL can be produced.

### WhatsApp Santral

Send template-based WhatsApp messages, manage templates & audiences, list
connected numbers, and read send logs — with the same `stk_` access token.

```go
// Connected numbers (only Connected == true can send)
numbers, err := client.WhatsApp.Numbers.List()

// Templates — variables are auto-extracted from the body
tpl, err := client.WhatsApp.Templates.Create(sentroy.CreateWhatsAppTemplateParams{
    Name: "Order shipped",
    Body: "Hi {{name}}, your order {{orderId}} has shipped!",
})
templates, err := client.WhatsApp.Templates.List()
tpl, err = client.WhatsApp.Templates.Get("template-id")
tpl, err = client.WhatsApp.Templates.Update("template-id", sentroy.UpdateWhatsAppTemplateParams{
    Body: "Hello {{name}}!",
})
err = client.WhatsApp.Templates.Delete("template-id")

// Audiences — entries are phone strings or per-recipient variable maps
aud, err := client.WhatsApp.Audiences.Create(sentroy.CreateWhatsAppAudienceParams{
    Name: "VIP customers",
    Entries: []interface{}{
        "+905551112233",
        sentroy.WhatsAppAudienceEntry{
            Phone:     "+905554445566",
            Variables: map[string]string{"name": "Ayse"},
        },
    },
})
audiences, err := client.WhatsApp.Audiences.List()
aud, err = client.WhatsApp.Audiences.Get("audience-id")
aud, err = client.WhatsApp.Audiences.Update("audience-id", sentroy.UpdateWhatsAppAudienceParams{
    Name: "VIP customers 2026",
})
err = client.WhatsApp.Audiences.Delete("audience-id")

// Send — single recipient (To) OR a saved audience (AudienceID);
// template (TemplateID) OR raw Body with {{variables}}.
// Global Variables are merged UNDER per-recipient audience variables.
result, err := client.WhatsApp.Send(sentroy.WhatsAppSendParams{
    From:       "session-id-or-phone", // omit to use the only connected number
    AudienceID: "audience-id",
    TemplateID: "template-id",
    Variables:  map[string]string{"orderId": "SO-1042"},
})
fmt.Println(result.Total, result.Sent, result.Failed)

// Send logs (paginated)
logs, err := client.WhatsApp.Logs.List(&sentroy.WhatsAppLogListParams{
    Status: sentroy.WhatsAppSendStatusFailed,
    Limit:  50,
})
```

## Auth-as-a-Service (Auth Projects)

`sentroy.NewAuth` is a **separate entry point** for Sentroy Auth Projects
(hosted end-user pools). It talks to `https://auth.sentroy.com` with an
`aps_` project API key and/or end-user bearer tokens — do not confuse it
with the `stk_` company token used by `sentroy.New`.

> The `aps_` key is the project's master key. Keep it server-side only —
> never ship it to a browser or mobile client.

```go
auth := sentroy.NewAuth(sentroy.AuthConfig{
    ProjectSlug: "my-project",
    APIKey:      "aps_...", // server-only
})

// Sign up (session persisted if email verification isn't required)
signup, err := auth.SignUp(sentroy.SignUpParams{
    Email:    "user@example.com",
    Password: "s3cure-Passw0rd",
})

// Sign in — discriminated outcome: tokens OR an MFA challenge
outcome, err := auth.SignIn(sentroy.SignInParams{
    Email:    "user@example.com",
    Password: "s3cure-Passw0rd",
})
if outcome.Kind == sentroy.LoginOutcomeMfa {
    login, err := auth.VerifyMfa(sentroy.VerifyMfaParams{
        MfaToken: outcome.Mfa.MfaToken,
        Code:     "123456",
    })
    _ = login
}

// Current session
user := auth.User()
token := auth.AccessToken()
me, err := auth.GetCurrentUser() // validates against /me, refreshes snapshot

// Session management (bearer required)
sessions, err := auth.ListSessions()
err = auth.RevokeSession("session-id")
activity, err := auth.GetActivity()

// Account flows
err = auth.SendPasswordReset("user@example.com")
u, err := auth.ConfirmPasswordReset("token-from-mail", "new-Passw0rd")
u, err = auth.VerifyEmail("token-from-mail")
err = auth.ChangePassword("current", "next")          // clears local session
err = auth.RequestEmailChange("new@example.com", "pw") // confirm mail → new address
u, err = auth.ConfirmEmailChange("token-from-mail")    // clears local session
err = auth.RequestAccountDeletion("pw")
err = auth.ConfirmAccountDeletion("token-from-mail")   // clears local session

// Magic link & invitations
err = auth.SendMagicLink(sentroy.SendMagicLinkParams{Email: "user@example.com"})
login, err := auth.ConsumeMagicLink("token-from-mail")
login, err = auth.AcceptInvitation(sentroy.AcceptInvitationParams{
    Token:    "invitation-token",
    Password: "s3cure-Passw0rd",
})

// Social federation — URL builder only (redirect the browser to it)
url := auth.SocialAuthorizeURL(sentroy.SocialProviderGoogle, &sentroy.SocialAuthorizeOptions{
    RedirectURI: "https://app.example.com/callback",
})

// MFA management (bearer required)
status, err := auth.MFA.GetStatus()
enroll, err := auth.MFA.EnrollTotp()
verified, err := auth.MFA.VerifyTotpEnrollment("123456") // recovery codes shown ONCE
err = auth.MFA.DisableTotp("current-password")

// Passkey management (bearer required). Registration/authentication
// need a browser WebAuthn ceremony — use the TypeScript SDK for those.
passkeys, err := auth.Passkeys.List()
err = auth.Passkeys.Delete("passkey-id")

// Token refresh — no automatic background refresh server-side;
// call when the access token is (about to be) expired. A rejected
// refresh clears the session.
err = auth.RefreshNow()

// Manual session injection + Firebase-style state subscription
auth.SetSession(sentroy.AuthSession{AccessToken: at, RefreshToken: rt, User: user})
unsubscribe := auth.OnAuthStateChanged(func(u *sentroy.SentroyAuthUser) {
    fmt.Println("auth state:", u)
})
defer unsubscribe()
```

Auth errors are `*sentroy.SentroyAuthError` with `Code` (machine-readable),
`Status` (HTTP), and `Message`:

```go
var authErr *sentroy.SentroyAuthError
if errors.As(err, &authErr) {
    fmt.Println(authErr.Code, authErr.Status, authErr.Message)
}
```

## Error Handling

```go
import "errors"

result, err := client.Send.Email(sentroy.SendParams{...})
if err != nil {
    var sentroyErr *sentroy.SentroyError
    if errors.As(err, &sentroyErr) {
        fmt.Println(sentroyErr.StatusCode) // 401, 403, 500, etc.
        fmt.Println(sentroyErr.Message)    // Human-readable error
        fmt.Println(sentroyErr.Body)       // Raw response body
    }
}
```

## Configuration

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `BaseURL` | `string` | Yes | Sentroy instance URL (e.g. `https://sentroy.com`) |
| `CompanySlug` | `string` | Yes | Your company slug |
| `AccessToken` | `string` | Yes | Access token (`stk_...`) |
| `Timeout` | `time.Duration` | No | Request timeout (default: `30s`) |

## Requirements

- Go 1.21+
- Zero external dependencies (stdlib only)

## Raw Documentation

For AI agents and LLMs — plain-text version of this document:

```
https://raw.githubusercontent.com/Sentroy-Co/client-sdk/refs/heads/main/go/README.md
```

## License

[MIT](LICENSE)
