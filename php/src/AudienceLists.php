<?php

namespace Sentroy\ClientSdk;

/**
 * Audience lists — named groupings of contacts. Accessed via
 * Sentroy::$audience->lists.
 */
class AudienceLists
{
    /** @var HttpClient */
    private $http;

    public function __construct(HttpClient $http)
    {
        $this->http = $http;
    }

    /**
     * List every audience list in the company.
     *
     * @return array
     */
    public function getAll()
    {
        return $this->http->get('/audience/lists');
    }

    /**
     * Get a single audience list by id.
     *
     * @param string $id
     * @return array
     */
    public function get($id)
    {
        return $this->http->get('/audience/lists/' . rawurlencode($id));
    }

    /**
     * Create a new audience list.
     *
     * @param array $params {
     *     @type string $name        Required
     *     @type string $description Optional
     * }
     * @return array
     */
    public function create(array $params)
    {
        return $this->http->post('/audience/lists', $params);
    }

    /**
     * Delete an audience list. Contacts stay in the company; only the
     * grouping is removed.
     *
     * @param string $id
     * @return void
     */
    public function delete($id)
    {
        $this->http->delete('/audience/lists/' . rawurlencode($id));
    }

    /**
     * Membership operations scoped to a list id.
     *
     * @param string $listId
     * @return AudienceListMembers
     */
    public function members($listId)
    {
        return new AudienceListMembers($this->http, $listId);
    }
}
