package sentroy

import (
	"net/http"
	"net/url"
)

// DomainsService provides access to domain-related API endpoints.
type DomainsService struct {
	h *httpClient
}

func newDomainsService(h *httpClient) *DomainsService {
	return &DomainsService{h: h}
}

// List returns all verified domains for the company.
func (s *DomainsService) List() ([]Domain, error) {
	return doRequest[[]Domain](s.h, http.MethodGet, "/domains", nil, nil)
}

// Get returns a single domain by ID.
func (s *DomainsService) Get(id string) (*Domain, error) {
	d, err := doRequest[Domain](s.h, http.MethodGet, "/domains/"+url.PathEscape(id), nil, nil)
	if err != nil {
		return nil, err
	}
	return &d, nil
}
