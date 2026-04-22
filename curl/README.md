<p align="center">
  <img src="https://sentroy.com/business/sentroy-logo-light.png" alt="Sentroy" width="240" />
</p>

<h3 align="center">Sentroy API — cURL Examples</h3>

<p align="center">
  Quick reference for interacting with the Sentroy platform API using cURL.
</p>

---

## Authentication

All requests require an access token in the `Authorization` header:

```
Authorization: Bearer stk_...
```

> Access tokens can be created from **Admin > Access Tokens** in the Sentroy dashboard.

## Base URLs

The platform splits its API across two path namespaces. Both live under the
same origin (`https://sentroy.com`); the gateway forwards to the correct
backend automatically.

```
Mail     https://sentroy.com/api/mail/companies/{company-slug}
Storage  https://sentroy.com/api/storage/companies/{company-slug}
```

Replace `{company-slug}` with your company slug throughout the examples
below. The same access token works across both namespaces.

---

## Domains

### List domains

```bash
curl -s https://sentroy.com/api/mail/companies/{company-slug}/domains \
  -H "Authorization: Bearer stk_..."
```

### Get a domain

```bash
curl -s https://sentroy.com/api/mail/companies/{company-slug}/domains/{domain-id} \
  -H "Authorization: Bearer stk_..."
```

<details>
<summary>Example response</summary>

```json
{
  "data": [
    {
      "id": "a1b2c3d4-...",
      "domain": "example.com",
      "status": "active",
      "spfVerified": true,
      "dkimVerified": true,
      "dmarcVerified": true,
      "createdAt": "2026-01-10T08:00:00.000Z",
      "updatedAt": "2026-01-10T09:15:00.000Z"
    }
  ]
}
```

</details>

---

## Mailboxes

### List mailbox accounts

```bash
curl -s https://sentroy.com/api/mail/companies/{company-slug}/mailboxes \
  -H "Authorization: Bearer stk_..."
```

<details>
<summary>Example response</summary>

```json
{
  "data": [
    {
      "email": "info@example.com",
      "domain": "example.com",
      "username": "info"
    }
  ]
}
```

</details>

---

## Templates

### List templates

```bash
curl -s https://sentroy.com/api/mail/companies/{company-slug}/templates \
  -H "Authorization: Bearer stk_..."
```

### Get a template

```bash
curl -s https://sentroy.com/api/mail/companies/{company-slug}/templates/{template-id} \
  -H "Authorization: Bearer stk_..."
```

<details>
<summary>Example response</summary>

```json
{
  "data": {
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
}
```

Template fields like `name`, `subject`, and `mjmlBody` can be a plain string or an object keyed by language code. Use the `variables` array to know which `{{placeholders}}` the template expects.

</details>

---

## Send Email

### Send with a template

```bash
curl -s -X POST https://sentroy.com/api/mail/companies/{company-slug}/send \
  -H "Authorization: Bearer stk_..." \
  -H "Content-Type: application/json" \
  -d '{
    "to": "user@example.com",
    "from": "info@example.com",
    "subject": "Welcome!",
    "domainId": "a1b2c3d4-...",
    "templateId": "b3f1a2c4-...",
    "variables": {
      "name": "John",
      "company": "Acme"
    }
  }'
```

### Send with a specific language

```bash
curl -s -X POST https://sentroy.com/api/mail/companies/{company-slug}/send \
  -H "Authorization: Bearer stk_..." \
  -H "Content-Type: application/json" \
  -d '{
    "to": "user@example.com",
    "from": "info@example.com",
    "subject": "Hosgeldin!",
    "domainId": "a1b2c3d4-...",
    "templateId": "b3f1a2c4-...",
    "lang": "tr",
    "variables": {
      "name": "Ahmet"
    }
  }'
```

### Send with raw HTML

```bash
curl -s -X POST https://sentroy.com/api/mail/companies/{company-slug}/send \
  -H "Authorization: Bearer stk_..." \
  -H "Content-Type: application/json" \
  -d '{
    "to": ["user1@example.com", "user2@example.com"],
    "from": "info@example.com",
    "subject": "Hello",
    "domainId": "a1b2c3d4-...",
    "html": "<h1>Hello World</h1>"
  }'
```

### Send with attachments

