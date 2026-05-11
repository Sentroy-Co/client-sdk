#!/usr/bin/env node
// Thin shim — keeps the shebang out of TypeScript-emitted files so tsc
// can still emit them as plain CommonJS modules without preserving comments.
require("../dist/cli/index.js")
