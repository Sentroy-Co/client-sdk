<p align="center">
  <img src="https://sentroy.com/business/sentroy-logo-light.png" alt="Sentroy" width="240" />
</p>

<h3 align="center">Sentroy Client SDK for Python</h3>

<p align="center">
  Server-side SDK to interact with the Sentroy platform API.<br />
  List domains, manage mailboxes, fetch templates, read inbox, and send emails.
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

## License

[MIT](LICENSE)
