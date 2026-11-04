# Rust API coverage

The comparison source is TypeScript commit `326f131dec57c8e8a4dd6b2f8eb18020a772e861`. The [manifest](api-parity.json) maps each of the 70 root resource methods to a native Rust method. Method names use Rust's snake_case; `Inbox::move_message` corresponds to `move`.

| Resource | Count | Rust operations |
| --- | ---: | --- |
| Domains | 2 | list, get |
| Mailboxes | 1 | list |
| Templates | 5 | list, get, create, update, delete |
| Inbox | 9 | save_draft, list, get, list_folders, get_thread, mark_as_read, mark_as_unread, move_message, delete |
| Send | 1 | email |
| Audience | 13 | contacts: list, search, get, create, update, delete; lists: list, get, create, delete; members: list, add, remove |
| Suppressions | 3 | list, add, remove |
| Webhooks | 9 | list, get, create, update, delete, test; deliveries: list, get, replay |
| Logs | 2 | list, get |
| Buckets | 5 | list, get, create, update, delete |
| Media | 5 | list, get, upload, delete, download |
| Storage | 2 | quota, usage |
| WhatsApp | 13 | numbers: list; templates and audiences: list, get, create, update, delete; logs: list; send |
| **Total** | **70** | |

Synchronous scoped factories such as `audience.lists.members(id)` and `webhooks.deliveries(id)` are additional helpers. The manifest and `python3 ../scripts/check_rust_parity.py` check public method presence against the current TypeScript resource source; they do not establish behavioral equivalence. Contract tests are separate. The guard does not cover the independent modules below.

| Surface | Native scope and differences |
| --- | --- |
| Auth | Identity sign-up, sign-in, MFA, sessions, password/email/account operations, activity, social URL, passkey begin/complete, and admin operations; some calls expose JSON values and selected typed alternatives. Sessions are in memory; native applications own persistence and refresh scheduling. Browser redirect consumption and WebAuthn execution are application responsibilities. Admin user listing is unimplemented in both source SDKs. |
| Vault | Instance-scoped configuration, cached reads, explicit environment fallback, public filtering, invalidation, refresh and signed webhook verification. Clones share cache state; independent clients do not. |
| MCP | Official `rmcp` connection, resource/metadata helpers, static or dynamic credential provider, and private download/upload helpers. Official protocol buffering and errors are separate from bounded private-file transfers. No automatic consent, token acquisition, redirect following or retry. |
| Browser and CLI | TypeScript React and React Native components, hooks, browser storage, UI and CLI do not have direct Rust equivalents. |

Identity, company REST, Vault and MCP credentials are distinct. Sensitive session and file data should remain in application-controlled storage. For recovery and file limits see [README.md](README.md).
