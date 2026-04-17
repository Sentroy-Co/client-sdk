// Package sentroy provides a Go client SDK for the Sentroy platform API.
//
// Create a client with [New] and use the resource services to interact with
// the API:
//
//	client := sentroy.New(sentroy.Config{
//	    BaseURL:     "https://sentroy.com",
//	    CompanySlug: "my-company",
//	    AccessToken: "stk_abc123...",
//	})
//
//	domains, err := client.Domains.List()
package sentroy

import (
	"net/url"
	"strings"
	"time"
)

// Config holds the parameters needed to create a [Client].
type Config struct {
	// BaseURL is the Sentroy instance URL (e.g. "https://sentroy.com").
	BaseURL string
	// CompanySlug is your company identifier.
	CompanySlug string
	// AccessToken is the API token (stk_...).
	AccessToken string
	// Timeout is the HTTP request timeout. Defaults to 30 seconds.
	Timeout time.Duration
}

// Client is the entry point for the Sentroy SDK. Use [New] to create one.
type Client struct {
	Domains   *DomainsService
	Mailboxes *MailboxesService
	Templates *TemplatesService
	Inbox     *InboxService
	Send      *SendService
}

// New creates a new Sentroy [Client] with the given configuration.
func New(config Config) *Client {
	if config.Timeout == 0 {
		config.Timeout = 30 * time.Second
	}

	base := strings.TrimRight(config.BaseURL, "/")
	apiBase := base + "/api/companies/" + url.PathEscape(config.CompanySlug)
	h := newHTTPClient(apiBase, config.AccessToken, config.Timeout)

	return &Client{
		Domains:   newDomainsService(h),
		Mailboxes: newMailboxesService(h),
		Templates: newTemplatesService(h),
		Inbox:     newInboxService(h),
		Send:      newSendService(h),
	}
}
