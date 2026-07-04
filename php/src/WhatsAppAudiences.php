<?php

namespace Sentroy\ClientSdk;

/**
 * Saved phone audiences for bulk WhatsApp sending. Accessed via
 * Sentroy::$whatsapp->audiences.
 */
class WhatsAppAudiences
{
    /** @var HttpClient */
    private $http;

    public function __construct(HttpClient $http)
    {
        $this->http = $http;
    }

    /**
     * List all audiences. Each has id, name, description, entries
     * ([{phone, variables?}]) and entryCount.
     *
     * @return array
     */
    public function getAll()
    {
        return $this->http->get('/audiences');
    }

    /**
     * Get a single audience by id.
     *
     * @param string $id
     * @return array
     */
    public function get($id)
    {
        return $this->http->get('/audiences/' . rawurlencode($id));
    }

    /**
     * Create an audience. Entries accept plain phone strings or
     * ['phone' => ..., 'variables' => [...]] maps for per-recipient
     * variable values.
     *
     * @param array $params {
     *     @type string $name        Required
     *     @type string $description Optional
     *     @type array  $entries     Required — string[] or [{phone, variables?}]
     * }
     * @return array
     */
    public function create(array $params)
    {
        return $this->http->post('/audiences', $params);
    }

    /**
     * Update an audience (partial). "description" accepts null to clear.
     *
     * @param string $id
     * @param array  $params {
     *     @type string      $name        Optional
     *     @type string|null $description Optional (nullable)
     *     @type array       $entries     Optional
     * }
     * @return array
     */
    public function update($id, array $params)
    {
        return $this->http->patch('/audiences/' . rawurlencode($id), $params);
    }

    /**
     * Delete an audience.
     *
     * @param string $id
     * @return void
     */
    public function delete($id)
    {
        $this->http->delete('/audiences/' . rawurlencode($id));
    }
}
