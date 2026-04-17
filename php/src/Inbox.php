<?php

declare(strict_types=1);

namespace Sentroy\ClientSdk;

class Inbox
{
  private HttpClient $http;

  public function __construct(HttpClient $http)
  {
    $this->http = $http;
  }

  /**
   * List messages in a mailbox folder.
   *
   * @param array{mailbox?: string, folder?: string, page?: int, limit?: int, unreadOnly?: bool} $params
   */
  public function list(array $params = []): array
  {
    $query = [];
    if (isset($params["mailbox"])) $query["mailbox"] = $params["mailbox"];
    if (isset($params["folder"])) $query["folder"] = $params["folder"];
    if (isset($params["page"])) $query["page"] = $params["page"];
    if (isset($params["limit"])) $query["limit"] = $params["limit"];
    if (!empty($params["unreadOnly"])) $query["unreadOnly"] = "true";

    return $this->http->get("/inbox", $query);
  }

  /**
   * Get a single message detail.
   *
   * @param array{mailbox?: string, folder?: string} $options
   */
  public function get(int $uid, array $options = []): array
  {
    $query = [];
    if (isset($options["mailbox"])) $query["mailbox"] = $options["mailbox"];
    if (isset($options["folder"])) $query["folder"] = $options["folder"];

    return $this->http->get("/inbox/{$uid}", $query);
  }

  /** List IMAP folders (mailboxes) for a given email account */
  public function listFolders(?string $mailbox = null): array
  {
    $query = [];
    if ($mailbox !== null) $query["mailbox"] = $mailbox;

    return $this->http->get("/inbox/mailboxes", $query);
  }

  /** Get thread messages by subject */
  public function getThread(string $subject, ?string $mailbox = null): array
  {
    $query = ["subject" => $subject];
    if ($mailbox !== null) $query["mailbox"] = $mailbox;

    return $this->http->get("/inbox/thread", $query);
  }

  /**
   * Mark a message as read.
   *
   * @param array{mailbox?: string, folder?: string} $options
   */
  public function markAsRead(int $uid, array $options = []): void
  {
    $this->http->post("/inbox/{$uid}/read", [
      "mailbox" => $options["mailbox"] ?? null,
      "folder" => $options["folder"] ?? null,
    ]);
  }

  /**
   * Mark a message as unread.
   *
   * @param array{mailbox?: string, folder?: string} $options
   */
  public function markAsUnread(int $uid, array $options = []): void
  {
    $query = [];
    if (isset($options["mailbox"])) $query["mailbox"] = $options["mailbox"];
    if (isset($options["folder"])) $query["folder"] = $options["folder"];

    $this->http->delete("/inbox/{$uid}/read", $query);
  }

  /**
   * Move a message to another folder.
   *
   * @param array{from?: string, mailbox?: string} $options
   */
  public function move(int $uid, string $to, array $options = []): void
  {
    $this->http->post("/inbox/{$uid}/move", [
      "to" => $to,
      "from" => $options["from"] ?? null,
      "mailbox" => $options["mailbox"] ?? null,
    ]);
  }

  /**
   * Delete a message.
   *
   * @param array{mailbox?: string, folder?: string} $options
   */
  public function delete(int $uid, array $options = []): void
  {
    $query = [];
    if (isset($options["mailbox"])) $query["mailbox"] = $options["mailbox"];
    if (isset($options["folder"])) $query["folder"] = $options["folder"];

    $this->http->delete("/inbox/{$uid}", $query);
  }
}
