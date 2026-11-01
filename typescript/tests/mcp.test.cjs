const { test, before, after } = require('node:test')
const assert = require('node:assert/strict')
const http = require('node:http')
const { spawnSync } = require('node:child_process')
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js')
const { WebStandardStreamableHTTPServerTransport } = require('@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js')
const { z } = require('zod')
const { connectSentroyMcp, sentroyMcpResource, sentroyMcpResourceMetadata, SentroyMcpError } = require('@sentroy-co/client-sdk/mcp')
const personal = 'mcp_' + 'a'.repeat(43), access = 'mcp_at_' + 'b'.repeat(43), id = '1'.repeat(24), connectionId = '2'.repeat(24)
let origin, server, acceptedToken = personal, executions = 0, requests = []
before(async () => {
  server = http.createServer(async (request, output) => {
    try {
      const url = new URL(request.url, origin)
      requests.push({ path: url.pathname, authorization: request.headers.authorization, cookie: request.headers.cookie })
      if (request.headers.authorization !== `Bearer ${acceptedToken}`) { output.writeHead(401); output.end('unauthorized'); return }
      if (url.pathname.startsWith('/mcp/acme/files/assets/')) { output.writeHead(200, { 'content-type': 'application/octet-stream', 'content-length': 5 }); output.end('Hello'); return }
      if (url.pathname !== '/mcp/acme') { output.writeHead(404); output.end(); return }
      if (request.method !== 'POST') { output.writeHead(405); output.end(); return }
      const chunks = []
      for await (const chunk of request) chunks.push(chunk)
      const incoming = new Request(new URL(request.url, origin), { method: 'POST', headers: request.headers, body: Buffer.concat(chunks) })
      const mcp = new McpServer({ name: 'sentroy-fixture', version: '1' })
      mcp.registerTool('echo', { inputSchema: z.object({ text: z.string() }), annotations: { readOnlyHint: true } }, async ({ text }) => {
        executions++; return { content: [{ type: 'text', text }], structuredContent: { text } }
      })
      const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true })
      await mcp.connect(transport)
      const response = await transport.handleRequest(incoming)
      output.writeHead(response.status, Object.fromEntries(response.headers))
      output.end(Buffer.from(await response.arrayBuffer()))
      await mcp.close()
    } catch { output.writeHead(500); output.end('fixture error') }
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  origin = `http://127.0.0.1:${server.address().port}`
})
after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)) })
const options = (patch = {}) => ({ app: 'storage', companySlug: 'acme', origin, token: personal, ...patch })
const reference = (resource) => ({ method: 'GET', requiresAuthorization: true, file: { id, size: 5 }, downloadUrl: `${resource}/files/assets/${id}?connection=${connectionId}&version=2026-11-01T01%3A02%3A03.456Z` })

