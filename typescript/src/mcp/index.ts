import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
  StreamableHTTPClientTransport,
  StreamableHTTPError,
} from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { SentroyMcpError } from "./errors";
import { downloadContactExport, uploadContactImport } from "./contact-files";
import type {
  SentroyMcpContactExportReference,
  SentroyMcpContactImportReference,
  SentroyMcpContactFileBody,
  SentroyMcpContactImportUploaded,
} from "./contact-files";
export { SentroyMcpError } from "./errors";
export {
  sentroyMcpContactImportFileInfo,
  SentroyMcpContactImportError,
} from "./contact-files";
export type {
  SentroyMcpContactExportReference,
  SentroyMcpContactImportReference,
  SentroyMcpContactFileBody,
  SentroyMcpContactImportUploaded,
} from "./contact-files";

export type SentroyMcpApp = "core" | "mail" | "storage" | "linear" | "chaby";
export interface SentroyMcpResourceOptions {
  app: SentroyMcpApp;
  companySlug: string;
  /** Override only this app's origin for self-hosting. HTTPS or loopback HTTP. */
  origin?: string;
}
export interface SentroyMcpOptions extends SentroyMcpResourceOptions {
  /** A personal MCP token or externally managed OAuth MCP access token, never stk_. */
  token: string | (() => string | Promise<string>);
  fetch?: typeof globalThis.fetch;
  clientInfo?: { name: string; version: string };
}
export interface SentroyMcpDownloadReference {
  downloadUrl: string;
  requiresAuthorization: true;
  method: "GET";
  file: { id: string; size: number };
}
export interface SentroyMcpMailAttachmentReference {
  downloadUrl: string;
  requiresAuthorization: true;
  method: "GET";
  attachment: { partId: string; encodedSize: number };
  maxBytes: number;
}
export interface SentroyMcpConnection {
  client: Client;
  resource: string;
  downloadFile(
    reference: SentroyMcpDownloadReference,
    options?: { signal?: AbortSignal; timeoutMs?: number },
  ): Promise<Response>;
  downloadMailAttachment(
    reference: SentroyMcpMailAttachmentReference,
    options?: { signal?: AbortSignal; timeoutMs?: number },
  ): Promise<Response>;
  downloadMailContactsExport(
    reference: SentroyMcpContactExportReference,
    options?: { signal?: AbortSignal; timeoutMs?: number },
  ): Promise<Response>;
  uploadMailContactsImport(
    reference: SentroyMcpContactImportReference,
    body: SentroyMcpContactFileBody,
    options?: { signal?: AbortSignal; timeoutMs?: number },
  ): Promise<SentroyMcpContactImportUploaded>;
  close(): Promise<void>;
}
const origins: Record<SentroyMcpApp, string> = {
  core: "https://sentroy.com",
  mail: "https://mail.sentroy.com",
  storage: "https://storage.sentroy.com",
  linear: "https://linear.sentroy.com",
  chaby: "https://chaby.sentroy.com",
};
const slug = /^[a-z0-9][a-z0-9_-]{0,99}$/;
const objectId = /^[a-f\d]{24}$/;
const maxDownloadBytes = 64 * 1024 * 1024;
/** Public configuration only: no credentials, network requests or registration. */
export function sentroyMcpResource(options: SentroyMcpResourceOptions): string {
  if (
    typeof options.app !== "string" ||
    typeof options.companySlug !== "string" ||
    !Object.hasOwn(origins, options.app) ||
    !slug.test(options.companySlug)
  )
    throw new SentroyMcpError("invalid_mcp_resource");
  let origin: URL;
  try {
    origin = new URL(options.origin ?? origins[options.app]);
  } catch {
    throw new SentroyMcpError("invalid_mcp_origin");
  }
  if (
    origin.username ||
    origin.password ||
    origin.hash ||
    origin.search ||
    origin.pathname !== "/" ||
    (origin.protocol !== "https:" &&
      !(
        origin.protocol === "http:" &&
        ["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname)
      ))
  )
    throw new SentroyMcpError("invalid_mcp_origin");
  return `${origin.origin}/mcp/${encodeURIComponent(options.companySlug)}`;
}
export function sentroyMcpResourceMetadata(
  options: SentroyMcpResourceOptions,
): string {
  const resource = new URL(sentroyMcpResource(options));
  return `${resource.origin}/.well-known/oauth-protected-resource${resource.pathname}`;
}
function credential(source: SentroyMcpOptions["token"]) {
  return async () => {
    let token: unknown;
    try {
      token = typeof source === "function" ? await source() : source;
    } catch {
      throw new SentroyMcpError("mcp_token_unavailable");
    }
    if (
      typeof token !== "string" ||
      !/^mcp_(?:at_)?[A-Za-z0-9_-]{43}$/.test(token)
    )
      throw new SentroyMcpError("invalid_mcp_token");
    return token;
  };
}
const targetUrl = (input: Parameters<typeof fetch>[0]) =>
  new URL(input instanceof Request ? input.url : String(input));
function assertTarget(target: URL, origin: string) {
  if (
    target.origin !== origin ||
    target.username ||
    target.password ||
    target.hash
  )
    throw new SentroyMcpError("invalid_mcp_target");
}
/** Uses the official protocol client; performs no tool calls or user approvals. */
export async function connectSentroyMcp(
  options: SentroyMcpOptions,
): Promise<SentroyMcpConnection> {
  const resource = new URL(sentroyMcpResource(options)),
    app = options.app,
    getToken = credential(options.token),
    fetcher = options.fetch ?? globalThis.fetch;
  if (!fetcher) throw new SentroyMcpError("fetch_unavailable");
  // Fail before constructing a network transport for legacy/malformed credentials.
  await getToken();
  const transport = new StreamableHTTPClientTransport(new URL(resource), {
    reconnectionOptions: {
      maxRetries: 0,
      initialReconnectionDelay: 1000,
      maxReconnectionDelay: 1000,
      reconnectionDelayGrowFactor: 1,
    },
    fetch: async (input, init) => {
      const target = targetUrl(input);
      assertTarget(target, resource.origin);
      if (target.pathname !== resource.pathname || target.search)
        throw new SentroyMcpError("invalid_mcp_target");
      const headers = new Headers(
        init?.headers ?? (input instanceof Request ? input.headers : undefined),
      );
      headers.delete("cookie");
      headers.set("Authorization", `Bearer ${await getToken()}`);
      let response: Response;
      try {
        response = await fetcher(input, {
          ...init,
          headers,
          redirect: "manual",
          credentials: "omit",
        });
      } catch {
        throw new SentroyMcpError("mcp_network_error");
      }
      if (response.status >= 300 && response.status < 400) {
        await response.body?.cancel().catch(() => {});
        throw new SentroyMcpError("mcp_redirect_refused", response.status);
      }
      return response;
    },
  });
  const client = new Client(
    options.clientInfo ?? { name: "sentroy-client-sdk", version: "1" },
  );
  try {
    await client.connect(transport);
  } catch (error) {
    await client.close().catch(() => {});
    if (error instanceof SentroyMcpError) throw error;
    throw new SentroyMcpError(
      "mcp_connection_failed",
      error instanceof StreamableHTTPError ? error.code : undefined,
    );
  }
  return {
    client,
    resource: resource.href,
    close: () => client.close(),
    downloadMailContactsExport: (reference, input) =>
      downloadContactExport(
        { app, resource, getToken, fetcher },
        reference,
        input,
      ),
    uploadMailContactsImport: (reference, body, input) =>
      uploadContactImport(
        { app, resource, getToken, fetcher },
        reference,
        body,
        input,
      ),
    downloadFile: (reference, input) =>
      downloadFile(app, resource, getToken, fetcher, reference, input),
    downloadMailAttachment: (reference, input) =>
      downloadMailAttachment(
        app,
        resource,
        getToken,
        fetcher,
        reference,
        input,
      ),
  };
}
function downloadTarget(resource: URL, reference: SentroyMcpDownloadReference) {
  if (
    !reference ||
    reference.requiresAuthorization !== true ||
    reference.method !== "GET" ||
    typeof reference.downloadUrl !== "string" ||
    reference.downloadUrl.length > 4000 ||
    !objectId.test(reference.file?.id ?? "") ||
    !Number.isSafeInteger(reference.file?.size) ||
    reference.file.size < 0 ||
    reference.file.size > maxDownloadBytes
  )
    throw new SentroyMcpError("invalid_mcp_download");
  let target: URL;
  try {
    target = new URL(reference.downloadUrl);
  } catch {
    throw new SentroyMcpError("invalid_mcp_download");
  }
  assertTarget(target, resource.origin);
  const prefix = resource.pathname + "/files/";
  const path = target.pathname.startsWith(prefix)
    ? target.pathname.slice(prefix.length).split("/")
    : [];
  const keys = [...target.searchParams.keys()],
    version = target.searchParams.get("version"),
    connection = target.searchParams.get("connection");
  if (
    path.length !== 2 ||
    !slug.test(path[0]!) ||
    path[1] !== reference.file.id ||
    keys.length !== 2 ||
    new Set(keys).size !== 2 ||
    keys.some((key) => !["version", "connection"].includes(key)) ||
    !objectId.test(connection ?? "") ||
    !version ||
    !Number.isFinite(Date.parse(version)) ||
    new Date(version).toISOString() !== version
  )
    throw new SentroyMcpError("invalid_mcp_download");
  return target;
}
async function downloadFile(
  app: SentroyMcpApp,
  resource: URL,
  getToken: () => Promise<string>,
  fetcher: typeof fetch,
  reference: SentroyMcpDownloadReference,
  input?: { signal?: AbortSignal; timeoutMs?: number },
) {
  if (app !== "storage")
    throw new SentroyMcpError("mcp_download_not_supported");
  const target = downloadTarget(resource, reference);
  return authenticatedDownload(
    target,
    getToken,
    fetcher,
    { expectedSize: reference.file.size, maxBytes: maxDownloadBytes },
    input,
  );
}
async function downloadCredential(
  getToken: () => Promise<string>,
  signal: AbortSignal,
): Promise<string> {
  if (signal.aborted) throw new SentroyMcpError("mcp_download_aborted");
  return new Promise((resolve, reject) => {
    const abort = () => {
      signal.removeEventListener("abort", abort);
      reject(new SentroyMcpError("mcp_download_aborted"));
    };
    signal.addEventListener("abort", abort, { once: true });
    Promise.resolve()
      .then(getToken)
      .then(
        (token) => {
          signal.removeEventListener("abort", abort);
          resolve(token);
        },
        (error) => {
          signal.removeEventListener("abort", abort);
          reject(error);
        },
      );
  });
}
async function authenticatedDownload(
  target: URL,
  getToken: () => Promise<string>,
  fetcher: typeof fetch,
  policy: { expectedSize?: number; maxBytes: number },
  input?: { signal?: AbortSignal; timeoutMs?: number },
) {
  let expectedSize = policy.expectedSize;
  const timeoutMs = input?.timeoutMs ?? 60000;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 120000)
    throw new SentroyMcpError("invalid_mcp_timeout");
  const controller = new AbortController(),
    abort = () => controller.abort();
  if (input?.signal?.aborted) throw new SentroyMcpError("mcp_download_aborted");
  input?.signal?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(abort, timeoutMs);
  const cleanup = () => {
    clearTimeout(timer);
    input?.signal?.removeEventListener("abort", abort);
  };
  let response: Response | undefined;
  try {
    const token = await downloadCredential(getToken, controller.signal);
    if (controller.signal.aborted)
      throw new SentroyMcpError("mcp_download_aborted");
    response = await fetcher(target, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
      redirect: "manual",
      credentials: "omit",
      signal: controller.signal,
    });
    if (response.status !== 200)
      throw new SentroyMcpError("mcp_download_failed", response.status);
    const declared = response.headers.get("content-length");
    const identityEncoding =
      !response.headers.get("content-encoding") ||
      response.headers.get("content-encoding")?.toLowerCase() === "identity";
    if (
      identityEncoding &&
      declared !== null &&
      (!/^\d+$/.test(declared) ||
        Number(declared) > policy.maxBytes ||
        (expectedSize !== undefined && Number(declared) !== expectedSize))
    )
      throw new SentroyMcpError("mcp_download_size_mismatch");
    if (identityEncoding && expectedSize === undefined && declared !== null)
      expectedSize = Number(declared);
    if (!response.body) {
      if (expectedSize !== undefined && expectedSize !== 0)
        throw new SentroyMcpError("mcp_download_size_mismatch");
      cleanup();
      return new Response(null, {
        headers: { "Content-Type": "application/octet-stream" },
      });
    }
    const reader = response.body.getReader();
    let count = 0,
      finished = false;
    const finish = () => {
      if (!finished) {
        finished = true;
        cleanup();
      }
    };
    const body = new ReadableStream<Uint8Array>({
      async pull(output) {
        try {
          const part = await reader.read();
          if (part.done) {
            if (expectedSize !== undefined && count !== expectedSize)
              throw new SentroyMcpError("mcp_download_size_mismatch");
            output.close();
            finish();
            return;
          }
          count += part.value.byteLength;
          if (
            (expectedSize !== undefined && count > expectedSize) ||
            count > policy.maxBytes
          )
            throw new SentroyMcpError("mcp_download_size_mismatch");
          output.enqueue(part.value);
        } catch {
          controller.abort();
          await reader.cancel().catch(() => {});
          finish();
          output.error(new SentroyMcpError("mcp_download_failed"));
        }
      },
      async cancel() {
        controller.abort();
        await reader.cancel().catch(() => {});
        finish();
      },
    });
    return new Response(body, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        ...(expectedSize === undefined
          ? {}
          : { "Content-Length": String(expectedSize) }),
      },
    });
  } catch (error) {
    controller.abort();
    cleanup();
    await response?.body?.cancel().catch(() => {});
    if (error instanceof SentroyMcpError) throw error;
    throw new SentroyMcpError("mcp_download_failed");
  }
}

