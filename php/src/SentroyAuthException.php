<?php

namespace Sentroy\ClientSdk;

/**
 * Error thrown by the Auth Project sub-client (AuthClient). Built from
 * the auth API's uniform {error, error_description} JSON shape — separate
 * from SentroyException, which covers the main platform envelope.
 */
class SentroyAuthException extends \Exception
{
    /** @var string Machine-readable error code (e.g. "invalid_credentials"). */
    private $errorCode;

    /** @var int HTTP status code (0 for transport-level failures). */
    private $statusCode;

    /**
     * @param string $errorCode
     * @param string $description
     * @param int    $statusCode
     */
    public function __construct($errorCode, $description, $statusCode)
    {
        $this->errorCode = $errorCode;
        $this->statusCode = $statusCode;

        parent::__construct($description !== '' ? $description : $errorCode, $statusCode);
    }

    /**
     * @return string
     */
    public function getErrorCode()
    {
        return $this->errorCode;
    }

    /**
     * @return int
     */
    public function getStatusCode()
    {
        return $this->statusCode;
    }
}
