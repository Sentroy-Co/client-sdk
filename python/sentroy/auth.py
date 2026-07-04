from __future__ import annotations

"""Sentroy Auth-as-a-Service client (separate entry point).

This is NOT wired into the root :class:`sentroy.Sentroy` client — it talks
to a different base URL (``https://auth.sentroy.com`` by default) with a
different credential (project ``aps_`` API key), mirroring the TypeScript
SDK's separate ``auth`` entry point.

Security: the ``aps_`` API key is the project's master key (admin over the
whole end-user pool) — keep it SERVER-ONLY, never ship it to a browser.

Auth precedence per request: explicit end-user bearer (access token from a
signed-in session) > project ``api_key``.

Session state is held in memory by default (Python is a server runtime —
there is no ``localStorage``); pass a custom ``storage`` adapter object
with ``read()`` / ``write(value)`` / ``clear()`` for persistence. Unlike
the browser SDK there is no background refresh timer — call
:meth:`SentroyAuth.refresh_now` when the access token nears expiry.
"""

import json
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass, field
from typing import Any, Callable, Optional

DEFAULT_AUTH_BASE_URL = "https://auth.sentroy.com"


class SentroyAuthError(Exception):
    """Raised on any non-2xx auth API response.

    Built from the uniform ``{error, error_description}`` JSON shape.
    """

    def __init__(self, code: str, message: str, status: int) -> None:
        self.code = code
        self.status = status
        super().__init__(message)


# ── Types ───────────────────────────────────────────────────────────────────


@dataclass
class SentroyAuthUser:
    id: str
    auth_project_id: str
    email: str
    email_verified: bool
    display_name: Optional[str]
    image: Optional[str]
    metadata: dict[str, Any]
    last_login_at: Optional[str]
    created_at: str
    updated_at: str

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> SentroyAuthUser:
        return cls(
            id=d["id"],
            auth_project_id=d.get("authProjectId", d.get("auth_project_id", "")),
            email=d.get("email", ""),
            email_verified=d.get("emailVerified", d.get("email_verified", False)),
            display_name=d.get("displayName", d.get("display_name")),
            image=d.get("image"),
            metadata=d.get("metadata") or {},
            last_login_at=d.get("lastLoginAt", d.get("last_login_at")),
            created_at=d.get("createdAt", d.get("created_at", "")),
            updated_at=d.get("updatedAt", d.get("updated_at", "")),
        )


@dataclass
class SignupResponse:
    user: SentroyAuthUser
    # Unset when email verification is required first.
    access_token: Optional[str] = None
    refresh_token: Optional[str] = None
    expires_in: Optional[int] = None
    token_type: Optional[str] = None
    email_verification_required: Optional[bool] = None

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> SignupResponse:
        return cls(
            user=SentroyAuthUser.from_dict(d["user"]),
            access_token=d.get("accessToken"),
            refresh_token=d.get("refreshToken"),
            expires_in=d.get("expiresIn"),
            token_type=d.get("tokenType"),
            email_verification_required=d.get("emailVerificationRequired"),
        )


@dataclass
class LoginResponse:
    user: SentroyAuthUser
    access_token: str
    refresh_token: str
    expires_in: int
    token_type: str
    # Set on magic-link consume when the request carried a redirect_uri.
    redirect_uri: Optional[str] = None

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> LoginResponse:
        return cls(
            user=SentroyAuthUser.from_dict(d["user"]),
            access_token=d.get("accessToken", ""),
            refresh_token=d.get("refreshToken", ""),
            expires_in=d.get("expiresIn", 0),
            token_type=d.get("tokenType", "Bearer"),
            redirect_uri=d.get("redirectUri"),
        )


@dataclass
class MfaChallenge:
    """First login step when MFA is enrolled — follow with ``verify_mfa``."""

    mfa_required: bool
    mfa_token: str
    factor_type: str  # "totp"

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> MfaChallenge:
        return cls(
            mfa_required=d.get("mfaRequired", True),
            mfa_token=d.get("mfaToken", ""),
            factor_type=d.get("factorType", "totp"),
        )


@dataclass
class LoginOutcome:
    """Discriminated union — ``kind`` is ``"tokens"`` or ``"mfa"``.

    - ``kind == "tokens"``: ``tokens`` is set, session persisted.
    - ``kind == "mfa"``: ``mfa`` is set — call ``verify_mfa``.
    """

    kind: str
    tokens: Optional[LoginResponse] = None
    mfa: Optional[MfaChallenge] = None


