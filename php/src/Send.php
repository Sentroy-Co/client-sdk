<?php

declare(strict_types=1);

namespace Sentroy\ClientSdk;

class Send
{
  private HttpClient $http;

  public function __construct(HttpClient $http)
  {
    $this->http = $http;
  }

  /**
   * Send an email.
   *
   * @param array{
   *   to: string|string[],
   *   from: string,
   *   subject: string,
   *   domainId: string,
   *   cc?: string|string[],
   *   templateId?: string,
   *   html?: string,
   *   text?: string,
   *   variables?: array<string, string>,
   *   replyTo?: string,
   *   attachments?: array<array{filename: string, content: string, contentType?: string}>,
   *   scheduledAt?: string,
   *   headers?: array<string, string>,
   *   inReplyTo?: string,
   *   references?: string[],
   * } $params
   */
  public function email(array $params): array
  {
    return $this->http->post("/send", $params);
  }
}
