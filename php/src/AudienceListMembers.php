<?php

namespace Sentroy\ClientSdk;

/**
 * Membership operations scoped to a single audience list. Obtained via
 * Sentroy::$audience->lists->members($listId).
 */
class AudienceListMembers
{
    /** @var HttpClient */
    private $http;

    /** @var string */
    private $listId;

    /**
     * @param HttpClient $http
     * @param string     $listId
     */
    public function __construct(HttpClient $http, $listId)
    {
        $this->http = $http;
        $this->listId = $listId;
    }

    /**
     * List all contacts in this audience list.
     *
     * @return array
     */
    public function getAll()
    {
        return $this->http->get(
            '/audience/lists/' . rawurlencode($this->listId) . '/members'
        );
    }

    /**
     * Add a contact to the list by id.
     *
     * @param string $contactId
     * @return void
     */
    public function add($contactId)
    {
        $this->http->post(
            '/audience/lists/' . rawurlencode($this->listId) . '/members',
            array('contactId' => $contactId)
        );
    }

    /**
     * Remove a contact from the list (DELETE with a JSON body). The
     * contact record itself is preserved.
     *
     * @param string $contactId
     * @return void
     */
    public function remove($contactId)
    {
        $this->http->deleteWithBody(
            '/audience/lists/' . rawurlencode($this->listId) . '/members',
            array('contactId' => $contactId)
        );
    }
}
