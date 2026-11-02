import { SentroyMcpError } from "./errors";
import {
  hashPrivateFile,
  snapshotPrivateFile,
  transferPrivateFile,
  readPrivateFile,
} from "./private-files";
import type { PrivateFileContext, TransferOptions } from "./private-files";

export type SentroyMcpContactFileBody = Uint8Array | ArrayBuffer | Blob;
export interface SentroyMcpContactExportReference {
  exportId: string;
  format: "jsonl" | "csv";
  bytes: number;
  fileHash: string;
  expiresAt: string;
  downloadUrl: string;
  requiresOriginalBearer: true;
}
export interface SentroyMcpContactImportReference {
  uploadId: string;
  bytes: number;
  fileHash: string;
  expiresAt: string;
  uploadUrl: string;
  requiresOriginalBearer: true;
}
export interface SentroyMcpContactImportUploaded {
  uploadId: string;
  state: "ready";
  count: number;
  fileHash: string;
  expiresAt: string;
}
const uploadFailureReasons = [
  "contact_import_columns",
  "contact_import_row_limit",
  "contact_import_csv_invalid",
  "contact_import_csv_columns",
  "contact_import_csv_escaped_email",
  "contact_import_tags_invalid",
  "contact_import_utf8_invalid",
  "contact_import_nul",
  "contact_import_json_invalid",
  "contact_import_row_invalid",
  "contact_import_duplicate_email",
  "contact_import_normalized_too_large",
  "contact_import_file_hash_mismatch",
  "contact_import_upload_size_mismatch",
  "contact_import_upload_too_large",
] as const;
export class SentroyMcpContactImportError extends SentroyMcpError {
  constructor(
    status: number,
    readonly reason?: (typeof uploadFailureReasons)[number],
    readonly row?: number,
  ) {
    super("mcp_upload_failed", status);
    this.name = "SentroyMcpContactImportError";
  }
}
export interface ContactFileContext extends PrivateFileContext {}
const cap = 1024 * 1024;
const uuid =
  /^[a-f\d]{8}-[a-f\d]{4}-[1-8][a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/;
const hex = /^[a-f\d]{64}$/;
function expiry(value: string) {
  return (
    typeof value === "string" &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString() === value &&
    Date.parse(value) > Date.now()
  );
}
/** Local metadata only. Pass this result to upload_create, never the raw body. */
export async function sentroyMcpContactImportFileInfo(
  body: SentroyMcpContactFileBody,
  format: "csv" | "jsonl",
) {
  if (!["csv", "jsonl"].includes(format))
    throw new SentroyMcpError("invalid_mcp_contact_file");
  try {
    const bytes = await snapshotPrivateFile(
      body,
      cap,
      "invalid_mcp_contact_file",
    );
    return {
      format,
      bytes: bytes.byteLength,
      fileHash: await hashPrivateFile(bytes),
    };
  } catch (error) {
    if (error instanceof SentroyMcpError) throw error;
    throw new SentroyMcpError("invalid_mcp_contact_file");
  }
}
function target(
  context: ContactFileContext,
  raw: string,
  kind: "exports" | "imports",
  id: string,
  fileHash: string,
) {
  if (context.app !== "mail")
    throw new SentroyMcpError("mcp_contact_files_not_supported");
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new SentroyMcpError("invalid_mcp_contact_file_reference");
  }
  const keys = [...url.searchParams.keys()];
  if (
    typeof raw !== "string" ||
    raw.length > 4000 ||
    !uuid.test(id) ||
    !hex.test(fileHash) ||
    url.origin !== context.resource.origin ||
    url.username ||
    url.password ||
    url.hash ||
    url.pathname !== `${context.resource.pathname}/contacts/${kind}/${id}` ||
    !/^[a-f\d]{24}$/.test(url.searchParams.get("connection") ?? "") ||
    keys.length !== (kind === "exports" ? 2 : 1) ||
    new Set(keys).size !== keys.length ||
    keys.some(
      (key) =>
        !["connection", ...(kind === "exports" ? ["hash"] : [])].includes(key),
    ) ||
    (kind === "exports" && url.searchParams.get("hash") !== fileHash)
  )
    throw new SentroyMcpError("invalid_mcp_contact_file_reference");
  return url;
}
function reference(
  raw: SentroyMcpContactExportReference | SentroyMcpContactImportReference,
) {
  if (
    !raw ||
    raw.requiresOriginalBearer !== true ||
    !Number.isSafeInteger(raw.bytes) ||
    raw.bytes < 0 ||
    raw.bytes > cap ||
    !expiry(raw.expiresAt)
  )
    throw new SentroyMcpError("invalid_mcp_contact_file_reference");
}
export async function downloadContactExport(
  context: ContactFileContext,
  raw: SentroyMcpContactExportReference,
  input?: TransferOptions,
) {
  // Snapshot before any credential callback can mutate the caller's object.
  const ref = raw && { ...raw };
  reference(ref);
  if (!["csv", "jsonl"].includes(ref.format))
    throw new SentroyMcpError("invalid_mcp_contact_file_reference");
  const url = target(
    context,
    ref.downloadUrl,
    "exports",
    ref.exportId,
    ref.fileHash,
  );
  return transferPrivateFile(
    context,
    "download",
    input,
    async (signal, token, remember) => {
      const response = await context.fetcher(url, {
        method: "GET",
        headers: { Authorization: `Bearer ${await token()}` },
        redirect: "manual",
        credentials: "omit",
        signal,
      });
      remember(response);
      if (response.status !== 200)
        throw new SentroyMcpError("mcp_download_failed", response.status);
      const data = await readPrivateFile(response, cap, signal, ref.bytes);
      if ((await hashPrivateFile(data)) !== ref.fileHash)
        throw new SentroyMcpError("mcp_contact_file_hash_mismatch");
      return new Response(data, {
        headers: {
          "Content-Type": "application/octet-stream",
          "Content-Length": String(data.byteLength),
          "Content-Disposition": `attachment; filename="contacts.${ref.format}"`,
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff",
        },
      });
    },
  );
}
export async function uploadContactImport(
  context: ContactFileContext,
  raw: SentroyMcpContactImportReference,
  body: SentroyMcpContactFileBody,
  input?: TransferOptions,
) {
  const ref = raw && { ...raw };
  reference(ref);
  if (ref.bytes < 1)
    throw new SentroyMcpError("invalid_mcp_contact_file_reference");
  const url = target(
    context,
    ref.uploadUrl,
    "imports",
    ref.uploadId,
    ref.fileHash,
  );
  return transferPrivateFile(
    context,
    "upload",
    input,
    async (signal, token, remember) => {
      const data = await snapshotPrivateFile(
        body,
        cap,
        "invalid_mcp_contact_file",
      );
      if (data.byteLength !== ref.bytes)
        throw new SentroyMcpError("mcp_contact_file_size_mismatch");
      if ((await hashPrivateFile(data)) !== ref.fileHash)
        throw new SentroyMcpError("mcp_contact_file_hash_mismatch");
      if (signal.aborted) throw new SentroyMcpError("mcp_upload_aborted");
      const response = await context.fetcher(url, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${await token()}`,
          "Content-Type": "application/octet-stream",
        },
        body: data,
        redirect: "manual",
        credentials: "omit",
        signal,
      });
      remember(response);
      if (response.status !== 200) {
        if ([400, 409, 413, 422].includes(response.status)) {
          const bytes = await readPrivateFile(response, 4096, signal);
          let reason: (typeof uploadFailureReasons)[number] | undefined,
            row: number | undefined;
          try {
            const result = JSON.parse(
              new TextDecoder("utf-8", { fatal: true }).decode(bytes),
            );
            if (result && uploadFailureReasons.includes(result.error)) {
              reason = result.error;
              if (
                Number.isInteger(result.row) &&
                result.row > 0 &&
                result.row <= 1048576
              )
                row = result.row;
            }
          } catch {
            /* No remote diagnostic body becomes an error message. */
          }
          throw new SentroyMcpContactImportError(response.status, reason, row);
        }
        throw new SentroyMcpError("mcp_upload_failed", response.status);
      }
      const bytes = await readPrivateFile(response, 4096, signal);
      let result: SentroyMcpContactImportUploaded;
      try {
        result = JSON.parse(
          new TextDecoder("utf-8", { fatal: true }).decode(bytes),
        );
      } catch {
        throw new SentroyMcpError("invalid_mcp_contact_upload_response");
      }
      if (
        !result ||
        result.uploadId !== ref.uploadId ||
        result.state !== "ready" ||
        result.fileHash !== ref.fileHash ||
        !Number.isInteger(result.count) ||
        result.count < 1 ||
        result.count > 100 ||
        result.expiresAt !== ref.expiresAt ||
        !expiry(result.expiresAt)
      )
        throw new SentroyMcpError("invalid_mcp_contact_upload_response");
      return {
        uploadId: ref.uploadId,
        state: "ready",
        count: result.count,
        fileHash: ref.fileHash,
        expiresAt: ref.expiresAt,
      } satisfies SentroyMcpContactImportUploaded;
    },
  );
}
