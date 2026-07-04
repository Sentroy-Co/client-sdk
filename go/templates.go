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

// ListByDomain returns the templates tied to a single sending domain.
func (s *TemplatesService) ListByDomain(domainID string) ([]Template, error) {
	return doRequest[[]Template](s.h, http.MethodGet, "/templates",
		map[string]string{"domainId": domainID}, nil)
}

// Get returns a single template by ID.
func (s *TemplatesService) Get(id string) (*Template, error) {
	t, err := doRequest[Template](s.h, http.MethodGet, "/templates/"+url.PathEscape(id), nil, nil)
	if err != nil {
		return nil, err
	}
	return &t, nil
}

// Create creates an email template. Requires the templates.manage permission.
//
// Name / Subject / MJMLBody may be a flat string or a map[string]string
// keyed by language code. The platform extracts the variable list from the
// body and returns it on the created template (Variables).
func (s *TemplatesService) Create(params CreateTemplateParams) (*Template, error) {
	t, err := doRequest[Template](s.h, http.MethodPost, "/templates", nil, params)
	if err != nil {
		return nil, err
	}
	return &t, nil
}

// Update patches an existing template (partial update). Requires the
// templates.manage permission.
func (s *TemplatesService) Update(id string, params UpdateTemplateParams) (*Template, error) {
	t, err := doRequest[Template](s.h, http.MethodPatch, "/templates/"+url.PathEscape(id), nil, params)
	if err != nil {
		return nil, err
	}
	return &t, nil
}

// Delete removes a template by ID. Requires the templates.manage permission.
func (s *TemplatesService) Delete(id string) error {
	_, err := doRequest[map[string]interface{}](s.h, http.MethodDelete, "/templates/"+url.PathEscape(id), nil, nil)
	return err
}
