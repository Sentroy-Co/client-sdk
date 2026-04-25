package sentroy

import "io"

// apiResponse is the standard API envelope returned by all endpoints.
type apiResponse[T any] struct {
	Data  T      `json:"data"`
	Error string `json:"error,omitempty"`
}

// Domain represents a verified sending domain.
type Domain struct {
	ID            string `json:"id"`
	Domain        string `json:"domain"`
	Status        string `json:"status"` // pending | verifying | active | failed
	SPFVerified   bool   `json:"spfVerified"`
	DKIMVerified  bool   `json:"dkimVerified"`
	DMARCVerified bool   `json:"dmarcVerified"`
	CreatedAt     string `json:"createdAt"`
	UpdatedAt     string `json:"updatedAt"`
}

// MailboxUser represents a mailbox account.
type MailboxUser struct {
	Email    string `json:"email"`
	Domain   string `json:"domain"`
	Username string `json:"username"`
}

// Template represents an email template.
// Name, Subject, MJMLBody, and HTMLBody use interface{} because the value
// can be either a plain string or a map[string]string for localized content.
type Template struct {
	ID         string      `json:"id"`
	Name       interface{} `json:"name"`
	Subject    interface{} `json:"subject"`
	MJMLBody   interface{} `json:"mjmlBody"`
	HTMLBody   interface{} `json:"htmlBody,omitempty"`
	Variables  []string    `json:"variables,omitempty"`
	DomainID   string      `json:"domainId,omitempty"`
	DomainName string      `json:"domainName,omitempty"`
	CreatedAt  string      `json:"createdAt"`
	UpdatedAt  string      `json:"updatedAt"`
}

// MessageAddress represents an email address with an optional display name.
type MessageAddress struct {
	Name    string `json:"name"`
	Address string `json:"address"`
}

// MessageSummary is the abbreviated representation returned by inbox list.
type MessageSummary struct {
	UID            int              `json:"uid"`
	Subject        string           `json:"subject"`
	From           MessageAddress   `json:"from"`
	To             []MessageAddress `json:"to"`
	Date           string           `json:"date"`
	Seen           bool             `json:"seen"`
	Flagged        bool             `json:"flagged"`
	Size           int              `json:"size"`
	HasAttachments bool             `json:"hasAttachments"`
	Preview        string           `json:"preview"`
	MessageID      *string          `json:"messageId"`
	InReplyTo      *string          `json:"inReplyTo"`
	Category       string           `json:"category"`
}

// MessageDetail is the full message representation.
type MessageDetail struct {
	UID         int               `json:"uid"`
	Subject     string            `json:"subject"`
	From        MessageAddress    `json:"from"`
	To          []MessageAddress  `json:"to"`
	CC          []MessageAddress  `json:"cc"`
	ReplyTo     *MessageAddress   `json:"replyTo"`
	Date        string            `json:"date"`
	Seen        bool              `json:"seen"`
	Flagged     bool              `json:"flagged"`
	TextBody    *string           `json:"textBody"`
	HTMLBody    *string           `json:"htmlBody"`
	Attachments []AttachmentInfo  `json:"attachments"`
	Headers     map[string]string `json:"headers"`
	MessageID   *string           `json:"messageId"`
	InReplyTo   *string           `json:"inReplyTo"`
	References  []string          `json:"references"`
	Folder      string            `json:"folder,omitempty"`
}

// AttachmentInfo describes an attachment in a message.
type AttachmentInfo struct {
	PartID      string  `json:"partId"`
	Filename    string  `json:"filename"`
	Size        int     `json:"size"`
	ContentType string  `json:"contentType"`
	ContentID   *string `json:"contentId"`
}

// Mailbox represents an IMAP folder.
type Mailbox struct {
	Name           string  `json:"name"`
	Path           string  `json:"path"`
	SpecialUse     *string `json:"specialUse"`
	TotalMessages  int     `json:"totalMessages"`
	UnreadMessages int     `json:"unreadMessages"`
}

// InboxListParams are the optional query parameters for listing inbox messages.
type InboxListParams struct {
	Mailbox    string
	Folder     string
	Page       int
	Limit      int
	UnreadOnly bool
}

// Attachment is a file to include when sending an email.
type Attachment struct {
	Filename    string `json:"filename"`
	Content     string `json:"content"`
	ContentType string `json:"contentType,omitempty"`
}

// SendParams are the parameters for sending an email.
// To and CC accept either a single string or a slice of strings.
// Use ToList / CCList helpers or set the fields directly.
type SendParams struct {
	To          interface{}       `json:"to"`
	From        string            `json:"from"`
	Subject     string            `json:"subject"`
	DomainID    string            `json:"domainId"`
	CC          interface{}       `json:"cc,omitempty"`
	TemplateID  string            `json:"templateId,omitempty"`
	// Template language code (e.g. "en", "tr"). Falls back to default if omitted.
	Lang        string              `json:"lang,omitempty"`
	HTML        string            `json:"html,omitempty"`
	Text        string            `json:"text,omitempty"`
	Variables   map[string]string `json:"variables,omitempty"`
	ReplyTo     string            `json:"replyTo,omitempty"`
	Attachments []Attachment      `json:"attachments,omitempty"`
	ScheduledAt string            `json:"scheduledAt,omitempty"`
	Headers     map[string]string `json:"headers,omitempty"`
	InReplyTo   string            `json:"inReplyTo,omitempty"`
	References  []string          `json:"references,omitempty"`
}