function mailDownloadTarget(
  resource: URL,
  reference: SentroyMcpMailAttachmentReference,
) {
  if (!reference) throw new SentroyMcpError("invalid_mcp_download");
  const { downloadUrl, requiresAuthorization, method, maxBytes, attachment } =
    reference;
  const encodedSize = attachment?.encodedSize,
    partId = attachment?.partId;
  if (
    requiresAuthorization !== true ||
    method !== "GET" ||
    typeof downloadUrl !== "string" ||
    downloadUrl.length > 5000 ||
    !Number.isSafeInteger(maxBytes) ||
    maxBytes < 1 ||
    maxBytes > 8 * 1024 * 1024 ||
    !Number.isSafeInteger(encodedSize) ||
    encodedSize < 0 ||
    encodedSize > 12 * 1024 * 1024 ||
    typeof partId !== "string" ||
    !/^\d+(?:\.\d+)*$/.test(partId) ||
    partId.length > 80
  )
    throw new SentroyMcpError("invalid_mcp_download");
  let target: URL;
  try {
    target = new URL(downloadUrl);
  } catch {
    throw new SentroyMcpError("invalid_mcp_download");
  }
  assertTarget(target, resource.origin);
  const prefix = resource.pathname + "/attachments/",
    encoded = target.pathname.startsWith(prefix)
      ? target.pathname.slice(prefix.length)
      : "",
    keys = [...target.searchParams.keys()];
  if (
    !/^[A-Za-z0-9_-]{1,2500}$/.test(encoded) ||
    keys.length !== 2 ||
    new Set(keys).size !== 2 ||
    keys.some((key) => !["connection", "version"].includes(key)) ||
    !objectId.test(target.searchParams.get("connection") ?? "") ||
    !/^[a-f\d]{64}$/.test(target.searchParams.get("version") ?? "")
  )
    throw new SentroyMcpError("invalid_mcp_download");
  try {
    const raw = atob(encoded.replace(/-/g, "+").replace(/_/g, "/")),
      decoded = JSON.parse(
        new TextDecoder("utf-8", { fatal: true }).decode(
          Uint8Array.from(raw, (char) => char.charCodeAt(0)),
        ),
      ) as Record<string, unknown>;
    const ref = decoded.reference as Record<string, unknown>;
    if (
      !decoded ||
      Object.keys(decoded).sort().join(",") !== "partId,reference" ||
      decoded.partId !== partId ||
      !ref ||
      Object.keys(ref).sort().join(",") !==
        "companyId,folder,mailbox,uid,uidValidity" ||
      typeof ref.companyId !== "string" ||
      !ref.companyId ||
      ref.companyId.length > 100 ||
      /[\r\n\0]/.test(ref.companyId) ||
      typeof ref.mailbox !== "string" ||
      ref.mailbox.length > 320 ||
      !/^[^\s@]+@[^\s@]+$/.test(ref.mailbox) ||
      typeof ref.folder !== "string" ||
      !ref.folder ||
      ref.folder.length > 512 ||
      ref.folder.startsWith("__") ||
      /[\r\n\0]/.test(ref.folder) ||
      typeof ref.uidValidity !== "string" ||
      !/^[1-9]\d{0,19}$/.test(ref.uidValidity) ||
      typeof ref.uid !== "number" ||
      !Number.isInteger(ref.uid) ||
      ref.uid < 1 ||
      ref.uid > 4294967295
    )
      throw Error("invalid");
  } catch {
    throw new SentroyMcpError("invalid_mcp_download");
  }
  return { target, maxBytes };
}
async function downloadMailAttachment(
  app: SentroyMcpApp,
  resource: URL,
  getToken: () => Promise<string>,
  fetcher: typeof fetch,
  reference: SentroyMcpMailAttachmentReference,
  input?: { signal?: AbortSignal; timeoutMs?: number },
) {
  if (app !== "mail") throw new SentroyMcpError("mcp_download_not_supported");
  const selected = mailDownloadTarget(resource, reference);
  return authenticatedDownload(
    selected.target,
    getToken,
    fetcher,
    { maxBytes: selected.maxBytes },
    input,
  );
}
