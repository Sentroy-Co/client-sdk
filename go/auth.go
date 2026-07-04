// Sentroy Auth-as-a-Service client — a separate entry point from the main
// [Client] (mirrors the TypeScript SDK where SentroyAuth lives on its own
// base URL and auth model).
//
// Create one with [NewAuth]:
//
//	auth := sentroy.NewAuth(sentroy.AuthConfig{
//	    ProjectSlug: "my-project",
//	    APIKey:      "aps_...", // server-only — NEVER ship to a browser/client
//	})
//
//	outcome, err := auth.SignIn(sentroy.SignInParams{Email: "a@b.c", Password: "..."})
//
// Authorization precedence per request: an end-user access token (from the
// current session) when the endpoint requires one, otherwise the project
// APIKey (aps_). The Go client is server-side: there is no background
// token refresh — call [AuthClient.RefreshNow] when needed.
package sentroy

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"
)

const defaultAuthBaseURL = "https://auth.sentroy.com"

// SentroyAuthError is returned when an Auth API call fails. It carries the
// machine-readable Code and HTTP Status from the {error, error_description}
// response shape.
type SentroyAuthError struct {
	Code    string
	Status  int
	Message string
}

func (e *SentroyAuthError) Error() string {
	if e.Message != "" {
		return e.Message
	}
	return fmt.Sprintf("Sentroy Auth error %s (%d)", e.Code, e.Status)
}

// ── Types ────────────────────────────────────────────────────────────────

// SentroyAuthUser is an end user in an Auth Project pool.
type SentroyAuthUser struct {
	ID            string                 `json:"id"`
	AuthProjectID string                 `json:"authProjectId"`
	Email         string                 `json:"email"`
	EmailVerified bool                   `json:"emailVerified"`
	DisplayName   *string                `json:"displayName"`
	Image         *string                `json:"image"`
	Metadata      map[string]interface{} `json:"metadata"`
	LastLoginAt   *string                `json:"lastLoginAt"`
	CreatedAt     string                 `json:"createdAt"`
	UpdatedAt     string                 `json:"updatedAt"`
}

// AuthTokensResponse is a fresh access/refresh token pair.
type AuthTokensResponse struct {
	AccessToken  string `json:"accessToken"`
	RefreshToken string `json:"refreshToken"`
	ExpiresIn    int    `json:"expiresIn"`
	TokenType    string `json:"tokenType"`
}

// SignupResponse is the result of AuthClient.SignUp. Token fields are unset
// when the project requires email verification before issuing a session.
type SignupResponse struct {
	User                      SentroyAuthUser `json:"user"`
	AccessToken               string          `json:"accessToken,omitempty"`
	RefreshToken              string          `json:"refreshToken,omitempty"`
	ExpiresIn                 int             `json:"expiresIn,omitempty"`
	TokenType                 string          `json:"tokenType,omitempty"`
	EmailVerificationRequired bool            `json:"emailVerificationRequired,omitempty"`
}

// LoginResponse is a completed login: user + token pair.
type LoginResponse struct {
	User         SentroyAuthUser `json:"user"`
	AccessToken  string          `json:"accessToken"`
	RefreshToken string          `json:"refreshToken"`
	ExpiresIn    int             `json:"expiresIn"`
	TokenType    string          `json:"tokenType"`
}

// MfaChallengeResponse is returned by SignIn when the user has MFA
// enrolled — follow with AuthClient.VerifyMfa.
type MfaChallengeResponse struct {
	MfaRequired bool   `json:"mfaRequired"`
	MfaToken    string `json:"mfaToken"`
	FactorType  string `json:"factorType"` // "totp"
}

// LoginOutcomeKind discriminates a LoginOutcome.
type LoginOutcomeKind string

const (
	LoginOutcomeTokens LoginOutcomeKind = "tokens"
	LoginOutcomeMfa    LoginOutcomeKind = "mfa"
)