```bash
curl -s -X POST https://sentroy.com/api/mail/companies/{company-slug}/send \
  -H "Authorization: Bearer stk_..." \
  -H "Content-Type: application/json" \
  -d '{
    "to": "user@example.com",
    "from": "info@example.com",
    "subject": "Invoice",
    "domainId": "a1b2c3d4-...",
    "html": "<p>Please find your invoice attached.</p>",
    "attachments": [
      {
        "filename": "invoice.pdf",
        "content": "<base64-encoded-content>",
        "contentType": "application/pdf"
      }
    ]
  }'
```

<details>
<summary>Example response</summary>

```json
{
  "data": {
    "jobId": "job_abc123",
    "mailLogId": "log_xyz789",
    "status": "queued"
  }
}
```

</details>

---

## Inbox

### List messages

```bash
curl -s "https://sentroy.com/api/mail/companies/{company-slug}/inbox?mailbox=info@example.com&folder=INBOX&page=1&limit=20" \
  -H "Authorization: Bearer stk_..."
```

### Get a message

```bash
curl -s "https://sentroy.com/api/mail/companies/{company-slug}/inbox/1234?mailbox=info@example.com" \
  -H "Authorization: Bearer stk_..."
```

### List IMAP folders

```bash
curl -s "https://sentroy.com/api/mail/companies/{company-slug}/inbox/mailboxes?mailbox=info@example.com" \
  -H "Authorization: Bearer stk_..."
```

### Get thread by subject

```bash
curl -s "https://sentroy.com/api/mail/companies/{company-slug}/inbox/thread?subject=Re%3A+Project+update&mailbox=info@example.com" \
  -H "Authorization: Bearer stk_..."
```

### Mark as read

```bash
curl -s -X POST https://sentroy.com/api/mail/companies/{company-slug}/inbox/1234/read \
  -H "Authorization: Bearer stk_..." \
  -H "Content-Type: application/json" \
  -d '{"mailbox": "info@example.com", "folder": "INBOX"}'
```

### Mark as unread

```bash
curl -s -X DELETE "https://sentroy.com/api/mail/companies/{company-slug}/inbox/1234/read?mailbox=info@example.com&folder=INBOX" \
  -H "Authorization: Bearer stk_..."
```

### Move message

```bash
curl -s -X POST https://sentroy.com/api/mail/companies/{company-slug}/inbox/1234/move \
  -H "Authorization: Bearer stk_..." \
  -H "Content-Type: application/json" \
  -d '{"to": "Trash", "from": "INBOX", "mailbox": "info@example.com"}'
```

### Delete message

```bash
curl -s -X DELETE "https://sentroy.com/api/mail/companies/{company-slug}/inbox/1234?mailbox=info@example.com" \
  -H "Authorization: Bearer stk_..."
```

---

## Buckets

Buckets are isolated storage containers with their own visibility (public
vs private) and usage counters.

### List buckets

```bash
curl -s https://sentroy.com/api/storage/companies/{company-slug}/buckets \
  -H "Authorization: Bearer stk_..."
```

### Get a bucket

```bash
curl -s https://sentroy.com/api/storage/companies/{company-slug}/buckets/{bucket-slug} \
  -H "Authorization: Bearer stk_..."
```

### Create a bucket

```bash
curl -s -X POST https://sentroy.com/api/storage/companies/{company-slug}/buckets \
  -H "Authorization: Bearer stk_..." \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Product Assets",
    "description": "Catalog images and downloads",
    "isPublic": false
  }'
```

### Update a bucket

Toggling `isPublic` cascades to every file's S3 ACL and Media record.

```bash
curl -s -X PATCH https://sentroy.com/api/storage/companies/{company-slug}/buckets/{bucket-slug} \
  -H "Authorization: Bearer stk_..." \
  -H "Content-Type: application/json" \
  -d '{"isPublic": true}'
```

### Delete a bucket

Pass `?force=true` to purge every file (S3 objects + Media records) before
removing the bucket; a non-empty bucket returns 409 otherwise.

```bash
curl -s -X DELETE "https://sentroy.com/api/storage/companies/{company-slug}/buckets/{bucket-slug}?force=true" \
  -H "Authorization: Bearer stk_..."
```

<details>
<summary>Example bucket response</summary>

