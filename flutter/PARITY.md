# API coverage

The comparison source is TypeScript SDK 2.18.3, commit `326f131dec57c8e8a4dd6b2f8eb18020a772e861`. [api-parity.json](api-parity.json) maps the root asynchronous resource inventory to Dart classes and methods.

| Surface | Methods | Dart scope |
| --- | ---: | --- |
| Mail | 45 | Domains, Mailboxes, Templates, Inbox, Send, audience contacts/lists/members, suppressions, webhooks/deliveries, logs |
| Storage | 12 | Buckets, media upload/download and metadata, quota/usage |
| WhatsApp | 13 | Numbers, templates, audiences, send and logs |
| **Total** | **70** | Checked by the API presence guard |

Additional native surfaces include Identity and admin, signed JWT verification, memory/custom/serialized session storage, a Flutter controller/scope, thumbnail helpers, Env Vault, MCP connections and all five private file helpers. Dart methods retain the reference camelCase names; factory access such as `members(id)` and `deliveries(id)` is also available.

The presence guard detects unmapped current TypeScript methods and missing Dart methods. It does not prove wire or security equivalence. Tests separately cover serialization, routes, error receipts, session races, signatures, caching, file bounds and widgets.

Native boundaries are described in [README.md](README.md): the app supplies navigation, secure storage and WebAuthn integration. MCP uses the existing 2025 POST JSON/SSE service flow; optional standalone GET notification streams, resumption and 2026 discovery are outside this adapter. Contact import error row/reason diagnostics are intentionally not returned. React UI and the TypeScript CLI have no direct Dart replacement.
