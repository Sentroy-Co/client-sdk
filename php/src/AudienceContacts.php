<?php

namespace Sentroy\ClientSdk;

/**
 * Contact CRUD. Accessed via Sentroy::$audience->contacts.
 */
class AudienceContacts
{
    /** @var HttpClient */
    private $http;

    public function __construct(HttpClient $http)
    {
        $this->http = $http;
    }

    /**
     * Paginated list of contacts. Filter by status or tag set; tags are
     * sent as a comma-joined query param.
     *
     * @param array $params {
     *     @type int    $page   Optional
     *     @type int    $limit  Optional
     *     @type string $status Optional — "active", "unsubscribed", "bounced"
     *     @type array  $tags   Optional — string[]
     * }
     * @return array { contacts, total, page, limit }
     */
    public function getAll(array $params = array())
    {
        $query = array();
        if (isset($params['page'])) {
            $query['page'] = $params['page'];
        }
        if (isset($params['limit'])) {
            $query['limit'] = $params['limit'];
        }
        if (isset($params['status'])) {
            $query['status'] = $params['status'];
        }
        if (isset($params['tags']) && is_array($params['tags']) && count($params['tags']) > 0) {
            $query['tags'] = implode(',', $params['tags']);
        }
        return $this->http->get('/audience/contacts', $query);
    }

    /**
     * Email-prefix autocomplete. Capped server-side at 10 results — use
     * getAll() for paginated browsing.
     *
     * @param string $q
     * @return array
     */
    public function search($q)
    {
        return $this->http->get('/audience/contacts', array('q' => $q));
    }

    /**
     * Get a single contact by id.
     *
     * @param string $id
     * @return array
     */
    public function get($id)
    {
        return $this->http->get('/audience/contacts/' . rawurlencode($id));
    }

    /**
     * Create a contact. Defaults to status "active".
     *
     * @param array $params {
     *     @type string $email    Required
     *     @type string $name     Optional
     *     @type array  $tags     Optional — string[]
     *     @type array  $metadata Optional
     * }
     * @return array
     */
    public function create(array $params)
    {
        return $this->http->post('/audience/contacts', $params);
    }

    /**
     * Patch any contact field. Pass "status" to mark unsubscribed/bounced.
     *
     * @param string $id
     * @param array  $params {
     *     @type string $email    Optional
     *     @type string $name     Optional
     *     @type array  $tags     Optional
     *     @type string $status   Optional — "active", "unsubscribed", "bounced"
     *     @type array  $metadata Optional
     * }
     * @return array
     */
    public function update($id, array $params)
    {
        return $this->http->patch('/audience/contacts/' . rawurlencode($id), $params);
    }

    /**
     * Soft-delete: marks the contact as "unsubscribed". The record stays
     * so historical mail-log foreign keys keep resolving and the email
     * won't accidentally be re-added.
     *
     * @param string $id
     * @return void
     */
    public function delete($id)
    {
        $this->http->delete('/audience/contacts/' . rawurlencode($id));
    }
}
