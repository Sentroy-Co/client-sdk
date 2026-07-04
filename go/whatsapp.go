package sentroy

import (
	"net/http"
	"net/url"
	"strconv"
)

// ── Types ────────────────────────────────────────────────────────────────

// WhatsAppNumber is one connected (or connecting) WhatsApp session.
type WhatsAppNumber struct {
	SessionID   string  `json:"sessionId"`
	PhoneNumber *string `json:"phoneNumber"`
	Label       *string `json:"label"`
	Status      string  `json:"status"`
	// Connected is a convenience flag: status == "connected". Only
	// connected numbers can send.
	Connected bool `json:"connected"`
}

// WhatsAppTemplate is a reusable message template with {{variable}}
// placeholders.
type WhatsAppTemplate struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	// Body is the message body with {{variable}} placeholders.
	Body string `json:"body"`
	// Variables are the names extracted from the body (for validation/UI).
	Variables []string `json:"variables"`
	MediaURL  *string  `json:"mediaUrl"`
	Category  *string  `json:"category"`
	CreatedAt string   `json:"createdAt"`
	UpdatedAt string   `json:"updatedAt"`
}

// CreateWhatsAppTemplateParams is the request body for creating a WhatsApp
// template. Variables are auto-extracted from the body server-side.
type CreateWhatsAppTemplateParams struct {
	Name     string `json:"name"`
	Body     string `json:"body"`
	MediaURL string `json:"mediaUrl,omitempty"`
	Category string `json:"category,omitempty"`
}

// UpdateWhatsAppTemplateParams is a partial template update. MediaURL and
// Category are pointers so nil means "don't change".
type UpdateWhatsAppTemplateParams struct {
	Name     string  `json:"name,omitempty"`
	Body     string  `json:"body,omitempty"`
	MediaURL *string `json:"mediaUrl,omitempty"`
	Category *string `json:"category,omitempty"`
}

// WhatsAppAudienceEntry is one recipient inside an audience, with optional
// per-recipient variable values.
type WhatsAppAudienceEntry struct {
	Phone     string            `json:"phone"`
	Variables map[string]string `json:"variables,omitempty"`
}

// WhatsAppAudience is a saved recipient list for bulk sends.
type WhatsAppAudience struct {
	ID          string                  `json:"id"`
	Name        string                  `json:"name"`
	Description *string                 `json:"description"`
	Entries     []WhatsAppAudienceEntry `json:"entries"`
	EntryCount  int                     `json:"entryCount"`
	CreatedAt   string                  `json:"createdAt"`
	UpdatedAt   string                  `json:"updatedAt"`
}

// CreateWhatsAppAudienceParams is the request body for creating an
// audience. Entries accept plain phone strings or WhatsAppAudienceEntry
// values for per-recipient variables (interface{} mirrors the API's
// string-or-object union).
type CreateWhatsAppAudienceParams struct {
	Name        string `json:"name"`
	Description string `json:"description,omitempty"`
	// Entries: each element is either a phone string or a
	// WhatsAppAudienceEntry.
	Entries []interface{} `json:"entries"`
}

// UpdateWhatsAppAudienceParams is a partial audience update.
type UpdateWhatsAppAudienceParams struct {
	Name        string  `json:"name,omitempty"`
	Description *string `json:"description,omitempty"`
	// Entries: each element is either a phone string or a
	// WhatsAppAudienceEntry. Nil means "don't change".
	Entries []interface{} `json:"entries,omitempty"`
}

// WhatsAppSendParams configures a single or bulk WhatsApp send.
type WhatsAppSendParams struct {
	// From is the sender number — a connected number's SessionID or
	// PhoneNumber. Omit to use the company's only connected number.
	From string `json:"from,omitempty"`
	// To is a single recipient phone (E.164). Provide To OR AudienceID.
	To string `json:"to,omitempty"`
	// AudienceID targets a saved audience (bulk send). Provide To OR
	// AudienceID.
	AudienceID string `json:"audienceId,omitempty"`
	// TemplateID selects the template to render. Provide TemplateID OR
	// raw Body.
	TemplateID string `json:"templateId,omitempty"`
	// Body is the raw message body with {{variables}} (when not using a
	// template).
	Body string `json:"body,omitempty"`
	// Variables are global values, merged UNDER per-recipient audience
	// variables.
	Variables map[string]string `json:"variables,omitempty"`
}

