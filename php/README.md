<p align="center">
  <img src="https://sentroy.com/business/sentroy-logo-light.png" alt="Sentroy" width="240" />
</p>

<h3 align="center">Sentroy Client SDK for PHP</h3>

<p align="center">
  Server-side SDK to interact with the Sentroy platform API.<br />
  List domains, manage mailboxes, fetch templates, read inbox, and send emails.
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
$domains = $sentroy->domains->list();

// Get a single domain
$domain = $sentroy->domains->get('domain-id');
```

### Mailboxes

```php
// List all mailbox accounts
$mailboxes = $sentroy->mailboxes->list();
```

### Templates

```php
// List all templates
$templates = $sentroy->templates->list();

// Get a template by ID
$template = $sentroy->templates->get('template-id');
```

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

- PHP 8.1+
- `ext-curl`
- `ext-json`

## License

[MIT](../LICENSE)
