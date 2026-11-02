import { SentroyMcpError } from "./errors";
import {
  hashPrivateFile,
  snapshotPrivateFile,
  transferPrivateFile,
  readPrivateFile,
} from "./private-files";
import type {
  PrivateFileBody,
  PrivateFileContext,
  TransferOptions,
} from "./private-files";

export type SentroyMcpStorageUploadBody = PrivateFileBody;
const extensions = {
  "application/pdf": ["pdf"],
  "image/jpeg": ["jpg", "jpeg"],
  "image/png": ["png"],
  "image/webp": ["webp"],
  "text/plain": ["txt", "log"],
  "text/csv": ["csv"],
  "audio/mpeg": ["mp3"],
  "audio/wav": ["wav"],
  "audio/ogg": ["ogg", "oga"],
  "audio/mp4": ["m4a", "mp4"],
  "audio/webm": ["webm"],
  "video/mp4": ["mp4"],
  "video/webm": ["webm"],
  "video/quicktime": ["mov"],
} as const;
export type SentroyMcpStorageUploadMimeType = keyof typeof extensions;
export interface SentroyMcpStorageUploadFileInfo {
  name: string;
  mimeType: SentroyMcpStorageUploadMimeType;
  bytes: number;
  sha256: string;
}
export interface SentroyMcpStorageUploadMetadata extends SentroyMcpStorageUploadFileInfo {
  uploadId: string;
  bucket: { id: string; slug: string; revision: string };
  state: "waiting" | "ready";
  revision: string;
  expiresAt: string;
  published: false;
  malwareScanned: false;
  requiresHumanApproval: true;
}
export interface SentroyMcpStorageUploadReference extends SentroyMcpStorageUploadMetadata {
  uploadUrl: string;
  method: "PUT";
  contentType: "application/octet-stream";
  requiresOriginalBearer: true;
}
const cap = 10 * 1024 * 1024;
const hex = /^[a-f\d]{64}$/;
const uuid =
  /^[a-f\d]{8}-[a-f\d]{4}-[1-8][a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/;
function validName(name: unknown, mimeType: unknown) {
  if (
    typeof name !== "string" ||
    typeof mimeType !== "string" ||
    !Object.hasOwn(extensions, mimeType)
  )
    return false;
  const dot = name.lastIndexOf(".");
  return (
    name.length >= 1 &&
    name.length <= 200 &&
    name.trim() === name &&
    !/[/\\\u0000-\u001f\u007f]/.test(name) &&
    dot > 0 &&
    new TextDecoder().decode(new TextEncoder().encode(name)) === name &&
    (
      extensions[
        mimeType as SentroyMcpStorageUploadMimeType
      ] as readonly string[]
    ).includes(name.slice(dot + 1).toLowerCase())
  );
}
function future(value: unknown): value is string {
  return (
    typeof value === "string" &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString() === value &&
    Date.parse(value) > Date.now()
  );
}
/** Local manifest only; no upload, publication, scan or credential acquisition. */
export async function sentroyMcpStorageUploadFileInfo(
  body: SentroyMcpStorageUploadBody,
  input: Pick<SentroyMcpStorageUploadFileInfo, "name" | "mimeType">,
): Promise<SentroyMcpStorageUploadFileInfo> {
  const name = input?.name,
    mimeType = input?.mimeType;
  if (!validName(name, mimeType))
    throw new SentroyMcpError("invalid_mcp_storage_upload");
  try {
    const bytes = await snapshotPrivateFile(
      body,
      cap,
      "invalid_mcp_storage_upload",
    );
    return {
      name,
      mimeType,
      bytes: bytes.byteLength,
      sha256: await hashPrivateFile(bytes),
    };
  } catch (error) {
    if (error instanceof SentroyMcpError) throw error;
    throw new SentroyMcpError("invalid_mcp_storage_upload");
  }
}
function metadata(value: SentroyMcpStorageUploadMetadata) {
  return (
    !!value &&
    uuid.test(value.uploadId) &&
    validName(value.name, value.mimeType) &&
    Number.isSafeInteger(value.bytes) &&
    value.bytes >= 1 &&
    value.bytes <= cap &&
    hex.test(value.sha256) &&
    hex.test(value.revision) &&
    !!value.bucket &&
    /^[a-f\d]{24}$/.test(value.bucket.id) &&
    /^[a-z0-9][a-z0-9_-]{0,99}$/.test(value.bucket.slug) &&
    hex.test(value.bucket.revision) &&
    ["waiting", "ready"].includes(value.state) &&
    future(value.expiresAt) &&
    value.published === false &&
    value.malwareScanned === false &&
    value.requiresHumanApproval === true
  );
}
/** Original-grant transfer only. This does not call a tool or approve a write. */
export async function uploadStorageFile(
  context: PrivateFileContext,
  raw: SentroyMcpStorageUploadReference,
  body: SentroyMcpStorageUploadBody,
  input?: TransferOptions,
): Promise<SentroyMcpStorageUploadMetadata & { state: "ready" }> {
  if (context.app !== "storage")
    throw new SentroyMcpError("mcp_storage_upload_not_supported");
  // Freeze every compared field before local hashing or a credential callback.
  const ref = raw && { ...raw, bucket: raw.bucket && { ...raw.bucket } };
  if (
    !metadata(ref) ||
    ref.requiresOriginalBearer !== true ||
    ref.method !== "PUT" ||
    ref.contentType !== "application/octet-stream" ||
    typeof ref.uploadUrl !== "string" ||
    ref.uploadUrl.length > 4000
  )
    throw new SentroyMcpError("invalid_mcp_storage_upload_reference");
  let url: URL;
  try {
    url = new URL(ref.uploadUrl);
  } catch {
    throw new SentroyMcpError("invalid_mcp_storage_upload_reference");
  }
  if (
    url.origin !== context.resource.origin ||
    url.username ||
    url.password ||
    url.hash ||
    url.pathname !== `${context.resource.pathname}/uploads/${ref.uploadId}` ||
    [...url.searchParams.keys()].length !== 1 ||
    !/^[a-f\d]{24}$/.test(url.searchParams.get("connection") ?? "")
  )
    throw new SentroyMcpError("invalid_mcp_storage_upload_reference");
  return transferPrivateFile(
    context,
    "upload",
    input,
    async (signal, token, remember) => {
      const data = await snapshotPrivateFile(
        body,
        cap,
        "invalid_mcp_storage_upload",
      );
      if (data.byteLength !== ref.bytes)
        throw new SentroyMcpError("mcp_storage_upload_size_mismatch");
      if ((await hashPrivateFile(data)) !== ref.sha256)
        throw new SentroyMcpError("mcp_storage_upload_hash_mismatch");
      if (!future(ref.expiresAt))
        throw new SentroyMcpError("invalid_mcp_storage_upload_reference");
      const bearer = await token();
      if (!future(ref.expiresAt))
        throw new SentroyMcpError("invalid_mcp_storage_upload_reference");
      const response = await context.fetcher(url, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${bearer}`,
          "Content-Type": ref.contentType,
        },
        body: data,
        redirect: "manual",
        credentials: "omit",
        cache: "no-store",
        signal,
      });
      remember(response);
      if (response.status !== 200)
        throw new SentroyMcpError("mcp_upload_failed", response.status);
      if (
        response.headers.get("content-type")?.split(";")[0]?.trim() !==
        "application/json"
      )
        throw new SentroyMcpError("invalid_mcp_storage_upload_response");
      const bytes = await readPrivateFile(
        response,
        4096,
        signal,
        undefined,
        "mcp_storage_upload",
      );
      let result: SentroyMcpStorageUploadMetadata;
      try {
        result = JSON.parse(
          new TextDecoder("utf-8", { fatal: true }).decode(bytes),
        );
      } catch {
        throw new SentroyMcpError("invalid_mcp_storage_upload_response");
      }
      if (
        !metadata(result) ||
        result.state !== "ready" ||
        result.uploadId !== ref.uploadId ||
        result.bytes !== ref.bytes ||
        result.sha256 !== ref.sha256 ||
        result.name !== ref.name ||
        result.mimeType !== ref.mimeType ||
        result.expiresAt !== ref.expiresAt ||
        result.bucket.id !== ref.bucket.id ||
        result.bucket.slug !== ref.bucket.slug ||
        result.bucket.revision !== ref.bucket.revision
      )
        throw new SentroyMcpError("invalid_mcp_storage_upload_response");
      return {
        uploadId: ref.uploadId,
        name: ref.name,
        mimeType: ref.mimeType,
        bytes: ref.bytes,
        sha256: ref.sha256,
        bucket: { ...ref.bucket },
        state: "ready",
        revision: result.revision,
        expiresAt: ref.expiresAt,
        published: false,
        malwareScanned: false,
        requiresHumanApproval: true,
      };
    },
  );
}
