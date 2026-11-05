import 'dart:async';
import 'package:http/http.dart' as http;
import '../errors.dart';
import '../json.dart';
import '../http.dart';
import 'storage.dart';
import 'types.dart';

class SentroyAuth {
  SentroyAuth({
    Uri? baseUrl,
    required this.projectSlug,
    this.apiKey,
    http.Client? httpClient,
    this.timeout = const Duration(seconds: 30),
    AuthSessionStorage? storage,
  }) : baseUrl = baseUrl ?? Uri.parse('https://auth.sentroy.com'),
       _http = SentroyHttp(
         baseUrl: baseUrl ?? Uri.parse('https://auth.sentroy.com'),
         accessToken: apiKey,
         client: httpClient,
         timeout: timeout,
       ),
       _storage = storage ?? MemoryAuthSessionStorage() {
    pathSegment(projectSlug);
  }
  final Uri baseUrl;
  final String projectSlug;
  final String? apiKey;
  final Duration timeout;
  final SentroyHttp _http;
  final AuthSessionStorage _storage;
  final _changes = StreamController<AuthSession?>.broadcast();
  AuthSession? _session;
  Future<void>? _refreshing;
  int _generation = 0;
  Future<void> _storageWrites = Future.value();
  AuthSession? get currentSession => _session;
  Stream<AuthSession?> get changes => _changes.stream;
  Uri _uri(String path, [Map<String, String>? query]) {
    final root = baseUrl.toString().replaceFirst(RegExp(r'/+$'), '');
    final u = Uri.parse('$root/api/v1/auth/${pathSegment(projectSlug)}$path');
    return query == null || query.isEmpty
        ? u
        : u.replace(queryParameters: query);
  }

  Future<dynamic> request(
    String method,
    String path, {
    Object? body,
    String? bearer,
  }) async {
    final transport = bearer == null ? _http : _http.withBearer(bearer);
    final route = '/api/v1/auth/${pathSegment(projectSlug)}$path';
    try {
      switch (method) {
        case 'GET':
          return await transport.get(route);
        case 'POST':
          return await transport.post(route, body);
        case 'DELETE':
          return await transport.delete(route, body: body);
        default:
          throw ArgumentError('Unsupported auth method');
      }
    } on SentroyException catch (e) {
      if (e.statusCode == null) rethrow;
      final j = e.body is Map ? e.body as Map : const {};
      throw SentroyAuthException(
        j['error'] is String ? j['error'] as String : 'http_error',
        j['error_description'] is String
            ? j['error_description'] as String
            : 'HTTP ${e.statusCode}',
        statusCode: e.statusCode,
      );
    }
  }

  String _token() =>
      _session?.accessToken ??
      (throw const SentroyAuthException('not_signed_in', 'Not signed in'));
  Future<void> setSession(AuthSession? session) {
    final generation = ++_generation;
    final write = _storageWrites.then((_) async {
      if (session == null) {
        await _storage.clear();
      } else {
        await _storage.write(session);
      }
      if (generation == _generation) {
        _session = session;
        if (!_changes.isClosed) _changes.add(session);
      }
    });
    _storageWrites = write.catchError((Object _) {});
    return write;
  }

  Future<AuthSession?> restore() async {
    final generation = _generation;
    await _storageWrites;
    final s = await _storage.read();
    if (generation == _generation) {
      _session = s;
      if (!_changes.isClosed) _changes.add(s);
    }
    return _session;
  }

  Future<void> close() async {
    await _changes.close();
    _http.close();
  }

  Future<SignupResponse> signUp(SignUpRequest input) async {
    final r = SignupResponse.fromJson(
      jsonObject(await request('POST', '/signup', body: input.toJson())),
    );
    if (r.accessToken != null && r.refreshToken != null) {
      await setSession(
        AuthSession(
          accessToken: r.accessToken!,
          refreshToken: r.refreshToken!,
          user: r.user,
        ),
      );
    }
    return r;
  }

  Future<LoginOutcome> signIn(SignInRequest input) async {
    final j = jsonObject(await request('POST', '/login', body: input.toJson()));
    if (j['mfaRequired'] == true) {
      return LoginOutcome.mfa(MfaChallengeResponse.fromJson(j));
    }
    final r = LoginResponse.fromJson(j);
    await setSession(r.session);
    return LoginOutcome.tokens(r);
  }