// LoginOutcome is the discriminated result of SignIn: either a completed
// session (Kind == LoginOutcomeTokens, Tokens set) or an MFA challenge
// (Kind == LoginOutcomeMfa, Mfa set — call VerifyMfa next).
type LoginOutcome struct {
	Kind   LoginOutcomeKind
	Tokens *LoginResponse
	Mfa    *MfaChallengeResponse
}

// SessionSummary is one active refresh-token session.
type SessionSummary struct {
	ID                 string  `json:"id"`
	RefreshTokenPrefix string  `json:"refreshTokenPrefix"`
	UserAgent          *string `json:"userAgent"`
	IP                 *string `json:"ip"`
	ExpiresAt          string  `json:"expiresAt"`
	CreatedAt          string  `json:"createdAt"`
}

// ActivityEntry is one row of the user's security activity log.
type ActivityEntry struct {
	ID        string                 `json:"id"`
	Action    string                 `json:"action"`
	IPAddress *string                `json:"ipAddress"`
	CreatedAt string                 `json:"createdAt"`
	Details   map[string]interface{} `json:"details"`
}

// MfaStatus describes the user's MFA enrollment.
type MfaStatus struct {
	Enrolled               bool    `json:"enrolled"`
	FactorType             string  `json:"factorType,omitempty"`
	VerifiedAt             *string `json:"verifiedAt,omitempty"`
	RecoveryCodesRemaining int     `json:"recoveryCodesRemaining,omitempty"`
}

// MfaEnrollResponse is the TOTP enrollment secret + provisioning URI.
type MfaEnrollResponse struct {
	Secret     string `json:"secret"`
	OtpauthURI string `json:"otpauthUri"`
}

// MfaVerifyEnrollmentResponse confirms enrollment. RecoveryCodes are shown
// once — store them now.
type MfaVerifyEnrollmentResponse struct {
	Enrolled      bool     `json:"enrolled"`
	RecoveryCodes []string `json:"recoveryCodes"`
}

// PasskeySummary is one registered WebAuthn credential.
type PasskeySummary struct {
	ID                 string   `json:"id"`
	CredentialIDPrefix string   `json:"credentialIdPrefix"`
	DeviceName         *string  `json:"deviceName"`
	Transports         []string `json:"transports"`
	LastUsedAt         *string  `json:"lastUsedAt"`
	CreatedAt          string   `json:"createdAt"`
}

// SocialProvider is a supported social federation provider.
type SocialProvider string

const (
	SocialProviderGoogle    SocialProvider = "google"
	SocialProviderGithub    SocialProvider = "github"
	SocialProviderFacebook  SocialProvider = "facebook"
	SocialProviderMicrosoft SocialProvider = "microsoft"
	SocialProviderTwitter   SocialProvider = "twitter"
	SocialProviderApple     SocialProvider = "apple"
)

// AuthSession is the persisted session state (token pair + user snapshot).
type AuthSession struct {
	AccessToken  string          `json:"accessToken"`
	RefreshToken string          `json:"refreshToken"`
	User         SentroyAuthUser `json:"user"`
}

// AuthStorageAdapter persists the session. The default is an in-memory
// adapter; supply your own (file, DB, ...) via AuthConfig.Storage.
type AuthStorageAdapter interface {
	Read() *AuthSession
	Write(AuthSession)
	Clear()
}

type memoryAuthStorage struct {
	mu      sync.Mutex
	session *AuthSession
}

func (m *memoryAuthStorage) Read() *AuthSession {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.session == nil {
		return nil
	}
	s := *m.session
	return &s
}

func (m *memoryAuthStorage) Write(s AuthSession) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.session = &s
}

func (m *memoryAuthStorage) Clear() {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.session = nil
}

