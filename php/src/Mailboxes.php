<?php

namespace Sentroy\ClientSdk;

class Mailboxes
{
    /** @var HttpClient */
    private $http;

    public function __construct(HttpClient $http)
    {
        $this->http = $http;
    }

    /**
     * List all mailbox accounts for the company.
     *
     * @return array
     */
    public function getAll()
    {
        return $this->http->get('/mailboxes');
    }
}
