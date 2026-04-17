<?php

namespace Sentroy\ClientSdk;

class Templates
{
    /** @var HttpClient */
    private $http;

    public function __construct(HttpClient $http)
    {
        $this->http = $http;
    }

    /**
     * List all templates.
     *
     * @return array
     */
    public function list()
    {
        return $this->http->get('/templates');
    }

    /**
     * Get a single template by ID.
     *
     * @param string $id
     * @return array
     */
    public function get($id)
    {
        return $this->http->get('/templates/' . urlencode($id));
    }
}
