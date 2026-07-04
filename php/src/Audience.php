<?php

namespace Sentroy\ClientSdk;

/**
 * Audience — contact lists + contacts for template sending.
 *
 * $sentroy->audience->lists    — list CRUD + members($listId)
 * $sentroy->audience->contacts — contact CRUD + search
 */
class Audience
{
    /** @var AudienceLists */
    public $lists;

    /** @var AudienceContacts */
    public $contacts;

    public function __construct(HttpClient $http)
    {
        $this->lists = new AudienceLists($http);
        $this->contacts = new AudienceContacts($http);
    }
}
