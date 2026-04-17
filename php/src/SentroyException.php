<?php

namespace Sentroy\ClientSdk;

class SentroyException extends \Exception
{
    /** @var int */
    private $statusCode;

    /** @var mixed */
    private $responseBody;

    /**
     * @param int    $statusCode
     * @param mixed  $responseBody
     * @param string $message
     */
    public function __construct($statusCode, $responseBody, $message = '')
    {
        $this->statusCode = $statusCode;
        $this->responseBody = $responseBody;

        if ($message === '') {
            $message = "Sentroy API error ({$statusCode})";
        }

        parent::__construct($message, $statusCode);
    }

    /**
     * @return int
     */
    public function getStatusCode()
    {
        return $this->statusCode;
    }

    /**
     * @return mixed
     */
    public function getResponseBody()
    {
        return $this->responseBody;
    }
}
