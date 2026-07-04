<?php

namespace Sentroy\ClientSdk;

/**
 * Sentroy Auth Project client (Auth-as-a-Service).
 *
 * Separate entry point from the main Sentroy client — it talks to
 * https://auth.sentroy.com (overridable) under
 * /api/v1/auth/{projectSlug}/... and authenticates with a project API
 * key (aps_...) and/or per-call end-user access tokens.
 *
 * Auth precedence per request: an explicit end-user bearer (access
 * token argument) wins over the project apiKey. Endpoints that operate
 * on "the signed-in user" (/me/...) take the user's access token as
 * their first argument; token-only flows (verify-email,
 * password-reset/confirm, ...) need neither.
 *
 * The aps_ key is the project's MASTER key — keep it server-side only,
 * never ship it to a browser.
 *
 * This is a stateless server-side port of the TypeScript SentroyAuth
 * client: browser-only features (localStorage session persistence,
 * background token refresh, onAuthStateChanged, WebAuthn ceremonies,
 * redirect-fragment consumption) are intentionally not included.
 */
class AuthClient
{
    const DEFAULT_AUTH_BASE_URL = 'https://auth.sentroy.com';

    /** @var string */
    private $baseUrl;

    /** @var string */
    private $projectSlug;

    /** @var string|null */
    private $apiKey;

    /** @var int */
    private $timeout;

    /**
     * @param array $config {
     *     @type string $project_slug  Required — Auth Project slug
     *     @type string $api_key       Optional — project API key (aps_...);
     *                                 server-side only
     *     @type string $auth_base_url Optional — default https://auth.sentroy.com
     *     @type int    $timeout       Optional — request timeout in seconds (default: 30)
     * }
     *
     * @throws \InvalidArgumentException
     */
    public function __construct(array $config)
    {
        if (empty($config['project_slug'])) {
            throw new \InvalidArgumentException('project_slug is required');
        }

        $base = isset($config['auth_base_url']) && $config['auth_base_url'] !== ''
            ? $config['auth_base_url']
            : self::DEFAULT_AUTH_BASE_URL;

        $this->baseUrl = rtrim($base, '/');
        $this->projectSlug = $config['project_slug'];
        $this->apiKey = isset($config['api_key']) ? $config['api_key'] : null;
        $this->timeout = isset($config['timeout']) ? (int) $config['timeout'] : 30;
    }

    /**
     * @param string $path
     * @return string
     */
    private function url($path)
    {
        $p = (strlen($path) > 0 && $path[0] === '/') ? $path : '/' . $path;
        return $this->baseUrl . '/api/v1/auth/' . rawurlencode($this->projectSlug) . $p;
    }

