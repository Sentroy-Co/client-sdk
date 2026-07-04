<?php

namespace Sentroy\ClientSdk;

/**
 * Connected WhatsApp numbers. Accessed via Sentroy::$whatsapp->numbers.
 */
class WhatsAppNumbers
{
    /** @var HttpClient */
    private $http;

    public function __construct(HttpClient $http)
    {
        $this->http = $http;
    }

    /**
     * List the company's WhatsApp numbers. Each entry has sessionId,
     * phoneNumber, label, status and a "connected" convenience flag —
     * only connected numbers can send.
     *
     * @return array
     */
    public function getAll()
    {
        return $this->http->get('/numbers');
    }
}
