<?php

namespace Sentroy\ClientSdk;

class Webhooks
{
    /** @var HttpClient */
    private $http;

    public function __construct(HttpClient $http)
    {
        $this->http = $http;
    }

    /**
     * List webhooks across the company, or scoped to a single domain.
     *
     * @param string|null $domainId
     * @return array
     */
    public function getAll($domainId = null)
    {
        $query = array();
        if ($domainId !== null) {
            $query['domainId'] = $domainId;
        }
        return $this->http->get('/webhooks', $query);
    }

    /**
     * Get a single webhook by id. The "secret" is NOT returned on reads.
     *
     * @param string $id
     * @return array
     */
    public function get($id)
    {
        return $this->http->get('/webhooks/' . rawurlencode($id));
    }

    /**
     * Register a webhook for one or more events on a domain. The
     * response includes a "secret" — store it now for HMAC verification;
     * subsequent reads only return the webhook config without the secret.
     *
     * @param array $params {
     *     @type string $url      Required
     *     @type array  $events   Required — "sent", "bounced", "failed",
     *                            "opened", "clicked", "unsubscribed"
     *     @type string $domainId Required
     * }
     * @return array Webhook incl. secret
     */
    public function create(array $params)
    {
        return $this->http->post('/webhooks', $params);
    }

    /**
     * Patch URL, event list, or "active" flag.
     *
     * @param string $id
     * @param array  $params {
     *     @type string $url    Optional
     *     @type array  $events Optional
     *     @type bool   $active Optional
     * }
     * @return array
     */
    public function update($id, array $params)
    {
        return $this->http->patch('/webhooks/' . rawurlencode($id), $params);
    }

    /**
     * Delete a webhook. In-flight deliveries are not retried.
     *
     * @param string $id
     * @return void
     */
    public function delete($id)
    {
        $this->http->delete('/webhooks/' . rawurlencode($id));
    }

    /**
     * Manually fire a custom event payload at a webhook's current URL.
     * Returns the dispatch result (status, duration, deliveryId) and
     * records a row in the delivery log.
     *
     * @param string $id
     * @param array  $params {
     *     @type string $event   Required
     *     @type array  $payload Required
     * }
     * @return array { deliveryId, responseStatus, durationMs, status, error? }
     */
    public function test($id, array $params)
    {
        return $this->http->post('/webhooks/' . rawurlencode($id) . '/test', $params);
    }

    /**
     * Delivery-log scope for a single webhook id.
     *
     * @param string $webhookId
     * @return WebhookDeliveries
     */
    public function deliveries($webhookId)
    {
        return new WebhookDeliveries($this->http, $webhookId);
    }
}
