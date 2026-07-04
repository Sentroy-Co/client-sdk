<p align="center">
  <img src="https://sentroy.com/business/sentroy-logo-light.png" alt="Sentroy" width="240" />
</p>

<h3 align="center">Sentroy Client SDK for PHP</h3>

<p align="center">
  Server-side SDK to interact with the Sentroy platform API.<br />
  Manage mail (domains, mailboxes, templates, inbox, send, audience, suppressions, webhooks, logs), storage (buckets, media) and WhatsApp (numbers, templates, audiences, send, logs) from a single entry point — plus a standalone Auth Project client.
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
// List all templates (optionally filtered by sending domain)
$templates = $sentroy->templates->getAll();
$templates = $sentroy->templates->getAll(['domainId' => 'domain-id']);

// Get a template by ID
$template = $sentroy->templates->get('template-id');

// Create — requires the templates.manage permission.
// The platform extracts {{placeholders}} from the body and returns
// them on the created template's "variables"; variables is NOT an input.
$template = $sentroy->templates->create([
    'name' => ['en' => 'Welcome Email', 'tr' => 'Hosgeldin E-postasi'],
    'subject' => ['en' => 'Welcome, {{name}}!', 'tr' => 'Hosgeldin, {{name}}!'],
    'mjmlBody' => ['en' => '<mjml>...</mjml>', 'tr' => '<mjml>...</mjml>'],
    'domainId' => 'domain-id',
]);

// Partial update
$template = $sentroy->templates->update('template-id', [
    'subject' => 'Updated subject',
]);

