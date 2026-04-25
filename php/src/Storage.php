<?php

namespace Sentroy\ClientSdk;

/**
 * Read-only storage observability — quota and usage breakdown. Bucket
 * and media CRUD live on Sentroy::$buckets / Sentroy::$media.
 */
class Storage
{
    /** @var HttpClient */
    private $http;

    public function __construct(HttpClient $http)
    {
        $this->http = $http;
    }

    /**
     * Plan storage quota for the company.
     *
     * Mail and storage share the same byte pool: "used" is the storage
     * slice, "mailUsed" what the mail product has occupied. "limit" of
     * 0 means unlimited.
     *
     * @return array {used:int,limit:int,mailUsed:int,planName?:string}
     */
    public function quota()
    {
        return $this->http->get('/storage-quota');
    }

    /**
     * Combined dashboard payload — plan quota + per-bucket byte/file
     * counts + per-type aggregation across the company. Single round-
     * trip; intended for usage UIs.
     *
     * @return array {quota:array, buckets:array, byType:array}
     */
    public function usage()
    {
        return $this->http->get('/usage');
    }
}
