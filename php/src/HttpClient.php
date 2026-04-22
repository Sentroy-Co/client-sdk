<?php

namespace Sentroy\ClientSdk;

class HttpClient
{
    /** @var string */
    private $baseUrl;

    /** @var string */
    private $token;

    /** @var int */
    private $timeout;

    /**
     * @param string $baseUrl
     * @param string $token
     * @param int    $timeout
     */
    public function __construct($baseUrl, $token, $timeout = 30)
    {
        $this->baseUrl = rtrim($baseUrl, '/');
        $this->token = $token;
        $this->timeout = $timeout;
    }

    /**
     * @param string $path
     * @param array  $query
     * @return string
     */
    private function buildUrl($path, array $query = array())
    {
        $url = $this->baseUrl . $path;

        $filtered = array_filter($query, function ($v) {
            return $v !== null && $v !== '';
        });

        if (!empty($filtered)) {
            $url .= '?' . http_build_query($filtered);
        }

        return $url;
    }

    /**
     * @param string $method
     * @param string $path
     * @param array  $options
     * @return mixed
     * @throws SentroyException
     */
    private function request($method, $path, array $options = array())
    {
        $query = isset($options['query']) ? $options['query'] : array();
        $body = isset($options['body']) ? $options['body'] : null;

        $url = $this->buildUrl($path, $query);

        $ch = curl_init();

        curl_setopt($ch, CURLOPT_URL, $url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_TIMEOUT, $this->timeout);
        curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, $this->timeout);
        curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $method);

        $headers = array(
            'Authorization: Bearer ' . $this->token,
            'Accept: application/json',
        );

        if ($body !== null) {
            $jsonBody = json_encode($body);
            curl_setopt($ch, CURLOPT_POSTFIELDS, $jsonBody);
            $headers[] = 'Content-Type: application/json';
            $headers[] = 'Content-Length: ' . strlen($jsonBody);
        }

        curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);

        $response = curl_exec($ch);
        $statusCode = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $curlError = curl_error($ch);
        $curlErrno = curl_errno($ch);

        curl_close($ch);

        if ($curlErrno !== 0) {
            throw new SentroyException(
                0,
                null,
                "cURL error ({$curlErrno}): {$curlError}"
            );
        }

        $json = json_decode((string) $response, true);

        if ($statusCode < 200 || $statusCode >= 300) {
            $errorMessage = isset($json['error']) ? $json['error'] : "Request failed with status {$statusCode}";
            throw new SentroyException($statusCode, $json, $errorMessage);
        }

        return isset($json['data']) ? $json['data'] : null;
    }

    /**
     * @param string $path
     * @param array  $query
     * @return mixed
     */
    public function get($path, array $query = array())
    {
        return $this->request('GET', $path, array('query' => $query));
    }

    /**
     * @param string $path
     * @param mixed  $body
     * @return mixed
     */
    public function post($path, $body = null)
    {
        return $this->request('POST', $path, array('body' => $body));
    }

    /**
     * @param string $path
     * @param mixed  $body
     * @return mixed
     */
    public function put($path, $body = null)
    {
        return $this->request('PUT', $path, array('body' => $body));
    }

    /**
     * @param string $path
     * @param mixed  $body
     * @return mixed
     */
    public function patch($path, $body = null)
    {
        return $this->request('PATCH', $path, array('body' => $body));
    }

    /**
     * @param string $path
     * @param array  $query
     * @return mixed
     */
    public function delete($path, array $query = array())
    {
        return $this->request('DELETE', $path, array('query' => $query));
    }

    /**
     * Multipart/form-data upload. $file is an array with:
     *   - name     (string) — form field name, conventionally "file"
     *   - filename (string) — how the server sees the file name
     *   - contents (string) — raw byte string
     *   - type     (string) — MIME type; defaults to application/octet-stream
     *
     * $fields are extra string form fields (folder, public, tags, ...).
     *
     * @param string $path
     * @param array  $file
     * @param array  $fields
     * @return mixed
     * @throws SentroyException
     */
    public function postMultipart($path, array $file, array $fields = array())
    {
        $url = $this->buildUrl($path);

        // CURLFile requires a real filesystem path. We write the bytes to a
        // temp file, send the upload, then clean up. Works for small + large
        // payloads without memory copies beyond what cURL itself does.
        $tmp = tempnam(sys_get_temp_dir(), 'sentroy-upload-');
        if ($tmp === false) {
            throw new SentroyException(0, null, 'Failed to create temp file for upload');
        }
        file_put_contents($tmp, isset($file['contents']) ? $file['contents'] : '');

        $filename = isset($file['filename']) ? $file['filename'] : 'upload.bin';
        $mime = isset($file['type']) ? $file['type'] : 'application/octet-stream';
        $fieldName = isset($file['name']) ? $file['name'] : 'file';

        $postFields = array();
        foreach ($fields as $k => $v) {
            if ($v === null) {
                continue;
            }
            $postFields[$k] = (string) $v;
        }
        $postFields[$fieldName] = new \CURLFile($tmp, $mime, $filename);

        $ch = curl_init();
        curl_setopt($ch, CURLOPT_URL, $url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_TIMEOUT, $this->timeout);
        curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, $this->timeout);
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, $postFields);
        curl_setopt($ch, CURLOPT_HTTPHEADER, array(
            'Authorization: Bearer ' . $this->token,
            'Accept: application/json',
            // NOT Content-Type: cURL writes the correct multipart boundary.
        ));

        $response = curl_exec($ch);
        $statusCode = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $curlError = curl_error($ch);
        $curlErrno = curl_errno($ch);
        curl_close($ch);

        @unlink($tmp);

        if ($curlErrno !== 0) {
            throw new SentroyException(0, null, "cURL error ({$curlErrno}): {$curlError}");
        }

        $json = json_decode((string) $response, true);
        if ($statusCode < 200 || $statusCode >= 300) {
            $msg = isset($json['error']) ? $json['error'] : "Upload failed with status {$statusCode}";
            throw new SentroyException($statusCode, $json, $msg);
        }
        return isset($json['data']) ? $json['data'] : null;
    }

    /**
     * GET a binary endpoint. Returns array('body' => string, 'content_type' => string).
     *
     * @param string $path
     * @param array  $query
     * @return array
     * @throws SentroyException
     */
    public function fetchRaw($path, array $query = array())
    {
        $url = $this->buildUrl($path, $query);

        $ch = curl_init();
        curl_setopt($ch, CURLOPT_URL, $url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_TIMEOUT, $this->timeout);
        curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, $this->timeout);
        curl_setopt($ch, CURLOPT_HTTPHEADER, array(
            'Authorization: Bearer ' . $this->token,
        ));

        $response = curl_exec($ch);
        $statusCode = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $contentType = (string) curl_getinfo($ch, CURLINFO_CONTENT_TYPE);
        $curlError = curl_error($ch);
        $curlErrno = curl_errno($ch);
        curl_close($ch);

        if ($curlErrno !== 0) {
            throw new SentroyException(0, null, "cURL error ({$curlErrno}): {$curlError}");
        }
        if ($statusCode < 200 || $statusCode >= 300) {
            throw new SentroyException(
                $statusCode,
                array('body' => (string) $response),
                "Download failed with status {$statusCode}"
            );
        }
        return array('body' => (string) $response, 'content_type' => $contentType);
    }
}
