package sentroy

import (
	"fmt"
	"net/http"
)

// InboxService provides access to inbox-related API endpoints.
type InboxService struct {
	h *httpClient
}

func newInboxService(h *httpClient) *InboxService {
	return &InboxService{h: h}
}

// InboxGetOptions are optional parameters for single-message operations.
type InboxGetOptions struct {
	Mailbox string
	Folder  string
}

// InboxMoveOptions are optional parameters for the Move operation.
type InboxMoveOptions struct {
	From    string
	Mailbox string
}

// List returns messages in a mailbox folder.
func (s *InboxService) List(params *InboxListParams) ([]MessageSummary, error) {
	q := make(map[string]string)
	if params != nil {
		if params.Mailbox != "" {
			q["mailbox"] = params.Mailbox
		}
		if params.Folder != "" {
			q["folder"] = params.Folder
		}
		if params.Page > 0 {
			q["page"] = fmt.Sprintf("%d", params.Page)
		}
		if params.Limit > 0 {
			q["limit"] = fmt.Sprintf("%d", params.Limit)
		}
		if params.UnreadOnly {
			q["unreadOnly"] = "true"
		}
	}
	return doRequest[[]MessageSummary](s.h, http.MethodGet, "/inbox", q, nil)
}

// Get returns the full detail of a single message.
func (s *InboxService) Get(uid int, opts *InboxGetOptions) (*MessageDetail, error) {
	q := make(map[string]string)
	if opts != nil {
		if opts.Mailbox != "" {
			q["mailbox"] = opts.Mailbox
		}
		if opts.Folder != "" {
			q["folder"] = opts.Folder
		}
	}
	d, err := doRequest[MessageDetail](s.h, http.MethodGet, fmt.Sprintf("/inbox/%d", uid), q, nil)
	if err != nil {
		return nil, err
	}
	return &d, nil
}

// ListFolders returns the IMAP folders (mailboxes) for a given email account.
func (s *InboxService) ListFolders(mailbox string) ([]Mailbox, error) {
	q := make(map[string]string)
	if mailbox != "" {
		q["mailbox"] = mailbox
	}
	return doRequest[[]Mailbox](s.h, http.MethodGet, "/inbox/mailboxes", q, nil)
}

// GetThread returns all messages in a thread identified by subject.
func (s *InboxService) GetThread(subject string, mailbox string) ([]MessageDetail, error) {
	q := map[string]string{"subject": subject}
	if mailbox != "" {
		q["mailbox"] = mailbox
	}
	return doRequest[[]MessageDetail](s.h, http.MethodGet, "/inbox/thread", q, nil)
}

// MarkAsRead marks a message as read (sets the \Seen flag).
func (s *InboxService) MarkAsRead(uid int, opts *InboxGetOptions) error {
	body := make(map[string]interface{})
	if opts != nil {
		if opts.Mailbox != "" {
			body["mailbox"] = opts.Mailbox
		}
		if opts.Folder != "" {
			body["folder"] = opts.Folder
		}
	}
	_, err := doRequest[interface{}](s.h, http.MethodPost, fmt.Sprintf("/inbox/%d/read", uid), nil, body)
	return err
}

// MarkAsUnread marks a message as unread (removes the \Seen flag).
func (s *InboxService) MarkAsUnread(uid int, opts *InboxGetOptions) error {
	q := make(map[string]string)
	if opts != nil {
		if opts.Mailbox != "" {
			q["mailbox"] = opts.Mailbox
		}
		if opts.Folder != "" {
			q["folder"] = opts.Folder
		}
	}
	_, err := doRequest[interface{}](s.h, http.MethodDelete, fmt.Sprintf("/inbox/%d/read", uid), q, nil)
	return err
}

// Move moves a message to another folder.
func (s *InboxService) Move(uid int, to string, opts *InboxMoveOptions) error {
	body := map[string]interface{}{"to": to}
	if opts != nil {
		if opts.From != "" {
			body["from"] = opts.From
		}
		if opts.Mailbox != "" {
			body["mailbox"] = opts.Mailbox
		}
	}
	_, err := doRequest[interface{}](s.h, http.MethodPost, fmt.Sprintf("/inbox/%d/move", uid), nil, body)
	return err
}

// Delete deletes a message.
func (s *InboxService) Delete(uid int, opts *InboxGetOptions) error {
	q := make(map[string]string)
	if opts != nil {
		if opts.Mailbox != "" {
			q["mailbox"] = opts.Mailbox
		}
		if opts.Folder != "" {
			q["folder"] = opts.Folder
		}
	}
	_, err := doRequest[interface{}](s.h, http.MethodDelete, fmt.Sprintf("/inbox/%d", uid), q, nil)
	return err
}
