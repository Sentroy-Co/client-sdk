<?php

namespace Sentroy\ClientSdk;

class Send
{
    /** @var HttpClient */
    private $http;

    public function __construct(HttpClient $http)
    {
        $this->http = $http;
    }

    /**
     * Send an email.
     *
     * @param array $params {
     *     @type string|string[] $to
     *     @type string          $from
     *     @type string          $subject
     *     @type string          $domainId
     *     @type string|string[] $cc
     *     @type string          $templateId
     *     @type string          $html
     *     @type string          $text
     *     @type array           $variables
     *     @type string          $lang
     *     @type string          $replyTo
     *     @type array           $attachments  [{filename, content, contentType}]
     *     @type string          $scheduledAt
     *     @type array           $headers
     *     @type string          $inReplyTo
     *     @type string[]        $references
     * }
     * @return array
     */
    public function email(array $params)
    {
        return $this->http->post('/send', $params);
    }
}
