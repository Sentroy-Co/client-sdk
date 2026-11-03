/** Contains the original UUID so a caller can inspect/retry an ambiguous request safely. */
export class ComposeRequestError extends Error {
  constructor(
    readonly requestId: string,
    cause: unknown,
  ) {
    super("Compose request failed; retain requestId before retrying", { cause })
    this.name = "ComposeRequestError"
  }
}
export function composeRequestId(value?: string) {
  if (value) {
    if (
      !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(
        value,
      )
    )
      throw Error("requestId must be a UUID")
    return value.toLowerCase()
  }
  if (!globalThis.crypto?.randomUUID)
    throw Error("Provide requestId on runtimes without crypto.randomUUID")
  return globalThis.crypto.randomUUID()
}
export function hasBcc(value?: string | string[]) {
  return Array.isArray(value) ? value.length > 0 : !!value?.trim()
}
