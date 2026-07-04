package sentroy

import (
	"net/http"
	"net/url"
	"strconv"
)

// LogsService reads the mail send log.
type LogsService struct {
	h *httpClient
}

func newLogsService(h *httpClient) *LogsService {
	return &LogsService{h: h}
}

// List returns mail-log entries. Filter by status, domain, and ISO
// timestamp range (From / To, inclusive). Results are paginated
// server-side; pass Page and Limit to walk a large window.
func (s *LogsService) List(params *LogListParams) ([]MailLog, error) {
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
		if params.DomainID != "" {
			q["domainId"] = params.DomainID
		}
		if params.From != "" {
			q["from"] = params.From
		}
		if params.To != "" {
			q["to"] = params.To
		}
	}
	return doRequest[[]MailLog](s.h, http.MethodGet, "/logs", q, nil)
}

// Get returns a single mail-log entry by id.
func (s *LogsService) Get(id string) (*MailLog, error) {
	l, err := doRequest[MailLog](s.h, http.MethodGet, "/logs/"+url.PathEscape(id), nil, nil)
	if err != nil {
		return nil, err
	}
	return &l, nil
}