@dataclass
class SessionSummary:
    id: str
    refresh_token_prefix: str
    user_agent: Optional[str]
    ip: Optional[str]
    expires_at: str
    created_at: str

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> SessionSummary:
        return cls(
            id=d["id"],
            refresh_token_prefix=d.get(
                "refreshTokenPrefix", d.get("refresh_token_prefix", "")
            ),
            user_agent=d.get("userAgent", d.get("user_agent")),
            ip=d.get("ip"),
            expires_at=d.get("expiresAt", d.get("expires_at", "")),
            created_at=d.get("createdAt", d.get("created_at", "")),
        )


@dataclass
class ActivityEntry:
    id: str
    action: str
    ip_address: Optional[str]
    created_at: str
    details: Optional[dict[str, Any]] = None

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> ActivityEntry:
        return cls(
            id=d["id"],
            action=d.get("action", ""),
            ip_address=d.get("ipAddress", d.get("ip_address")),
            created_at=d.get("createdAt", d.get("created_at", "")),
            details=d.get("details"),
        )


@dataclass
class MfaStatus:
    enrolled: bool
    factor_type: Optional[str] = None
    verified_at: Optional[str] = None
    recovery_codes_remaining: Optional[int] = None

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> MfaStatus:
        return cls(
            enrolled=d.get("enrolled", False),
            factor_type=d.get("factorType", d.get("factor_type")),
            verified_at=d.get("verifiedAt", d.get("verified_at")),
            recovery_codes_remaining=d.get(
                "recoveryCodesRemaining", d.get("recovery_codes_remaining")
            ),
        )


@dataclass
class MfaEnrollResponse:
    secret: str
    otpauth_uri: str

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> MfaEnrollResponse:
        return cls(
            secret=d.get("secret", ""),
            otpauth_uri=d.get("otpauthUri", d.get("otpauth_uri", "")),
        )


@dataclass
class MfaVerifyEnrollmentResponse:
    enrolled: bool
    # Shown ONCE — persist them for the user now.
    recovery_codes: list[str] = field(default_factory=list)

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> MfaVerifyEnrollmentResponse:
        return cls(
            enrolled=d.get("enrolled", True),
            recovery_codes=d.get("recoveryCodes", d.get("recovery_codes", [])),
        )


@dataclass
class PasskeySummary:
    id: str
    credential_id_prefix: str
    device_name: Optional[str]
    transports: list[str]
    last_used_at: Optional[str]
    created_at: str

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> PasskeySummary:
        return cls(
            id=d["id"],
            credential_id_prefix=d.get(
                "credentialIdPrefix", d.get("credential_id_prefix", "")
            ),
            device_name=d.get("deviceName", d.get("device_name")),
            transports=d.get("transports", []),
            last_used_at=d.get("lastUsedAt", d.get("last_used_at")),
            created_at=d.get("createdAt", d.get("created_at", "")),
        )


SOCIAL_PROVIDERS = (
    "google",
    "github",
    "facebook",
    "microsoft",
    "twitter",
    "apple",
)

AuthStateChangeListener = Callable[[Optional[SentroyAuthUser]], None]


class MemoryAuthStorage:
    """Default in-memory session storage adapter."""

    def __init__(self) -> None:
        self._value: Optional[dict[str, Any]] = None

    def read(self) -> Optional[dict[str, Any]]:
        return self._value

    def write(self, value: dict[str, Any]) -> None:
        self._value = value

    def clear(self) -> None:
        self._value = None


# ── HTTP layer ──────────────────────────────────────────────────────────────