// AuthConfig holds the parameters for [NewAuth].
type AuthConfig struct {
	// AuthBaseURL is the auth platform root. Defaults to
	// "https://auth.sentroy.com".
	AuthBaseURL string
	// ProjectSlug identifies the Auth Project (end-user pool).
	ProjectSlug string
	// APIKey is the project API key (aps_...). Server-only — it grants
	// admin-level access to the whole user pool; never expose it to
	// browsers or client apps. Optional: end-user token flows work
	// without it.
	APIKey string
	// Storage persists the session. Defaults to an in-memory adapter.
	Storage AuthStorageAdapter
	// Timeout is the HTTP request timeout. 0 means no timeout (matches
	// the TypeScript AuthHttp, which sets none).
	Timeout time.Duration
}

// AuthStateChangeListener receives the current user (nil when signed out).
type AuthStateChangeListener func(user *SentroyAuthUser)

// AuthClient is the Sentroy Auth-as-a-Service client. Use [NewAuth] to
// create one. It is intentionally separate from the main [Client]: it
// talks to a different base URL with a different auth model (aps_ project
// key + end-user bearer tokens instead of stk_ company tokens).
type AuthClient struct {
	// MFA groups the TOTP enrollment/status endpoints (bearer required).
	MFA *AuthMfaService
	// Passkeys groups passkey management endpoints (bearer required).
	// Note: registering/authenticating a passkey requires a browser
	// WebAuthn ceremony and is not available server-side.
	Passkeys *AuthPasskeysService

	baseURL     string
	projectSlug string
	apiKey      string
	httpClient  *http.Client
	storage     AuthStorageAdapter

	mu          sync.Mutex
	currentUser *SentroyAuthUser
	listeners   map[int]AuthStateChangeListener
	nextID      int
}

// NewAuth creates a new [AuthClient] with the given configuration.
func NewAuth(config AuthConfig) *AuthClient {
	base := config.AuthBaseURL
	if base == "" {
		base = defaultAuthBaseURL
	}
	storage := config.Storage
	if storage == nil {
		storage = &memoryAuthStorage{}
	}
	c := &AuthClient{
		baseURL:     strings.TrimRight(base, "/"),
		projectSlug: config.ProjectSlug,
		apiKey:      config.APIKey,
		httpClient:  &http.Client{Timeout: config.Timeout},
		storage:     storage,
		listeners:   map[int]AuthStateChangeListener{},
	}
	c.MFA = &AuthMfaService{c: c}
	c.Passkeys = &AuthPasskeysService{c: c}

	// Restore from storage on construct.
	if restored := storage.Read(); restored != nil {
		u := restored.User
		c.currentUser = &u
	}
	return c
}

// ── HTTP layer ───────────────────────────────────────────────────────────

func (c *AuthClient) url(path string) string {
	if !strings.HasPrefix(path, "/") {
		path = "/" + path
	}
	return c.baseURL + "/api/v1/auth/" + url.PathEscape(c.projectSlug) + path
}

// authDo performs one Auth API request. Authorization precedence: explicit
// bearer (end-user access token) > project apiKey. It parses the
// {error, error_description} error shape into SentroyAuthError and
// auto-unwraps an optional {data} envelope.
func authDo[T any](c *AuthClient, method, path string, body interface{}, bearer string) (T, error) {
	var zero T

	var reqBody io.Reader
	if body != nil {
		data, err := json.Marshal(body)
		if err != nil {
			return zero, fmt.Errorf("failed to marshal request body: %w", err)
		}
		reqBody = bytes.NewReader(data)
	}

	req, err := http.NewRequest(method, c.url(path), reqBody)
	if err != nil {
		return zero, err
	}
	req.Header.Set("Accept", "application/json")
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	if bearer != "" {
		req.Header.Set("Authorization", "Bearer "+bearer)
	} else if c.apiKey != "" {
		req.Header.Set("Authorization", "Bearer "+c.apiKey)
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return zero, err
	}
	defer resp.Body.Close()

	rawBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return zero, fmt.Errorf("failed to read response body: %w", err)
	}

	isJSON := strings.Contains(resp.Header.Get("Content-Type"), "application/json")

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		authErr := &SentroyAuthError{
			Code:    "http_error",
			Status:  resp.StatusCode,
			Message: fmt.Sprintf("HTTP %d", resp.StatusCode),
		}
		if isJSON {
			var e struct {
				Error            string `json:"error"`
				ErrorDescription string `json:"error_description"`
			}
			if json.Unmarshal(rawBody, &e) == nil {
				if e.Error != "" {
					authErr.Code = e.Error
				}
				if e.ErrorDescription != "" {
					authErr.Message = e.ErrorDescription
				}
			}
		}
		return zero, authErr
	}

	// Tolerate non-JSON / empty responses.
	if !isJSON || len(rawBody) == 0 {
		return zero, nil
	}

	// Auto-unwrap an optional {data} envelope.
	payload := json.RawMessage(rawBody)
	var probe map[string]json.RawMessage
	if json.Unmarshal(rawBody, &probe) == nil {
		if d, ok := probe["data"]; ok {
			payload = d
		}
	}

	var out T
	if err := json.Unmarshal(payload, &out); err != nil {
		return zero, fmt.Errorf("failed to decode response: %w", err)
	}
	return out, nil
}

