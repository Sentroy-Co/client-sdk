const { test, before, after } = require('node:test')
const assert = require('node:assert/strict')
const http = require('node:http')
const { Sentroy, ComposeRequestError } = require('../dist/index.js')
const requestId = '12345678-1234-4234-a234-123456789abc'
let server,
  origin,
  calls = [],
  mode = 'ok'
before(async () => {
  server = http.createServer(async (request, response) => {
    const chunks = []
    for await (const chunk of request) chunks.push(chunk)
    calls.push({
      path: request.url,
      authorization: request.headers.authorization,
      cookie: request.headers.cookie,
      body: JSON.parse(Buffer.concat(chunks)),
    })
    response.setHeader('Content-Type', 'application/json')
    if (mode === 'redirect') {
      response.writeHead(307, { location: '/redirect-target' })
      response.end('{}')
      return
    }
    if (mode === 'huge') {
      response.end(JSON.stringify({ data: { status: 'x'.repeat(5000) } }))
      return
    }
    if (mode === 'fail') {
      response.writeHead(503)
      response.end(JSON.stringify({ error: 'fixture unavailable' }))
      return
    }
    response.end(
      JSON.stringify({
        data: request.url.includes('drafts')
          ? { status: 'saved', folder: 'Drafts' }
          : {
              status: mode === 'unknown' ? 'unknown' : 'queued',
              canRetry: false,
            },
      }),
    )
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  origin = `http://127.0.0.1:${server.address().port}`
})
after(async () => {
  server.closeAllConnections()
  await new Promise((resolve) => server.close(resolve))
})
const client = () =>
  new Sentroy({
    baseUrl: origin,
    companySlug: 'acme',
    accessToken: 'stk_fixture',
  })
const params = () => ({
  from: 'mine@owned.test',
  to: [],
  bcc: ['private@example.test'],
  domainId: 'domain-id',
  subject: 'Hello',
  text: 'Body',
  requestId,
})
test('BCC uses versioned platform route, one shared recipient list, STK and explicit request UUID', async () => {
  const result = await client().send.email({
    ...params(),
    to: ['one@example.test', 'two@example.test'],
  })
  assert.equal(result.requestId, requestId)
  assert.equal(calls.at(-1).path, '/api/mail/companies/acme/send-bcc')
  assert.equal(calls.at(-1).authorization, 'Bearer stk_fixture')
  assert.equal(calls.at(-1).cookie, undefined)
  assert.deepEqual(calls.at(-1).body.to, [
    'one@example.test',
    'two@example.test',
  ])
  assert.equal(calls.at(-1).body.recipients, undefined)
})
test('BCC-only accepts empty To; unknown receipt retains UUID and is never retried automatically', async () => {
  mode = 'unknown'
  const count = calls.length
  const result = await client().send.email(params())
  mode = 'ok'
  assert.equal(result.status, 'unknown')
  assert.equal(result.requestId, requestId)
  assert.equal(result.canRetry, false)
  assert.equal(calls.length, count + 1)
  assert.deepEqual(calls.at(-1).body.to, [])
})
test('failed BCC HTTP call carries original UUID with one attempt and no legacy fallback', async () => {
  mode = 'fail'
  const count = calls.length
  await assert.rejects(
    client().send.email(params()),
    (error) =>
      error instanceof ComposeRequestError &&
      error.requestId === requestId &&
      error.cause.statusCode === 503,
  )
  mode = 'ok'
  assert.equal(calls.length, count + 1)
  assert.equal(calls.at(-1).path, '/api/mail/companies/acme/send-bcc')
})
test('private BCC draft uses versioned route and exposes safe receipt UUID', async () => {
  const result = await client().inbox.saveDraft({
    mailbox: 'mine@owned.test',
    bcc: ['private@example.test'],
    requestId,
    html: '<p>Draft</p>',
    attachments: [{ filename: 'note.txt', content: 'SGk=' }],
  })
  assert.equal(result.status, 'saved')
  assert.equal(result.requestId, requestId)
  assert.equal(
    calls.at(-1).path,
    '/api/mail/companies/acme/inbox/drafts-bcc-v1',
  )
  assert.deepEqual(calls.at(-1).body.bcc, ['private@example.test'])
})
test('legacy sends/drafts keep paths; multi-To becomes personalized recipients with variables', async () => {
  const p = {
    from: 'mine@owned.test',
    domainId: 'domain-id',
    subject: 'Hi',
    to: ['a@example.test', 'b@example.test'],
    variables: { count: 2, rows: [{ name: 'One' }] },
  }
  await client().send.email(p)
  assert.equal(calls.at(-1).path, '/api/mail/companies/acme/send')
  assert.deepEqual(
    calls.at(-1).body.recipients,
    p.to.map((to) => ({ to, variables: p.variables })),
  )
  assert.equal(calls.at(-1).body.to, undefined)
  await client().send.email({ ...p, to: ['one@example.test'] })
  assert.equal(calls.at(-1).body.to, 'one@example.test')
  await client().inbox.saveDraft({
    mailbox: 'mine@owned.test',
    html: '<p>Draft</p>',
  })
  assert.equal(calls.at(-1).path, '/api/mail/companies/acme/inbox/drafts')
})
test('invalid UUID is refused before HTTP; absent UUID is generated once and returned', async () => {
  const count = calls.length
  await assert.rejects(
    client().send.email({ ...params(), requestId: 'invalid' }),
    /UUID/,
  )
  assert.equal(calls.length, count)
  const result = await client().send.email({
    ...params(),
    requestId: undefined,
  })
  assert.match(result.requestId, /^[a-f0-9-]{36}$/)
  assert.equal(calls.at(-1).body.requestId, result.requestId)
})

test('versioned compose refuses redirects and oversized receipts with no second HTTP call', async () => {
  for (const value of ['redirect', 'huge']) {
    mode = value
    const count = calls.length
    await assert.rejects(
      client().send.email(params()),
      (error) =>
        error instanceof ComposeRequestError && error.requestId === requestId,
    )
    assert.equal(calls.length, count + 1)
  }
  mode = 'ok'
})
