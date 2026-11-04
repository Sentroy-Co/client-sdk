# Rust SDK maintenance

This directory contains a native async client; consult [README.md](README.md) and [PARITY.md](PARITY.md) before changing its public surface.

- The TypeScript comparison source and 70 root resource mappings are recorded in [api-parity.json](api-parity.json). Update the manifest when changing a mapped method; run `python3 ../scripts/check_rust_parity.py`. This guard checks presence, not behavior.
- Preserve the separate REST, Identity, Vault and MCP credential namespaces. Do not put tokens, private file contents or raw sensitive server errors in logs or examples.
- Preserve BCC request IDs on uncertain outcomes. Do not automatically retry or redirect compose requests, MCP writes, or private transfers.
- Test wire behavior using local fixtures. From this directory run `cargo fmt --check`, `cargo test`, `cargo check --examples`, and the parity guard. The declared Rust 1.89 minimum remains subject to CI verification.
- Native code does not provide React, browser storage, WebAuthn execution or the TypeScript CLI. Document platform boundaries rather than claiming those interfaces exist.