class _AuthHttp:
    """Auth-as-a-Service HTTP layer.

    Same conventions as the TS ``AuthHttp``: JSON in/out, uniform
    ``{error, error_description}`` error shape, optional ``{data}``
    envelope auto-unwrap, header precedence explicit bearer > api key.
    """

    def __init__(
        self,
        *,
        auth_base_url: Optional[str] = None,
        project_slug: str,
        api_key: Optional[str] = None,
        timeout: Optional[int] = None,
    ) -> None:
        self.base_url = (auth_base_url or DEFAULT_AUTH_BASE_URL).rstrip("/")
        self.project_slug = project_slug
        self.api_key = api_key
        self._timeout = timeout

    def url(self, path: str) -> str:
        p = path if path.startswith("/") else f"/{path}"
        slug = urllib.parse.quote(self.project_slug, safe="")
        return f"{self.base_url}/api/v1/auth/{slug}{p}"

    def request(
        self,
        path: str,
        *,
        method: str = "GET",
        json_body: Optional[Any] = None,
        bearer: Optional[str] = None,
    ) -> Any:
        headers: dict[str, str] = {"Accept": "application/json"}
        data: Optional[bytes] = None
        if json_body is not None:
            headers["Content-Type"] = "application/json"
            data = json.dumps(json_body).encode("utf-8")
        # Precedence: explicit end-user bearer > project aps_ api key.
        if bearer:
            headers["Authorization"] = f"Bearer {bearer}"
        elif self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"

        req = urllib.request.Request(
            self.url(path), data=data, headers=headers, method=method
        )
        try:
            with urllib.request.urlopen(req, timeout=self._timeout) as resp:
                payload = self._parse_json(
                    resp.read(), resp.headers.get("Content-Type", "")
                )
        except urllib.error.HTTPError as exc:
            raw = exc.read() if exc.fp else b""
            payload = self._parse_json(
                raw, exc.headers.get("Content-Type", "") if exc.headers else ""
            )
            err = payload if isinstance(payload, dict) else {}
            raise SentroyAuthError(
                err.get("error") or "http_error",
                err.get("error_description") or f"HTTP {exc.code}",
                exc.code,
            ) from exc

        # Auto-unwrap the optional {data} envelope.
        if isinstance(payload, dict) and "data" in payload:
            return payload["data"]
        return payload

    @staticmethod
    def _parse_json(raw: bytes, content_type: str) -> Any:
        if "application/json" not in (content_type or ""):
            return None
        try:
            return json.loads(raw.decode("utf-8")) if raw else None
        except (json.JSONDecodeError, ValueError):
            return None


# ── Client ──────────────────────────────────────────────────────────────────


class _AuthMfa:
    """`/me/mfa` operations (bearer required)."""

    def __init__(self, auth: "SentroyAuth") -> None:
        self._auth = auth

    def get_status(self) -> MfaStatus:
        data = self._auth._http.request(
            "/me/mfa", method="GET", bearer=self._auth._require_token()
        )
        return MfaStatus.from_dict(data or {})

    def enroll_totp(self) -> MfaEnrollResponse:
        data = self._auth._http.request(
            "/me/mfa/totp/enroll",
            method="POST",
            bearer=self._auth._require_token(),
        )
        return MfaEnrollResponse.from_dict(data or {})

    def verify_totp_enrollment(self, code: str) -> MfaVerifyEnrollmentResponse:
        data = self._auth._http.request(
            "/me/mfa/totp/verify-enrollment",
            method="POST",
            json_body={"code": code},
            bearer=self._auth._require_token(),
        )
        return MfaVerifyEnrollmentResponse.from_dict(data or {})

    def disable_totp(self, current_password: str) -> None:
        self._auth._http.request(
            "/me/mfa/totp/disable",
            method="POST",
            json_body={"currentPassword": current_password},
            bearer=self._auth._require_token(),
        )


class _AuthPasskey:
    """`/me/passkey` management (bearer required).

    Note: passkey *register* / *authenticate* WebAuthn ceremonies are
    browser-only and are not available in the Python SDK.
    """

    def __init__(self, auth: "SentroyAuth") -> None:
        self._auth = auth

    def list(self) -> list[PasskeySummary]:
        data = self._auth._http.request(
            "/me/passkey", method="GET", bearer=self._auth._require_token()
        )
        return [PasskeySummary.from_dict(p) for p in (data or [])]

    def delete(self, id: str) -> None:
        self._auth._http.request(
            f"/me/passkey/{urllib.parse.quote(id, safe='')}",
            method="DELETE",
            bearer=self._auth._require_token(),
        )


