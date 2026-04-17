package sentroy

import "net/http"

// MailboxesService provides access to mailbox-related API endpoints.
type MailboxesService struct {
	h *httpClient
}

func newMailboxesService(h *httpClient) *MailboxesService {
	return &MailboxesService{h: h}
}

// List returns all mailbox accounts for the company.
func (s *MailboxesService) List() ([]MailboxUser, error) {
	return doRequest[[]MailboxUser](s.h, http.MethodGet, "/mailboxes", nil, nil)
}