// ── Session state ────────────────────────────────────────────────────────

// User returns the current session's user snapshot, or nil when signed out.
func (c *AuthClient) User() *SentroyAuthUser {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.currentUser == nil {
		return nil
	}
	u := *c.currentUser
	return &u
}

// AccessToken returns the current session's access token, or "" when
// signed out.
func (c *AuthClient) AccessToken() string {
	if s := c.storage.Read(); s != nil {
		return s.AccessToken
	}
	return ""
}

// SetSession injects a session manually — for tokens obtained through a
// custom channel (e.g. a redirect callback handled by your own code).
func (c *AuthClient) SetSession(session AuthSession) {
	c.persist(session)
}

// OnAuthStateChanged subscribes to session changes (Firebase-style). The
// current state is dispatched immediately on subscribe. Returns an
// unsubscribe function.
func (c *AuthClient) OnAuthStateChanged(listener AuthStateChangeListener) func() {
	c.mu.Lock()
	id := c.nextID
	c.nextID++
	c.listeners[id] = listener
	current := c.currentUser
	c.mu.Unlock()

	listener(copyUser(current))

	return func() {
		c.mu.Lock()
		delete(c.listeners, id)
		c.mu.Unlock()
	}
}

func copyUser(u *SentroyAuthUser) *SentroyAuthUser {
	if u == nil {
		return nil
	}
	v := *u
	return &v
}

func (c *AuthClient) persist(session AuthSession) {
	c.storage.Write(session)
	c.mu.Lock()
	u := session.User
	c.currentUser = &u
	listeners := make([]AuthStateChangeListener, 0, len(c.listeners))
	for _, l := range c.listeners {
		listeners = append(listeners, l)
	}
	c.mu.Unlock()
	for _, l := range listeners {
		l(copyUser(&u))
	}
}

func (c *AuthClient) clearSession() {
	c.storage.Clear()
	c.mu.Lock()
	c.currentUser = nil
	listeners := make([]AuthStateChangeListener, 0, len(c.listeners))
	for _, l := range c.listeners {
		listeners = append(listeners, l)
	}
	c.mu.Unlock()
	for _, l := range listeners {
		l(nil)
	}
}

func (c *AuthClient) requireToken() (string, error) {
	if s := c.storage.Read(); s != nil && s.AccessToken != "" {
		return s.AccessToken, nil
	}
	return "", errors.New("not signed in — accessToken missing")
}

// ── Signup / login / logout ──────────────────────────────────────────────

// SignUpParams is the input for AuthClient.SignUp.
type SignUpParams struct {
	Email       string                 `json:"email"`
	Password    string                 `json:"password"`
	DisplayName string                 `json:"displayName,omitempty"`
	Metadata    map[string]interface{} `json:"metadata,omitempty"`
}

