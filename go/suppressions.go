package sentroy

import (
	"net/http"
	"net/url"
	"strconv"
)

// SuppressionsService manages the suppression list. Suppressed recipients
// are skipped at send time.
type SuppressionsService struct {
	h *httpClient
}

func newSuppressionsService(h *httpClient) *SuppressionsService {
	return &SuppressionsService{h: h}
}

// List returns suppressions across the company (or a single domain). Every
// entry is one address that will not receive mail until removed.
func (s *SuppressionsService) List(params *SuppressionListParams) ([]Suppression, error) {
	q := map[string]string{}
	if params != nil {
		if params.Page > 0 {
			q["page"] = strconv.Itoa(params.Page)
		}
		if params.Limit > 0 {
			q["limit"] = strconv.Itoa(params.Limit)
		}
		if params.DomainID != "" {
			q["domainId"] = params.DomainID
		}
		if params.Reason != "" {
			q["reason"] = params.Reason
		}
	}
	return doRequest[[]Suppression](s.h, http.MethodGet, "/suppressions", q, nil)
}

// Add manually suppresses an address (e.g. honoring an off-platform
// opt-out). Bounces and complaints are added automatically by the mail
// server.
func (s *SuppressionsService) Add(params AddSuppressionParams) (*Suppression, error) {
	sup, err := doRequest[Suppression](s.h, http.MethodPost, "/suppressions", nil, params)
	if err != nil {
		return nil, err
	}
	return &sup, nil
}

// Remove deletes a suppression — the address will be eligible to receive
// mail again.
func (s *SuppressionsService) Remove(id string) error {
	_, err := doRequest[map[string]interface{}](s.h, http.MethodDelete,
		"/suppressions/"+url.PathEscape(id), nil, nil)
	return err
}
