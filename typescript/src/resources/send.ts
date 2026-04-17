import type { HttpClient } from "../http"
import type { SendParams, SendResult } from "../types"

export class Send {
  constructor(private http: HttpClient) {}

  /** Send an email */
  async email(params: SendParams): Promise<SendResult> {
    return this.http.post<SendResult>("/send", params)
  }
}
