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
//	buckets, err := client.Buckets.List()
//
// The SDK uses a single BaseURL (the platform root) for both mail and
// storage resources. The platform's API gateway transparently routes
// mail calls to the mail subdomain and storage calls to the storage
// subdomain; consumers never see the split.
package sentroy

import (
	"net/url"
	"strings"
	"time"
)

// Config holds the parameters needed to create a [Client].
type Config struct {
	// BaseURL is the Sentroy platform root (e.g. "https://sentroy.com").
	// Both mail and storage resources are reached through this single origin.
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
	Buckets   *BucketsService
	Media     *MediaService
}

// New creates a new Sentroy [Client] with the given configuration.
func New(config Config) *Client {
	if config.Timeout == 0 {
		config.Timeout = 30 * time.Second
	}

	base := strings.TrimRight(config.BaseURL, "/")
	slug := url.PathEscape(config.CompanySlug)

	// Mail resources hit the `/api/mail/companies` gateway path — core
	// forwards to the mail subdomain.
	mailHTTP := newHTTPClient(
		base+"/api/mail/companies/"+slug,
		config.AccessToken,
		config.Timeout,
	)

	// Storage uses the same pattern via `/api/storage/companies`.
	storageHTTP := newHTTPClient(
		base+"/api/storage/companies/"+slug,
		config.AccessToken,
		config.Timeout,
	)

	return &Client{
		Domains:   newDomainsService(mailHTTP),
		Mailboxes: newMailboxesService(mailHTTP),
		Templates: newTemplatesService(mailHTTP),
		Inbox:     newInboxService(mailHTTP),
		Send:      newSendService(mailHTTP),
		Buckets:   newBucketsService(storageHTTP),
		Media:     newMediaService(storageHTTP),
	}
}
