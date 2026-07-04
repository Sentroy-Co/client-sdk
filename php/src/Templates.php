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
     * List all templates, optionally filtered by sending domain.
     *
     * @param array $params {
     *     @type string $domainId Optional — scope to a single domain
     * }
     * @return array
     */
    public function getAll(array $params = array())
    {
        $query = array();
        if (isset($params['domainId'])) {
            $query['domainId'] = $params['domainId'];
        }
        return $this->http->get('/templates', $query);
    }

    /**
     * Get a single template by ID.
     *
     * @param string $id
     * @return array
     */
    public function get($id)
    {
        return $this->http->get('/templates/' . rawurlencode($id));
    }

    /**
     * Create an email template. Requires "templates.manage" permission.
     *
     * "name" / "subject" / "mjmlBody" may be a flat string or an
     * associative array keyed by language code (e.g. ['tr' => ..., 'en' => ...]).
     * The platform extracts the variable list from the body and returns it
     * on the created template ("variables") — variables is NOT an input.
     *
     * @param array $params {
     *     @type string|array $name     Required
     *     @type string|array $subject  Required
     *     @type string|array $mjmlBody Required
     *     @type string       $domainId Required
     * }
     * @return array
     */
    public function create(array $params)
    {
        return $this->http->post('/templates', $params);
    }

    /**
     * Update an existing template (partial). Requires "templates.manage".
     *
     * @param string $id
     * @param array  $params {
     *     @type string|array $name     Optional
     *     @type string|array $subject  Optional
     *     @type string|array $mjmlBody Optional
     * }
     * @return array
     */
    public function update($id, array $params)
    {
        return $this->http->patch('/templates/' . rawurlencode($id), $params);
    }

    /**
     * Delete a template by ID. Requires "templates.manage".
     *
     * @param string $id
     * @return void
     */
    public function delete($id)
    {
        $this->http->delete('/templates/' . rawurlencode($id));
    }
}
