export class SentroyMcpError extends Error {
  constructor(
    readonly code: string,
    readonly status?: number,
  ) {
    super(code);
    this.name = "SentroyMcpError";
  }
}