  Future<LoginResponse> _login(String path, JsonMap body) async {
    final r = LoginResponse.fromJson(
      jsonObject(await request('POST', path, body: body)),
    );
    await setSession(r.session);
    return r;
  }

  Future<LoginResponse> verifyMfa(MfaVerifyRequest input) =>
      _login('/login/mfa/verify', input.toJson());
  Future<void> signOut() async {
    final s = _session;
    await setSession(null);
    try {
      if (s != null) {
        await request(
          'POST',
          '/logout',
          body: {'refreshToken': s.refreshToken},
        );
      }
    } on SentroyException {
      // Local sign-out has already completed.
    }
  }

  Future<void> refreshNow() => _refreshing ??= _refresh().whenComplete(() {
    _refreshing = null;
  });
  Future<void> _refresh() async {
    final s = _session;
    if (s == null) {
      throw const SentroyAuthException('not_signed_in', 'Not signed in');
    }
    // Remove the rotating token before dispatch. A timeout may mean the server
    // consumed it, so neither this process nor a restarted one may replay it.
    final generation = _generation + 1;
    await setSession(null);
    if (_generation != generation) return;
    final r = AuthTokensResponse.fromJson(
      jsonObject(
        await request(
          'POST',
          '/refresh',
          body: {'refreshToken': s.refreshToken},
        ),
      ),
    );
    if (_generation == generation) {
      await setSession(
        AuthSession(
          accessToken: r.accessToken,
          refreshToken: r.refreshToken,
          user: s.user,
        ),
      );
    }
  }

  Future<void> sendPasswordReset(String email) async {
    await request('POST', '/password-reset/request', body: {'email': email});
  }

  Future<SentroyAuthUser> confirmPasswordReset({
    required String token,
    required String newPassword,
  }) async => SentroyAuthUser.fromJson(
    jsonObject(
      jsonObject(
        await request(
          'POST',
          '/password-reset/confirm',
          body: {'token': token, 'newPassword': newPassword},
        ),
      )['user'],
    ),
  );
  Future<SentroyAuthUser> verifyEmail(String token) async {
    final generation = _generation;
    final u = SentroyAuthUser.fromJson(
      jsonObject(
        jsonObject(
          await request('POST', '/verify-email', body: {'token': token}),
        )['user'],
      ),
    );
    final s = _session;
    if (generation == _generation && s != null && s.user.id == u.id) {
      await setSession(
        AuthSession(
          accessToken: s.accessToken,
          refreshToken: s.refreshToken,
          user: u,
        ),
      );
    }
    return u;
  }

  Future<void> sendMagicLink({
    required String email,
    String? redirectUri,
  }) async {
    await request(
      'POST',
      '/magic-link/request',
      body: {'email': email, 'redirectUri': ?redirectUri},
    );
  }

  Future<LoginResponse> consumeMagicLink(String token) =>
      _login('/magic-link/consume', {'token': token});
  Future<LoginResponse> acceptInvitation({
    required String token,
    required String password,
    String? displayName,
  }) => _login('/invitation/accept', {
    'token': token,
    'password': password,
    'displayName': ?displayName,
  });
  Uri socialAuthorizeUrl(
    SocialProvider provider, {
    String? redirectUri,
    bool? rememberMe,
  }) => _uri('/social/${provider.name}/authorize', {
    'redirectUri': ?redirectUri,
    if (rememberMe == true) 'rememberMe': '1',
  });
  Future<SentroyAuthUser?> consumeRedirectFragment(String fragment) async {
    final hash = fragment.startsWith('#') ? fragment.substring(1) : fragment;
    final p = Uri(query: hash).queryParametersAll;
    if ((p['access_token']?.length ?? 0) != 1 ||
        (p['refresh_token']?.length ?? 0) != 1) {
      return null;
    }
    final a = p['access_token']!.single, r = p['refresh_token']!.single;
    if (a.isEmpty || r.isEmpty) return null;
    final generation = _generation;
    final u = SentroyAuthUser.fromJson(
      jsonObject(await request('GET', '/me', bearer: a)),
    );
    if (generation == _generation) {
      await setSession(AuthSession(accessToken: a, refreshToken: r, user: u));
    }
    return u;
  }

  Future<SentroyAuthUser?> getCurrentUser() async {
    final s = _session;
    if (s == null) return null;
    final generation = _generation;
    final u = SentroyAuthUser.fromJson(
      jsonObject(await request('GET', '/me', bearer: s.accessToken)),
    );
    if (generation == _generation) {
      await setSession(
        AuthSession(
          accessToken: s.accessToken,
          refreshToken: s.refreshToken,
          user: u,
        ),
      );
    }
    return u;
  }