// Delete
$sentroy->templates->delete('template-id');
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
$messages = $sentroy->inbox->getAll([
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

### Audience

Contact lists and contacts for template sending.

```php
// Lists
$lists = $sentroy->audience->lists->getAll();
$list = $sentroy->audience->lists->get('list-id');
$list = $sentroy->audience->lists->create([
    'name' => 'Newsletter',
    'description' => 'Monthly product updates',
]);
$sentroy->audience->lists->delete('list-id'); // grouping only; contacts stay

// List membership
$members = $sentroy->audience->lists->members('list-id')->getAll();
$sentroy->audience->lists->members('list-id')->add('contact-id');
$sentroy->audience->lists->members('list-id')->remove('contact-id'); // contact preserved

// Contacts (paginated; filter by status or tags)
$result = $sentroy->audience->contacts->getAll([
    'page' => 1,
    'limit' => 50,
    'status' => 'active',            // active | unsubscribed | bounced
    'tags' => ['newsletter', 'vip'], // comma-joined by the SDK
]);
// $result = ['contacts' => [...], 'total' => ..., 'page' => ..., 'limit' => ...]

// Email-prefix autocomplete (server-capped at 10 results)
$matches = $sentroy->audience->contacts->search('john@');

$contact = $sentroy->audience->contacts->get('contact-id');

$contact = $sentroy->audience->contacts->create([
    'email' => 'user@example.com',
    'name' => 'John Doe',
    'tags' => ['newsletter'],
    'metadata' => ['plan' => 'pro'],
]);

$contact = $sentroy->audience->contacts->update('contact-id', [
    'status' => 'unsubscribed',
]);

// Soft-delete: marks the contact unsubscribed; the record is kept
// for mail-log integrity.
$sentroy->audience->contacts->delete('contact-id');
```

### Suppressions

Suppressed recipients are skipped at send time. Bounces and complaints
are added automatically by the mail server; use `add` for manual
opt-outs.

```php
$suppressions = $sentroy->suppressions->getAll([
    'page' => 1,
    'limit' => 50,
    'domainId' => 'domain-id',
    'reason' => 'manual',
]);

$suppression = $sentroy->suppressions->add([
    'email' => 'user@example.com',
    'reason' => 'manual',
    'domainId' => 'domain-id',
]);

// The address becomes eligible to receive mail again
$sentroy->suppressions->remove('suppression-id');
```

### Webhooks

```php
// List (optionally scoped to a domain)
$webhooks = $sentroy->webhooks->getAll();
$webhooks = $sentroy->webhooks->getAll('domain-id');

// Get — the secret is NOT returned on reads
$webhook = $sentroy->webhooks->get('webhook-id');

// Create — the response includes "secret" ONLY here; store it for
// HMAC signature verification.
$webhook = $sentroy->webhooks->create([
    'url' => 'https://example.com/hooks/sentroy',
    'events' => ['sent', 'bounced', 'opened'], // sent|bounced|failed|opened|clicked|unsubscribed
    'domainId' => 'domain-id',
]);

// Update URL, event list, or active flag
$webhook = $sentroy->webhooks->update('webhook-id', ['active' => false]);

// Delete (in-flight deliveries are not retried)
$sentroy->webhooks->delete('webhook-id');

// Fire a custom test payload at the current URL
$dispatch = $sentroy->webhooks->test('webhook-id', [
    'event' => 'sent',
    'payload' => ['messageId' => 'test-123'],
]);
// $dispatch = ['deliveryId' => ..., 'responseStatus' => ..., 'durationMs' => ..., 'status' => 'success'|'failed']

// Delivery log (test/replay dispatches only, not production deliveries)
$deliveries = $sentroy->webhooks->deliveries('webhook-id')->getAll([
    'status' => 'failed', // success | failed | pending
]);
$delivery = $sentroy->webhooks->deliveries('webhook-id')->get('delivery-id');

// Re-fire a recorded payload at the webhook's CURRENT URL
$dispatch = $sentroy->webhooks->deliveries('webhook-id')->replay('delivery-id');
```

### Mail Logs

```php
$logs = $sentroy->logs->getAll([
    'page' => 1,
    'limit' => 50,
    'status' => 'sent',         // queued|processing|sent|bounced|failed
    'domainId' => 'domain-id',
    'from' => '2026-07-01T00:00:00Z', // ISO, inclusive
    'to' => '2026-07-02T00:00:00Z',   // ISO, inclusive
]);

$log = $sentroy->logs->get('log-id');
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

Video uploads support two opt-in processing flags:

```php
$uploaded = $sentroy->media->upload('clips', [
    'body' => file_get_contents('./clip.mp4'),
    'filename' => 'clip.mp4',
    'content_type' => 'video/mp4',
    // Synchronous single-pass H.264 re-encode at source resolution
    'compress_video' => true,
    // Async 144p/480p/720p/1080p ladder (implies compress). The response
    // returns immediately with processing.status === "queued"; poll
    // media->get() while videoMeta.variants fill in.
    'transcode_video' => true,
]);
```

### Storage quota & usage

```php
// Plan quota — mail and storage share the same byte pool ("limit" 0 = unlimited)
$quota = $sentroy->storage->quota();
// ['used' => ..., 'limit' => ..., 'mailUsed' => ..., 'planName' => ...]

// Single round-trip dashboard payload
$usage = $sentroy->storage->usage();
// ['quota' => [...], 'buckets' => [...], 'byType' => [...]]
```

### WhatsApp

Send template-based WhatsApp messages, manage templates & audiences,
list connected numbers, and read send logs — with the same `stk_` token.

```php
// Connected numbers (only "connected" ones can send)
$numbers = $sentroy->whatsapp->numbers->getAll();

// Templates — {{variable}} placeholders are auto-extracted into "variables"
$templates = $sentroy->whatsapp->templates->getAll();
$template = $sentroy->whatsapp->templates->get('template-id');
$template = $sentroy->whatsapp->templates->create([
    'name' => 'Order shipped',
    'body' => 'Hi {{name}}, your order {{orderId}} has shipped!',
    'mediaUrl' => 'https://cdn.sentroy.com/f/abc123', // optional
    'category' => 'transactional',                    // optional
]);
$template = $sentroy->whatsapp->templates->update('template-id', [
    'body' => 'Hello {{name}}!',
    'mediaUrl' => null, // null clears the value
]);
$sentroy->whatsapp->templates->delete('template-id');

// Audiences — plain phone strings or per-recipient variable maps
$audiences = $sentroy->whatsapp->audiences->getAll();
$audience = $sentroy->whatsapp->audiences->create([
    'name' => 'VIP customers',
    'entries' => [
        '+905551112233',
        ['phone' => '+905554445566', 'variables' => ['name' => 'Ahmet']],
    ],
]);
$audience = $sentroy->whatsapp->audiences->update('audience-id', [
    'entries' => ['+905551112233'],
]);
$sentroy->whatsapp->audiences->delete('audience-id');

// Send — single recipient ("to") OR a saved audience ("audienceId"),
// rendering a template ("templateId") OR a raw "body".
$result = $sentroy->whatsapp->send([
    'from' => 'session-or-phone', // omit to use the only connected number
    'to' => '+905551112233',
    'templateId' => 'template-id',
    'variables' => ['name' => 'John'], // merged under per-recipient variables
]);
// $result = ['total' => ..., 'sent' => ..., 'failed' => ..., 'results' => [...]]

// Bulk send to an audience with a raw body
$result = $sentroy->whatsapp->send([
    'audienceId' => 'audience-id',
    'body' => 'Hi {{name}}, we have news!',
]);

// Send logs
$logs = $sentroy->whatsapp->logs->getAll([
    'status' => 'failed', // queued | sent | failed
    'limit' => 50,
]);
```

### Thumbnails

Pure URL helpers for picking the right pre-generated image thumbnail for a
display target (no HTTP calls):

```php
use Sentroy\ClientSdk\Thumbnails;

$media = $sentroy->media->get('my-bucket', $mediaId);

// Pixel target (use 2x for retina displays)
$avatarUrl = Thumbnails::pickThumbnailUrl($media, 56 * 2);

// Semantic presets: avatar (128) | card (500) | preview (960) | hero (1600)
$cardUrl = Thumbnails::pickPresetThumbnailUrl($media, 'card');
```

Falls back to `url` / `downloadUrl` for non-image media or when no
thumbnails exist.

## Auth Projects (Auth-as-a-Service)

`AuthClient` is a **separate entry point** for Sentroy Auth Projects —
it talks to `https://auth.sentroy.com` under
`/api/v1/auth/{project-slug}/...` and authenticates with a project API
key (`aps_...`) and/or per-call end-user access tokens.

> The `aps_` key is the project's master key. Keep it server-side only —
> never ship it to a browser.

```php
use Sentroy\ClientSdk\AuthClient;
use Sentroy\ClientSdk\SentroyAuthException;

$auth = new AuthClient([
    'project_slug' => 'my-project',
    'api_key' => 'aps_...',                        // optional, server-only
    'auth_base_url' => 'https://auth.sentroy.com', // optional (default)
]);

// Sign up / sign in
$res = $auth->signUp([
    'email' => 'user@example.com',
    'password' => 'S3cure!pass',
    'displayName' => 'John',
]);

$res = $auth->signIn([
    'email' => 'user@example.com',
    'password' => 'S3cure!pass',
]);
if (!empty($res['mfaRequired'])) {
    // TOTP-enrolled user — complete with the 6-digit code
    $res = $auth->verifyMfa([
        'mfaToken' => $res['mfaToken'],
        'code' => '123456',
    ]);
}
$accessToken = $res['accessToken'];
$refreshToken = $res['refreshToken'];

// Token lifecycle
$tokens = $auth->refresh($refreshToken);
$auth->signOut($refreshToken); // best-effort revoke

// Password reset & email verification (token-only flows)
$auth->sendPasswordReset('user@example.com');
$user = $auth->confirmPasswordReset('reset-token', 'NewS3cure!pass');
$user = $auth->verifyEmail('verify-token');

// Magic link
$auth->sendMagicLink('user@example.com', 'https://app.example.com/after-login');
$res = $auth->consumeMagicLink('magic-token');

// Invitations
$res = $auth->acceptInvitation([
    'token' => 'invite-token',
    'password' => 'S3cure!pass',
]);

// Social login — URL builder only; redirect the user's browser to it.
// Tokens come back in the redirect URL fragment.
$url = $auth->socialAuthorizeUrl('google', [
    'redirectUri' => 'https://app.example.com/callback',
]);

// Current user (returns null on an invalid/expired token)
$user = $auth->getCurrentUser($accessToken);

// Sessions & activity
$sessions = $auth->listSessions($accessToken);
$auth->revokeSession($accessToken, 'session-id');
$activity = $auth->getActivity($accessToken);

// Account management (bearer required)
$auth->changePassword($accessToken, 'current', 'NewS3cure!pass'); // revokes ALL sessions
$auth->requestEmailChange($accessToken, 'new@example.com', 'current');
$user = $auth->confirmEmailChange('change-token'); // token-only; sessions revoked
$auth->requestAccountDeletion($accessToken, 'current');
$auth->confirmAccountDeletion('delete-token');     // token-only

// MFA (TOTP)
$status = $auth->mfaGetStatus($accessToken);
$enroll = $auth->mfaEnrollTotp($accessToken);      // ['secret' => ..., 'otpauthUri' => ...]
$done = $auth->mfaVerifyTotpEnrollment($accessToken, '123456');
// $done['recoveryCodes'] is shown ONCE — store it
$auth->mfaDisableTotp($accessToken, 'current-password');

// Passkey management (the WebAuthn register/authenticate ceremonies
// are browser-only and not part of the PHP SDK)
$passkeys = $auth->passkeyList($accessToken);
$auth->passkeyDelete($accessToken, 'passkey-id');
```

Auth errors throw `SentroyAuthException` (separate from `SentroyException`):

```php
try {
    $auth->signIn(['email' => '...', 'password' => 'wrong']);
} catch (SentroyAuthException $e) {
    echo $e->getErrorCode();  // e.g. "invalid_credentials"
    echo $e->getStatusCode(); // e.g. 401
    echo $e->getMessage();    // human-readable error_description
}
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
