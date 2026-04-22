<p align="center">
  <img src="https://sentroy.com/business/sentroy-logo-light.png" alt="Sentroy" width="240" />
</p>

<h3 align="center">Sentroy Client SDK for Go</h3>

<p align="center">
  Server-side SDK to interact with the Sentroy platform API.<br />
  Manage mail (domains, mailboxes, templates, inbox, send) and storage (buckets, media) from a single entry point.
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

// Get a template by ID
template, err := client.Templates.Get("template-id")
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
