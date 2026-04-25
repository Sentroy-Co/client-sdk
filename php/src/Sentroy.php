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

    /** @var Buckets */
    public $buckets;

    /** @var Media */
    public $media;

    /** @var Storage */
    public $storage;

    /**
     * Create a new Sentroy client.
     *
     * A single base_url covers every resource — mail (domains, mailboxes,
     * templates, inbox, send) and storage (buckets, media). The platform
     * gateway transparently forwards mail requests to the mail subdomain
     * and storage requests to the storage subdomain.
     *
     * @param array $config {
     *     @type string $base_url      Sentroy platform root (e.g. https://sentroy.com)
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
        $timeout = isset($config['timeout']) ? (int) $config['timeout'] : 30;

        // Mail resources flow through the /api/mail/companies gateway path.
        $mailHttp = new HttpClient(
            $base . '/api/mail/companies/' . $slug,
            $config['access_token'],
            $timeout
        );
        // Storage uses the same pattern via /api/storage/companies.
        $storageHttp = new HttpClient(
            $base . '/api/storage/companies/' . $slug,
            $config['access_token'],
            $timeout
        );

        $this->domains = new Domains($mailHttp);
        $this->mailboxes = new Mailboxes($mailHttp);
        $this->templates = new Templates($mailHttp);
        $this->inbox = new Inbox($mailHttp);
        $this->send = new Send($mailHttp);
        $this->buckets = new Buckets($storageHttp);
        $this->media = new Media($storageHttp);
        $this->storage = new Storage($storageHttp);
    }
}