// SignUp registers a new end user. If the project does not require email
// verification, the response includes tokens and the session is persisted.
func (c *AuthClient) SignUp(params SignUpParams) (*SignupResponse, error) {
	res, err := authDo[SignupResponse](c, http.MethodPost, "/signup", params, "")
	if err != nil {
		return nil, err
	}
	if res.AccessToken != "" && res.RefreshToken != "" {
		c.persist(AuthSession{
			AccessToken:  res.AccessToken,
			RefreshToken: res.RefreshToken,
			User:         res.User,
		})
	}
	return &res, nil
}

// SignInParams is the input for AuthClient.SignIn.
type SignInParams struct {
	Email      string `json:"email"`
	Password   string `json:"password"`
	RememberMe bool   `json:"rememberMe,omitempty"`
}

// SignIn logs in with email/password. Users with MFA enrolled get a
// LoginOutcome with Kind == LoginOutcomeMfa — follow with VerifyMfa. On
// Kind == LoginOutcomeTokens the session is persisted.
func (c *AuthClient) SignIn(params SignInParams) (*LoginOutcome, error) {
	raw, err := authDo[json.RawMessage](c, http.MethodPost, "/login", params, "")
	if err != nil {
		return nil, err
	}

	var challenge MfaChallengeResponse
	if json.Unmarshal(raw, &challenge) == nil && challenge.MfaRequired {
		return &LoginOutcome{Kind: LoginOutcomeMfa, Mfa: &challenge}, nil
	}

	var tokens LoginResponse
	if err := json.Unmarshal(raw, &tokens); err != nil {
		return nil, fmt.Errorf("failed to decode login response: %w", err)
	}
	c.persist(AuthSession{
		AccessToken:  tokens.AccessToken,
		RefreshToken: tokens.RefreshToken,
		User:         tokens.User,
	})
	return &LoginOutcome{Kind: LoginOutcomeTokens, Tokens: &tokens}, nil
}

// VerifyMfaParams is the input for AuthClient.VerifyMfa. Provide Code (TOTP)
// or RecoveryCode.
type VerifyMfaParams struct {
	MfaToken     string `json:"mfaToken"`
	Code         string `json:"code,omitempty"`
	RecoveryCode string `json:"recoveryCode,omitempty"`
}

// VerifyMfa completes an MFA login started by SignIn. On success the
// session is persisted and login is complete.
func (c *AuthClient) VerifyMfa(params VerifyMfaParams) (*LoginResponse, error) {
	res, err := authDo[LoginResponse](c, http.MethodPost, "/login/mfa/verify", params, "")
	if err != nil {
		return nil, err
	}
	c.persist(AuthSession{
		AccessToken:  res.AccessToken,
		RefreshToken: res.RefreshToken,
		User:         res.User,
	})
	return &res, nil
}

// SignOut revokes the refresh token (best-effort — network errors are
// swallowed so sign-out never blocks) and always clears the local session.
func (c *AuthClient) SignOut() error {
	if s := c.storage.Read(); s != nil && s.RefreshToken != "" {
		_, _ = authDo[json.RawMessage](c, http.MethodPost, "/logout",
			map[string]string{"refreshToken": s.RefreshToken}, "")
	}
	c.clearSession()
	return nil
}

// ── Password reset / email verification ─────────────────────────────────

// SendPasswordReset requests a password-reset mail. Uniform response — no
// email-existence leak.
func (c *AuthClient) SendPasswordReset(email string) error {
	_, err := authDo[json.RawMessage](c, http.MethodPost, "/password-reset/request",
		map[string]string{"email": email}, "")
	return err
}

// ConfirmPasswordReset sets a new password using the token from the reset
// mail. Password policy + HaveIBeenPwned breach check run server-side.
func (c *AuthClient) ConfirmPasswordReset(token, newPassword string) (*SentroyAuthUser, error) {
	res, err := authDo[struct {
		User SentroyAuthUser `json:"user"`
	}](c, http.MethodPost, "/password-reset/confirm",
		map[string]string{"token": token, "newPassword": newPassword}, "")
	if err != nil {
		return nil, err
	}
	return &res.User, nil
}

