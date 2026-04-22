<p align="center">
  <img src="https://sentroy.com/business/sentroy-logo-light.png" alt="Sentroy" width="240" />
</p>

<h3 align="center">Sentroy Client SDK for Python</h3>

<p align="center">
  Server-side SDK to interact with the Sentroy platform API.<br />
  Manage mail (domains, mailboxes, templates, inbox, send) and storage (buckets, media) from a single entry point.
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
# List all templates
templates = sentroy.templates.list()

# Get a template by ID
template = sentroy.templates.get("template-id")
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
