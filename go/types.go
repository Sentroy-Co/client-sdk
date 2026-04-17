package sentroy

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
