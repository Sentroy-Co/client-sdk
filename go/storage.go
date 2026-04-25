package sentroy

import "net/http"

// StorageService exposes read-only quota / usage breakdown endpoints.
// Bucket and media CRUD live on Client.Buckets / Client.Media.
type StorageService struct {
	h *httpClient
}

func newStorageService(h *httpClient) *StorageService {
	return &StorageService{h: h}
}

// Quota returns the company's plan storage quota. Used reflects bucket
// totals, MailUsed what the mail product has stored under the same plan
// pool, Limit of 0 means unlimited.
func (s *StorageService) Quota() (*StorageQuota, error) {
	q, err := doRequest[StorageQuota](s.h, http.MethodGet, "/storage-quota", nil, nil)
	if err != nil {
		return nil, err
	}
	return &q, nil
}

// Usage returns a single combined dashboard payload — plan quota,
// per-bucket byte/file counts and per-type aggregation across the
// company. One round-trip; intended for usage UIs.
func (s *StorageService) Usage() (*StorageUsage, error) {
	u, err := doRequest[StorageUsage](s.h, http.MethodGet, "/usage", nil, nil)
	if err != nil {
		return nil, err
	}
	return &u, nil
}