// WhatsAppSendResultEntry is the per-recipient outcome of a send.
type WhatsAppSendResultEntry struct {
	To          string `json:"to"`
	Status      string `json:"status"` // sent | failed
	WaMessageID string `json:"waMessageId,omitempty"`
	Error       string `json:"error,omitempty"`
}

// WhatsAppSendResult is the summary returned by WhatsApp.Send.
type WhatsAppSendResult struct {
	Total   int                       `json:"total"`
	Sent    int                       `json:"sent"`
	Failed  int                       `json:"failed"`
	Results []WhatsAppSendResultEntry `json:"results"`
}

// WhatsAppSendStatus is the state of one logged WhatsApp message.
type WhatsAppSendStatus string

const (
	WhatsAppSendStatusQueued WhatsAppSendStatus = "queued"
	WhatsAppSendStatusSent   WhatsAppSendStatus = "sent"
	WhatsAppSendStatusFailed WhatsAppSendStatus = "failed"
)

// WhatsAppLog is one recorded WhatsApp send attempt.
type WhatsAppLog struct {
	ID          string             `json:"id"`
	SessionID   string             `json:"sessionId"`
	To          string             `json:"to"`
	TemplateID  *string            `json:"templateId"`
	AudienceID  *string            `json:"audienceId"`
	Status      WhatsAppSendStatus `json:"status"`
	WaMessageID *string            `json:"waMessageId"`
	Error       *string            `json:"error"`
	CreatedAt   string             `json:"createdAt"`
}

// WhatsAppLogListParams are the optional filters for WhatsApp.Logs.List.
type WhatsAppLogListParams struct {
	Page       int
	Limit      int
	Status     WhatsAppSendStatus
	SessionID  string
	TemplateID string
}

// WhatsAppLogListResult is the paginated response from WhatsApp.Logs.List.
type WhatsAppLogListResult struct {
	Data  []WhatsAppLog `json:"data"`
	Page  int           `json:"page"`
	Limit int           `json:"limit"`
	Total int           `json:"total"`
}

// ── Sub-services ─────────────────────────────────────────────────────────

// WhatsAppNumbersService lists the company's WhatsApp numbers.
type WhatsAppNumbersService struct {
	h *httpClient
}

// List returns the company's WhatsApp numbers (only Connected ones can send).
func (s *WhatsAppNumbersService) List() ([]WhatsAppNumber, error) {
	return doRequest[[]WhatsAppNumber](s.h, http.MethodGet, "/numbers", nil, nil)
}

// WhatsAppTemplatesService manages WhatsApp message templates.
type WhatsAppTemplatesService struct {
	h *httpClient
}

// List returns all WhatsApp templates.
func (s *WhatsAppTemplatesService) List() ([]WhatsAppTemplate, error) {
	return doRequest[[]WhatsAppTemplate](s.h, http.MethodGet, "/templates", nil, nil)
}

// Get returns a single WhatsApp template by id.
func (s *WhatsAppTemplatesService) Get(id string) (*WhatsAppTemplate, error) {
	t, err := doRequest[WhatsAppTemplate](s.h, http.MethodGet,
		"/templates/"+url.PathEscape(id), nil, nil)
	if err != nil {
		return nil, err
	}
	return &t, nil
}

// Create creates a WhatsApp template. Variables are auto-extracted from
// the body.
func (s *WhatsAppTemplatesService) Create(params CreateWhatsAppTemplateParams) (*WhatsAppTemplate, error) {
	t, err := doRequest[WhatsAppTemplate](s.h, http.MethodPost, "/templates", nil, params)
	if err != nil {
		return nil, err
	}
	return &t, nil
}

// Update patches a WhatsApp template.
func (s *WhatsAppTemplatesService) Update(id string, params UpdateWhatsAppTemplateParams) (*WhatsAppTemplate, error) {
	t, err := doRequest[WhatsAppTemplate](s.h, http.MethodPatch,
		"/templates/"+url.PathEscape(id), nil, params)
	if err != nil {
		return nil, err
	}
	return &t, nil
}

