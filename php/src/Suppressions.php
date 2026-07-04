<?php

namespace Sentroy\ClientSdk;

class Suppressions
{
    /** @var HttpClient */
    private $http;

    public function __construct(HttpClient $http)
    {
        $this->http = $http;
    }

    /**
     * List suppressions across the company (or a single domain).
     * Suppressed recipients are skipped at send time — every entry here
     * is one address that will not receive mail until removed.
     *
     * @param array $params {
     *     @type int    $page     Optional
     *     @type int    $limit    Optional
     *     @type string $domainId Optional
     *     @type string $reason   Optional
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
        if (isset($params['domainId'])) {
            $query['domainId'] = $params['domainId'];
        }
        if (isset($params['reason'])) {
            $query['reason'] = $params['reason'];
        }
        return $this->http->get('/suppressions', $query);
    }

    /**
     * Manually suppress an address (e.g. honoring an off-platform
     * opt-out). Bounces and complaints are added automatically by the
     * mail server.
     *
     * @param array $params {
     *     @type string $email    Required
     *     @type string $reason   Optional
     *     @type string $domainId Required
     * }
     * @return array
     */
    public function add(array $params)
    {
        return $this->http->post('/suppressions', $params);
    }

    /**
     * Remove a suppression — the address will be eligible to receive
     * mail again.
     *
     * @param string $id
     * @return void
     */
    public function remove($id)
    {
        $this->http->delete('/suppressions/' . rawurlencode($id));
    }
}