// SendResult is the response from sending an email.
type SendResult struct {
	JobID       string `json:"jobId"`
	MailLogID   string `json:"mailLogId"`
	Status      string `json:"status"`
	ScheduledAt string `json:"scheduledAt,omitempty"`
}

// Bucket represents a storage bucket — an isolated container for files
// with its own visibility and usage counters.
type Bucket struct {
	ID          string `json:"id"`
	CompanyID   string `json:"companyId"`
	Name        string `json:"name"`
	Slug        string `json:"slug"`
	Description string `json:"description,omitempty"`
	IsPublic    bool   `json:"isPublic"`
	StorageUsed int64  `json:"storageUsed"`
	FileCount   int    `json:"fileCount"`
	CreatedAt   string `json:"createdAt"`
	UpdatedAt   string `json:"updatedAt"`
}

// CreateBucketParams is the request body for creating a bucket.
type CreateBucketParams struct {
	Name        string `json:"name"`
	Slug        string `json:"slug,omitempty"`
	Description string `json:"description,omitempty"`
	IsPublic    bool   `json:"isPublic,omitempty"`
}

// UpdateBucketParams is the request body for updating a bucket. IsPublic
// is a pointer so you can distinguish "don't change" from "set to false".
type UpdateBucketParams struct {
	Name        string `json:"name,omitempty"`
	Description string `json:"description,omitempty"`
	IsPublic    *bool  `json:"isPublic,omitempty"`
}

// MediaType categorizes a stored file by content type.
type MediaType string

const (
	MediaTypeImage    MediaType = "image"
	MediaTypeVideo    MediaType = "video"
	MediaTypeAudio    MediaType = "audio"
	MediaTypeDocument MediaType = "document"
	MediaTypeOther    MediaType = "other"
)

// MediaThumbnail is a pre-generated resized variant of an image.
type MediaThumbnail struct {
	Width    int    `json:"width"`
	Height   int    `json:"height"`
	FileName string `json:"fileName"`
	Size     int64  `json:"size"`
}

// MediaImageMeta holds image-specific metadata for a media record.
type MediaImageMeta struct {
	Width       int              `json:"width"`
	Height      int              `json:"height"`
	Orientation string           `json:"orientation"` // landscape | portrait | square
	Thumbnails  []MediaThumbnail `json:"thumbnails"`
}

// Media represents a single file stored inside a bucket.
type Media struct {
	ID           string          `json:"id"`
	BucketID     string          `json:"bucketId"`
	CompanyID    string          `json:"companyId"`
	FileName     string          `json:"fileName"`
	OriginalName string          `json:"originalName"`
	Type         MediaType       `json:"type"`
	Size         int64           `json:"size"`
	MimeType     string          `json:"mimeType"`
	Folder       string          `json:"folder"`
	UploadedBy   string          `json:"uploadedBy"`
	Tags         []string        `json:"tags"`
	Alt          string          `json:"alt,omitempty"`
	Caption      string          `json:"caption,omitempty"`
	IsPublic     bool            `json:"isPublic"`
	ImageMeta    *MediaImageMeta `json:"imageMeta,omitempty"`
	CreatedAt    string          `json:"createdAt"`
	UpdatedAt    string          `json:"updatedAt"`
}

// MediaListResult is the paginated response from Media.List.
type MediaListResult struct {
	Items []Media `json:"items"`
	Total int     `json:"total"`
	Limit int     `json:"limit"`
	Skip  int     `json:"skip"`
}

// MediaListParams are the optional filters for Media.List.
type MediaListParams struct {
	Type   MediaType
	Folder string
	Limit  int
	Skip   int
}

// UploadMediaParams configures a single Media.Upload call. Body accepts
// any io.Reader — *os.File, bytes.Buffer, http.Response.Body all work.
type UploadMediaParams struct {
	Filename string
	Body     io.Reader
	Folder   string
	IsPublic *bool
	Alt      string
	Caption  string
	Tags     []string
}

// ── Storage quota / usage ─────────────────────────────────────────────────

// StorageQuota is the plan-level storage quota for a company. Mail and
// storage share the same byte pool: Used is the storage slice, MailUsed
// what the mail product has occupied. Limit of 0 means unlimited.
type StorageQuota struct {
	Used     int64  `json:"used"`
	Limit    int64  `json:"limit"`
	MailUsed int64  `json:"mailUsed"`
	PlanName string `json:"planName,omitempty"`
}

// StorageUsageBucket describes one bucket's contribution to total usage.
type StorageUsageBucket struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Slug        string `json:"slug"`
	StorageUsed int64  `json:"storageUsed"`
	FileCount   int64  `json:"fileCount"`
	IsPublic    bool   `json:"isPublic"`
}

// StorageUsageByType is one media-type aggregation row.
type StorageUsageByType struct {
	Type  string `json:"type"`
	Count int64  `json:"count"`
	Bytes int64  `json:"bytes"`
}

// StorageUsage is the combined dashboard payload returned by Storage.Usage.
type StorageUsage struct {
	Quota   StorageQuota         `json:"quota"`
	Buckets []StorageUsageBucket `json:"buckets"`
	ByType  []StorageUsageByType `json:"byType"`
}
