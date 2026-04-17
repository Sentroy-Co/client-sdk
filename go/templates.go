package sentroy

import (
	"net/http"
	"net/url"
)

// TemplatesService provides access to template-related API endpoints.
type TemplatesService struct {
	h *httpClient
}

func newTemplatesService(h *httpClient) *TemplatesService {
	return &TemplatesService{h: h}
}

// List returns all templates.
func (s *TemplatesService) List() ([]Template, error) {
	return doRequest[[]Template](s.h, http.MethodGet, "/templates", nil, nil)
}

// Get returns a single template by ID.
func (s *TemplatesService) Get(id string) (*Template, error) {
	t, err := doRequest[Template](s.h, http.MethodGet, "/templates/"+url.PathEscape(id), nil, nil)
	if err != nil {
		return nil, err
	}
	return &t, nil
}
