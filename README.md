<p align="center">
  <img src="https://sentroy.com/business/sentroy-logo-light.png" alt="Sentroy" width="240" />
</p>

<h3 align="center">Sentroy Client SDKs</h3>

<p align="center">
  Official client SDKs for the Sentroy platform API.
</p>

---

## Available SDKs

| Language | Package | Install |
|----------|---------|---------|
| TypeScript / Node.js | [`@sentroy-co/client-sdk`](https://www.npmjs.com/package/@sentroy-co/client-sdk) | `npm install @sentroy-co/client-sdk` |
| Go | [`github.com/Sentroy-Co/client-sdk/go`](https://pkg.go.dev/github.com/Sentroy-Co/client-sdk/go) | `go get github.com/Sentroy-Co/client-sdk/go` |
| Python | [`sentroy-client-sdk`](https://pypi.org/project/sentroy-client-sdk/) | `pip install sentroy-client-sdk` |
| PHP | [`sentroy-co/client-sdk`](https://packagist.org/packages/sentroy-co/client-sdk) | `composer require sentroy-co/client-sdk` |

## Features

All SDKs provide the same API surface:

- **Domains** — List and retrieve verified domains
- **Mailboxes** — List mailbox accounts
- **Templates** — List and retrieve email templates
- **Inbox** — Read messages, list folders, manage threads, move/delete
- **Send** — Send emails with templates or raw HTML

## Authentication

All SDKs authenticate via **Access Tokens**. Create one from **Admin > Access Tokens** in your Sentroy dashboard.

```
Authorization: Bearer stk_...
```

## Documentation

Each SDK has its own README with detailed installation and usage instructions:

- [TypeScript](typescript/)
- [Go](go/)
- [Python](python/)
- [PHP](php/)

## License

[MIT](LICENSE)