class SentroyAuth:
    """Sentroy Auth Project client (Firebase-Auth-style session API).

    Example::

        auth = SentroyAuth(
            project_slug="my-app",
            api_key="aps_...",   # SERVER-ONLY master key
        )

        outcome = auth.sign_in(email="user@example.com", password="...")
        if outcome.kind == "mfa":
            auth.verify_mfa(mfa_token=outcome.mfa.mfa_token, code="123456")
        print(auth.user)
    """

    def __init__(
        self,
        *,
        project_slug: str,
        auth_base_url: Optional[str] = None,
        api_key: Optional[str] = None,
        storage: Optional[Any] = None,
        timeout: Optional[int] = None,
    ) -> None:
        self._http = _AuthHttp(
            auth_base_url=auth_base_url,
            project_slug=project_slug,
            api_key=api_key,
            timeout=timeout,
        )
        self._storage = storage if storage is not None else MemoryAuthStorage()
        self._listeners: list[AuthStateChangeListener] = []
        self._current_user: Optional[SentroyAuthUser] = None

        restored = self._storage.read()
        if restored and isinstance(restored.get("user"), dict):
            self._current_user = SentroyAuthUser.from_dict(restored["user"])

    # ── State ───────────────────────────────────────────────────────────

    @property
    def user(self) -> Optional[SentroyAuthUser]:
        return self._current_user

    @property
    def access_token(self) -> Optional[str]:
        restored = self._storage.read()
        return restored.get("accessToken") if restored else None

    def on_auth_state_changed(
        self, listener: AuthStateChangeListener
    ) -> Callable[[], None]:
        """Firebase-style subscription. The current state is dispatched
        immediately on subscribe. Returns an unsubscribe function."""
        self._listeners.append(listener)
        listener(self._current_user)

        def unsubscribe() -> None:
            try:
                self._listeners.remove(listener)
            except ValueError:
                pass

        return unsubscribe

    def set_session(
        self,
        *,
        access_token: str,
        refresh_token: str,
        user: SentroyAuthUser,
    ) -> None:
        """Manual session injection — for tokens obtained through a custom
        auth callback channel."""
        self._persist(access_token, refresh_token, user)

    # ── Signup / login ──────────────────────────────────────────────────

    def sign_up(
        self,
        *,
        email: str,
        password: str,
        display_name: Optional[str] = None,
        metadata: Optional[dict[str, Any]] = None,
    ) -> SignupResponse:
        """Create an account. Persists the session when tokens are returned
        (i.e. the project does not require email verification first)."""
        body: dict[str, Any] = {"email": email, "password": password}
        if display_name is not None:
            body["displayName"] = display_name
        if metadata is not None:
            body["metadata"] = metadata
        data = self._http.request("/signup", method="POST", json_body=body)
        res = SignupResponse.from_dict(data)
        if res.access_token and res.refresh_token:
            self._persist(res.access_token, res.refresh_token, res.user)
        return res

    def sign_in(
        self,
        *,
        email: str,
        password: str,
        remember_me: Optional[bool] = None,
    ) -> LoginOutcome:
        """Email/password sign-in.

        Returns a :class:`LoginOutcome`: ``kind == "mfa"`` means the user
        has MFA enrolled — follow with :meth:`verify_mfa`. ``kind ==
        "tokens"`` means the session was established."""
        body: dict[str, Any] = {"email": email, "password": password}
        if remember_me is not None:
            body["rememberMe"] = remember_me
        data = self._http.request("/login", method="POST", json_body=body)
        if isinstance(data, dict) and data.get("mfaRequired"):
            return LoginOutcome(kind="mfa", mfa=MfaChallenge.from_dict(data))
        res = LoginResponse.from_dict(data)
        self._persist(res.access_token, res.refresh_token, res.user)
        return LoginOutcome(kind="tokens", tokens=res)

    def verify_mfa(
        self,
        *,
        mfa_token: str,
        code: Optional[str] = None,
        recovery_code: Optional[str] = None,
    ) -> LoginResponse:
        """Complete an MFA login (TOTP code or recovery code). Persists the
        session on success."""
        body: dict[str, Any] = {"mfaToken": mfa_token}
        if code is not None:
            body["code"] = code
        if recovery_code is not None:
            body["recoveryCode"] = recovery_code
        data = self._http.request(
            "/login/mfa/verify", method="POST", json_body=body
        )
        res = LoginResponse.from_dict(data)
        self._persist(res.access_token, res.refresh_token, res.user)
        return res

    def sign_out(self) -> None:
        """Best-effort refresh-token revoke (network errors swallowed);
        always clears the local session."""
        restored = self._storage.read()
        refresh_token = restored.get("refreshToken") if restored else None
        if refresh_token:
            try:
                self._http.request(
                    "/logout",
                    method="POST",
                    json_body={"refreshToken": refresh_token},
                )
            except Exception:
                pass
        self._clear_session()

    # ── Password / email lifecycle ──────────────────────────────────────

    def send_password_reset(self, email: str) -> None:
        self._http.request(
            "/password-reset/request",
            method="POST",
            json_body={"email": email},
        )

    def confirm_password_reset(
        self, *, token: str, new_password: str
    ) -> SentroyAuthUser:
        """Reset password using the token from the email. Password policy +
        HaveIBeenPwned breach check run server-side."""
        data = self._http.request(
            "/password-reset/confirm",
            method="POST",
            json_body={"token": token, "newPassword": new_password},
        )
        return SentroyAuthUser.from_dict(data["user"])

    def verify_email(self, token: str) -> SentroyAuthUser:
        """Verify email with a token. Updates the persisted user snapshot
        if it matches the current session."""
        data = self._http.request(
            "/verify-email", method="POST", json_body={"token": token}
        )
        user = SentroyAuthUser.from_dict(data["user"])
        if self._current_user and self._current_user.id == user.id:
            restored = self._storage.read()
            if restored:
                self._persist(
                    restored["accessToken"], restored["refreshToken"], user
                )
            else:
                self._current_user = user
                self._notify()
        return user

    # ── Magic link ──────────────────────────────────────────────────────

    def send_magic_link(
        self, *, email: str, redirect_uri: Optional[str] = None
    ) -> None:
        """Request a magic-link email. Requires the project's
        ``magicLinkEnabled``. Uniform 200 — no email-existence leak."""
        body: dict[str, Any] = {"email": email}
        if redirect_uri is not None:
            body["redirectUri"] = redirect_uri
        self._http.request(
            "/magic-link/request", method="POST", json_body=body
        )

    def consume_magic_link(self, token: str) -> LoginResponse:
        """Sign in with a magic-link token. Persists the session."""
        data = self._http.request(
            "/magic-link/consume", method="POST", json_body={"token": token}
        )
        res = LoginResponse.from_dict(data)
        self._persist(res.access_token, res.refresh_token, res.user)
        return res

    # ── Invitation ──────────────────────────────────────────────────────

    def accept_invitation(
        self,
        *,
        token: str,
        password: str,
        display_name: Optional[str] = None,
    ) -> LoginResponse:
        """Accept an admin invitation (token from mail); creates the account
        and persists the session."""
        body: dict[str, Any] = {"token": token, "password": password}
        if display_name is not None:
            body["displayName"] = display_name
        data = self._http.request(
            "/invitation/accept", method="POST", json_body=body
        )
        res = LoginResponse.from_dict(data)
        self._persist(res.access_token, res.refresh_token, res.user)
        return res

    # ── Social federation ───────────────────────────────────────────────

    def social_authorize_url(
        self,
        provider: str,
        *,
        redirect_uri: Optional[str] = None,
        remember_me: Optional[bool] = None,
    ) -> str:
        """Build the provider authorize URL (no HTTP call). ``provider`` is
        one of google | github | facebook | microsoft | twitter | apple.
        Tokens come back in the redirect URL fragment."""
        params: dict[str, str] = {}
        if redirect_uri:
            params["redirectUri"] = redirect_uri
        if remember_me:
            params["rememberMe"] = "1"
        qs = urllib.parse.urlencode(params)
        base = self._http.url(
            f"/social/{urllib.parse.quote(provider, safe='')}/authorize"
        )
        return f"{base}?{qs}" if qs else base

    # ── /me ─────────────────────────────────────────────────────────────

    def get_current_user(self) -> Optional[SentroyAuthUser]:
        """Validate the stored access token via ``/me`` and refresh the
        persisted user snapshot. Returns ``None`` when signed out or the
        token no longer validates."""
        restored = self._storage.read()
        if not restored:
            return None
        try:
            data = self._http.request(
                "/me", method="GET", bearer=restored["accessToken"]
            )
        except SentroyAuthError:
            return None
        user = SentroyAuthUser.from_dict(data)
        self._persist(restored["accessToken"], restored["refreshToken"], user)
        return user

    def list_sessions(self) -> list[SessionSummary]:
        data = self._http.request(
            "/me/sessions", method="GET", bearer=self._require_token()
        )
        return [SessionSummary.from_dict(s) for s in (data or [])]

    def revoke_session(self, id: str) -> None:
        self._http.request(
            f"/me/sessions/{urllib.parse.quote(id, safe='')}",
            method="DELETE",
            bearer=self._require_token(),
        )

    def change_password(
        self, *, current_password: str, new_password: str
    ) -> None:
        """Change password. The backend revokes ALL sessions; the SDK clears
        the local session — sign in again afterwards."""
        self._http.request(
            "/me/password",
            method="POST",
            json_body={
                "currentPassword": current_password,
                "newPassword": new_password,
            },
            bearer=self._require_token(),
        )
        self._clear_session()

    def request_email_change(
        self, *, new_email: str, current_password: str
    ) -> None:
        """Request an email change — the confirmation mail goes to the NEW
        address."""
        self._http.request(
            "/me/email/change-request",
            method="POST",
            json_body={
                "newEmail": new_email,
                "currentPassword": current_password,
            },
            bearer=self._require_token(),
        )

    def confirm_email_change(self, token: str) -> SentroyAuthUser:
        """Token-only confirm (no bearer). All sessions are revoked; the SDK
        clears the local session."""
        data = self._http.request(
            "/me/email/change-confirm",
            method="POST",
            json_body={"token": token},
        )
        user = SentroyAuthUser.from_dict(data)
        self._clear_session()
        return user

    def request_account_deletion(self, current_password: str) -> None:
        self._http.request(
            "/me/account/delete-request",
            method="POST",
            json_body={"currentPassword": current_password},
            bearer=self._require_token(),
        )

    def confirm_account_deletion(self, token: str) -> None:
        """Token-only confirm; clears the local session."""
        self._http.request(
            "/me/account/delete-confirm",
            method="POST",
            json_body={"token": token},
        )
        self._clear_session()

    def get_activity(self) -> list[ActivityEntry]:
        data = self._http.request(
            "/me/activity", method="GET", bearer=self._require_token()
        )
        return [ActivityEntry.from_dict(a) for a in (data or [])]

    # ── Refresh ─────────────────────────────────────────────────────────

    def refresh_now(self) -> None:
        """Exchange the stored refresh token for new tokens and persist
        them. On failure the session is cleared and the error re-raised."""
        restored = self._storage.read()
        if not restored or not restored.get("refreshToken"):
            self._clear_session()
            return
        try:
            data = self._http.request(
                "/refresh",
                method="POST",
                json_body={"refreshToken": restored["refreshToken"]},
            )
        except SentroyAuthError:
            self._clear_session()
            raise
        restored["accessToken"] = data["accessToken"]
        restored["refreshToken"] = data["refreshToken"]
        self._storage.write(restored)

    # ── Sub-resources ───────────────────────────────────────────────────

    @property
    def mfa(self) -> _AuthMfa:
        return _AuthMfa(self)

    @property
    def passkey(self) -> _AuthPasskey:
        return _AuthPasskey(self)

    # ── Internals ───────────────────────────────────────────────────────

    def _require_token(self) -> str:
        restored = self._storage.read()
        token = restored.get("accessToken") if restored else None
        if not token:
            raise SentroyAuthError(
                "not_signed_in", "Not signed in — accessToken missing.", 0
            )
        return token

    def _persist(
        self,
        access_token: str,
        refresh_token: str,
        user: SentroyAuthUser,
    ) -> None:
        self._storage.write(
            {
                "accessToken": access_token,
                "refreshToken": refresh_token,
                "user": {
                    "id": user.id,
                    "authProjectId": user.auth_project_id,
                    "email": user.email,
                    "emailVerified": user.email_verified,
                    "displayName": user.display_name,
                    "image": user.image,
                    "metadata": user.metadata,
                    "lastLoginAt": user.last_login_at,
                    "createdAt": user.created_at,
                    "updatedAt": user.updated_at,
                },
            }
        )
        self._current_user = user
        self._notify()

    def _clear_session(self) -> None:
        self._storage.clear()
        self._current_user = None
        self._notify()

    def _notify(self) -> None:
        for listener in list(self._listeners):
            try:
                listener(self._current_user)
            except Exception:
                # One listener's failure must not block the others.
                pass
