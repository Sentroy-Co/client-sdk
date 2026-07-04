<p align="center">
  <img src="https://sentroy.com/business/sentroy-logo-light.png" alt="Sentroy" width="240" />
</p>

<h3 align="center">Sentroy Client SDK for Python</h3>

<p align="center">
  Server-side SDK to interact with the Sentroy platform API.<br />
  Manage mail (domains, mailboxes, templates, inbox, send, audience, suppressions, webhooks, logs), storage (buckets, media) and WhatsApp from a single entry point — plus a separate Auth-as-a-Service client.
</p>

<p align="center">
  <a href="https://pypi.org/project/sentroy-client-sdk/"><img src="https://img.shields.io/pypi/v/sentroy-client-sdk.svg" alt="PyPI version" /></a>
  <a href="https://github.com/Sentroy-Co/client-sdk/blob/main/LICENSE"><img src="https://img.shields.io/pypi/l/sentroy-client-sdk.svg" alt="license" /></a>
</p>

---

## Installation

```bash
pip install sentroy-client-sdk
```

## Quick Start

```python
from sentroy import Sentroy

sentroy = Sentroy(
    base_url="https://sentroy.com",
    company_slug="my-company",
    access_token="stk_...",
)
```

> Access tokens can be created from **Admin > Access Tokens** in the Sentroy dashboard.

## Usage

### Domains

```python
# List all domains
domains = sentroy.domains.list()

# Get a single domain
domain = sentroy.domains.get("domain-id")
```

### Mailboxes

```python
# List all mailbox accounts
mailboxes = sentroy.mailboxes.list()
```

### Templates

```python
# List all templates (optionally filtered by sending domain)
templates = sentroy.templates.list()
templates = sentroy.templates.list(domain_id="domain-id")

# Get a template by ID
template = sentroy.templates.get("template-id")

# Create — name/subject/mjml_body accept a flat string or a {lang: value} map.
# `variables` is NOT an input: the platform extracts placeholders from the
# body and returns them on the created template. Requires templates.manage.
template = sentroy.templates.create(
    name={"en": "Welcome", "tr": "Hosgeldin"},
    subject={"en": "Welcome, {{name}}!", "tr": "Hosgeldin, {{name}}!"},
    mjml_body={"en": "<mjml>...</mjml>", "tr": "<mjml>...</mjml>"},
    domain_id="domain-id",
)

# Partial update
template = sentroy.templates.update("template-id", subject="New subject")

# Delete
sentroy.templates.delete("template-id")
```

Templates support multiple languages. A field like `name` or `subject` can be a plain string or a dict keyed by language code:

```python
# Example template response
{
    "id": "b3f1a2c4-...",
    "name": {"en": "Welcome Email", "tr": "Hosgeldin E-postasi"},
    "subject": {"en": "Welcome, {{name}}!", "tr": "Hosgeldin, {{name}}!"},
    "mjmlBody": {"en": "<mjml>...</mjml>", "tr": "<mjml>...</mjml>"},
    "variables": ["name", "company"],
    "domainId": "a1b2c3d4-...",
    "domainName": "example.com"
}
```

Use the `variables` list to know which placeholders (`{{name}}`, `{{company}}`) the template expects.

### Inbox

```python
from sentroy import InboxListParams

# List messages
messages = sentroy.inbox.list(InboxListParams(
    mailbox="info@example.com",
    folder="INBOX",
    page=1,
    limit=20,
))

# Get a single message
message = sentroy.inbox.get(1234, mailbox="info@example.com")

# List IMAP folders
folders = sentroy.inbox.list_folders("info@example.com")

# Get a thread by subject
thread = sentroy.inbox.get_thread("Re: Project update", "info@example.com")

# Mark as read / unread
sentroy.inbox.mark_as_read(1234, mailbox="info@example.com")
sentroy.inbox.mark_as_unread(1234, mailbox="info@example.com")

# Move message
sentroy.inbox.move(1234, "Trash", from_folder="INBOX", mailbox="info@example.com")

# Delete message
sentroy.inbox.delete(1234, mailbox="info@example.com")
```

### Send Email

