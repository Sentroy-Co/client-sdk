import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:jose/jose.dart';
import '../errors.dart';
import '../json.dart';
import 'client.dart';
import 'types.dart';

/// Server-side Identity operations. Keep the API key on a trusted server.
class SentroyAuthAdmin {
  SentroyAuthAdmin({
    Uri? baseUrl,
    required this.projectSlug,
    required this.apiKey,
    http.Client? httpClient,
    Duration timeout = const Duration(seconds: 30),
    this.jwksCacheTtl = const Duration(hours: 1),
  }) : baseUrl = baseUrl ?? Uri.parse('https://auth.sentroy.com'),
       _auth = SentroyAuth(
         baseUrl: baseUrl,
         projectSlug: projectSlug,
         apiKey: apiKey,
         httpClient: httpClient,
         timeout: timeout,
       ) {
    if (apiKey.length < 12 || apiKey.codeUnits.any((x) => x > 127)) {
      throw ArgumentError('API key must contain at least 12 ASCII characters');
    }
    if (jwksCacheTtl.isNegative) {
      throw ArgumentError('JWKS cache TTL must not be negative');
    }
    users = AuthAdminUsers(_auth);
  }
  final Uri baseUrl;
  final String projectSlug, apiKey;
  final Duration jwksCacheTtl;
  final SentroyAuth _auth;
  late final AuthAdminUsers users;
  List<JsonMap>? _keys;
  DateTime? _expires;
  Future<List<JsonMap>>? _pendingJwks;
  int _cacheGeneration = 0;
  void invalidateJwksCache() {
    _keys = null;
    _expires = null;
    _cacheGeneration++;
    _pendingJwks = null;
  }

  Future<void> close() => _auth.close();
  Future<List<JsonMap>> _jwks() {
    if (_keys != null &&
        _expires != null &&
        DateTime.now().isBefore(_expires!)) {
      return Future.value(_keys!);
    }
    if (_pendingJwks != null) return _pendingJwks!;
    final generation = _cacheGeneration;
    late final Future<List<JsonMap>> pending;
    pending =
        (() async {
          final j = jsonObject(await _auth.request('GET', '/jwks.json'));
          final keys = jsonList(j['keys'], (v) => v);
          if (_cacheGeneration == generation) {
            _keys = keys;
            _expires = DateTime.now().add(jwksCacheTtl);
          }
          return keys;
        })().whenComplete(() {
          if (identical(_pendingJwks, pending)) _pendingJwks = null;
        });
    return _pendingJwks = pending;
  }

  Future<JsonMap> verifyIdToken(String token) async {
    try {
      final parts = token.split('.');
      if (parts.length != 3) throw const FormatException('Malformed JWT');
      JsonMap decode(String s) => jsonObject(
        jsonDecode(utf8.decode(base64Url.decode(base64Url.normalize(s)))),
      );
      final header = decode(parts[0]), claims = decode(parts[1]);
      final kid = header['kid'];
      if (header['alg'] != 'RS256' || kid is! String || kid.isEmpty) {
        throw const FormatException('Unsupported JWT header');
      }
      final exp = claims['exp'];
      if (exp is! num || exp <= DateTime.now().millisecondsSinceEpoch / 1000) {
        throw const FormatException('Token expired');
      }
      final issuer =
          '${baseUrl.toString().replaceFirst(RegExp(r'/+$'), '')}/p/${pathSegment(projectSlug)}';
      if (claims['iss'] != issuer) {
        throw const FormatException('Issuer mismatch');
      }
      if (claims['aud'] != apiKey.substring(0, 12)) {
        throw const FormatException('Audience mismatch');
      }
      final matches = (await _jwks()).where((k) => k['kid'] == kid).toList();
      if (matches.length != 1) {
        throw const FormatException('Key ID must identify one key');
      }
      final key = matches.single;
      if (key['kty'] != 'RSA' ||
          (key['alg'] != null && key['alg'] != 'RS256') ||
          (key['use'] != null && key['use'] != 'sig') ||
          (key['key_ops'] != null &&
              (key['key_ops'] is! List ||
                  !(key['key_ops'] as List).contains('verify')))) {
        throw const FormatException('Invalid signing key');
      }
      final store = JsonWebKeyStore()..addKey(JsonWebKey.fromJson(key));
      if (!await JsonWebSignature.fromCompactSerialization(
        token,
      ).verify(store)) {
        throw const FormatException('Invalid signature');
      }
      return claims;
    } on SentroyException {
      rethrow;
    } catch (_) {
      throw const SentroyAuthException(
        'invalid_token',
        'Token verification failed',
      );
    }
  }
}

