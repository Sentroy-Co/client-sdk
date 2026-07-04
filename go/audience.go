package sentroy

import (
	"net/http"
	"net/url"
	"strconv"
	"strings"
)

// AudienceService groups contact and audience-list management.
type AudienceService struct {
	Lists    *AudienceListsService
	Contacts *AudienceContactsService
}

func newAudienceService(h *httpClient) *AudienceService {
	return &AudienceService{
		Lists:    &AudienceListsService{h: h},
		Contacts: &AudienceContactsService{h: h},
	}
}

// AudienceListsService manages audience lists (named contact groupings).
type AudienceListsService struct {
	h *httpClient
}

// List returns every audience list in the company.
func (s *AudienceListsService) List() ([]ContactList, error) {
	return doRequest[[]ContactList](s.h, http.MethodGet, "/audience/lists", nil, nil)
}

// Get returns a single audience list by id.
func (s *AudienceListsService) Get(id string) (*ContactList, error) {
	l, err := doRequest[ContactList](s.h, http.MethodGet,
		"/audience/lists/"+url.PathEscape(id), nil, nil)
	if err != nil {
		return nil, err
	}
	return &l, nil
}

// Create creates a new audience list.
func (s *AudienceListsService) Create(params CreateAudienceListParams) (*ContactList, error) {
	l, err := doRequest[ContactList](s.h, http.MethodPost, "/audience/lists", nil, params)
	if err != nil {
		return nil, err
	}
	return &l, nil
}

// Delete removes an audience list. Contacts stay in the company; only the
// grouping is removed.
func (s *AudienceListsService) Delete(id string) error {
	_, err := doRequest[map[string]interface{}](s.h, http.MethodDelete,
		"/audience/lists/"+url.PathEscape(id), nil, nil)
	return err
}

// Members returns membership operations scoped to a list id.
func (s *AudienceListsService) Members(listID string) *AudienceListMembersService {
	return &AudienceListMembersService{h: s.h, listID: listID}
}

// AudienceListMembersService manages the contacts inside one audience list.
type AudienceListMembersService struct {
	h      *httpClient
	listID string
}

// List returns all contacts in this audience list.
func (s *AudienceListMembersService) List() ([]Contact, error) {
	return doRequest[[]Contact](s.h, http.MethodGet,
		"/audience/lists/"+url.PathEscape(s.listID)+"/members", nil, nil)
}

// Add adds a contact to the list by id.
func (s *AudienceListMembersService) Add(contactID string) error {
	_, err := doRequest[map[string]interface{}](s.h, http.MethodPost,
		"/audience/lists/"+url.PathEscape(s.listID)+"/members", nil,
		map[string]string{"contactId": contactID})
	return err
}

// Remove removes a contact from the list (DELETE with a JSON body). The
// contact record itself is preserved.
func (s *AudienceListMembersService) Remove(contactID string) error {
	_, err := doRequest[map[string]interface{}](s.h, http.MethodDelete,
		"/audience/lists/"+url.PathEscape(s.listID)+"/members", nil,
		map[string]string{"contactId": contactID})
	return err
}

// AudienceContactsService manages the company-wide contact pool.
type AudienceContactsService struct {
	h *httpClient
}

// List returns a paginated list of contacts. Filter by status or tag set;
// tags are sent as a comma-joined query param.
func (s *AudienceContactsService) List(params *ContactListParams) (*ContactListResult, error) {
	q := map[string]string{}
	if params != nil {
		if params.Page > 0 {
			q["page"] = strconv.Itoa(params.Page)
		}
		if params.Limit > 0 {
			q["limit"] = strconv.Itoa(params.Limit)
		}
		if params.Status != "" {
			q["status"] = string(params.Status)
		}
		if len(params.Tags) > 0 {
			q["tags"] = strings.Join(params.Tags, ",")
		}
	}
	r, err := doRequest[ContactListResult](s.h, http.MethodGet, "/audience/contacts", q, nil)
	if err != nil {
		return nil, err
	}
	return &r, nil
}

// Search runs an email-prefix autocomplete. Capped server-side at 10
// results — use List for paginated browsing.
func (s *AudienceContactsService) Search(q string) ([]Contact, error) {
	return doRequest[[]Contact](s.h, http.MethodGet, "/audience/contacts",
		map[string]string{"q": q}, nil)
}

// Get returns a single contact by id.
func (s *AudienceContactsService) Get(id string) (*Contact, error) {
	c, err := doRequest[Contact](s.h, http.MethodGet,
		"/audience/contacts/"+url.PathEscape(id), nil, nil)
	if err != nil {
		return nil, err
	}
	return &c, nil
}

// Create creates a contact. Defaults to status "active".
func (s *AudienceContactsService) Create(params CreateContactParams) (*Contact, error) {
	c, err := doRequest[Contact](s.h, http.MethodPost, "/audience/contacts", nil, params)
	if err != nil {
		return nil, err
	}
	return &c, nil
}

// Update patches any contact field. Pass Status to mark unsubscribed/bounced.
func (s *AudienceContactsService) Update(id string, params UpdateContactParams) (*Contact, error) {
	c, err := doRequest[Contact](s.h, http.MethodPatch,
		"/audience/contacts/"+url.PathEscape(id), nil, params)
	if err != nil {
		return nil, err
	}
	return &c, nil
}

// Delete soft-deletes a contact: it is marked as "unsubscribed". The record
// stays so historical mail-log foreign keys keep resolving and the email
// won't accidentally be re-added.
func (s *AudienceContactsService) Delete(id string) error {
	_, err := doRequest[map[string]interface{}](s.h, http.MethodDelete,
		"/audience/contacts/"+url.PathEscape(id), nil, nil)
	return err
}
