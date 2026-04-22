package sentroy

import (
	"net/http"
	"net/url"
	"strconv"
)

// MediaService provides access to media (file) management inside buckets.
type MediaService struct {
	h *httpClient
}

func newMediaService(h *httpClient) *MediaService {
	return &MediaService{h: h}
}

// List returns files in a bucket (paginated).
func (s *MediaService) List(bucketSlug string, params *MediaListParams) (*MediaListResult, error) {
	query := map[string]string{}
	if params != nil {
		if params.Type != "" {
			query["type"] = string(params.Type)
		}
		if params.Folder != "" {
			query["folder"] = params.Folder
		}
		if params.Limit > 0 {
			query["limit"] = strconv.Itoa(params.Limit)
		}
		if params.Skip > 0 {
			query["skip"] = strconv.Itoa(params.Skip)
		}
	}
	r, err := doRequest[MediaListResult](s.h, http.MethodGet,
		"/buckets/"+url.PathEscape(bucketSlug)+"/media", query, nil)
	if err != nil {
		return nil, err
	}
	return &r, nil
}

// Get returns a single media record by ID.
func (s *MediaService) Get(bucketSlug, mediaID string) (*Media, error) {
	m, err := doRequest[Media](s.h, http.MethodGet,
		"/buckets/"+url.PathEscape(bucketSlug)+"/media/"+url.PathEscape(mediaID),
		nil, nil)
	if err != nil {
		return nil, err
	}
	return &m, nil
}

// Upload sends a file to a bucket. Any io.Reader works as body:
//
//	f, _ := os.Open("photo.jpg")
//	defer f.Close()
//	media, _ := client.Media.Upload("product-assets", sentroy.UploadMediaParams{
//	    Filename: "photo.jpg",
//	    Body:     f,
//	    IsPublic: sentroy.Ptr(true),
//	})
func (s *MediaService) Upload(bucketSlug string, params UploadMediaParams) (*Media, error) {
	filename := params.Filename
	if filename == "" {
		filename = "upload.bin"
	}

	fields := []multipartField{
		{name: "file", filename: filename, reader: params.Body},
	}
	if params.Folder != "" {
		fields = append(fields, multipartField{name: "folder", text: params.Folder})
	}
	if params.IsPublic != nil {
		v := "false"
		if *params.IsPublic {
			v = "true"
		}
		fields = append(fields, multipartField{name: "public", text: v})
	}
	if params.Alt != "" {
		fields = append(fields, multipartField{name: "alt", text: params.Alt})
	}
	if params.Caption != "" {
		fields = append(fields, multipartField{name: "caption", text: params.Caption})
	}
	if len(params.Tags) > 0 {
		joined := params.Tags[0]
		for _, t := range params.Tags[1:] {
			joined += "," + t
		}
		fields = append(fields, multipartField{name: "tags", text: joined})
	}

	m, err := postMultipart[Media](s.h,
		"/buckets/"+url.PathEscape(bucketSlug)+"/media", fields)
	if err != nil {
		return nil, err
	}
	return &m, nil
}

// Download retrieves the raw bytes of a file. Works for both public and
// private buckets — private ones are auth-gated through the storage app.
// Pass DownloadOptions.Quality for a pre-generated thumbnail width
// (e.g. 500); falls back to the original if the variant doesn't exist.
type DownloadOptions struct {
	// Quality requests a thumbnail width. 0 or "original" → original file.
	Quality int
}

// Download returns the file bytes plus the Content-Type header.
func (s *MediaService) Download(bucketSlug, mediaID string, opts *DownloadOptions) ([]byte, string, error) {
	query := map[string]string{}
	if opts != nil && opts.Quality > 0 {
		query["quality"] = strconv.Itoa(opts.Quality)
	}
	return s.h.fetchRaw(
		"/buckets/"+url.PathEscape(bucketSlug)+"/media/"+url.PathEscape(mediaID)+"/download",
		query,
	)
}

// Delete removes a file. Cascades through the CDN: S3 objects (original
// + thumbnails) are removed, then the Media record. If any S3 delete
// fails the record is kept so you can retry.
func (s *MediaService) Delete(bucketSlug, mediaID string) error {
	_, err := doRequest[map[string]interface{}](s.h, http.MethodDelete,
		"/buckets/"+url.PathEscape(bucketSlug)+"/media/"+url.PathEscape(mediaID),
		nil, nil)
	return err
}

// Ptr returns a pointer to the given value. Useful for UpdateBucketParams.IsPublic
// and UploadMediaParams.IsPublic where nil distinguishes "unset" from "false".
func Ptr[T any](v T) *T { return &v }