class AuthAdminUsers {
  AuthAdminUsers(this._auth);
  Never list({int? limit, int? skip, bool? emailVerified}) =>
      throw UnsupportedError(
        'User listing requires the session-authenticated dashboard API',
      );
  final SentroyAuth _auth;
  Future<SignupResponse> create(SignUpRequest input) async =>
      SignupResponse.fromJson(
        jsonObject(
          await _auth.request('POST', '/signup', body: input.toJson()),
        ),
      );
  Future<LoginOutcome> signIn(SignInRequest input) async {
    final j = jsonObject(
      await _auth.request('POST', '/login', body: input.toJson()),
    );
    return j['mfaRequired'] == true
        ? LoginOutcome.mfa(MfaChallengeResponse.fromJson(j))
        : LoginOutcome.tokens(LoginResponse.fromJson(j));
  }

  Future<LoginResponse> verifyMfa(MfaVerifyRequest input) async =>
      LoginResponse.fromJson(
        jsonObject(
          await _auth.request(
            'POST',
            '/login/mfa/verify',
            body: input.toJson(),
          ),
        ),
      );
  Future<AuthTokensResponse> refresh(String token) async =>
      AuthTokensResponse.fromJson(
        jsonObject(
          await _auth.request(
            'POST',
            '/refresh',
            body: {'refreshToken': token},
          ),
        ),
      );
  Future<void> signOut(String token) async {
    await _auth.request('POST', '/logout', body: {'refreshToken': token});
  }

  Future<SentroyAuthUser> verifyEmail(String token) async =>
      SentroyAuthUser.fromJson(
        jsonObject(
          jsonObject(
            await _auth.request(
              'POST',
              '/verify-email',
              body: {'token': token},
            ),
          )['user'],
        ),
      );
  Future<void> requestPasswordReset(String email) =>
      _auth.sendPasswordReset(email);
  Future<SentroyAuthUser> confirmPasswordReset({
    required String token,
    required String newPassword,
  }) => _auth.confirmPasswordReset(token: token, newPassword: newPassword);
  Future<void> sendMagicLink({required String email, String? redirectUri}) =>
      _auth.sendMagicLink(email: email, redirectUri: redirectUri);
  Future<LoginResponse> consumeMagicLink(String token) async =>
      LoginResponse.fromJson(
        jsonObject(
          await _auth.request(
            'POST',
            '/magic-link/consume',
            body: {'token': token},
          ),
        ),
      );
  Future<LoginResponse> acceptInvitation({
    required String token,
    required String password,
    String? displayName,
  }) async => LoginResponse.fromJson(
    jsonObject(
      await _auth.request(
        'POST',
        '/invitation/accept',
        body: {
          'token': token,
          'password': password,
          'displayName': ?displayName,
        },
      ),
    ),
  );
  Future<SentroyAuthUser> getUser(String token) async =>
      SentroyAuthUser.fromJson(
        jsonObject(await _auth.request('GET', '/me', bearer: token)),
      );
  Future<JsonMap> getUserinfo(String token) async =>
      jsonObject(await _auth.request('GET', '/userinfo', bearer: token));
}
