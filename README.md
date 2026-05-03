<p align="center">
  <img src="https://sentroy.com/business/sentroy-logo-light.png" alt="Sentroy" width="240" />
</p>

<h3 align="center">Sentroy Client SDKs</h3>

<p align="center">
  Official client SDKs for the <a href="https://sentroy.com">Sentroy</a> platform API.<br />
  <a href="https://sentroy.com/docs">API Documentation</a> &middot; <a href="https://sentroy.com">sentroy.com</a>
</p>

---

## Available SDKs

| Language | Package | Install |
|----------|---------|---------|
| TypeScript / Node.js | [`@sentroy-co/client-sdk`](https://www.npmjs.com/package/@sentroy-co/client-sdk) | `npm install @sentroy-co/client-sdk` |
| Go | [`github.com/Sentroy-Co/client-sdk/go`](https://pkg.go.dev/github.com/Sentroy-Co/client-sdk/go) | `go get github.com/Sentroy-Co/client-sdk/go` |
| Python | [`sentroy-client-sdk`](https://pypi.org/project/sentroy-client-sdk/) | `pip install sentroy-client-sdk` |
| PHP | [`sentroy-co/client-sdk`](https://packagist.org/packages/sentroy-co/client-sdk) | `composer require sentroy-co/client-sdk` |
| cURL | — | [Examples](curl/) |

## Features

All SDKs provide the same API surface:

**Mail**

- **Domains** — List and retrieve verified domains
- **Mailboxes** — List mailbox accounts
- **Templates** — List and retrieve email templates
- **Inbox** — Read messages, list folders, manage threads, move/delete
- **Send** — Send emails with templates or raw HTML

**Storage**

- **Buckets** — Create, list, update, and delete isolated file containers
- **Media** — Upload, list, download, and delete files inside a bucket

The SDK takes a single `baseUrl` (the platform root, e.g.
`https://sentroy.com`); the gateway transparently routes mail calls to
the mail subdomain and storage calls to the storage subdomain.

## Authentication

All SDKs authenticate via **Access Tokens**. Create one from **Admin > Access Tokens** in your Sentroy dashboard.

```
Authorization: Bearer stk_...
```

## Documentation

Each SDK has its own README with detailed installation and usage instructions:

- [TypeScript](typescript/) · [raw](https://raw.githubusercontent.com/Sentroy-Co/client-sdk/refs/heads/main/typescript/README.md)
- [Go](go/) · [raw](https://raw.githubusercontent.com/Sentroy-Co/client-sdk/refs/heads/main/go/README.md)
- [Python](python/) · [raw](https://raw.githubusercontent.com/Sentroy-Co/client-sdk/refs/heads/main/python/README.md)
- [PHP](php/) · [raw](https://raw.githubusercontent.com/Sentroy-Co/client-sdk/refs/heads/main/php/README.md)
- [cURL](curl/) · [raw](https://raw.githubusercontent.com/Sentroy-Co/client-sdk/refs/heads/main/curl/README.md)

### For AI Agents

Plain-text documentation links for LLM/agent consumption:

```
https://raw.githubusercontent.com/Sentroy-Co/client-sdk/refs/heads/main/typescript/README.md
https://raw.githubusercontent.com/Sentroy-Co/client-sdk/refs/heads/main/go/README.md
https://raw.githubusercontent.com/Sentroy-Co/client-sdk/refs/heads/main/python/README.md
https://raw.githubusercontent.com/Sentroy-Co/client-sdk/refs/heads/main/php/README.md
https://raw.githubusercontent.com/Sentroy-Co/client-sdk/refs/heads/main/curl/README.md
```

## License

[MIT](LICENSE)