```json
{
  "data": {
    "id": "65a3b2c1-...",
    "companyId": "64f1e2d3-...",
    "name": "Product Assets",
    "slug": "product-assets",
    "description": "Catalog images and downloads",
    "isPublic": false,
    "storageUsed": 12489533,
    "fileCount": 42,
    "createdAt": "2026-03-05T12:00:00.000Z",
    "updatedAt": "2026-04-22T08:15:00.000Z"
  }
}
```

</details>

---

## Media

Upload, list, download, and delete files inside a bucket.

### List files

```bash
curl -s "https://sentroy.com/api/storage/companies/{company-slug}/buckets/{bucket-slug}/media?type=image&limit=50" \
  -H "Authorization: Bearer stk_..."
```

### Get a file

```bash
curl -s https://sentroy.com/api/storage/companies/{company-slug}/buckets/{bucket-slug}/media/{media-id} \
  -H "Authorization: Bearer stk_..."
```

### Upload a file

Multipart/form-data. `file` is the binary body; extra text fields configure
folder, visibility, and metadata.

```bash
curl -s -X POST https://sentroy.com/api/storage/companies/{company-slug}/buckets/{bucket-slug}/media \
  -H "Authorization: Bearer stk_..." \
  -F "file=@./photo.jpg" \
  -F "folder=products" \
  -F "public=true" \
  -F "alt=Product cover" \
  -F "tags=v1,cover"
```

<details>
<summary>Example upload response</summary>

```json
{
  "data": {
    "id": "65b1a4d7-...",
    "bucketId": "65a3b2c1-...",
    "companyId": "64f1e2d3-...",
    "fileName": "products/1714132800-photo.jpg",
    "originalName": "photo.jpg",
    "type": "image",
    "size": 284930,
    "mimeType": "image/jpeg",
    "folder": "products",
    "uploadedBy": "u_abc123",
    "tags": ["v1", "cover"],
    "alt": "Product cover",
    "isPublic": true,
    "imageMeta": {
      "width": 2400,
      "height": 1600,
      "orientation": "landscape",
      "thumbnails": [
        { "width": 500, "height": 333, "fileName": "…/500-photo.jpg", "size": 45122 }
      ]
    },
    "createdAt": "2026-04-22T09:00:00.000Z",
    "updatedAt": "2026-04-22T09:00:00.000Z"
  }
}
```

</details>

### Download a file

Works for both public and private buckets — private ones are auth-gated
through the storage app. Pass `?quality=500` to request a pre-generated
thumbnail width (falls back to the original if the variant wasn't generated
for this file).

```bash
# Original
curl -o photo.jpg https://sentroy.com/api/storage/companies/{company-slug}/buckets/{bucket-slug}/media/{media-id}/download \
  -H "Authorization: Bearer stk_..."

# 500px wide thumbnail
curl -o photo-500.jpg "https://sentroy.com/api/storage/companies/{company-slug}/buckets/{bucket-slug}/media/{media-id}/download?quality=500" \
  -H "Authorization: Bearer stk_..."
```

### Delete a file

Cascades through the CDN: S3 objects (original + thumbnails) are removed,
then the Media record. If any S3 delete fails the record is kept so you
can retry.

```bash
curl -s -X DELETE https://sentroy.com/api/storage/companies/{company-slug}/buckets/{bucket-slug}/media/{media-id} \
  -H "Authorization: Bearer stk_..."
```

---

## Error Handling

All error responses follow the same format:

```json
{
  "data": null,
  "error": "Human-readable error message"
}
```

| Status | Meaning |
|--------|---------|
| `400` | Bad request (missing or invalid parameters) |
| `401` | Invalid or expired access token |
| `403` | Insufficient permissions or token/company mismatch |
| `404` | Resource not found |
| `409` | Conflict (e.g. deleting a non-empty bucket without `force`) |
| `413` | Payload too large (e.g. upload exceeds storage quota) |
| `500` | Internal server error |
| `502` | Backend gateway error (CDN or mail server unreachable) |

---

## Raw Documentation

For AI agents and LLMs — plain-text version of this document:

```
https://raw.githubusercontent.com/Sentroy-Co/client-sdk/refs/heads/main/curl/README.md
```

## License

[MIT](../LICENSE)
