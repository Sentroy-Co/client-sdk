const { test, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const { createHash } = require("node:crypto");
const { McpServer } = require("@modelcontextprotocol/sdk/server/mcp.js");
const {
  WebStandardStreamableHTTPServerTransport,
} = require("@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js");
const {
  connectSentroyMcp,
  sentroyMcpStorageUploadFileInfo,
  SentroyMcpError,
} = require("@sentroy-co/client-sdk/mcp");
const token = "mcp_" + "a".repeat(43),
  rotated = "mcp_at_" + "b".repeat(43);
const uploadId = "123e4567-e89b-42d3-a456-426614174000",
  connectionId = "2".repeat(24);
const content = Buffer.from("İsim,tutar\nAda,42\n");
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
let server, origin, requests, reference, accepted;
const info = () => ({
  name: "İsim.CSV",
  mimeType: "text/csv",
  bytes: content.length,
  sha256: hash(content),
});
const ack = (ref) => ({ ...ref, state: "ready", revision: "d".repeat(64) });
before(async () => {
  server = http.createServer(async (request, output) => {
    try {
      const url = new URL(request.url, origin),
        chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      const bytes = Buffer.concat(chunks);
      requests.push({
        url,
        method: request.method,
        headers: request.headers,
        bytes,
      });
      if (request.headers.authorization !== `Bearer ${accepted}`) {
        output.writeHead(401);
        output.end("PRIVATE REMOTE DETAIL");
        return;
      }
      if (url.pathname.includes("/uploads/")) {
        output.writeHead(200, { "content-type": "application/json" });
        output.end(JSON.stringify(ack(reference)));
        return;
      }
      if (url.pathname !== "/mcp/acme" || request.method !== "POST") {
        output.writeHead(405);
        output.end();
        return;
      }
      const mcp = new McpServer({
        name: "storage-upload-fixture",
        version: "1",
      });
      const transport = new WebStandardStreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
      });
      await mcp.connect(transport);
      const incoming = new Request(new URL(request.url, origin), {
        method: "POST",
        headers: request.headers,
        body: bytes,
      });
      const response = await transport.handleRequest(incoming);
      output.writeHead(response.status, Object.fromEntries(response.headers));
      output.end(Buffer.from(await response.arrayBuffer()));
      await mcp.close();
    } catch {
      output.writeHead(500);
      output.end("PRIVATE FIXTURE FAILURE");
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
});
beforeEach(() => {
  requests = [];
  accepted = token;
  reference = {
    ...info(),
    uploadId,
    bucket: { id: "c".repeat(24), slug: "assets", revision: "a".repeat(64) },
    state: "waiting",
    revision: "b".repeat(64),
    expiresAt: new Date(Date.now() + 600000).toISOString(),
    published: false,
    malwareScanned: false,
    requiresHumanApproval: true,
    uploadUrl: `${origin}/mcp/acme/uploads/${uploadId}?connection=${connectionId}`,
    method: "PUT",
    contentType: "application/octet-stream",
    requiresOriginalBearer: true,
  };
});
const options = (patch) => ({
  app: "storage",
  companySlug: "acme",
  origin,
  token,
  ...patch,
});
const json = (value) => Response.json(value);
test("local UTF8 file info snapshots supported byte forms and returns only a manifest", async () => {
  for (const body of [
    content,
    new Uint8Array(content),
    new Uint8Array(content).buffer,
    new Blob([content]),
  ])
    assert.deepEqual(
      await sentroyMcpStorageUploadFileInfo(body, {
        name: "İsim.CSV",
        mimeType: "text/csv",
      }),
      info(),
    );
  const max = new Uint8Array(10 * 1024 * 1024);
  assert.equal(
    (
      await sentroyMcpStorageUploadFileInfo(max, {
        name: "a.txt",
        mimeType: "text/plain",
      })
    ).bytes,
    max.length,
  );
  for (const body of [
    new Uint8Array(),
    new Uint8Array(max.length + 1),
    "raw data",
    {},
  ])
    await assert.rejects(
      sentroyMcpStorageUploadFileInfo(body, {
        name: "a.txt",
        mimeType: "text/plain",
      }),
      SentroyMcpError,
    );
  for (const [name, mimeType] of [
    ["../a.csv", "text/csv"],
    ["a.txt", "text/csv"],
    [" a.csv", "text/csv"],
    ["a\u0001.csv", "text/csv"],
    ["a\ud800.csv", "text/csv"],
    ["a.svg", "image/svg+xml"],
    ["a.zip", "application/zip"],
    ["a.csv", "constructor"],
  ])
    await assert.rejects(
      sentroyMcpStorageUploadFileInfo(content, { name, mimeType }),
      SentroyMcpError,
    );
});
test("all fourteen MIME families have the same manifest extension policy as Storage", async () => {
  for (const [mimeType, ext] of [
    ["application/pdf", "pdf"],
    ["image/jpeg", "jpeg"],
    ["image/png", "png"],
    ["image/webp", "webp"],
    ["text/plain", "log"],
    ["text/csv", "csv"],
    ["audio/mpeg", "mp3"],
    ["audio/wav", "wav"],
    ["audio/ogg", "oga"],
    ["audio/mp4", "m4a"],
    ["audio/webm", "webm"],
    ["video/mp4", "mp4"],
    ["video/webm", "webm"],
    ["video/quicktime", "mov"],
  ])
    assert.equal(
      (
        await sentroyMcpStorageUploadFileInfo(content, {
          name: `file.${ext}`,
          mimeType,
        })
      ).mimeType,
      mimeType,
    );
});
test("actual authenticated PUT sends a private immutable body and returns staging metadata without publishing", async () => {
  let current = token;
  const c = await connectSentroyMcp(options({ token: () => current }));
  try {
    current = rotated;
    accepted = rotated;
    const result = await c.uploadStorageFile(reference, new Blob([content]));
    assert.deepEqual(result, {
      ...info(),
      uploadId,
      bucket: reference.bucket,
      state: "ready",
      revision: "d".repeat(64),
      expiresAt: reference.expiresAt,
      published: false,
      malwareScanned: false,
      requiresHumanApproval: true,
    });
    const req = requests.at(-1);
    assert.equal(req.method, "PUT");
    assert.deepEqual(req.bytes, content);
    assert.equal(req.headers.authorization, `Bearer ${rotated}`);
    assert.equal(req.headers.cookie, undefined);
    assert.equal(req.headers["content-type"], "application/octet-stream");
    assert.equal(
      requests.filter((r) => r.url.pathname.includes("/uploads/")).length,
      1,
    );
    assert(!requests.some((r) => r.url.pathname.includes("mcp-actions")));
  } finally {
    await c.close();
  }
});
test("origin, app, company, path, grant query, expiry, flags and manifest validation happen before credential loading", async () => {
  let calls = 0;
  const c = await connectSentroyMcp(
      options({
        token: () => {
          calls++;
          return token;
        },
      }),
    ),
    base = calls;
  const ref = structuredClone(reference);
  try {
    for (const change of [
      { uploadUrl: ref.uploadUrl.replace(origin, "https://evil.test") },
      { uploadUrl: ref.uploadUrl.replace("/acme/", "/other/") },
      { uploadUrl: ref.uploadUrl.replace("/uploads/", "/contacts/imports/") },
      { uploadUrl: ref.uploadUrl + "&connection=" + connectionId },
      { uploadUrl: ref.uploadUrl + "&token=secret" },
      { uploadUrl: ref.uploadUrl + "#x" },
      { uploadUrl: ref.uploadUrl.replace("http://", "http://user:password@") },
      { uploadUrl: ref.uploadUrl.replace("connection=", "other=") },
      { uploadId: "bad" },
      { bytes: 0 },
      { bytes: 10 * 1024 * 1024 + 1 },
      { sha256: "bad" },
      { requiresOriginalBearer: false },
      { method: "POST" },
      { contentType: "text/plain" },
      { published: true },
      { malwareScanned: true },
      { requiresHumanApproval: false },
      { expiresAt: "1970-01-01T00:00:00.000Z" },
      { revision: "bad" },
      { state: "completed" },
      { name: "../a.csv" },
      { mimeType: "application/json" },
      { bucket: { ...ref.bucket, id: "invalid" } },
    ])
      await assert.rejects(
        c.uploadStorageFile({ ...ref, ...change }, content),
        SentroyMcpError,
      );
    assert.equal(calls, base);
    for (const timeoutMs of [0, -1, 120001, 1.1, NaN])
      await assert.rejects(
        c.uploadStorageFile(ref, content, { timeoutMs }),
        SentroyMcpError,
      );
    assert.equal(calls, base);
  } finally {
    await c.close();
  }
  const other = await connectSentroyMcp(options({ app: "mail" }));
  try {
    await assert.rejects(
      other.uploadStorageFile(ref, content),
      (e) => e.code === "mcp_storage_upload_not_supported",
    );
  } finally {
    await other.close();
  }
});
test("wrong local size or hash never sends an upload or loads its credential", async () => {
  let calls = 0;
  const c = await connectSentroyMcp(
      options({
        token: () => {
          calls++;
          return token;
        },
      }),
    ),
    base = calls;
  try {
    for (const body of [
      Buffer.from("private wrong file"),
      Buffer.from("X".repeat(content.length)),
    ])
      await assert.rejects(
        c.uploadStorageFile(reference, body),
        (e) => e instanceof SentroyMcpError && !e.message.includes("private"),
      );
    assert.equal(calls, base);
    assert(!requests.some((r) => r.method === "PUT"));
  } finally {
    await c.close();
  }
});
test("reference fields, nested bucket and local bytes stay pinned across a mutable credential callback", async () => {
  const original = structuredClone(reference),
    local = Buffer.from(content);
  let mutate = false,
    seen;
  const c = await connectSentroyMcp(
    options({
      token: () => {
        if (mutate) {
          reference.bytes = 1;
          reference.sha256 = "0".repeat(64);
          reference.bucket.id = "e".repeat(24);
          reference.uploadUrl = "https://evil.test";
          local.fill(88);
        }
        return token;
      },
      fetch: async (input, init) => {
        if (new URL(String(input)).pathname.includes("/uploads/")) {
          seen = { url: String(input), body: Buffer.from(init.body) };
          return json(ack(original));
        }
        return fetch(input, init);
      },
    }),
  );
  try {
    mutate = true;
    const result = await c.uploadStorageFile(reference, local);
    assert.equal(seen.url, original.uploadUrl);
    assert.deepEqual(seen.body, content);
    assert.equal(result.bytes, content.length);
    assert.equal(result.bucket.id, original.bucket.id);
  } finally {
    await c.close();
  }
});
test("a success acknowledgement must bind every manifest field and private staging flag", async () => {
  let response;
  const c = await connectSentroyMcp(
    options({
      fetch: (input, init) =>
        new URL(String(input)).pathname.includes("/uploads/")
          ? Promise.resolve(json(response))
          : fetch(input, init),
    }),
  );
  try {
    for (const patch of [
      { uploadId: "223e4567-e89b-42d3-a456-426614174000" },
      { name: "different.csv" },
      { bytes: 1 },
      { sha256: "0".repeat(64) },
      { mimeType: "text/plain" },
      { state: "waiting" },
      { published: true },
      { malwareScanned: true },
      { requiresHumanApproval: false },
      { revision: "bad" },
      { expiresAt: new Date(Date.now() + 800000).toISOString() },
      { bucket: { ...reference.bucket, slug: "other" } },
      { bucket: { ...reference.bucket, id: "e".repeat(24) } },
      { bucket: { ...reference.bucket, revision: "0".repeat(64) } },
    ]) {
      response = { ...ack(reference), ...patch };
      await assert.rejects(
        c.uploadStorageFile(reference, content),
        (e) => e.code === "invalid_mcp_storage_upload_response",
      );
    }
  } finally {
    await c.close();
  }
});
test("redirects and remote failures never retry or expose diagnostic bodies", async () => {
  let count = 0,
    status = 307;
  const c = await connectSentroyMcp(
    options({
      fetch: (input, init) => {
        if (new URL(String(input)).pathname.includes("/uploads/")) {
          count++;
          assert.equal(init.redirect, "manual");
          assert.equal(init.credentials, "omit");
          assert.equal(init.cache, "no-store");
          return Promise.resolve(
            new Response("PRIVATE DETAIL", {
              status,
              headers: { location: "https://evil.test" },
            }),
          );
        }
        return fetch(input, init);
      },
    }),
  );
  try {
    for (const code of [307, 401, 409, 413, 503]) {
      status = code;
      const before = count;
      await assert.rejects(
        c.uploadStorageFile(reference, content),
        (e) =>
          e.code === "mcp_upload_failed" &&
          e.status === code &&
          !e.message.includes("PRIVATE"),
      );
      assert.equal(count, before + 1);
    }
  } finally {
    await c.close();
  }
});
test("bounded acknowledgement parsing rejects invalid JSON, size, MIME and UTF8 without leaking its text", async () => {
  let response;
  const c = await connectSentroyMcp(
    options({
      fetch: (input, init) =>
        new URL(String(input)).pathname.includes("/uploads/")
          ? Promise.resolve(response)
          : fetch(input, init),
    }),
  );
  try {
    for (const value of [
      new Response("PRIVATE DIAGNOSTIC", {
        headers: { "content-type": "application/json" },
      }),
      new Response("X".repeat(4097), {
        headers: { "content-type": "application/json" },
      }),
      new Response(new Uint8Array([255]), {
        headers: { "content-type": "application/json" },
      }),
      new Response(JSON.stringify(ack(reference)), {
        headers: { "content-type": "application/json-evil" },
      }),
      new Response(JSON.stringify(ack(reference)), {
        headers: {
          "content-type": "application/json",
          "content-length": "9000",
        },
      }),
      json(null),
    ]) {
      response = value;
      await assert.rejects(
        c.uploadStorageFile(reference, content),
        (e) => e instanceof SentroyMcpError && !e.message.includes("PRIVATE"),
      );
    }
  } finally {
    await c.close();
  }
});
test("cancellation covers a hung credential and a late credential cannot start HTTP after timeout", async () => {
  let hang = false,
    release,
    count = 0;
  const c = await connectSentroyMcp(
    options({
      token: () =>
        hang
          ? new Promise((resolve) => {
              release = resolve;
            })
          : token,
      fetch: (input, init) => {
        if (new URL(String(input)).pathname.includes("/uploads/")) count++;
        return fetch(input, init);
      },
    }),
  );
  try {
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(
      c.uploadStorageFile(reference, content, { signal: controller.signal }),
      (e) => e.code === "mcp_upload_aborted",
    );
    hang = true;
    await assert.rejects(
      c.uploadStorageFile(reference, content, { timeoutMs: 20 }),
      (e) => e.code === "mcp_upload_aborted",
    );
    release(token);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(count, 0);
  } finally {
    hang = false;
    await c.close();
  }
});
test("timeout cancels an acknowledgement stream instead of returning a usable partial receipt", async () => {
  let cancelled = false;
  const c = await connectSentroyMcp(
    options({
      fetch: (input, init) =>
        new URL(String(input)).pathname.includes("/uploads/")
          ? Promise.resolve(
              new Response(
                new ReadableStream({
                  start(controller) {
                    controller.enqueue(new TextEncoder().encode("{"));
                  },
                  cancel() {
                    cancelled = true;
                  },
                }),
                { headers: { "content-type": "application/json" } },
              ),
            )
          : fetch(input, init),
    }),
  );
  try {
    await assert.rejects(
      c.uploadStorageFile(reference, content, { timeoutMs: 20 }),
      (e) => e.code === "mcp_upload_aborted",
    );
    await new Promise((resolve) => setImmediate(resolve));
    assert(cancelled);
  } finally {
    await c.close();
  }
});
test("expired reservations cannot start HTTP after delayed credential acquisition", async () => {
  let delayed = false,
    count = 0;
  const c = await connectSentroyMcp(
    options({
      token: async () => {
        if (delayed) await new Promise((resolve) => setTimeout(resolve, 40));
        return token;
      },
      fetch: (input, init) => {
        if (new URL(String(input)).pathname.includes("/uploads/")) count++;
        return fetch(input, init);
      },
    }),
  );
  try {
    reference.expiresAt = new Date(Date.now() + 20).toISOString();
    delayed = true;
    await assert.rejects(
      c.uploadStorageFile(reference, content),
      (e) => e.code === "invalid_mcp_storage_upload_reference",
    );
    assert.equal(count, 0);
  } finally {
    delayed = false;
    await c.close();
  }
});
