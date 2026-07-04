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

// CreateTemplateParams is the request body for creating a template.
// Name, Subject, and MJMLBody accept either a flat string (single locale)
// or a map[string]string keyed by language code ({"tr": ..., "en": ...}).
//
// Note: the variable list is NOT part of the input — the platform extracts
// placeholders from the body automatically and returns them on the
// resulting Template.Variables. Requires the templates.manage permission.
type CreateTemplateParams struct {
	Name     interface{} `json:"name"`
	Subject  interface{} `json:"subject"`
	MJMLBody interface{} `json:"mjmlBody"`
	DomainID string      `json:"domainId"`
}

// UpdateTemplateParams is a partial update — send only the fields you want
// to change. Requires the templates.manage permission.
type UpdateTemplateParams struct {
	Name     interface{} `json:"name,omitempty"`
	Subject  interface{} `json:"subject,omitempty"`
	MJMLBody interface{} `json:"mjmlBody,omitempty"`
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
// To and CC accept either a single string or a slice of strings
// (set the fields directly, e.g. To: "a@x.com" or To: []string{...}).
type SendParams struct {
	To         interface{} `json:"to"`
	From       string      `json:"from"`
	Subject    string      `json:"subject"`
	DomainID   string      `json:"domainId"`
	CC         interface{} `json:"cc,omitempty"`
	TemplateID string      `json:"templateId,omitempty"`
	// Template language code (e.g. "en", "tr"). Falls back to default if omitted.
	Lang        string            `json:"lang,omitempty"`
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
	// URL is returned by some endpoints (e.g. upload results); when present
	// it can be used directly instead of constructing a CDN URL.
	URL string `json:"url,omitempty"`
}

// MediaImageMeta holds image-specific metadata for a media record.
type MediaImageMeta struct {
	Width       int              `json:"width"`
	Height      int              `json:"height"`
	Orientation string           `json:"orientation"` // landscape | portrait | square
	Thumbnails  []MediaThumbnail `json:"thumbnails"`
}

// MediaVideoVariant is a single transcoded video rung. Generated by the
// storage CDN when TranscodeVideo is passed to Media.Upload. Reachable via
// /f/<mediaId>/<height> (e.g. /f/abc/720 for the 720p variant).
type MediaVideoVariant struct {
	Height   int    `json:"height"`
	Width    int    `json:"width"`
	FileName string `json:"fileName"`
	Size     int64  `json:"size"`
	Bitrate  int64  `json:"bitrate,omitempty"`
}

// MediaVideoMeta holds video-specific metadata for a media record.
type MediaVideoMeta struct {
	Width  int `json:"width"`
	Height int `json:"height"`
	// Duration is the length in seconds. May be 0 if the probe failed.
	Duration float64             `json:"duration"`
	Variants []MediaVideoVariant `json:"variants"`
}

// MediaProcessing is the async background-processing tracker. Populated
// only on uploads that opted into the multi-quality video ladder. Poll
// Media.Get while Status is "queued" / "processing".
type MediaProcessing struct {
	Status            string `json:"status"` // queued | processing | completed | failed
	VariantsTotal     int    `json:"variantsTotal,omitempty"`
	VariantsCompleted int    `json:"variantsCompleted,omitempty"`
	Error             string `json:"error,omitempty"`
	StartedAt         string `json:"startedAt,omitempty"`
	CompletedAt       string `json:"completedAt,omitempty"`
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
	// VideoMeta is populated for video uploads with TranscodeVideo: variant
	// rungs stream in over time as the background pipeline finishes each
	// ladder step.
	VideoMeta *MediaVideoMeta `json:"videoMeta,omitempty"`
	// Processing tracks async background work (currently only video
	// transcoding). Treat anything other than "completed" / nil as
	// "still in flight".
	Processing *MediaProcessing `json:"processing,omitempty"`
	// URL is the direct CDN URL for public buckets — not always present.
	// When absent, callers must use the download proxy endpoint.
	URL string `json:"url,omitempty"`
	// DownloadURL is the authed download URL (short-lived signed link or proxy).
	DownloadURL string `json:"downloadUrl,omitempty"`
	CreatedAt   string `json:"createdAt"`
	UpdatedAt   string `json:"updatedAt"`
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
	// CompressVideo runs a light single-pass H.264 re-encode of the source
	// video at the source resolution. Trims a typical phone/screen-recording
	// upload by 30-60% with no visible quality loss. Roughly doubles the
	// upload-handler latency since the request waits for the encode before
	// returning. Ignored on non-video uploads.
	CompressVideo bool
	// TranscodeVideo generates a multi-quality variant ladder
	// (144p / 480p / 720p / 1080p). Implies CompressVideo. Variants are
	// generated asynchronously after the upload response: the API returns
	// immediately with Media.Processing.Status == "queued", then streams
	// ladder rungs into Media.VideoMeta.Variants one by one. Poll Media.Get
	// to watch VariantsCompleted climb — once Processing.Status ==
	// "completed" the ladder is fully available via /f/<id>/<height>.
	// Ignored on non-video uploads.
	TranscodeVideo bool
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

// ── Audience / Contacts ───────────────────────────────────────────────────

// ContactStatus is the lifecycle state of a contact.
type ContactStatus string

const (
	ContactStatusActive       ContactStatus = "active"
	ContactStatusUnsubscribed ContactStatus = "unsubscribed"
	ContactStatusBounced      ContactStatus = "bounced"
)

// Contact is a single audience member.
type Contact struct {
	ID            string                 `json:"id"`
	CompanyID     string                 `json:"companyId"`
	Email         string                 `json:"email"`
	Name          string                 `json:"name,omitempty"`
	Tags          []string               `json:"tags"`
	Status        ContactStatus          `json:"status"`
	Metadata      map[string]interface{} `json:"metadata"`
	LastEmailedAt *string                `json:"lastEmailedAt,omitempty"`
	CreatedAt     string                 `json:"createdAt"`
	UpdatedAt     string                 `json:"updatedAt"`
}

// ContactList is a named grouping of contacts.
type ContactList struct {
	ID          string `json:"id"`
	CompanyID   string `json:"companyId"`
	Name        string `json:"name"`
	Description string `json:"description,omitempty"`
	MemberCount int    `json:"memberCount,omitempty"`
	CreatedAt   string `json:"createdAt"`
	UpdatedAt   string `json:"updatedAt"`
}

// CreateContactParams is the request body for creating a contact.
// New contacts default to status "active".
type CreateContactParams struct {
	Email    string                 `json:"email"`
	Name     string                 `json:"name,omitempty"`
	Tags     []string               `json:"tags,omitempty"`
	Metadata map[string]interface{} `json:"metadata,omitempty"`
}

// UpdateContactParams is a partial contact update. Pass Status to mark a
// contact unsubscribed/bounced.
type UpdateContactParams struct {
	Email    string                 `json:"email,omitempty"`
	Name     string                 `json:"name,omitempty"`
	Tags     []string               `json:"tags,omitempty"`
	Status   ContactStatus          `json:"status,omitempty"`
	Metadata map[string]interface{} `json:"metadata,omitempty"`
}

// ContactListParams are the optional filters for Audience.Contacts.List.
// Tags are comma-joined when sent over the wire.
type ContactListParams struct {
	Page   int
	Limit  int
	Status ContactStatus
	Tags   []string
}

// ContactListResult is the paginated response from Audience.Contacts.List.
type ContactListResult struct {
	Contacts []Contact `json:"contacts"`
	Total    int       `json:"total"`
	Page     int       `json:"page"`
	Limit    int       `json:"limit"`
}

// CreateAudienceListParams is the request body for creating an audience list.
type CreateAudienceListParams struct {
	Name        string `json:"name"`
	Description string `json:"description,omitempty"`
}

// ── Suppressions ──────────────────────────────────────────────────────────

// Suppression is one address that will not receive mail until removed.
type Suppression struct {
	ID        string `json:"id"`
	Email     string `json:"email"`
	Reason    string `json:"reason"`
	DomainID  string `json:"domainId"`
	CreatedAt string `json:"createdAt"`
	Domain    *struct {
		Domain string `json:"domain"`
	} `json:"domain,omitempty"`
}

// AddSuppressionParams is the request body for manually suppressing an
// address. Reason is a free-form label (e.g. "manual", "complaint");
// defaults backend-side when omitted.
type AddSuppressionParams struct {
	Email    string `json:"email"`
	Reason   string `json:"reason,omitempty"`
	DomainID string `json:"domainId"`
}

// SuppressionListParams are the optional filters for Suppressions.List.
type SuppressionListParams struct {
	Page     int
	Limit    int
	DomainID string
	Reason   string
}

// ── Webhooks ──────────────────────────────────────────────────────────────

// WebhookEvent is one subscribable mail event.
type WebhookEvent string

const (
	WebhookEventSent         WebhookEvent = "sent"
	WebhookEventBounced      WebhookEvent = "bounced"
	WebhookEventFailed       WebhookEvent = "failed"
	WebhookEventOpened       WebhookEvent = "opened"
	WebhookEventClicked      WebhookEvent = "clicked"
	WebhookEventUnsubscribed WebhookEvent = "unsubscribed"
)

// Webhook is a registered event receiver. Secret is returned ONLY on
// create — store it then; subsequent reads omit it.
type Webhook struct {
	ID       string   `json:"id"`
	URL      string   `json:"url"`
	Events   []string `json:"events"`
	Active   bool     `json:"active"`
	DomainID string   `json:"domainId"`
	// Secret is returned only on create — used to verify HMAC signatures
	// of deliveries.
	Secret    string `json:"secret,omitempty"`
	CreatedAt string `json:"createdAt"`
	UpdatedAt string `json:"updatedAt"`
}

// CreateWebhookParams is the request body for registering a webhook.
type CreateWebhookParams struct {
	URL      string         `json:"url"`
	Events   []WebhookEvent `json:"events"`
	DomainID string         `json:"domainId"`
}

// UpdateWebhookParams is a partial webhook update. Active is a pointer so
// you can distinguish "don't change" from "set to false".
type UpdateWebhookParams struct {
	URL    string         `json:"url,omitempty"`
	Events []WebhookEvent `json:"events,omitempty"`
	Active *bool          `json:"active,omitempty"`
}

// WebhookDeliveryStatus is the outcome of a recorded dispatch.
type WebhookDeliveryStatus string

const (
	WebhookDeliveryStatusSuccess WebhookDeliveryStatus = "success"
	WebhookDeliveryStatusFailed  WebhookDeliveryStatus = "failed"
	WebhookDeliveryStatusPending WebhookDeliveryStatus = "pending"
)

// WebhookDelivery is one recorded test/replay dispatch row.
type WebhookDelivery struct {
	ID        string                 `json:"id"`
	WebhookID string                 `json:"webhookId"`
	CompanyID string                 `json:"companyId"`
	Kind      string                 `json:"kind"` // test | replay
	Event     string                 `json:"event"`
	Payload   map[string]interface{} `json:"payload"`
	// URL the dispatcher actually POSTed to (frozen at dispatch time).
	URL string `json:"url"`
	// ResponseStatus is the HTTP status returned by the receiver — 0 if the
	// request never landed.
	ResponseStatus int `json:"responseStatus"`
	// ResponseBody is truncated to a maximum of 4 KB.
	ResponseBody string                `json:"responseBody"`
	DurationMs   int64                 `json:"durationMs"`
	Status       WebhookDeliveryStatus `json:"status"`
	Error        string                `json:"error,omitempty"`
	// ReplayOf is set when this row is a replay of an earlier delivery.
	ReplayOf string `json:"replayOf,omitempty"`
	// TriggeredBy is a user id, email, or "system" for token/internal callers.
	TriggeredBy string `json:"triggeredBy"`
	CreatedAt   string `json:"createdAt"`
}

// WebhookDeliveryListParams are the optional filters for
// Webhooks.Deliveries(id).List.
type WebhookDeliveryListParams struct {
	Page   int
	Limit  int
	Status WebhookDeliveryStatus
}

// WebhookDeliveryListResult is the paginated delivery-log response.
type WebhookDeliveryListResult struct {
	Items []WebhookDelivery `json:"items"`
	Total int               `json:"total"`
	Page  int               `json:"page"`
	Limit int               `json:"limit"`
}

// WebhookTestParams is the request body for manually firing a custom event
// payload at a webhook.
type WebhookTestParams struct {
	Event   string                 `json:"event"`
	Payload map[string]interface{} `json:"payload"`
}

// WebhookDispatchResult is the outcome of a test or replay dispatch.
type WebhookDispatchResult struct {
	DeliveryID     string `json:"deliveryId"`
	ResponseStatus int    `json:"responseStatus"`
	DurationMs     int64  `json:"durationMs"`
	Status         string `json:"status"` // success | failed
	Error          string `json:"error,omitempty"`
}

// ── Logs ──────────────────────────────────────────────────────────────────

// MailLogStatus is the delivery state of a mail-log entry.
type MailLogStatus string

const (
	MailLogStatusQueued     MailLogStatus = "queued"
	MailLogStatusProcessing MailLogStatus = "processing"
	MailLogStatusSent       MailLogStatus = "sent"
	MailLogStatusBounced    MailLogStatus = "bounced"
	MailLogStatusFailed     MailLogStatus = "failed"
)

// MailLog is one send attempt recorded by the platform.
type MailLog struct {
	ID        string        `json:"id"`
	To        string        `json:"to"`
	From      string        `json:"from"`
	Subject   string        `json:"subject"`
	Status    MailLogStatus `json:"status"`
	MessageID *string       `json:"messageId"`
	DomainID  string        `json:"domainId"`
	Domain    *struct {
		Domain string `json:"domain"`
	} `json:"domain,omitempty"`
	TemplateID  *string                `json:"templateId"`
	Variables   map[string]interface{} `json:"variables"`
	ScheduledAt *string                `json:"scheduledAt,omitempty"`
	SentAt      *string                `json:"sentAt"`
	BouncedAt   *string                `json:"bouncedAt"`
	OpenedAt    *string                `json:"openedAt,omitempty"`
	ClickedAt   *string                `json:"clickedAt,omitempty"`
	Error       *string                `json:"error"`
	CreatedAt   string                 `json:"createdAt"`
}

// LogListParams are the optional filters for Logs.List. From/To are ISO
// timestamp bounds (inclusive).
type LogListParams struct {
	Page     int
	Limit    int
	Status   MailLogStatus
	DomainID string
	From     string
	To       string
}
