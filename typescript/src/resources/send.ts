import type { HttpClient } from "../http"
import {
  composeRequestId,
  ComposeRequestError,
  hasBcc,
} from "./compose-request"
import type { SendParams, SendResult } from "../types"

export class Send {
  constructor(private http: HttpClient) {}

  /** Send an email */
  async email(params: SendParams): Promise<SendResult> {
    if (hasBcc(params.bcc)) {
      const requestId = composeRequestId(params.requestId)
      try {
        return {
          ...(await this.http.postOnce<SendResult>("/send-bcc", {
            ...params,
            requestId,
          })),
          requestId,
        }
      } catch (cause) {
        throw new ComposeRequestError(requestId, cause)
      }
    }
    const { bcc, requestId, ...body } = params
    if (Array.isArray(params.to)) {
      if (!params.to.length)
        throw Error("At least one To or BCC recipient is required")
      if (params.to.length === 1)
        return this.http.post<SendResult>("/send", {
          ...body,
          to: params.to[0],
        })
      const { to, variables, ...batch } = body
      return this.http.post<SendResult>("/send", {
        ...batch,
        recipients: params.to.map((to) => ({ to, variables })),
      })
    }
    return this.http.post<SendResult>("/send", body)
  }
}
