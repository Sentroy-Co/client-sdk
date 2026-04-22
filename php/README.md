<p align="center">
  <img src="https://sentroy.com/business/sentroy-logo-light.png" alt="Sentroy" width="240" />
</p>

<h3 align="center">Sentroy Client SDK for PHP</h3>

<p align="center">
  Server-side SDK to interact with the Sentroy platform API.<br />
  Manage mail (domains, mailboxes, templates, inbox, send) and storage (buckets, media) from a single entry point.
</p>

<p align="center">
  <a href="https://packagist.org/packages/sentroy-co/client-sdk"><img src="https://img.shields.io/packagist/v/sentroy-co/client-sdk.svg" alt="Packagist version" /></a>
  <a href="https://github.com/Sentroy-Co/client-sdk/blob/main/LICENSE"><img src="https://img.shields.io/packagist/l/sentroy-co/client-sdk.svg" alt="license" /></a>
</p>

---

## Installation

```bash
composer require sentroy-co/client-sdk
```

## Quick Start

```php
use Sentroy\ClientSdk\Sentroy;

$sentroy = new Sentroy([
    'base_url' => 'https://sentroy.com',
    'company_slug' => 'my-company',
    'access_token' => 'stk_...',
]);
```

> Access tokens can be created from **Admin > Access Tokens** in the Sentroy dashboard.

## Usage

### Domains

```php
// List all domains
$domains = $sentroy->domains->getAll();

// Get a single domain
$domain = $sentroy->domains->get('domain-id');
```

### Mailboxes

```php
// List all mailbox accounts
$mailboxes = $sentroy->mailboxes->getAll();
```

### Templates

```php
// List all templates
$templates = $sentroy->templates->getAll();

// Get a template by ID
$template = $sentroy->templates->get('template-id');
```

Templates support multiple languages. A field like `name` or `subject` can be a plain string or an associative array keyed by language code:

```php
// Example template response
[
    'id' => 'b3f1a2c4-...',
    'name' => ['en' => 'Welcome Email', 'tr' => 'Hosgeldin E-postasi'],
    'subject' => ['en' => 'Welcome, {{name}}!', 'tr' => 'Hosgeldin, {{name}}!'],
    'mjmlBody' => ['en' => '<mjml>...</mjml>', 'tr' => '<mjml>...</mjml>'],
    'variables' => ['name', 'company'],
    'domainId' => 'a1b2c3d4-...',
    'domainName' => 'example.com',
]
```

Use the `variables` array to know which placeholders (`{{name}}`, `{{company}}`) the template expects.

### Inbox

```php
// List messages
$messages = $sentroy->inbox->list([
    'mailbox' => 'info@example.com',
    'folder' => 'INBOX',
    'page' => 1,
    'limit' => 20,
]);

// Get a single message
$message = $sentroy->inbox->get(1234, [
    'mailbox' => 'info@example.com',
]);

// List IMAP folders
$folders = $sentroy->inbox->listFolders('info@example.com');

// Get a thread by subject
$thread = $sentroy->inbox->getThread('Re: Project update', 'info@example.com');

// Mark as read / unread
$sentroy->inbox->markAsRead(1234, ['mailbox' => 'info@example.com']);
$sentroy->inbox->markAsUnread(1234, ['mailbox' => 'info@example.com']);

// Move message
$sentroy->inbox->move(1234, 'Trash', [
    'from' => 'INBOX',
    'mailbox' => 'info@example.com',
]);

// Delete message
$sentroy->inbox->delete(1234, ['mailbox' => 'info@example.com']);
```

### Send Email

