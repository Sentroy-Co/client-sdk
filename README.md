<p align="center">
  <img src="https://sentroy.com/business/sentroy-logo-light.png" alt="Sentroy" width="240" />
</p>

<h3 align="center">Sentroy Client SDKs</h3>

<p align="center">
  Official client SDKs for the <a href="https://sentroy.com">Sentroy</a> business mail &amp; storage platform.<br />
  <a href="https://docs.sentroy.com"><strong>Documentation</strong></a> &middot; <a href="https://sentroy.com">sentroy.com</a> &middot; <a href="https://status.sentroy.com">Status</a>
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

All SDKs target the same API surface (mail + storage) and work against either the hosted platform (`https://sentroy.com`) or your own Sentroy deployment — only the `baseUrl` changes.

## Authentication

Access tokens carry permission scopes per company. Create one from **Admin → Access Tokens** in your Sentroy dashboard.

```
Authorization: Bearer stk_...
```

## Documentation

Full reference, code samples in every language, interactive examples and rate-limit details:

**[docs.sentroy.com](https://docs.sentroy.com)**

## For AI Agents

Each SDK ships a single comprehensive `AGENTS.md` reference — feed the raw URL into a context window for full API coverage in one file:

```
https://raw.githubusercontent.com/Sentroy-Co/client-sdk/refs/heads/main/typescript/AGENTS.md
https://raw.githubusercontent.com/Sentroy-Co/client-sdk/refs/heads/main/go/README.md
https://raw.githubusercontent.com/Sentroy-Co/client-sdk/refs/heads/main/python/README.md
https://raw.githubusercontent.com/Sentroy-Co/client-sdk/refs/heads/main/php/README.md
https://raw.githubusercontent.com/Sentroy-Co/client-sdk/refs/heads/main/curl/README.md
```

> Only the TypeScript SDK has split `README.md` (lean, npm-facing) from `AGENTS.md` (full reference). The Go, Python, PHP and cURL READMEs remain comprehensive and double as agent-facing docs.

## License

[MIT](LICENSE)