test('public resource helpers map all apps and discovery without credentials or network calls', () => {
  for (const app of ['core', 'mail', 'storage', 'linear', 'chaby']) {
    const expected = app === 'core' ? 'https://sentroy.com' : `https://${app}.sentroy.com`
    assert.equal(sentroyMcpResource({ app, companySlug: 'acme' }), `${expected}/mcp/acme`)
    assert.equal(sentroyMcpResourceMetadata({ app, companySlug: 'acme' }), `${expected}/.well-known/oauth-protected-resource/mcp/acme`)
  }
  assert.equal(sentroyMcpResource(options()), `${origin}/mcp/acme`)
  for (const patch of [{ app: '__proto__' }, { companySlug: '../other' }, { companySlug: 'ACME' }, { origin: 'http://public.test' }, { origin: 'https://user:secret@sentroy.com' }, { origin: 'https://sentroy.com/path' }, { origin: 'https://sentroy.com?token=secret' }, { origin: 'https://sentroy.com/#fragment' }]) assert.throws(() => sentroyMcpResource(options(patch)), SentroyMcpError)
})
test('legacy, vault, identity, malformed and callback-failed credentials are rejected before any request', async () => {
  let network = 0
  for (const token of ['stk_legacy', 'stk_env_private', 'eyJ.identity.jwt', 'mcp_short', 'mcp_' + 'a'.repeat(44), personal + '\n']) {
    await assert.rejects(connectSentroyMcp(options({ token, fetch: async () => { network++; return new Response(null) } })), error => error.code === 'invalid_mcp_token')
  }
  await assert.rejects(connectSentroyMcp(options({ token: () => { throw Error('private credential value') } })), error => error.code === 'mcp_token_unavailable' && !error.message.includes('private'))
  assert.equal(network, 0)
})
test('official stateless client connects without tool execution and supports list/call; token callbacks rotate without cookie auth', async () => {
  acceptedToken = personal; requests = []; executions = 0
  let current = personal
  const connection = await connectSentroyMcp(options({ token: () => current }))
  try {
    assert.equal(executions, 0)
    assert.equal((await connection.client.listTools()).tools[0].name, 'echo')
    current = access; acceptedToken = access
    assert.equal((await connection.client.callTool({ name: 'echo', arguments: { text: 'Fixture text' } })).structuredContent.text, 'Fixture text')
    assert.equal(executions, 1)
    assert(requests.some(request => request.authorization === `Bearer ${access}`))
    assert(requests.every(request => request.cookie === undefined))
    assert.equal(connection.resource, `${origin}/mcp/acme`)
  } finally { await connection.close(); acceptedToken = personal }
})
test('transport follows no redirects and sanitizes private fetch errors', async () => {
  for (const failure of ['redirect', 'network']) {
    const seen = []
    await assert.rejects(connectSentroyMcp(options({ fetch: async (_url, init) => {
      seen.push(init)
      if (failure === 'network') throw Error('private gateway key')
      return new Response(null, { status: 302, headers: { location: 'https://evil.test' } })
    } })), error => error instanceof SentroyMcpError && !error.message.includes('private gateway'))
    assert.equal(seen.length, 1); assert.equal(seen[0].redirect, 'manual'); assert.equal(seen[0].credentials, 'omit')
  }
})
test('authenticated download uses the same transport credential, fixed origin/company/file/version and bounded bytes', async () => {
  acceptedToken = personal
  const connection = await connectSentroyMcp(options())
  try {
    const response = await connection.downloadFile(reference(connection.resource))
    assert.equal(response.headers.get('cache-control'), 'no-store')
    assert.equal(response.headers.get('content-type'), 'application/octet-stream')
    assert.equal(await response.text(), 'Hello')
    const request = requests.at(-1)
    assert.equal(request.path, `/mcp/acme/files/assets/${id}`); assert.equal(request.authorization, `Bearer ${personal}`)
  } finally { await connection.close() }
})
test('untrusted download references cannot send a credential to another origin, company, path or malformed target', async () => {
  const connection = await connectSentroyMcp(options()), initial = requests.length, ref = reference(connection.resource)
  const cases = [
    { ...ref, downloadUrl: ref.downloadUrl.replace(origin, 'https://evil.test') },
    { ...ref, downloadUrl: ref.downloadUrl.replace('http://', 'http://user:secret@') },
    { ...ref, downloadUrl: ref.downloadUrl.replace('/mcp/acme/', '/mcp/other/') },
    { ...ref, downloadUrl: `${origin}/api/admin?connection=${connectionId}&version=x` },
    { ...ref, downloadUrl: ref.downloadUrl + '&token=secret' },
    { ...ref, downloadUrl: ref.downloadUrl + '&connection=' + connectionId },
    { ...ref, downloadUrl: ref.downloadUrl + '#fragment' },
    { ...ref, file: { ...ref.file, id: '3'.repeat(24) } },
    { ...ref, file: { ...ref.file, size: 64 * 1024 * 1024 + 1 } },
    { ...ref, requiresAuthorization: false },
    { ...ref, method: 'POST' },
  ]
  try {
    for (const item of cases) await assert.rejects(connection.downloadFile(item), SentroyMcpError)
    assert.equal(requests.length, initial)
  } finally { await connection.close() }
})
test('downloads refuse partial, oversized, redirected and private diagnostic responses', async () => {
  let responseFactory = () => new Response('Hello'), downloads = 0
  const connection = await connectSentroyMcp(options({ fetch: async (input, init) => {
    if (new URL(String(input)).pathname.includes('/files/')) { downloads++; return responseFactory() }
    return fetch(input, init)
  } }))
  try {
    for (const body of ['four', 'sixsix']) {
      responseFactory = () => new Response(body)
      const response = await connection.downloadFile(reference(connection.resource))
      await assert.rejects(response.text(), error => error instanceof SentroyMcpError)
    }
    for (const status of [302, 401, 503]) {
      responseFactory = () => new Response('private server credential', { status })
      await assert.rejects(connection.downloadFile(reference(connection.resource)), error => error instanceof SentroyMcpError && error.status === status && !error.message.includes('private'))
    }
    responseFactory = () => new Response('Hello', { headers: { 'content-length': '999' } })
    await assert.rejects(connection.downloadFile(reference(connection.resource)), error => error.code === 'mcp_download_size_mismatch')
    assert.equal(downloads, 6)
  } finally { await connection.close() }
})
test('download cancellation and timeout propagate without leaving a timer or open reader', async () => {
  let cancelled = 0
  const connection = await connectSentroyMcp(options({ fetch: async (input, init) => {
    if (!new URL(String(input)).pathname.includes('/files/')) return fetch(input, init)
    return new Response(new ReadableStream({
      start(controller) { init.signal.addEventListener('abort', () => { controller.error(Error('aborted')); cancelled++ }, { once: true }) },
      cancel() { cancelled++ },
    }))
  } }))
  try {
    let response = await connection.downloadFile(reference(connection.resource))
    await response.body.cancel(); assert(cancelled >= 1)
    response = await connection.downloadFile(reference(connection.resource), { timeoutMs: 10 })
    await assert.rejects(response.text(), SentroyMcpError)
    const controller = new AbortController(); controller.abort()
    await assert.rejects(connection.downloadFile(reference(connection.resource), { signal: controller.signal }), error => error.code === 'mcp_download_aborted')
  } finally { await connection.close() }
})
test('non-Storage connections cannot repurpose this credential as a download credential', async () => {
  const connection = await connectSentroyMcp(options({ app: 'core' }))
  try { await assert.rejects(connection.downloadFile(reference(connection.resource)), error => error.code === 'mcp_download_not_supported') }
  finally { await connection.close() }
})
test('main REST entry does not import or require the optional MCP SDK', () => {
  const script = `const Module=require('node:module');const load=Module._load;Module._load=function(id,...args){if(id.startsWith('@modelcontextprotocol/'))throw Error('MCP must stay optional');return load.call(this,id,...args)};if(typeof require('./dist/index.js').Sentroy!=='function')process.exit(1)`
  const result = spawnSync(process.execPath, ['-e', script], { cwd: new URL('../', 'file://' + __filename), encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
})
