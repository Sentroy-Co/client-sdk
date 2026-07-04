<?php

namespace Sentroy\ClientSdk;

/**
 * WhatsApp message templates. Accessed via Sentroy::$whatsapp->templates.
 */
class WhatsAppTemplates
{
    /** @var HttpClient */
    private $http;

    public function __construct(HttpClient $http)
    {
        $this->http = $http;
    }

    /**
     * List all WhatsApp templates. Each has id, name, body (with
     * {{variable}} placeholders), variables (extracted from the body),
     * mediaUrl and category.
     *
     * @return array
     */
    public function getAll()
    {
        return $this->http->get('/templates');
    }

    /**
     * Get a single template by id.
     *
     * @param string $id
     * @return array
     */
    public function get($id)
    {
        return $this->http->get('/templates/' . rawurlencode($id));
    }

    /**
     * Create a template. "variables" are auto-extracted from the body.
     *
     * @param array $params {
     *     @type string $name     Required
     *     @type string $body     Required — with {{variable}} placeholders
     *     @type string $mediaUrl Optional
     *     @type string $category Optional
     * }
     * @return array
     */
    public function create(array $params)
    {
        return $this->http->post('/templates', $params);
    }

    /**
     * Update a template (partial). "mediaUrl" and "category" accept null
     * to clear the value.
     *
     * @param string $id
     * @param array  $params {
     *     @type string      $name     Optional
     *     @type string      $body     Optional
     *     @type string|null $mediaUrl Optional (nullable)
     *     @type string|null $category Optional (nullable)
     * }
     * @return array
     */
    public function update($id, array $params)
    {
        return $this->http->patch('/templates/' . rawurlencode($id), $params);
    }

    /**
     * Delete a template.
     *
     * @param string $id
     * @return void
     */
    public function delete($id)
    {
        $this->http->delete('/templates/' . rawurlencode($id));
    }
}