```php
// Send with a template
$result = $sentroy->send->email([
    'to' => 'user@example.com',
    'from' => 'info@example.com',
    'subject' => 'Welcome!',
    'domainId' => 'domain-id',
    'templateId' => 'template-id',
    'variables' => [
        'name' => 'John',
        'company' => 'Acme',
    ],
]);

// Send with a specific language
$result = $sentroy->send->email([
    'to' => 'user@example.com',
    'from' => 'info@example.com',
    'subject' => 'Hosgeldin!',
    'domainId' => 'domain-id',
    'templateId' => 'template-id',
    'lang' => 'tr',
    'variables' => ['name' => 'Ahmet'],
]);

// Send with raw HTML
$result = $sentroy->send->email([
    'to' => ['user1@example.com', 'user2@example.com'],
    'from' => 'info@example.com',
    'subject' => 'Hello',
    'domainId' => 'domain-id',
    'html' => '<h1>Hello World</h1>',
]);

// Send with attachments
$result = $sentroy->send->email([
    'to' => 'user@example.com',
    'from' => 'info@example.com',
    'subject' => 'Invoice',
    'domainId' => 'domain-id',
    'html' => '<p>Please find your invoice attached.</p>',
    'attachments' => [
        [
            'filename' => 'invoice.pdf',
            'content' => $base64String,
            'contentType' => 'application/pdf',
        ],
    ],
]);
```

### Buckets

Storage is organized into **buckets** — isolated containers with their
own visibility (public vs private) and usage counters.

```php
// List all buckets
$buckets = $sentroy->buckets->getAll();

// Get a single bucket by its slug
$bucket = $sentroy->buckets->get('product-assets');

// Create (slug auto-derived from name if omitted)
$bucket = $sentroy->buckets->create([
    'name' => 'User Uploads',
    'description' => 'Avatars and profile media',
    'is_public' => false,
]);

// Update — toggling is_public cascades to every file's ACL
$bucket = $sentroy->buckets->update('product-assets', [
    'is_public' => true,
]);

// Delete (pass true to purge files first; non-empty buckets 409 otherwise)
$sentroy->buckets->delete('product-assets', true);
```

### Media

Upload, list, download, and delete files. The same access token that
authorizes mail calls also authorizes storage.

```php
// List files in a bucket
$result = $sentroy->media->getAll('product-assets', [
    'type' => 'image',
    'limit' => 50,
]);

// Get a single media record
$media = $sentroy->media->get('product-assets', 'media-id');

// Upload from raw bytes
$uploaded = $sentroy->media->upload('product-assets', [
    'body' => file_get_contents('./photo.jpg'),
    'filename' => 'photo.jpg',
    'content_type' => 'image/jpeg',
    'folder' => 'products',
    'tags' => ['v1', 'cover'],
    'is_public' => true,
]);

// Download — returns ['body' => string, 'content_type' => string]
$res = $sentroy->media->download('product-assets', 'media-id');
file_put_contents('./downloaded.jpg', $res['body']);

// Thumbnail variant (500px wide — falls back to original if unavailable)
$thumb = $sentroy->media->download('product-assets', 'media-id', 500);

// Delete
$sentroy->media->delete('product-assets', 'media-id');
```

## Error Handling

```php
use Sentroy\ClientSdk\Sentroy;
use Sentroy\ClientSdk\SentroyException;

try {
    $sentroy->send->email([...]);
} catch (SentroyException $e) {
    echo $e->getStatusCode();    // 401, 403, 500, etc.
    echo $e->getMessage();       // Human-readable error
    $body = $e->getResponseBody(); // Full response body
}
```

## Configuration

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `base_url` | `string` | Yes | Sentroy instance URL (e.g. `https://sentroy.com`) |
| `company_slug` | `string` | Yes | Your company slug |
| `access_token` | `string` | Yes | Access token (`stk_...`) |
| `timeout` | `int` | No | Request timeout in seconds (default: `30`) |

## Requirements

- PHP 7.0+
- `ext-curl`
- `ext-json`

## Raw Documentation

For AI agents and LLMs — plain-text version of this document:

```
https://raw.githubusercontent.com/Sentroy-Co/client-sdk/refs/heads/main/php/README.md
```

## License

[MIT](../LICENSE)
