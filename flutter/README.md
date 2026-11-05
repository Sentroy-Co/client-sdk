# Sentroy Flutter SDK

A native Flutter client for Sentroy Mail, Storage, WhatsApp, Identity, Env Vault and MCP. Requires Flutter 3.32 / Dart 3.8 or newer. Version 0.1.0 is prepared in this repository; a pub.dev release has not been published.

## Install

Pin a reviewed commit when installing from Git:

```yaml
dependencies:
  sentroy_client_sdk:
    git:
      url: https://github.com/Sentroy-Co/client-sdk.git
      ref: <reviewed-commit>
      path: flutter
```

For a checkout, use `sentroy_client_sdk: {path: ../client-sdk/flutter}`. Import `package:sentroy_client_sdk/sentroy_client_sdk.dart` for service APIs or `sentroy_flutter.dart` for Flutter state integration as well.

## Company APIs

```dart
final sdk = Sentroy(
  companySlug: 'my-company',
  accessToken: token, // Obtain at runtime from your authorized application flow.
);
try {
  final domains = await sdk.domains.list();
  final buckets = await sdk.buckets.list();
  final messages = await sdk.inbox.list(
    const InboxListParams(unreadOnly: true, page: 1, limit: 25),
  );
} finally {
  sdk.close();
}
```

The root client exposes `domains`, `mailboxes`, `templates`, `inbox`, `send`, `audience`, `suppressions`, `webhooks`, `logs`, `buckets`, `media`, `storage`, and `whatsapp`. [PARITY.md](PARITY.md) lists the 70 mapped TypeScript resource methods. Requests and responses have Dart models; localized values accept a string or `Map<String,String>`, and address unions accept a string or `List<String>`. `PatchValue<String>(null)` explicitly clears a nullable update field, while an omitted wrapper leaves the field unchanged.

The company gateway routes are `/api/{mail,storage,whatsapp}/companies/{slug}`. Set `baseUrl`, `timeout`, or inject an `http.Client` for a custom deployment or platform integration. The default deadline is 30 seconds and covers the whole response. Injected clients remain caller-owned. Closing the SDK blocks new resource calls. Browser cookie authentication requires an appropriately configured injected client; the SDK does not automatically acquire a Sentroy browser session.

No service request automatically follows redirects or retries. Normal JSON responses have a 16 MiB cap. Media downloads return bytes and accept an optional `maxBytes` limit; multipart upload preserves filename, MIME type and processing flags.

### BCC and error recovery

BCC sends and drafts use dedicated versioned compose endpoints and a bounded 4 KiB receipt. A `ComposeRequestError` carries `requestId`, `statusCode`, `body`, and `cause`. Save the UUID on uncertain outcomes and reconcile the existing request before retrying with that same UUID. A new UUID represents a new send.

`SentroyException` preserves available status and response body details. Its string representation omits the body. Treat bodies, auth descriptions and raw protocol errors as potentially sensitive when handling diagnostics.

## Identity and Flutter state

```dart
final auth = SentroyAuth(projectSlug: 'my-project');
final controller = SentroyAuthController(auth);
await controller.initialize();

// Place in your widget tree:
SentroyAuthScope(controller: controller, child: const MyApp());

// Inside a descendant build method:
final state = SentroyAuthScope.of(context);
final user = state.user;
```

The scope rebuilds consumers when session, loading or error state changes. The controller exposes signup, signin, MFA verification, refresh, signout and restore. MFA login returns a challenge instead of a signed-in session; call `verifyMfa` with the user-entered code. Dispose the controller and then close the auth client when its owner is disposed.

The auth client also exposes password reset, email verification and changes, account deletion, sessions, activity, magic links, invitations, social authorization URLs and passkey begin/complete operations. The application handles deep links, validates callback context, clears callback fragments from navigation history, and invokes a platform WebAuthn authenticator. `consumeRedirectFragment` accepts the supplied fragment and verifies the user via `/me`; it does not implement a browser or invent PKCE endpoints.

Refresh is explicit and coalesced. The old rotating token is removed from durable storage before dispatch; an uncertain response requires signing in again. Delayed operations cannot replace a newer or cleared session. Choose your app's refresh scheduling and handle the controller's busy state during rotation.

