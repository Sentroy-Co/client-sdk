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

**Base URL:**

```
https://sentroy.com/api/companies/{company-slug}
```

Replace `{company-slug}` with your company slug throughout the examples below.

---

## Domains

### List domains

```bash
curl -s https://sentroy.com/api/companies/{company-slug}/domains \
  -H "Authorization: Bearer stk_..."
```

### Get a domain

```bash
curl -s https://sentroy.com/api/companies/{company-slug}/domains/{domain-id} \
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
curl -s https://sentroy.com/api/companies/{company-slug}/mailboxes \
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
curl -s https://sentroy.com/api/companies/{company-slug}/templates \
  -H "Authorization: Bearer stk_..."
```

### Get a template

```bash
curl -s https://sentroy.com/api/companies/{company-slug}/templates/{template-id} \
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
curl -s -X POST https://sentroy.com/api/companies/{company-slug}/send \
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
curl -s -X POST https://sentroy.com/api/companies/{company-slug}/send \
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
curl -s -X POST https://sentroy.com/api/companies/{company-slug}/send \
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
curl -s -X POST https://sentroy.com/api/companies/{company-slug}/send \
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
curl -s "https://sentroy.com/api/companies/{company-slug}/inbox?mailbox=info@example.com&folder=INBOX&page=1&limit=20" \
  -H "Authorization: Bearer stk_..."
```

### Get a message

```bash
curl -s "https://sentroy.com/api/companies/{company-slug}/inbox/1234?mailbox=info@example.com" \
  -H "Authorization: Bearer stk_..."
```

### List IMAP folders

```bash
curl -s "https://sentroy.com/api/companies/{company-slug}/inbox/mailboxes?mailbox=info@example.com" \
  -H "Authorization: Bearer stk_..."
```

### Get thread by subject

```bash
curl -s "https://sentroy.com/api/companies/{company-slug}/inbox/thread?subject=Re%3A+Project+update&mailbox=info@example.com" \
  -H "Authorization: Bearer stk_..."
```

### Mark as read

```bash
curl -s -X POST https://sentroy.com/api/companies/{company-slug}/inbox/1234/read \
  -H "Authorization: Bearer stk_..." \
  -H "Content-Type: application/json" \
  -d '{"mailbox": "info@example.com", "folder": "INBOX"}'
```

### Mark as unread

```bash
curl -s -X DELETE "https://sentroy.com/api/companies/{company-slug}/inbox/1234/read?mailbox=info@example.com&folder=INBOX" \
  -H "Authorization: Bearer stk_..."
```

### Move message

```bash
curl -s -X POST https://sentroy.com/api/companies/{company-slug}/inbox/1234/move \
  -H "Authorization: Bearer stk_..." \
  -H "Content-Type: application/json" \
  -d '{"to": "Trash", "from": "INBOX", "mailbox": "info@example.com"}'
```

### Delete message

```bash
curl -s -X DELETE "https://sentroy.com/api/companies/{company-slug}/inbox/1234?mailbox=info@example.com" \
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
| `500` | Internal server error |

---

## License

[MIT](../LICENSE)