```python
from sentroy import SendParams, Attachment

# Send with a template
result = sentroy.send.email(SendParams(
    to="user@example.com",
    from_addr="info@example.com",
    subject="Welcome!",
    domain_id="domain-id",
    template_id="template-id",
    variables={
        "name": "John",
        "company": "Acme",
    },
))

# Send with a specific language
result = sentroy.send.email(SendParams(
    to="user@example.com",
    from_addr="info@example.com",
    subject="Hosgeldin!",
    domain_id="domain-id",
    template_id="template-id",
    lang="tr",
    variables={"name": "Ahmet"},
))

# Send with raw HTML
result = sentroy.send.email(SendParams(
    to=["user1@example.com", "user2@example.com"],
    from_addr="info@example.com",
    subject="Hello",
    domain_id="domain-id",
    html="<h1>Hello World</h1>",
))

# Send with attachments
result = sentroy.send.email(SendParams(
    to="user@example.com",
    from_addr="info@example.com",
    subject="Invoice",
    domain_id="domain-id",
    html="<p>Please find your invoice attached.</p>",
    attachments=[
        Attachment(
            filename="invoice.pdf",
            content=base64_string,
            content_type="application/pdf",
        ),
    ],
))
```

### Audience (Contacts & Lists)

Company-wide contact records plus named lists (groupings).

```python
# Contacts — paginated list with filters
result = sentroy.audience.contacts.list(page=1, limit=50, status="active", tags=["vip"])
print(result.total, len(result.contacts))

# Email-prefix autocomplete (server-capped at 10 results)
matches = sentroy.audience.contacts.search("john@")

# CRUD
contact = sentroy.audience.contacts.get("contact-id")
contact = sentroy.audience.contacts.create(email="user@example.com", name="John", tags=["vip"])
contact = sentroy.audience.contacts.update("contact-id", status="unsubscribed")
sentroy.audience.contacts.delete("contact-id")  # soft-delete: marks unsubscribed

# Lists
lists = sentroy.audience.lists.list()
lst = sentroy.audience.lists.get("list-id")
lst = sentroy.audience.lists.create(name="Newsletter", description="Weekly digest")
sentroy.audience.lists.delete("list-id")  # only removes the grouping

# List membership (scoped sub-resource)
members = sentroy.audience.lists.members("list-id")
contacts = members.list()
members.add("contact-id")
members.remove("contact-id")  # contact record preserved
```

### Suppressions

Suppressed recipients are skipped at send time. Bounces/complaints are added
automatically server-side; use `add` for manual opt-outs.

```python
suppressions = sentroy.suppressions.list(page=1, limit=50, domain_id="domain-id")

suppression = sentroy.suppressions.add(
    email="user@example.com",
    domain_id="domain-id",
    reason="manual",
)

sentroy.suppressions.remove("suppression-id")
```

### Webhooks

```python
# List (optionally scoped to a domain)
webhooks = sentroy.webhooks.list(domain_id="domain-id")

# Create — `secret` is returned ONLY here; store it for HMAC verification
webhook = sentroy.webhooks.create(
    url="https://example.com/hooks/mail",
    events=["sent", "bounced", "opened"],
    domain_id="domain-id",
)
print(webhook.secret)

# Read / update / delete (reads never return the secret)
webhook = sentroy.webhooks.get("webhook-id")
webhook = sentroy.webhooks.update("webhook-id", active=False)
sentroy.webhooks.delete("webhook-id")

# Fire a custom test payload at the current URL
result = sentroy.webhooks.test("webhook-id", event="sent", payload={"demo": True})
print(result.status, result.response_status, result.duration_ms)

# Delivery log (test/replay dispatches only)
deliveries = sentroy.webhooks.deliveries("webhook-id")
page = deliveries.list(page=1, limit=20, status="failed")
row = deliveries.get("delivery-id")     # full payload + response body (4KB cap)
replayed = deliveries.replay("delivery-id")  # re-fires at the CURRENT URL
```

### Mail Logs

```python
logs = sentroy.logs.list(
    page=1,
    limit=50,
    status="sent",              # queued|processing|sent|bounced|failed
    domain_id="domain-id",
    from_="2026-01-01T00:00:00Z",  # ISO, inclusive
    to="2026-01-31T23:59:59Z",     # ISO, inclusive
)

log = sentroy.logs.get("log-id")
print(log.status, log.opened_at, log.clicked_at)
```

### WhatsApp

WhatsApp Santral — same `stk_` token as mail/storage.

