package sentroy

import (
	"net/http"
	"net/url"
)

// BucketsService provides access to storage bucket management endpoints.
type BucketsService struct {
	h *httpClient
}

func newBucketsService(h *httpClient) *BucketsService {
	return &BucketsService{h: h}
}

// List returns every bucket belonging to the company.
func (s *BucketsService) List() ([]Bucket, error) {
	return doRequest[[]Bucket](s.h, http.MethodGet, "/buckets", nil, nil)
}

// Get returns a single bucket by its slug.
func (s *BucketsService) Get(slug string) (*Bucket, error) {
	b, err := doRequest[Bucket](s.h, http.MethodGet, "/buckets/"+url.PathEscape(slug), nil, nil)
	if err != nil {
		return nil, err
	}
	return &b, nil
}

// Create provisions a new bucket. If params.Slug is empty, a URL-safe slug
// is auto-derived from the name on the server.
func (s *BucketsService) Create(params CreateBucketParams) (*Bucket, error) {
	b, err := doRequest[Bucket](s.h, http.MethodPost, "/buckets", nil, params)
	if err != nil {
		return nil, err
	}
	return &b, nil
}

// Update changes a bucket's name, description, or visibility. Toggling
// IsPublic cascades to every existing file's S3 ACL + Media record; the
// call can take a while for large buckets.
func (s *BucketsService) Update(slug string, params UpdateBucketParams) (*Bucket, error) {
	b, err := doRequest[Bucket](s.h, http.MethodPatch, "/buckets/"+url.PathEscape(slug), nil, params)
	if err != nil {
		return nil, err
	}
	return &b, nil
}

// DeleteOptions controls how a bucket is deleted.
type DeleteOptions struct {
	// Force purges every file (S3 objects + Media records) before removing
	// the bucket. Without it, a non-empty bucket returns 409.
	Force bool
}

// Delete removes a bucket. If the bucket has files and opts.Force is false,
// the server returns 409 and nothing is changed.
func (s *BucketsService) Delete(slug string, opts *DeleteOptions) error {
	query := map[string]string{}
	if opts != nil && opts.Force {
		query["force"] = "true"
	}
	_, err := doRequest[map[string]interface{}](s.h, http.MethodDelete, "/buckets/"+url.PathEscape(slug), query, nil)
	return err
}
