<?php

namespace Sentroy\ClientSdk;

/**
 * WhatsApp Santral — send template-based messages, manage templates &
 * audiences, list connected numbers, and read send logs. Uses the same
 * stk_ access token as mail and storage.
 */
class WhatsApp
{
    /** @var HttpClient */
    private $http;

    /** @var WhatsAppNumbers */
    public $numbers;

    /** @var WhatsAppTemplates */
    public $templates;

    /** @var WhatsAppAudiences */
    public $audiences;

    /** @var WhatsAppLogs */
    public $logs;

    public function __construct(HttpClient $http)
    {
        $this->http = $http;
        $this->numbers = new WhatsAppNumbers($http);
        $this->templates = new WhatsAppTemplates($http);
        $this->audiences = new WhatsAppAudiences($http);
        $this->logs = new WhatsAppLogs($http);
    }

    /**
     * Send a WhatsApp message to a single recipient ("to") or a whole
     * audience ("audienceId"), rendering a template ("templateId") or a
     * raw "body" with {{variables}}. Returns a per-recipient result
     * summary.
     *
     * @param array $params {
     *     @type string $from       Optional — a connected number's sessionId
     *                              or phoneNumber; omit to use the company's
     *                              only connected number
     *     @type string $to         Optional — single E.164 recipient
     *                              (provide "to" OR "audienceId")
     *     @type string $audienceId Optional — bulk send to a saved audience
     *     @type string $templateId Optional — provide "templateId" OR "body"
     *     @type string $body       Optional — raw message with {{variables}}
     *     @type array  $variables  Optional — global values, merged under
     *                              per-recipient audience variables
     * }
     * @return array { total, sent, failed, results }
     */
    public function send(array $params)
    {
        return $this->http->post('/send', $params);
    }
}