// VerifyEmail confirms an email address using the token from the
// verification mail. Updates the persisted user snapshot if it matches the
// current session.
func (c *AuthClient) VerifyEmail(token string) (*SentroyAuthUser, error) {
	res, err := authDo[struct {
		User SentroyAuthUser `json:"user"`
	}](c, http.MethodPost, "/verify-email", map[string]string{"token": token}, "")
	if err != nil {
		return nil, err
	}
	c.mu.Lock()
	matches := c.currentUser != nil && c.currentUser.ID == res.User.ID
	c.mu.Unlock()
	if matches {
		if s := c.storage.Read(); s != nil {
			s.User = res.User
			c.persist(*s)
		}
	}
	return &res.User, nil
}

// ── Magic link ───────────────────────────────────────────────────────────

// SendMagicLinkParams is the input for AuthClient.SendMagicLink.
type SendMagicLinkParams struct {
	Email       string `json:"email"`
	RedirectURI string `json:"redirectUri,omitempty"`
}

// SendMagicLink requests an email magic link. Requires the project's
// magicLinkEnabled flag. Uniform 200 — no email-existence leak.
func (c *AuthClient) SendMagicLink(params SendMagicLinkParams) error {
	_, err := authDo[json.RawMessage](c, http.MethodPost, "/magic-link/request", params, "")
	return err
}

// ConsumeMagicLink logs in with the token from a magic-link mail and
// persists the session.
func (c *AuthClient) ConsumeMagicLink(token string) (*LoginResponse, error) {
	res, err := authDo[LoginResponse](c, http.MethodPost, "/magic-link/consume",
		map[string]string{"token": token}, "")
	if err != nil {
		return nil, err
	}
	c.persist(AuthSession{
		AccessToken:  res.AccessToken,
		RefreshToken: res.RefreshToken,
		User:         res.User,
	})
	return &res, nil
}

// ── Invitation ───────────────────────────────────────────────────────────

// AcceptInvitationParams is the input for AuthClient.AcceptInvitation.
type AcceptInvitationParams struct {
	Token       string `json:"token"`
	Password    string `json:"password"`
	DisplayName string `json:"displayName,omitempty"`
}

// AcceptInvitation accepts an admin invitation (token from mail), creating
// the account and persisting the session.
func (c *AuthClient) AcceptInvitation(params AcceptInvitationParams) (*LoginResponse, error) {
	res, err := authDo[LoginResponse](c, http.MethodPost, "/invitation/accept", params, "")
	if err != nil {
		return nil, err
	}
	c.persist(AuthSession{
		AccessToken:  res.AccessToken,
		RefreshToken: res.RefreshToken,
		User:         res.User,
	})
	return &res, nil
}

// ── Social federation ────────────────────────────────────────────────────

// SocialAuthorizeOptions configures AuthClient.SocialAuthorizeURL.
type SocialAuthorizeOptions struct {
	RedirectURI string
	RememberMe  bool
}

// SocialAuthorizeURL builds the provider authorize URL (no request is
// made). Redirect the end user's browser to it; tokens come back in the
// redirect URL fragment.
func (c *AuthClient) SocialAuthorizeURL(provider SocialProvider, opts *SocialAuthorizeOptions) string {
	q := url.Values{}
	if opts != nil {
		if opts.RedirectURI != "" {
			q.Set("redirectUri", opts.RedirectURI)
		}
		if opts.RememberMe {
			q.Set("rememberMe", "1")
		}
	}
	u := c.baseURL + "/api/v1/auth/" + url.PathEscape(c.projectSlug) + "/social/" + string(provider) + "/authorize"
	if qs := q.Encode(); qs != "" {
		u += "?" + qs
	}
	return u
}

// ── Current user (/me) ───────────────────────────────────────────────────

