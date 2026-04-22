<?php

namespace Sentroy\ClientSdk;

class Media
{
    /** @var HttpClient */
    private $http;

    public function __construct(HttpClient $http)
    {
        $this->http = $http;
    }

    /**
     * List files in a bucket.
     *
     * @param string $bucketSlug
     * @param array  $params {
     *     @type string $type   Optional — "image", "video", "audio", "document", "other"
     *     @type string $folder Optional
     *     @type int    $limit  Optional
     *     @type int    $skip   Optional
     * }
     * @return array { items, total, limit, skip }
     */
    public function getAll($bucketSlug, array $params = array())
    {
        $query = array();
        if (isset($params['type'])) {
            $query['type'] = $params['type'];
        }
        if (isset($params['folder'])) {
            $query['folder'] = $params['folder'];
        }
        if (isset($params['limit'])) {
            $query['limit'] = (string) $params['limit'];
        }
        if (isset($params['skip'])) {
            $query['skip'] = (string) $params['skip'];
        }
        return $this->http->get('/buckets/' . rawurlencode($bucketSlug) . '/media', $query);
    }

    /**
     * Get a single media record.
     *
     * @param string $bucketSlug
     * @param string $mediaId
     * @return array
     */
    public function get($bucketSlug, $mediaId)
    {
        return $this->http->get(
            '/buckets/' . rawurlencode($bucketSlug) . '/media/' . rawurlencode($mediaId)
        );
    }

    /**
     * Upload a file to a bucket.
     *
     * @param string $bucketSlug
     * @param array  $params {
     *     @type string $body         Required — raw file bytes
     *     @type string $filename     Optional
     *     @type string $content_type Optional — MIME type
     *     @type string $folder       Optional
     *     @type bool   $is_public    Optional
     *     @type string $alt          Optional
     *     @type string $caption      Optional
     *     @type array  $tags         Optional
     * }
     * @return array  The serialized media record.
     */
    public function upload($bucketSlug, array $params)
    {
        if (!isset($params['body'])) {
            throw new \InvalidArgumentException('body is required (raw file bytes)');
        }

        $file = array(
            'name'     => 'file',
            'filename' => isset($params['filename']) ? $params['filename'] : 'upload.bin',
            'contents' => $params['body'],
            'type'     => isset($params['content_type']) ? $params['content_type'] : null,
        );

        $fields = array();
        if (isset($params['folder'])) {
            $fields['folder'] = $params['folder'];
        }
        if (isset($params['is_public'])) {
            $fields['public'] = $params['is_public'] ? 'true' : 'false';
        }
        if (isset($params['alt'])) {
            $fields['alt'] = $params['alt'];
        }
        if (isset($params['caption'])) {
            $fields['caption'] = $params['caption'];
        }
        if (isset($params['tags']) && is_array($params['tags'])) {
            $fields['tags'] = implode(',', $params['tags']);
        }

        return $this->http->postMultipart(
            '/buckets/' . rawurlencode($bucketSlug) . '/media',
            $file,
            $fields
        );
    }

    /**
     * Download a file. Returns an associative array with "body" (raw
     * bytes) and "content_type" (from the Content-Type header).
     *
     * Works for both public and private buckets — private ones are
     * auth-gated through the storage app. Optional "quality" requests a
     * pre-generated thumbnail width (falls back to original if missing).
     *
     * @param string $bucketSlug
     * @param string $mediaId
     * @param int|string|null $quality
     * @return array { body, content_type }
     */
    public function download($bucketSlug, $mediaId, $quality = null)
    {
        $query = array();
        if ($quality !== null && $quality !== 'original') {
            $query['quality'] = (string) $quality;
        }
        return $this->http->fetchRaw(
            '/buckets/' . rawurlencode($bucketSlug) . '/media/' . rawurlencode($mediaId) . '/download',
            $query
        );
    }

    /**
     * Delete a file. Cascades through the CDN: S3 objects (original +
     * thumbnails) are removed, then the Media record. If any S3 delete
     * fails the record is kept so you can retry.
     *
     * @param string $bucketSlug
     * @param string $mediaId
     * @return void
     */
    public function delete($bucketSlug, $mediaId)
    {
        $this->http->delete(
            '/buckets/' . rawurlencode($bucketSlug) . '/media/' . rawurlencode($mediaId)
        );
    }
}
