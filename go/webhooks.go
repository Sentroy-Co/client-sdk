package sentroy

import (
	"net/http"
	"net/url"
	"strconv"
)

// WebhooksService manages event webhooks and their delivery log.
type WebhooksService struct {
	h *httpClient
}

func newWebhooksService(h *httpClient) *WebhooksService {
	return &WebhooksService{h: h}
}

// List returns webhooks across the company. Pass a non-empty domainID to
// scope the list to a single domain.
func (s *WebhooksService) List(domainID string) ([]Webhook, error) {
	q := map[string]string{}
	if domainID != "" {
		q["domainId"] = domainID
	}
	return doRequest[[]Webhook](s.h, http.MethodGet, "/webhooks", q, nil)
}

// Get returns a single webhook by id. The secret is NOT returned on reads.
func (s *WebhooksService) Get(id string) (*Webhook, error) {
	w, err := doRequest[Webhook](s.h, http.MethodGet, "/webhooks/"+url.PathEscape(id), nil, nil)
	if err != nil {
		return nil, err
	}
	return &w, nil
}

// Create registers a webhook for one or more events on a domain. The
// response includes a Secret — store it now; subsequent reads only return
// the webhook config without the secret.
func (s *WebhooksService) Create(params CreateWebhookParams) (*Webhook, error) {
	w, err := doRequest[Webhook](s.h, http.MethodPost, "/webhooks", nil, params)
	if err != nil {
		return nil, err
	}
	return &w, nil
}

// Update patches the URL, event list, or Active flag.
func (s *WebhooksService) Update(id string, params UpdateWebhookParams) (*Webhook, error) {
	w, err := doRequest[Webhook](s.h, http.MethodPatch, "/webhooks/"+url.PathEscape(id), nil, params)
	if err != nil {
		return nil, err
	}
	return &w, nil
}

// Delete removes a webhook. In-flight deliveries are not retried.
func (s *WebhooksService) Delete(id string) error {
	_, err := doRequest[map[string]interface{}](s.h, http.MethodDelete,
		"/webhooks/"+url.PathEscape(id), nil, nil)
	return err
}

// Test manually fires a custom event payload at a webhook's current URL.
// Returns the dispatch result (status, duration, deliveryId) and records a
// row in the delivery log.
func (s *WebhooksService) Test(id string, params WebhookTestParams) (*WebhookDispatchResult, error) {
	r, err := doRequest[WebhookDispatchResult](s.h, http.MethodPost,
		"/webhooks/"+url.PathEscape(id)+"/test", nil, params)
	if err != nil {
		return nil, err
	}
	return &r, nil
}

// Deliveries returns the delivery-log scope for a single webhook id.
func (s *WebhooksService) Deliveries(webhookID string) *WebhookDeliveriesService {
	return &WebhookDeliveriesService{h: s.h, webhookID: webhookID}
}

// WebhookDeliveriesService reads (and replays) recorded dispatches for one
// webhook.
type WebhookDeliveriesService struct {
	h         *httpClient
	webhookID string
}

// List returns recorded test/replay dispatches for the webhook. Production
// deliveries (driven by the mail server) live elsewhere — this returns only
// what was fired from the Sentroy console or this SDK's Test / Replay calls.
func (s *WebhookDeliveriesService) List(params *WebhookDeliveryListParams) (*WebhookDeliveryListResult, error) {
	q := map[string]string{}
	if params != nil {
		if params.Page > 0 {
			q["page"] = strconv.Itoa(params.Page)
		}
		if params.Limit > 0 {
			q["limit"] = strconv.Itoa(params.Limit)
		}
		if params.Status != "" {
			q["status"] = string(params.Status)
		}
	}
	r, err := doRequest[WebhookDeliveryListResult](s.h, http.MethodGet,
		"/webhooks/"+url.PathEscape(s.webhookID)+"/deliveries", q, nil)
	if err != nil {
		return nil, err
	}
	return &r, nil
}

// Get returns a single delivery row, including the full payload plus the
// response body (truncated to 4 KB).
func (s *WebhookDeliveriesService) Get(deliveryID string) (*WebhookDelivery, error) {
	d, err := doRequest[WebhookDelivery](s.h, http.MethodGet,
		"/webhooks/"+url.PathEscape(s.webhookID)+"/deliveries/"+url.PathEscape(deliveryID),
		nil, nil)
	if err != nil {
		return nil, err
	}
	return &d, nil
}

// Replay re-fires the recorded payload at the webhook's CURRENT URL. The
// new row is linked to this one via ReplayOf.
func (s *WebhookDeliveriesService) Replay(deliveryID string) (*WebhookDispatchResult, error) {
	r, err := doRequest[WebhookDispatchResult](s.h, http.MethodPost,
		"/webhooks/"+url.PathEscape(s.webhookID)+"/deliveries/"+url.PathEscape(deliveryID)+"/replay",
		nil, nil)
	if err != nil {
		return nil, err
	}
	return &r, nil
}