// GetCurrentUser validates the stored access token via /me and refreshes
// the persisted user snapshot. Returns (nil, nil) when no session exists.
func (c *AuthClient) GetCurrentUser() (*SentroyAuthUser, error) {
	s := c.storage.Read()
	if s == nil {
		return nil, nil
	}
	user, err := authDo[SentroyAuthUser](c, http.MethodGet, "/me", nil, s.AccessToken)
	if err != nil {
		return nil, err
	}
	s.User = user
	c.persist(*s)
	return &user, nil
}

// ListSessions returns the user's active sessions. Requires a signed-in
// session.
func (c *AuthClient) ListSessions() ([]SessionSummary, error) {
	token, err := c.requireToken()
	if err != nil {
		return nil, err
	}
	return authDo[[]SessionSummary](c, http.MethodGet, "/me/sessions", nil, token)
}

// RevokeSession revokes one session by id. Requires a signed-in session.
func (c *AuthClient) RevokeSession(id string) error {
	token, err := c.requireToken()
	if err != nil {
		return err
	}
	_, err = authDo[json.RawMessage](c, http.MethodDelete,
		"/me/sessions/"+url.PathEscape(id), nil, token)
	return err
}

// ChangePassword changes the password. The backend revokes ALL sessions;
// the SDK clears the local session — sign in again afterwards.
func (c *AuthClient) ChangePassword(currentPassword, newPassword string) error {
	token, err := c.requireToken()
	if err != nil {
		return err
	}
	_, err = authDo[json.RawMessage](c, http.MethodPost, "/me/password",
		map[string]string{
			"currentPassword": currentPassword,
			"newPassword":     newPassword,
		}, token)
	if err != nil {
		return err
	}
	c.clearSession()
	return nil
}

// RequestEmailChange starts an email change — a confirmation mail is sent
// to the NEW address. Finalize with ConfirmEmailChange.
func (c *AuthClient) RequestEmailChange(newEmail, currentPassword string) error {
	token, err := c.requireToken()
	if err != nil {
		return err
	}
	_, err = authDo[json.RawMessage](c, http.MethodPost, "/me/email/change-request",
		map[string]string{
			"newEmail":        newEmail,
			"currentPassword": currentPassword,
		}, token)
	return err
}

// ConfirmEmailChange finalizes an email change using the token from the
// confirmation mail (token-only — no bearer). All sessions are revoked;
// the SDK clears the local session.
func (c *AuthClient) ConfirmEmailChange(token string) (*SentroyAuthUser, error) {
	user, err := authDo[SentroyAuthUser](c, http.MethodPost, "/me/email/change-confirm",
		map[string]string{"token": token}, "")
	if err != nil {
		return nil, err
	}
	c.clearSession()
	return &user, nil
}

// RequestAccountDeletion starts account deletion. Requires a signed-in
// session.
func (c *AuthClient) RequestAccountDeletion(currentPassword string) error {
	token, err := c.requireToken()
	if err != nil {
		return err
	}
	_, err = authDo[json.RawMessage](c, http.MethodPost, "/me/account/delete-request",
		map[string]string{"currentPassword": currentPassword}, token)
	return err
}

// ConfirmAccountDeletion finalizes account deletion using the token from
// the confirmation mail (token-only). Clears the local session.
func (c *AuthClient) ConfirmAccountDeletion(token string) error {
	_, err := authDo[json.RawMessage](c, http.MethodPost, "/me/account/delete-confirm",
		map[string]string{"token": token}, "")
	if err != nil {
		return err
	}
	c.clearSession()
	return nil
}

// GetActivity returns the user's security activity log. Requires a
// signed-in session.
func (c *AuthClient) GetActivity() ([]ActivityEntry, error) {
	token, err := c.requireToken()
	if err != nil {
		return nil, err
	}
	return authDo[[]ActivityEntry](c, http.MethodGet, "/me/activity", nil, token)
}

// ── MFA (/me/mfa) ────────────────────────────────────────────────────────

