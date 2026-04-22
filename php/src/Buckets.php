<?php

namespace Sentroy\ClientSdk;

class Buckets
{
    /** @var HttpClient */
    private $http;

    public function __construct(HttpClient $http)
    {
        $this->http = $http;
    }

    /**
     * List all buckets in the company.
     *
     * @return array
     */
    public function getAll()
    {
        return $this->http->get('/buckets');
    }

    /**
     * Get a single bucket by its slug.
     *
     * @param string $slug
     * @return array
     */
    public function get($slug)
    {
        return $this->http->get('/buckets/' . rawurlencode($slug));
    }

    /**
     * Create a bucket. If "slug" is omitted in $params the server derives
     * one from "name".
     *
     * @param array $params {
     *     @type string $name        Required
     *     @type string $slug        Optional
     *     @type string $description Optional
     *     @type bool   $is_public   Optional, default false
     * }
     * @return array
     */
    public function create(array $params)
    {
        $body = array('name' => $params['name']);
        if (isset($params['slug'])) {
            $body['slug'] = $params['slug'];
        }
        if (isset($params['description'])) {
            $body['description'] = $params['description'];
        }
        if (isset($params['is_public'])) {
            $body['isPublic'] = (bool) $params['is_public'];
        }
        return $this->http->post('/buckets', $body);
    }

    /**
     * Update a bucket's name, description, or visibility. Toggling
     * is_public cascades to every file's ACL + Media record.
     *
     * @param string $slug
     * @param array  $params {
     *     @type string $name        Optional
     *     @type string $description Optional
     *     @type bool   $is_public   Optional
     * }
     * @return array
     */
    public function update($slug, array $params)
    {
        $body = array();
        if (isset($params['name'])) {
            $body['name'] = $params['name'];
        }
        if (isset($params['description'])) {
            $body['description'] = $params['description'];
        }
        if (array_key_exists('is_public', $params)) {
            $body['isPublic'] = (bool) $params['is_public'];
        }
        return $this->http->patch('/buckets/' . rawurlencode($slug), $body);
    }

    /**
     * Delete a bucket. Pass $force=true to purge every file (S3 + Media
     * records) before removing; a non-empty bucket returns 409 otherwise.
     *
     * @param string $slug
     * @param bool   $force
     * @return void
     */
    public function delete($slug, $force = false)
    {
        $query = $force ? array('force' => 'true') : array();
        $this->http->delete('/buckets/' . rawurlencode($slug), $query);
    }
}
