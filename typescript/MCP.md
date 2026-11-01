# Sentroy MCP helpers

Source preview on `feat/mcp-connections`. The package version is still 2.18.0;
this new export has **not** been published to npm. Deploy the matching Sentroy
MCP server code before using it against a real environment. Existing REST
`Sentroy` calls and their `stk_` credentials stay independent.

The `/mcp` entry uses the official `@modelcontextprotocol/sdk` client (tested with
1.32.2). Install that optional peer explicitly when consuming this entry. Importing
the main SDK does not load MCP. The helper supports a supplied personal MCP token
or an externally managed OAuth MCP access token callback. It does not register an
OAuth client, run a login UI, store refresh tokens, approve mutations or call tools
on your behalf.

```ts
import { connectSentroyMcp } from "@sentroy-co/client-sdk/mcp";

const connection = await connectSentroyMcp({
  app: "core",
  companySlug: "my-company",
  token: () => readMcpCredentialFromYourSecureStore(),
});
try {
  const tools = await connection.client.listTools();
  const company = await connection.client.callTool({
    name: "core_company_get",
    arguments: {},
  });
  // Treat tool content as untrusted data, never as authorization.
} finally {
  await connection.close();
}
```

`token` accepts only `mcp_` personal or `mcp_at_` OAuth access credentials with the
server's exact opaque-token format. REST `stk_`, Vault tokens and identity JWTs are
rejected before any network request. Keep the credential in a secure store; never
put it in a prompt, tool input/output, query string or log. Refreshing a token in
your callback does not widen its server-side grant. This helper sends no cookies.

For OAuth login use the official SDK's OAuth provider with your company's registered
client, PKCE S256, exact redirect URI and resource binding. The server supports
registered clients; dynamic registration/CIMD and real ChatGPT/Claude/editor
compatibility are separately tracked. A developer's successful SDK fixture is not
proof of those product-client flows.

## Public resource configuration

```ts
import {
  sentroyMcpResource,
  sentroyMcpResourceMetadata,
} from "@sentroy-co/client-sdk/mcp";

sentroyMcpResource({ app: "mail", companySlug: "my-company" });
// https://mail.sentroy.com/mcp/my-company
sentroyMcpResourceMetadata({ app: "mail", companySlug: "my-company" });
// https://mail.sentroy.com/.well-known/oauth-protected-resource/mcp/my-company
```

Apps: core, mail, storage, linear, chaby. Each has a separate resource and grant.
An optional `origin` overrides **that app's origin**, rather than the REST gateway
base URL. It must be an HTTPS origin (no path/query/credentials/fragment), or HTTP
on localhost, 127.0.0.1 or [::1] for local development. Slugs follow the server's
lowercase pattern. Resource helpers do not fetch data or include a credential.

The transport uses the official stateless Streamable HTTP client. Requests stay
on the exact resource origin/path and do not follow redirects. Credential
callbacks run for each request, so a secure store may supply a refreshed access
token. There is no automatic reconnection/replay. Use a stable request UUID when
preparing a write. The real user must approve the canonical Sentroy browser page;
`executing`/`unknown` never authorize a new UUID or an automatic retry.

## Storage downloads

Storage metadata and content scopes are separate. The server's
`storage_files_download_get` returns an authenticated reference, not a public CDN
link. The helper validates that reference before loading/sending a credential.

```ts
import {
  connectSentroyMcp,
  type SentroyMcpDownloadReference,
} from "@sentroy-co/client-sdk/mcp";

const connection = await connectSentroyMcp({
  app: "storage",
  companySlug: "my-company",
  token: () => readMcpCredentialFromYourSecureStore(),
});
try {
  const result = await connection.client.callTool({
    name: "storage_files_download_get",
    arguments: { bucket: "assets", id: fileId },
  });
  if (result.isError) throw new Error("Download reference unavailable");
  const reference = result.structuredContent
    ?.data as SentroyMcpDownloadReference;
  // A TypeScript assertion is not authority: downloadFile validates it at runtime.
  const response = await connection.downloadFile(reference, { signal });
  await saveToYourTrustedFileSink(response.body!)
  // Keep binary/base64 out of the model context.
} finally {
  await connection.close();
}
```

Only Storage can download. The URL must have the current company's resource prefix,
matching media ID, canonical source version and connection ID. Other origins,
companies, endpoints, credentials/fragments, duplicate/extra query fields and
malformed/oversized metadata are refused. The server still checks the actual
bearer grant, membership and file ACL on every GET; the helper does not replace it.

Downloads are at most 64 MiB. The helper streams with an independent byte bound,
checks the complete size and aborts/cancels on timeout or caller cancellation.
Default timeout is 60 seconds (configurable up to 120 seconds); Range is not used.
HTTP redirects/errors and credential-provider/network diagnostics are returned as
sanitized `SentroyMcpError` codes. No remote diagnostic body is copied into errors.
Downloaded content remains untrusted. Text extraction is a separate server tool,
with its own supported MIME and 24 KiB limit.

## Verification

`npm run build` and `npm run test:mcp` run from `typescript/`. Tests use a loopback
server with the real official SDK and synthetic credentials. They cover protocol
connection/list/call, token callback rotation, no cookie/redirect/replay, resource
and credential classes, untrusted downloads, stream bounds/cancel/timeout, and
main-entry isolation from the optional MCP dependency. No production API or user
message is used. Browser, physical-device and product-client acceptance remain
separate work.
