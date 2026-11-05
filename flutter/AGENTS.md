# Flutter SDK maintenance

Read README.md and PARITY.md before changing APIs. The package targets Flutter 3.32 / Dart 3.8 and newer. Keep library imports portable; platform imports in tests are allowed.

- Preserve all mappings in api-parity.json. Run `python3 ../scripts/check_flutter_parity.py`; it checks presence, while contract tests check behavior.
- Keep company, Identity, Vault and MCP credentials separate. Preserve request UUIDs on uncertain BCC outcomes and never add automatic replay or redirects to writes/private transfers.
- Use the shared abortable HTTP transport for service calls. Enforce total response deadlines and byte limits; a Future timeout alone does not cancel an HTTP request.
- Do not persist rotating refresh tokens after dispatch or allow delayed responses to overwrite newer sessions. Keep pluggable storage failures explicit.
- Preserve bound private references, immutable origin, metadata/hash/receipt checks, streaming limits and close cancellation in the MCP adapter. Its upstream client is community-maintained mcp_dart.
- Validate with analysis, formatting, tests, package dry run, the parity guard and the example Web build. Check both minimum and current Flutter in CI. Never publish credentials or include build/cache output in the package.
