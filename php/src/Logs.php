<?php

namespace Sentroy\ClientSdk;

class Logs
{
    /** @var HttpClient */
    private $http;

    public function __construct(HttpClient $http)
    {
        $this->http = $http;
    }

    /**
     * List mail-log entries. Filter by status, domain, and ISO timestamp
     * range ("from" / "to", both inclusive). Results are paginated
     * server-side; pass "page" and "limit" to walk a large window.
     *
     * @param array $params {
     *     @type int    $page     Optional
     *     @type int    $limit    Optional
     *     @type string $status   Optional — "queued", "processing", "sent", "bounced", "failed"
     *     @type string $domainId Optional
     *     @type string $from     Optional — ISO timestamp, inclusive
     *     @type string $to       Optional — ISO timestamp, inclusive
     * }
     * @return array
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
        if (isset($params['domainId'])) {
            $query['domainId'] = $params['domainId'];
        }
        if (isset($params['from'])) {
            $query['from'] = $params['from'];
        }
        if (isset($params['to'])) {
            $query['to'] = $params['to'];
        }
        return $this->http->get('/logs', $query);
    }

    /**
     * Get a single mail-log entry by id.
     *
     * @param string $id
     * @return array
     */
    public function get($id)
    {
        return $this->http->get('/logs/' . rawurlencode($id));
    }
}
