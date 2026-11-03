import { SentroyMcpError } from "./errors";

export type PrivateFileBody = Uint8Array | ArrayBuffer | Blob;
export interface PrivateFileContext {
  app: string;
  resource: URL;
  getToken: () => Promise<string>;
  fetcher: typeof fetch;
}
export type TransferOptions = { signal?: AbortSignal; timeoutMs?: number };
export async function hashPrivateFile(bytes: Uint8Array<ArrayBuffer>) {
  if (!globalThis.crypto?.subtle)
    throw new SentroyMcpError("mcp_crypto_unavailable");
  const value = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(value), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}
export async function snapshotPrivateFile(
  body: PrivateFileBody,
  cap: number,
  invalidCode: string,
) {
  let bytes: Uint8Array<ArrayBuffer>;
  if (body instanceof Uint8Array) {
    if (body.byteLength < 1 || body.byteLength > cap)
      throw new SentroyMcpError(invalidCode);
    bytes = Uint8Array.from(body);
  } else if (body instanceof ArrayBuffer) {
    if (body.byteLength < 1 || body.byteLength > cap)
      throw new SentroyMcpError(invalidCode);
    bytes = new Uint8Array(body.slice(0));
  } else if (typeof Blob !== "undefined" && body instanceof Blob) {
    if (body.size < 1 || body.size > cap)
      throw new SentroyMcpError(invalidCode);
    bytes = new Uint8Array(await body.arrayBuffer());
  } else throw new SentroyMcpError(invalidCode);
  if (bytes.byteLength < 1 || bytes.byteLength > cap)
    throw new SentroyMcpError(invalidCode);
  return bytes;
}
/** One bounded request, including credential acquisition, hashing and response consumption. No retry or redirect. */
export async function transferPrivateFile<T>(
  context: Pick<PrivateFileContext, "getToken">,
  mode: "download" | "upload",
  input: TransferOptions | undefined,
  work: (
    signal: AbortSignal,
    token: () => Promise<string>,
    remember: (response: Response) => void,
  ) => Promise<T>,
) {
  const ms = input?.timeoutMs ?? (mode === "upload" ? 15000 : 60000);
  if (!Number.isSafeInteger(ms) || ms < 1 || ms > 120000)
    throw new SentroyMcpError("invalid_mcp_timeout");
  const controller = new AbortController(),
    abortedError = () => new SentroyMcpError(`mcp_${mode}_aborted`);
  if (input?.signal?.aborted) throw abortedError();
  const abort = () => controller.abort();
  let rejectAbort: (error: SentroyMcpError) => void = () => {};
  const onAbort = () => rejectAbort(abortedError());
  const cancellation = new Promise<never>((_, reject) => {
    rejectAbort = reject;
  });
  input?.signal?.addEventListener("abort", abort, { once: true });
  controller.signal.addEventListener("abort", onAbort, { once: true });
  const timer = setTimeout(abort, ms);
  let response: Response | undefined;
  const check = () => {
    if (controller.signal.aborted) throw abortedError();
  };
  try {
    return await Promise.race([
      work(
        controller.signal,
        async () => {
          check();
          const token = await context.getToken();
          check();
          return token;
        },
        (value) => {
          response = value;
          if (controller.signal.aborted)
            void value.body?.cancel().catch(() => {});
        },
      ),
      cancellation,
    ]);
  } catch (error) {
    controller.abort();
    void response?.body?.cancel().catch(() => {});
    if (error instanceof SentroyMcpError) throw error;
    throw new SentroyMcpError(`mcp_${mode}_failed`);
  } finally {
    clearTimeout(timer);
    input?.signal?.removeEventListener("abort", abort);
    controller.signal.removeEventListener("abort", onAbort);
  }
}
export async function readPrivateFile(
  response: Response,
  max: number,
  signal: AbortSignal,
  expected?: number,
  errorPrefix = "mcp_contact_file",
) {
  const declared = response.headers.get("content-length"),
    encoding = response.headers.get("content-encoding")?.toLowerCase();
  if (
    (!encoding || encoding === "identity") &&
    declared !== null &&
    (!/^\d+$/.test(declared) ||
      Number(declared) > max ||
      (expected !== undefined && Number(declared) !== expected))
  )
    throw new SentroyMcpError(`${errorPrefix}_size_mismatch`);
  if (!response.body) {
    if (expected) throw new SentroyMcpError(`${errorPrefix}_size_mismatch`);
    return new Uint8Array(0);
  }
  const reader = response.body.getReader(),
    chunks: Uint8Array[] = [];
  let count = 0;
  const abort = () => {
    void reader.cancel().catch(() => {});
  };
  signal.addEventListener("abort", abort, { once: true });
  try {
    while (true) {
      if (signal.aborted) throw new SentroyMcpError(`${errorPrefix}_aborted`);
      const part = await reader.read();
      if (part.done) break;
      count += part.value.byteLength;
      if (count > max || (expected !== undefined && count > expected))
        throw new SentroyMcpError(`${errorPrefix}_size_mismatch`);
      chunks.push(part.value);
    }
    if (expected !== undefined && count !== expected)
      throw new SentroyMcpError(`${errorPrefix}_size_mismatch`);
    const result = new Uint8Array(count);
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return result;
  } catch (error) {
    void reader.cancel().catch(() => {});
    throw error;
  } finally {
    signal.removeEventListener("abort", abort);
    reader.releaseLock();
  }
}