```python
# Connected numbers (only connected ones can send)
numbers = sentroy.whatsapp.numbers.list()

# Templates — variables auto-extracted from {{placeholders}} in body
templates = sentroy.whatsapp.templates.list()
tpl = sentroy.whatsapp.templates.create(
    name="Order shipped",
    body="Hi {{name}}, your order {{orderId}} has shipped!",
)
tpl = sentroy.whatsapp.templates.update(tpl.id, category="transactional")
sentroy.whatsapp.templates.delete(tpl.id)

# Audiences — entries accept plain phones or per-recipient variable maps
audience = sentroy.whatsapp.audiences.create(
    name="Beta users",
    entries=[
        "+905551112233",
        {"phone": "+905554445566", "variables": {"name": "Ayse"}},
    ],
)

# Send — single (`to`) XOR bulk (`audience_id`); template XOR raw body
result = sentroy.whatsapp.send(
    to="+905551112233",
    template_id=tpl.id,
    variables={"name": "John", "orderId": "1234"},
)
result = sentroy.whatsapp.send(
    audience_id=audience.id,
    body="Hello {{name}}!",   # global variables merged UNDER per-recipient ones
    variables={"name": "there"},
)
print(result.total, result.sent, result.failed)
for r in result.results:
    print(r.to, r.status, r.wa_message_id or r.error)

# Send logs
logs = sentroy.whatsapp.logs.list(page=1, limit=20, status="failed")
```

### Buckets

Storage is organized into **buckets** — isolated containers with their own
visibility (public vs private) and usage counters.

```python
# List all buckets
buckets = sentroy.buckets.list()

# Get a single bucket by its slug
bucket = sentroy.buckets.get("product-assets")

# Create (slug auto-derived from name if omitted)
bucket = sentroy.buckets.create(
    name="User Uploads",
    description="Avatars and profile media",
    is_public=False,
)

# Update — toggling is_public cascades to every file's ACL
bucket = sentroy.buckets.update("product-assets", is_public=True)

# Delete (pass force=True to purge files first)
sentroy.buckets.delete("product-assets", force=True)
```

### Media

Upload, list, download, and delete files. The same access token that
authorizes mail calls also authorizes storage.

```python
# List files in a bucket
result = sentroy.media.list("product-assets", type="image", limit=50)
print(result.total, len(result.items))

# Get a single media record
media = sentroy.media.get("product-assets", "media-id")

# Upload from a file path
uploaded = sentroy.media.upload(
    "product-assets",
    body="./photo.jpg",
    folder="products",
    tags=["v1", "cover"],
    is_public=True,
)

# Upload from raw bytes
uploaded = sentroy.media.upload(
    "product-assets",
    body=photo_bytes,
    filename="photo.jpg",
    content_type="image/jpeg",
)

# Download — returns (bytes, content_type)
data, content_type = sentroy.media.download("product-assets", "media-id")

# Thumbnail variant (500px wide — falls back to original if unavailable)
thumb, _ = sentroy.media.download(
    "product-assets", "media-id", quality=500,
)

# Delete
sentroy.media.delete("product-assets", "media-id")
```

#### Video uploads

```python
# Light single-pass H.264 re-encode (sync — roughly doubles upload latency)
uploaded = sentroy.media.upload("videos", body="./clip.mp4", compress_video=True)

# Async multi-quality ladder (144p/480p/720p/1080p) — implies compress_video.
# Returns immediately with processing.status == "queued"; poll media.get.
uploaded = sentroy.media.upload("videos", body="./clip.mp4", transcode_video=True)

import time
media = sentroy.media.get("videos", uploaded.id)
while media.processing and media.processing.status not in ("completed", "failed"):
    time.sleep(4)
    media = sentroy.media.get("videos", media.id)
print([v.height for v in media.video_meta.variants])
```

#### Thumbnail helpers

Pure URL helpers — pick the right pre-generated thumbnail for a display
target instead of shipping the original. Call with a 2x target for retina.

```python
from sentroy import pick_thumbnail_url, pick_preset_thumbnail_url, THUMBNAIL_PRESETS

avatar_url = pick_thumbnail_url(media, 56 * 2)          # explicit px target
card_url = pick_preset_thumbnail_url(media, "card")     # avatar|card|preview|hero
print(THUMBNAIL_PRESETS)  # {"avatar": 128, "card": 500, "preview": 960, "hero": 1600}
```

