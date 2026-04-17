package sentroy

import "net/http"

// SendService provides access to the email sending API endpoint.
type SendService struct {
	h *httpClient
}

func newSendService(h *httpClient) *SendService {
	return &SendService{h: h}
}

// Email sends an email with the given parameters.
func (s *SendService) Email(params SendParams) (*SendResult, error) {
	r, err := doRequest[SendResult](s.h, http.MethodPost, "/send", nil, params)
	if err != nil {
		return nil, err
	}
	return &r, nil
}