### Persist a session securely

Storage defaults to memory. Supply an `AuthSessionStorage`, or bridge your chosen secure-storage plugin through callbacks bound to an origin/project-specific key:

```dart
final sessions = SerializedAuthSessionStorage(
  read: () => secureStorage.read(key: sessionKey),
  write: (value) => secureStorage.write(key: sessionKey, value: value),
  clear: () => secureStorage.delete(key: sessionKey),
);
final auth = SentroyAuth(projectSlug: projectSlug, storage: sessions);
```

Here `secureStorage` belongs to your app, for example a configured `flutter_secure_storage` instance. The SDK adds no implicit persistent store. Company `stk_` tokens, Identity project keys, Vault `stk_env_` keys and MCP credentials have separate purposes. Keep project admin and private Vault keys on trusted servers. `SentroyAuthAdmin` verifies RS256 JWT signatures, issuer, audience, expiration and unique JWKS key identity; its configured-origin cache can be invalidated. The public server API has no admin user-list endpoint, matching the reference SDK.

## Vault

`VaultClient(VaultConfig(...))` supports cached reads, explicit resolver fallback, public filtering, invalidation and refresh. The default TTL is five minutes and timeout five seconds. `VaultConfig.fromMap` reads a caller-supplied environment map, so there is no unconditional `dart:io` dependency. Clones share cache, transport and lifetime. Verify webhook HMAC over raw bytes with `verifyVaultWebhook`; the default replay window is five minutes and rejects future timestamps. `handleWebhook` invalidates lazily; call `refresh()` for immediate fetching.

## MCP

```dart
final connection = await connectSentroyMcp(
  app: 'mail', companySlug: 'my-company', token: mcpToken,
);
try {
  final tools = await connection.client.listTools();
} finally {
  await connection.close();
}
```

An async `McpTokenProvider` may be supplied instead of a static `mcp_`/`mcp_at_` token. It is resolved before requests; the SDK does not acquire consent or tokens. Core, Mail, Storage, Linear and Chaby resource/metadata URLs are supported. Tool writes remain subject to server permissions and approval requirements.

The community-maintained `mcp_dart` client/codec is connected through a bounded HTTP adapter. It uses MCP 2025-03-26 initialization and POST JSON/SSE exchanges, with no 2026 discovery, standalone GET notification stream, resumption, session reinitialization or automatic replay. Protocol JSON and SSE events have a 1 MiB bound; closing cancels active transport/private requests. Public MCP request/result types are re-exported for calling the client.

All five private helpers are provided: `downloadFile`, `downloadMailAttachment`, `downloadMailContactsExport`, `uploadMailContactsImport`, and `uploadStorageFile`. References are bound to the immutable resource origin, expected path/query and grant metadata. Hashes, sizes, filenames, MIME types, expiry, revisions and receipts are checked. Limits are 64 MiB for storage downloads, 8 MiB for decoded mail attachments, 1 MiB for contact files and 10 MiB for storage uploads. Default deadlines are 60 seconds for downloads and 15 seconds for uploads, configurable from 1 millisecond to 120 seconds. A lost acknowledgment, server error or invalid upload receipt yields `mcp_upload_outcome_unknown`; inspect the existing operation before another upload. Contact import 4xx errors retain a sanitized status without the optional server row/reason diagnostics.

## Example and checks

Run `cd example && flutter run -d chrome`. It demonstrates the auth scope and a company Mail API request using a token entered at runtime. The package has no unconditional platform imports and the example is built for Web in CI. Android and iOS device testing remains application-specific.

From this directory:

```sh
flutter pub get
(cd example && flutter pub get)
flutter analyze
flutter test
dart format --output=none --set-exit-if-changed lib test example/lib
python3 ../scripts/check_flutter_parity.py
flutter pub publish --dry-run
(cd example && flutter build web --release)
```

The inventory check validates method presence. Contract, lifecycle, cryptographic and widget tests provide separate behavioral coverage. React components and the Node CLI remain TypeScript integrations.
