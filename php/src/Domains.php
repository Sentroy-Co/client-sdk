<?php

namespace Sentroy\ClientSdk;

class Domains
{
    /** @var HttpClient */
    private $http;

    public function __construct(HttpClient $http)
    {
        $this->http = $http;
    }

    /**
     * List all verified domains for the company.
     *
     * @return array
     */
    public function list()
    {
        return $this->http->get('/domains');
    }

    /**
     * Get a single domain by ID.
     *
     * @param string $id
     * @return array
     */
    public function get($id)
    {
        return $this->http->get('/domains/' . urlencode($id));
    }
}
