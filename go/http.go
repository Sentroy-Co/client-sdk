package sentroy

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// SentroyError is returned when the API responds with a non-2xx status code.
type SentroyError struct {
	StatusCode int
	Body       string
	Message    string
}

func (e *SentroyError) Error() string {
	if e.Message != "" {
		return e.Message
	}
	return fmt.Sprintf("Sentroy API error (%d)", e.StatusCode)
}

// httpClient wraps net/http.Client and handles auth, serialisation, and errors.
type httpClient struct {
	baseURL string
	token   string
	client  *http.Client
}

func newHTTPClient(baseURL, token string, timeout time.Duration) *httpClient {
	return &httpClient{
		baseURL: strings.TrimRight(baseURL, "/"),
		token:   token,
		client:  &http.Client{Timeout: timeout},
	}
}

func (h *httpClient) buildURL(path string, query map[string]string) (string, error) {
	u, err := url.Parse(h.baseURL + path)
	if err != nil {
		return "", err
	}
	if len(query) > 0 {
		q := u.Query()
		for k, v := range query {
			q.Set(k, v)
		}
		u.RawQuery = q.Encode()
	}
	return u.String(), nil
}

// doRequest performs an HTTP request, unwraps the {"data": T} envelope, and
// returns the typed result. It is a generic helper used by every service.
func doRequest[T any](h *httpClient, method, path string, query map[string]string, body interface{}) (T, error) {
	var zero T

	fullURL, err := h.buildURL(path, query)
	if err != nil {
		return zero, err
	}

	var reqBody io.Reader
	if body != nil {
		data, err := json.Marshal(body)
		if err != nil {
			return zero, fmt.Errorf("failed to marshal request body: %w", err)
		}
		reqBody = bytes.NewReader(data)
	}

	req, err := http.NewRequest(method, fullURL, reqBody)
	if err != nil {
		return zero, err
	}

	req.Header.Set("Authorization", "Bearer "+h.token)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}

	resp, err := h.client.Do(req)
	if err != nil {
		return zero, err
	}
	defer resp.Body.Close()

	rawBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return zero, fmt.Errorf("failed to read response body: %w", err)
	}

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		var envelope apiResponse[json.RawMessage]
		msg := fmt.Sprintf("Request failed with status %d", resp.StatusCode)
		if json.Unmarshal(rawBody, &envelope) == nil && envelope.Error != "" {
			msg = envelope.Error
		}
		return zero, &SentroyError{
			StatusCode: resp.StatusCode,
			Body:       string(rawBody),
			Message:    msg,
		}
	}

	var envelope apiResponse[T]
	if err := json.Unmarshal(rawBody, &envelope); err != nil {
		return zero, fmt.Errorf("failed to decode response: %w", err)
	}

	return envelope.Data, nil
}

// multipartField is one piece of a multipart/form-data request. Use text for
// string values and file (with filename + content reader) for a file part.
type multipartField struct {
	name     string
	text     string
	filename string
	reader   io.Reader
}

// postMultipart uploads a multipart/form-data body and unwraps the envelope.
// Used by media upload; callers build []multipartField explicitly so we don't
// hide the MIME boundary handling.
func postMultipart[T any](h *httpClient, path string, fields []multipartField) (T, error) {
	var zero T

	fullURL, err := h.buildURL(path, nil)
	if err != nil {
		return zero, err
	}

	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)
	for _, f := range fields {
		if f.reader != nil {
			part, err := writer.CreateFormFile(f.name, f.filename)
			if err != nil {
				return zero, fmt.Errorf("failed to create form file: %w", err)
			}
			if _, err := io.Copy(part, f.reader); err != nil {
				return zero, fmt.Errorf("failed to write file part: %w", err)
			}
		} else {
			if err := writer.WriteField(f.name, f.text); err != nil {
				return zero, fmt.Errorf("failed to write field: %w", err)
			}
		}
	}
	if err := writer.Close(); err != nil {
		return zero, fmt.Errorf("failed to close multipart writer: %w", err)
	}

	req, err := http.NewRequest(http.MethodPost, fullURL, body)
	if err != nil {
		return zero, err
	}
	req.Header.Set("Authorization", "Bearer "+h.token)
	req.Header.Set("Content-Type", writer.FormDataContentType())

	resp, err := h.client.Do(req)
	if err != nil {
		return zero, err
	}
	defer resp.Body.Close()

	rawBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return zero, fmt.Errorf("failed to read response body: %w", err)
	}

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		var envelope apiResponse[json.RawMessage]
		msg := fmt.Sprintf("Upload failed with status %d", resp.StatusCode)
		if json.Unmarshal(rawBody, &envelope) == nil && envelope.Error != "" {
			msg = envelope.Error
		}
		return zero, &SentroyError{
			StatusCode: resp.StatusCode,
			Body:       string(rawBody),
			Message:    msg,
		}
	}

	var envelope apiResponse[T]
	if err := json.Unmarshal(rawBody, &envelope); err != nil {
		return zero, fmt.Errorf("failed to decode response: %w", err)
	}
	return envelope.Data, nil
}

// fetchRaw issues a GET request and returns the raw response body bytes,
// without the {"data": T} envelope. Used by binary endpoints like media
// download.
func (h *httpClient) fetchRaw(path string, query map[string]string) ([]byte, string, error) {
	fullURL, err := h.buildURL(path, query)
	if err != nil {
		return nil, "", err
	}
	req, err := http.NewRequest(http.MethodGet, fullURL, nil)
	if err != nil {
		return nil, "", err
	}
	req.Header.Set("Authorization", "Bearer "+h.token)

	resp, err := h.client.Do(req)
	if err != nil {
		return nil, "", err
	}
	defer resp.Body.Close()

	rawBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, "", fmt.Errorf("failed to read response body: %w", err)
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, "", &SentroyError{
			StatusCode: resp.StatusCode,
			Body:       string(rawBody),
			Message:    fmt.Sprintf("Download failed with status %d", resp.StatusCode),
		}
	}
	return rawBody, resp.Header.Get("Content-Type"), nil
}
