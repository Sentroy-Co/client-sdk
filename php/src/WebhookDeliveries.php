<?php

namespace Sentroy\ClientSdk;

/**
 * Delivery log scoped to a single webhook. Obtained via
 * Sentroy::$webhooks->deliveries($webhookId).
 */
class WebhookDeliveries
{
    /** @var HttpClient */
    private $http;

    /** @var string */
    private $webhookId;

    /**
     * @param HttpClient $http
     * @param string     $webhookId
     */
    public function __construct(HttpClient $http, $webhookId)
    {
        $this->http = $http;
        $this->webhookId = $webhookId;
    }

    /**
     * List recorded test/replay dispatches for a webhook. Production
     * deliveries (driven by the mail server) live elsewhere — this
     * returns only what was fired from the Sentroy console or this
     * SDK's test() / replay() calls.
     *
     * @param array $params {
     *     @type int    $page   Optional
     *     @type int    $limit  Optional
     *     @type string $status Optional — "success", "failed", "pending"
     * }
     * @return array { items, total, page, limit }
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
        return $this->http->get(
            '/webhooks/' . rawurlencode($this->webhookId) . '/deliveries',
            $query
        );
    }

    /**
     * Get a single delivery row, including the full payload + response
     * body (truncated at 4KB).
     *
     * @param string $deliveryId
     * @return array
     */
    public function get($deliveryId)
    {
        return $this->http->get(
            '/webhooks/' . rawurlencode($this->webhookId)
            . '/deliveries/' . rawurlencode($deliveryId)
        );
    }

    /**
     * Re-fire the recorded payload at the webhook's CURRENT URL. The
     * new row is linked to this one via "replayOf".
     *
     * @param string $deliveryId
     * @return array { deliveryId, responseStatus, durationMs, status, error? }
     */
    public function replay($deliveryId)
    {
        return $this->http->post(
            '/webhooks/' . rawurlencode($this->webhookId)
            . '/deliveries/' . rawurlencode($deliveryId) . '/replay'
        );
    }
}
