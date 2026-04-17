<?php

namespace Sentroy\ClientSdk;

class Sentroy
{
    /** @var Domains */
    public $domains;

    /** @var Mailboxes */
    public $mailboxes;

    /** @var Templates */
    public $templates;

    /** @var Inbox */
    public $inbox;

    /** @var Send */
    public $send;

    /**
     * Create a new Sentroy client.
     *
     * @param array $config {
     *     @type string $base_url      Sentroy instance URL
     *     @type string $company_slug  Company slug
     *     @type string $access_token  Access token (stk_...)
     *     @type int    $timeout       Request timeout in seconds (default: 30)
     * }
     *
     * @throws \InvalidArgumentException
     */
    public function __construct(array $config)
    {
        if (empty($config['base_url'])) {
            throw new \InvalidArgumentException('base_url is required');
        }
        if (empty($config['company_slug'])) {
            throw new \InvalidArgumentException('company_slug is required');
        }
        if (empty($config['access_token'])) {
            throw new \InvalidArgumentException('access_token is required');
        }

        $base = rtrim($config['base_url'], '/');
        $slug = rawurlencode($config['company_slug']);
        $apiBase = $base . '/api/companies/' . $slug;
        $timeout = isset($config['timeout']) ? (int) $config['timeout'] : 30;

        $http = new HttpClient($apiBase, $config['access_token'], $timeout);

        $this->domains = new Domains($http);
        $this->mailboxes = new Mailboxes($http);
        $this->templates = new Templates($http);
        $this->inbox = new Inbox($http);
        $this->send = new Send($http);
    }
}
