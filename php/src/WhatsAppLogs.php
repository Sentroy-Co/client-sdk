<?php

namespace Sentroy\ClientSdk;

/**
 * WhatsApp send logs. Accessed via Sentroy::$whatsapp->logs.
 */
class WhatsAppLogs
{
    /** @var HttpClient */
    private $http;

    public function __construct(HttpClient $http)
    {
        $this->http = $http;
    }

    /**
     * List send-log entries.
     *
     * @param array $params {
     *     @type int    $page       Optional
     *     @type int    $limit      Optional
     *     @type string $status     Optional — "queued", "sent", "failed"
     *     @type string $sessionId  Optional
     *     @type string $templateId Optional
     * }
     * @return array { data, page, limit, total }
     */
    public function getAll(array $params = array())
    {
        $query = array();
        if (isset($params['page'])) {
            $query['page'] = $params['page'];
        }
        if (isset($params['limit'])) {
            $query['limit'] = $params['limit'];
        }
        if (isset($params['status'])) {
            $query['status'] = $params['status'];
        }
        if (isset($params['sessionId'])) {
            $query['sessionId'] = $params['sessionId'];
        }
        if (isset($params['templateId'])) {
            $query['templateId'] = $params['templateId'];
        }
        return $this->http->get('/logs', $query);
    }
}