### Storage quota & usage

```python
quota = sentroy.storage.quota()
print(quota.used, quota.limit, quota.mail_used)  # limit 0 = unlimited

usage = sentroy.storage.usage()
for bucket in usage.buckets:
    print(bucket.slug, bucket.storage_used, bucket.file_count)
for row in usage.by_type:
    print(row.type, row.count, row.bytes)
```

## Auth-as-a-Service (`SentroyAuth`)

Separate client for Sentroy Auth Projects (your own end-user pool) — it is
**not** attached to the root `Sentroy` client: different base URL
(`https://auth.sentroy.com`) and a different credential (project `aps_`
API key).

> The `aps_` key is the project's **master key** — keep it server-only,
> never ship it to a browser.

```python
from sentroy import SentroyAuth, SentroyAuthError

auth = SentroyAuth(
    project_slug="my-app",
    api_key="aps_...",                        # server-only
    # auth_base_url="https://auth.sentroy.com",  # default
)

# Sign up / sign in
res = auth.sign_up(email="user@example.com", password="s3cret!", display_name="John")

outcome = auth.sign_in(email="user@example.com", password="s3cret!")
if outcome.kind == "mfa":
    auth.verify_mfa(mfa_token=outcome.mfa.mfa_token, code="123456")

print(auth.user)          # current SentroyAuthUser (or None)
print(auth.access_token)  # current end-user access token (or None)

# Session lifecycle
auth.refresh_now()        # exchange refresh token for new tokens
auth.sign_out()           # best-effort revoke + clear local session

# Email / password flows
auth.send_password_reset("user@example.com")
auth.confirm_password_reset(token="...", new_password="...")
auth.verify_email("token-from-mail")
auth.send_magic_link(email="user@example.com", redirect_uri="https://rp/cb")
auth.consume_magic_link("token-from-mail")
auth.accept_invitation(token="...", password="...")

# Social login (URL builder only — redirect the user's browser to it)
url = auth.social_authorize_url("google", redirect_uri="https://rp/cb")

# Signed-in user (bearer) endpoints
user = auth.get_current_user()
sessions = auth.list_sessions()
auth.revoke_session("session-id")
auth.change_password(current_password="...", new_password="...")  # clears session
auth.request_email_change(new_email="new@example.com", current_password="...")
auth.confirm_email_change("token-from-mail")
auth.request_account_deletion("current-password")
auth.confirm_account_deletion("token-from-mail")
activity = auth.get_activity()

# MFA (TOTP)
status = auth.mfa.get_status()
enroll = auth.mfa.enroll_totp()               # secret + otpauth URI
codes = auth.mfa.verify_totp_enrollment("123456").recovery_codes  # shown once
auth.mfa.disable_totp("current-password")

# Passkeys (management; WebAuthn register/authenticate ceremonies are browser-only)
passkeys = auth.passkey.list()
auth.passkey.delete("passkey-id")

# Firebase-style state subscription
unsubscribe = auth.on_auth_state_changed(lambda user: print("auth state:", user))
unsubscribe()

# Error handling
try:
    auth.sign_in(email="user@example.com", password="wrong")
except SentroyAuthError as err:
    print(err.code, err.status)  # e.g. "invalid_credentials", 401
```

Session state is held in memory by default; pass a custom `storage` object
with `read()` / `write(value)` / `clear()` for persistence. There is no
background refresh timer — call `refresh_now()` when the token nears expiry.

## Error Handling

```python
from sentroy import Sentroy, SentroyError

try:
    sentroy.send.email(params)
except SentroyError as err:
    print(err.status_code)  # 401, 403, 500, etc.
    print(err)              # Human-readable error
```

## Configuration

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `base_url` | `str` | Yes | Sentroy instance URL (e.g. `https://sentroy.com`) |
| `company_slug` | `str` | Yes | Your company slug |
| `access_token` | `str` | Yes | Access token (`stk_...`) |
| `timeout` | `int` | No | Request timeout in seconds (default: `30`) |

## Requirements

- Python 3.10+
- Zero external dependencies (stdlib only)

## Raw Documentation

For AI agents and LLMs — plain-text version of this document:

```
https://raw.githubusercontent.com/Sentroy-Co/client-sdk/refs/heads/main/python/README.md
```

## License

[MIT](LICENSE)