    /**
     * @param string      $method
     * @param string      $path
     * @param mixed       $json   JSON body or null
     * @param string|null $bearer Explicit end-user access token; wins over apiKey
     * @return mixed
     * @throws SentroyAuthException
     */
    private function request($method, $path, $json = null, $bearer = null)
    {
        $ch = curl_init();

        curl_setopt($ch, CURLOPT_URL, $this->url($path));
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_TIMEOUT, $this->timeout);
        curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, $this->timeout);
        curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $method);

        $headers = array('Accept: application/json');

        // Auth precedence: explicit bearer (user access token) > project apiKey.
        if ($bearer !== null && $bearer !== '') {
            $headers[] = 'Authorization: Bearer ' . $bearer;
        } elseif ($this->apiKey !== null && $this->apiKey !== '') {
            $headers[] = 'Authorization: Bearer ' . $this->apiKey;
        }

        if ($json !== null) {
            $jsonBody = json_encode($json);
            curl_setopt($ch, CURLOPT_POSTFIELDS, $jsonBody);
            $headers[] = 'Content-Type: application/json';
            $headers[] = 'Content-Length: ' . strlen($jsonBody);
        }

        curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);

        $response = curl_exec($ch);
        $statusCode = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $contentType = (string) curl_getinfo($ch, CURLINFO_CONTENT_TYPE);
        $curlError = curl_error($ch);
        $curlErrno = curl_errno($ch);

        curl_close($ch);

        if ($curlErrno !== 0) {
            throw new SentroyAuthException(
                'network_error',
                "cURL error ({$curlErrno}): {$curlError}",
                0
            );
        }

        // Tolerate non-JSON responses (mirrors the TS AuthHttp behavior).
        $payload = null;
        if (stripos($contentType, 'application/json') !== false) {
            $payload = json_decode((string) $response, true);
        }

        if ($statusCode < 200 || $statusCode >= 300) {
            $errCode = is_array($payload) && isset($payload['error'])
                ? $payload['error']
                : 'http_error';
            $errDesc = is_array($payload) && isset($payload['error_description'])
                ? $payload['error_description']
                : "HTTP {$statusCode}";
            throw new SentroyAuthException($errCode, $errDesc, $statusCode);
        }

        // Auto-unwrap the optional {data} envelope.
        if (is_array($payload) && array_key_exists('data', $payload)) {
            return $payload['data'];
        }
        return $payload;
    }

    // ─── Signup / login ──────────────────────────────────────────────────

    /**
     * Create an end-user account. If email verification is not required
     * the response includes accessToken / refreshToken.
     *
     * @param array $params {
     *     @type string $email       Required
     *     @type string $password    Required
     *     @type string $displayName Optional
     *     @type array  $metadata    Optional
     * }
     * @return array { user, accessToken?, refreshToken?, expiresIn?,
     *                 tokenType?, emailVerificationRequired? }
     */
    public function signUp(array $params)
    {
        return $this->request('POST', '/signup', $params);
    }

    /**
     * Sign in with email/password.
     *
     * For MFA-enrolled users the response contains
     * ['mfaRequired' => true, 'mfaToken' => ..., 'factorType' => 'totp']
     * — follow up with verifyMfa(). Otherwise it's a full login response
     * ({ user, accessToken, refreshToken, expiresIn, tokenType }).
     *
     * @param array $params {
     *     @type string $email      Required
     *     @type string $password   Required
     *     @type bool   $rememberMe Optional
     * }
     * @return array
     */
    public function signIn(array $params)
    {
        return $this->request('POST', '/login', $params);
    }

    /**
     * Complete an MFA login started with signIn().
     *
     * @param array $params {
     *     @type string $mfaToken     Required — from the signIn() response
     *     @type string $code         Optional — TOTP code
     *     @type string $recoveryCode Optional — recovery code alternative
     * }
     * @return array { user, accessToken, refreshToken, expiresIn, tokenType }
     */
    public function verifyMfa(array $params)
    {
        return $this->request('POST', '/login/mfa/verify', $params);
    }

    /**
     * Revoke a refresh token (sign out). Best-effort: network/API errors
     * are swallowed so a dead connection never blocks sign-out flows.
     *
     * @param string $refreshToken
     * @return void
     */
    public function signOut($refreshToken)
    {
        try {
            $this->request('POST', '/logout', array('refreshToken' => $refreshToken));
        } catch (SentroyAuthException $e) {
            // Best-effort revoke — ignore.
        }
    }

    /**
     * Exchange a refresh token for new tokens.
     *
     * @param string $refreshToken
     * @return array { accessToken, refreshToken, expiresIn, tokenType }
     */
    public function refresh($refreshToken)
    {
        return $this->request('POST', '/refresh', array('refreshToken' => $refreshToken));
    }

    // ─── Password reset / email verification ─────────────────────────────

    /**
     * Send a password-reset email. Uniform 200 — does not leak whether
     * the address exists.
     *
     * @param string $email
     * @return void
     */
    public function sendPasswordReset($email)
    {
        $this->request('POST', '/password-reset/request', array('email' => $email));
    }

    /**
     * Reset the password using the token from the reset email. Password
     * policy + HaveIBeenPwned breach check run server-side.
     *
     * @param string $token
     * @param string $newPassword
     * @return array The user record.
     */
    public function confirmPasswordReset($token, $newPassword)
    {
        $res = $this->request('POST', '/password-reset/confirm', array(
            'token' => $token,
            'newPassword' => $newPassword,
        ));
        return isset($res['user']) ? $res['user'] : $res;
    }

    /**
     * Verify an email address using the token from the verification mail.
     *
     * @param string $token
     * @return array The user record.
     */
    public function verifyEmail($token)
    {
        $res = $this->request('POST', '/verify-email', array('token' => $token));
        return isset($res['user']) ? $res['user'] : $res;
    }

    // ─── Magic link ──────────────────────────────────────────────────────

    /**
     * Request a magic-link email. Requires the project to have
     * magicLinkEnabled. Uniform 200 (no email-existence leak).
     *
     * @param string      $email
     * @param string|null $redirectUri
     * @return void
     */
    public function sendMagicLink($email, $redirectUri = null)
    {
        $body = array('email' => $email);
        if ($redirectUri !== null) {
            $body['redirectUri'] = $redirectUri;
        }
        $this->request('POST', '/magic-link/request', $body);
    }

    /**
     * Exchange a magic-link token for a session.
     *
     * @param string $token
     * @return array Login response (+ redirectUri? when set on request).
     */
    public function consumeMagicLink($token)
    {
        return $this->request('POST', '/magic-link/consume', array('token' => $token));
    }

    // ─── Invitation ──────────────────────────────────────────────────────

    /**
     * Accept an admin invitation (token arrives by mail); creates the
     * account and returns a full login response.
     *
     * @param array $params {
     *     @type string $token       Required
     *     @type string $password    Required
     *     @type string $displayName Optional
     * }
     * @return array { user, accessToken, refreshToken, expiresIn, tokenType }
     */
    public function acceptInvitation(array $params)
    {
        return $this->request('POST', '/invitation/accept', $params);
    }

    // ─── Social federation ───────────────────────────────────────────────

    /**
     * Build the social-login authorize URL (no HTTP call). Redirect the
     * end-user's browser to it; tokens come back in the redirect URL
     * fragment.
     *
     * @param string $provider "google", "github", "facebook", "microsoft",
     *                         "twitter" or "apple"
     * @param array  $opts {
     *     @type string $redirectUri Optional
     *     @type bool   $rememberMe  Optional — sent as "1"
     * }
     * @return string
     */
    public function socialAuthorizeUrl($provider, array $opts = array())
    {
        $query = array();
        if (isset($opts['redirectUri'])) {
            $query['redirectUri'] = $opts['redirectUri'];
        }
        if (!empty($opts['rememberMe'])) {
            $query['rememberMe'] = '1';
        }
        $qs = empty($query) ? '' : '?' . http_build_query($query);

        return $this->baseUrl . '/api/v1/auth/' . rawurlencode($this->projectSlug)
            . '/social/' . rawurlencode($provider) . '/authorize' . $qs;
    }

    // ─── /me — current user ──────────────────────────────────────────────

    /**
     * Fetch the user behind an access token. Returns null when the token
     * is invalid or expired (mirrors the TS client).
     *
     * @param string $accessToken
     * @return array|null
     */
    public function getCurrentUser($accessToken)
    {
        try {
            return $this->request('GET', '/me', null, $accessToken);
        } catch (SentroyAuthException $e) {
            return null;
        }
    }

    /**
     * List the user's active sessions.
     *
     * @param string $accessToken
     * @return array [{ id, refreshTokenPrefix, userAgent, ip, expiresAt, createdAt }]
     */
    public function listSessions($accessToken)
    {
        return $this->request('GET', '/me/sessions', null, $accessToken);
    }

    /**
     * Revoke one of the user's sessions.
     *
     * @param string $accessToken
     * @param string $sessionId
     * @return void
     */
    public function revokeSession($accessToken, $sessionId)
    {
        $this->request('DELETE', '/me/sessions/' . rawurlencode($sessionId), null, $accessToken);
    }

    /**
     * Change the user's password. The backend revokes ALL sessions —
     * the user must sign in again afterwards.
     *
     * @param string $accessToken
     * @param string $currentPassword
     * @param string $newPassword
     * @return void
     */
    public function changePassword($accessToken, $currentPassword, $newPassword)
    {
        $this->request('POST', '/me/password', array(
            'currentPassword' => $currentPassword,
            'newPassword' => $newPassword,
        ), $accessToken);
    }

    /**
     * Request an email change — the confirmation mail is sent to the
     * NEW address.
     *
     * @param string $accessToken
     * @param string $newEmail
     * @param string $currentPassword
     * @return void
     */
    public function requestEmailChange($accessToken, $newEmail, $currentPassword)
    {
        $this->request('POST', '/me/email/change-request', array(
            'newEmail' => $newEmail,
            'currentPassword' => $currentPassword,
        ), $accessToken);
    }

    /**
     * Confirm an email change with the mailed token (token-only — no
     * bearer). All the user's sessions are revoked.
     *
     * @param string $token
     * @return array The updated user record.
     */
    public function confirmEmailChange($token)
    {
        return $this->request('POST', '/me/email/change-confirm', array('token' => $token));
    }

    /**
     * Request account deletion — a confirmation mail is sent.
     *
     * @param string $accessToken
     * @param string $currentPassword
     * @return void
     */
    public function requestAccountDeletion($accessToken, $currentPassword)
    {
        $this->request('POST', '/me/account/delete-request', array(
            'currentPassword' => $currentPassword,
        ), $accessToken);
    }

    /**
     * Confirm account deletion with the mailed token (token-only).
     *
     * @param string $token
     * @return void
     */
    public function confirmAccountDeletion($token)
    {
        $this->request('POST', '/me/account/delete-confirm', array('token' => $token));
    }

    /**
     * The user's recent auth activity.
     *
     * @param string $accessToken
     * @return array [{ id, action, ipAddress, createdAt, details }]
     */
    public function getActivity($accessToken)
    {
        return $this->request('GET', '/me/activity', null, $accessToken);
    }

    // ─── /me/mfa — TOTP ──────────────────────────────────────────────────

    /**
     * The user's MFA enrollment status.
     *
     * @param string $accessToken
     * @return array { enrolled, factorType?, verifiedAt?, recoveryCodesRemaining? }
     */
    public function mfaGetStatus($accessToken)
    {
        return $this->request('GET', '/me/mfa', null, $accessToken);
    }

    /**
     * Begin TOTP enrollment.
     *
     * @param string $accessToken
     * @return array { secret, otpauthUri }
     */
    public function mfaEnrollTotp($accessToken)
    {
        return $this->request('POST', '/me/mfa/totp/enroll', null, $accessToken);
    }

    /**
     * Complete TOTP enrollment with the first code. The returned
     * recoveryCodes are shown ONCE — store them.
     *
     * @param string $accessToken
     * @param string $code
     * @return array { enrolled: true, recoveryCodes }
     */
    public function mfaVerifyTotpEnrollment($accessToken, $code)
    {
        return $this->request('POST', '/me/mfa/totp/verify-enrollment', array(
            'code' => $code,
        ), $accessToken);
    }

    /**
     * Disable TOTP MFA.
     *
     * @param string $accessToken
     * @param string $currentPassword
     * @return void
     */
    public function mfaDisableTotp($accessToken, $currentPassword)
    {
        $this->request('POST', '/me/mfa/totp/disable', array(
            'currentPassword' => $currentPassword,
        ), $accessToken);
    }

    // ─── /me/passkey — management ────────────────────────────────────────
    // The WebAuthn register/authenticate ceremonies are browser-only and
    // not available server-side; list/delete management is.

    /**
     * List the user's registered passkeys.
     *
     * @param string $accessToken
     * @return array [{ id, credentialIdPrefix, deviceName, transports,
     *                  lastUsedAt, createdAt }]
     */
    public function passkeyList($accessToken)
    {
        return $this->request('GET', '/me/passkey', null, $accessToken);
    }

    /**
     * Delete one of the user's passkeys.
     *
     * @param string $accessToken
     * @param string $passkeyId
     * @return void
     */
    public function passkeyDelete($accessToken, $passkeyId)
    {
        $this->request('DELETE', '/me/passkey/' . rawurlencode($passkeyId), null, $accessToken);
    }
}