// AuthMfaService groups TOTP MFA endpoints. All methods require a
// signed-in session.
type AuthMfaService struct {
	c *AuthClient
}

// GetStatus returns the user's MFA enrollment status.
func (s *AuthMfaService) GetStatus() (*MfaStatus, error) {
	token, err := s.c.requireToken()
	if err != nil {
		return nil, err
	}
	st, err := authDo[MfaStatus](s.c, http.MethodGet, "/me/mfa", nil, token)
	if err != nil {
		return nil, err
	}
	return &st, nil
}

// EnrollTotp starts TOTP enrollment — returns the secret + otpauth URI to
// show in an authenticator app.
func (s *AuthMfaService) EnrollTotp() (*MfaEnrollResponse, error) {
	token, err := s.c.requireToken()
	if err != nil {
		return nil, err
	}
	r, err := authDo[MfaEnrollResponse](s.c, http.MethodPost, "/me/mfa/totp/enroll", nil, token)
	if err != nil {
		return nil, err
	}
	return &r, nil
}

// VerifyTotpEnrollment confirms enrollment with a TOTP code. RecoveryCodes
// are shown once — store them now.
func (s *AuthMfaService) VerifyTotpEnrollment(code string) (*MfaVerifyEnrollmentResponse, error) {
	token, err := s.c.requireToken()
	if err != nil {
		return nil, err
	}
	r, err := authDo[MfaVerifyEnrollmentResponse](s.c, http.MethodPost,
		"/me/mfa/totp/verify-enrollment", map[string]string{"code": code}, token)
	if err != nil {
		return nil, err
	}
	return &r, nil
}

// DisableTotp disables TOTP MFA (password re-check required).
func (s *AuthMfaService) DisableTotp(currentPassword string) error {
	token, err := s.c.requireToken()
	if err != nil {
		return err
	}
	_, err = authDo[json.RawMessage](s.c, http.MethodPost, "/me/mfa/totp/disable",
		map[string]string{"currentPassword": currentPassword}, token)
	return err
}

// ── Passkeys (/me/passkey) ───────────────────────────────────────────────

// AuthPasskeysService manages registered passkeys. Registration and
// authentication require a browser WebAuthn ceremony and are therefore
// not offered by this server-side SDK — use the TypeScript SDK in the
// browser for those flows.
type AuthPasskeysService struct {
	c *AuthClient
}

// List returns the user's registered passkeys. Requires a signed-in session.
func (s *AuthPasskeysService) List() ([]PasskeySummary, error) {
	token, err := s.c.requireToken()
	if err != nil {
		return nil, err
	}
	return authDo[[]PasskeySummary](s.c, http.MethodGet, "/me/passkey", nil, token)
}

// Delete removes a passkey by id. Requires a signed-in session.
func (s *AuthPasskeysService) Delete(id string) error {
	token, err := s.c.requireToken()
	if err != nil {
		return err
	}
	_, err = authDo[json.RawMessage](s.c, http.MethodDelete,
		"/me/passkey/"+url.PathEscape(id), nil, token)
	return err
}

// ── Refresh ──────────────────────────────────────────────────────────────

// RefreshNow exchanges the stored refresh token for a new token pair and
// persists it. The Go client performs no automatic background refresh —
// call this when the access token is (about to be) expired. A failed
// refresh clears the session.
func (c *AuthClient) RefreshNow() error {
	s := c.storage.Read()
	if s == nil || s.RefreshToken == "" {
		c.clearSession()
		return errors.New("not signed in — refreshToken missing")
	}
	res, err := authDo[AuthTokensResponse](c, http.MethodPost, "/refresh",
		map[string]string{"refreshToken": s.RefreshToken}, "")
	if err != nil {
		var authErr *SentroyAuthError
		if errors.As(err, &authErr) {
			// Refresh rejected — session is dead.
			c.clearSession()
		}
		return err
	}
	s.AccessToken = res.AccessToken
	s.RefreshToken = res.RefreshToken
	c.persist(*s)
	return nil
}