  Future<List<SessionSummary>> listSessions() async => jsonList(
    await request('GET', '/me/sessions', bearer: _token()),
    SessionSummary.fromJson,
  );
  Future<void> revokeSession(String id) async {
    await request(
      'DELETE',
      '/me/sessions/${pathSegment(id)}',
      bearer: _token(),
    );
  }

  Future<void> changePassword({
    required String currentPassword,
    required String newPassword,
  }) async {
    final generation = _generation;
    await request(
      'POST',
      '/me/password',
      bearer: _token(),
      body: {'currentPassword': currentPassword, 'newPassword': newPassword},
    );
    if (generation == _generation) await setSession(null);
  }

  Future<void> requestEmailChange({
    required String newEmail,
    required String currentPassword,
  }) async {
    await request(
      'POST',
      '/me/email/change-request',
      bearer: _token(),
      body: {'newEmail': newEmail, 'currentPassword': currentPassword},
    );
  }

  Future<SentroyAuthUser> confirmEmailChange(String token) async {
    final generation = _generation;
    final u = SentroyAuthUser.fromJson(
      jsonObject(
        await request(
          'POST',
          '/me/email/change-confirm',
          body: {'token': token},
        ),
      ),
    );
    if (generation == _generation) await setSession(null);
    return u;
  }

  Future<void> requestAccountDeletion(String currentPassword) async {
    await request(
      'POST',
      '/me/account/delete-request',
      bearer: _token(),
      body: {'currentPassword': currentPassword},
    );
  }

  Future<void> confirmAccountDeletion(String token) async {
    final generation = _generation;
    await request('POST', '/me/account/delete-confirm', body: {'token': token});
    if (generation == _generation) await setSession(null);
  }

  Future<List<ActivityEntry>> getActivity() async => jsonList(
    await request('GET', '/me/activity', bearer: _token()),
    ActivityEntry.fromJson,
  );
  Future<MfaStatus> getMfaStatus() async => MfaStatus.fromJson(
    jsonObject(await request('GET', '/me/mfa', bearer: _token())),
  );
  Future<MfaEnrollResponse> enrollTotp() async => MfaEnrollResponse.fromJson(
    jsonObject(await request('POST', '/me/mfa/totp/enroll', bearer: _token())),
  );
  Future<MfaVerifyEnrollmentResponse> verifyTotpEnrollment(String code) async =>
      MfaVerifyEnrollmentResponse.fromJson(
        jsonObject(
          await request(
            'POST',
            '/me/mfa/totp/verify-enrollment',
            bearer: _token(),
            body: {'code': code},
          ),
        ),
      );
  Future<void> disableTotp(String currentPassword) async {
    await request(
      'POST',
      '/me/mfa/totp/disable',
      bearer: _token(),
      body: {'currentPassword': currentPassword},
    );
  }

  Future<List<PasskeySummary>> listPasskeys() async => jsonList(
    await request('GET', '/me/passkey', bearer: _token()),
    PasskeySummary.fromJson,
  );
  Future<void> deletePasskey(String id) async {
    await request('DELETE', '/me/passkey/${pathSegment(id)}', bearer: _token());
  }

  Future<PasskeyChallenge> beginPasskeyRegistration() async =>
      PasskeyChallenge.fromJson(
        jsonObject(
          await request('POST', '/me/passkey/register/begin', bearer: _token()),
        ),
      );
  Future<void> completePasskeyRegistration({
    required String challengeToken,
    required JsonMap response,
    String? deviceName,
  }) async {
    await request(
      'POST',
      '/me/passkey/register/complete',
      bearer: _token(),
      body: {
        'challengeToken': challengeToken,
        'response': response,
        'deviceName': ?deviceName,
      },
    );
  }

  Future<PasskeyChallenge> beginPasskeyAuthentication({String? email}) async =>
      PasskeyChallenge.fromJson(
        jsonObject(
          await request(
            'POST',
            '/passkey/authenticate/begin',
            body: {'email': ?email},
          ),
        ),
      );
  Future<LoginResponse> completePasskeyAuthentication({
    required String challengeToken,
    required JsonMap response,
    bool? rememberMe,
  }) => _login('/passkey/authenticate/complete', {
    'challengeToken': challengeToken,
    'response': response,
    'rememberMe': ?rememberMe,
  });
}