// Delete removes a WhatsApp template.
func (s *WhatsAppTemplatesService) Delete(id string) error {
	_, err := doRequest[map[string]interface{}](s.h, http.MethodDelete,
		"/templates/"+url.PathEscape(id), nil, nil)
	return err
}

// WhatsAppAudiencesService manages saved recipient lists.
type WhatsAppAudiencesService struct {
	h *httpClient
}

// List returns all WhatsApp audiences.
func (s *WhatsAppAudiencesService) List() ([]WhatsAppAudience, error) {
	return doRequest[[]WhatsAppAudience](s.h, http.MethodGet, "/audiences", nil, nil)
}

// Get returns a single WhatsApp audience by id.
func (s *WhatsAppAudiencesService) Get(id string) (*WhatsAppAudience, error) {
	a, err := doRequest[WhatsAppAudience](s.h, http.MethodGet,
		"/audiences/"+url.PathEscape(id), nil, nil)
	if err != nil {
		return nil, err
	}
	return &a, nil
}

// Create creates a WhatsApp audience. Entries accept plain phone strings
// or WhatsAppAudienceEntry values for per-recipient variable maps.
func (s *WhatsAppAudiencesService) Create(params CreateWhatsAppAudienceParams) (*WhatsAppAudience, error) {
	a, err := doRequest[WhatsAppAudience](s.h, http.MethodPost, "/audiences", nil, params)
	if err != nil {
		return nil, err
	}
	return &a, nil
}

// Update patches a WhatsApp audience.
func (s *WhatsAppAudiencesService) Update(id string, params UpdateWhatsAppAudienceParams) (*WhatsAppAudience, error) {
	a, err := doRequest[WhatsAppAudience](s.h, http.MethodPatch,
		"/audiences/"+url.PathEscape(id), nil, params)
	if err != nil {
		return nil, err
	}
	return &a, nil
}

// Delete removes a WhatsApp audience.
func (s *WhatsAppAudiencesService) Delete(id string) error {
	_, err := doRequest[map[string]interface{}](s.h, http.MethodDelete,
		"/audiences/"+url.PathEscape(id), nil, nil)
	return err
}

// WhatsAppLogsService reads the WhatsApp send log.
type WhatsAppLogsService struct {
	h *httpClient
}

// List returns WhatsApp send-log entries (paginated).
func (s *WhatsAppLogsService) List(params *WhatsAppLogListParams) (*WhatsAppLogListResult, error) {
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
		if params.SessionID != "" {
			q["sessionId"] = params.SessionID
		}
		if params.TemplateID != "" {
			q["templateId"] = params.TemplateID
		}
	}
	r, err := doRequest[WhatsAppLogListResult](s.h, http.MethodGet, "/logs", q, nil)
	if err != nil {
		return nil, err
	}
	return &r, nil
}

// ── Root resource ────────────────────────────────────────────────────────

// WhatsAppService — WhatsApp Santral: send template-based messages, manage
// templates & audiences, list connected numbers, and read send logs. All
// via the same stk_ token as mail and storage.
type WhatsAppService struct {
	Numbers   *WhatsAppNumbersService
	Templates *WhatsAppTemplatesService
	Audiences *WhatsAppAudiencesService
	Logs      *WhatsAppLogsService

	h *httpClient
}

func newWhatsAppService(h *httpClient) *WhatsAppService {
	return &WhatsAppService{
		Numbers:   &WhatsAppNumbersService{h: h},
		Templates: &WhatsAppTemplatesService{h: h},
		Audiences: &WhatsAppAudiencesService{h: h},
		Logs:      &WhatsAppLogsService{h: h},
		h:         h,
	}
}

// Send delivers a WhatsApp message to a single recipient (To) or a whole
// audience (AudienceID), rendering a template (TemplateID) or raw Body with
// {{variables}}. Returns a per-recipient result summary.
func (s *WhatsAppService) Send(params WhatsAppSendParams) (*WhatsAppSendResult, error) {
	r, err := doRequest[WhatsAppSendResult](s.h, http.MethodPost, "/send", nil, params)
	if err != nil {
		return nil, err
	}
	return &r, nil
}
