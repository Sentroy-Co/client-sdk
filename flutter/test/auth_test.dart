import 'dart:async';
import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:jose/jose.dart';
import 'package:sentroy_client_sdk/src/auth/admin.dart';
import 'package:sentroy_client_sdk/src/auth/client.dart';
import 'package:sentroy_client_sdk/src/auth/storage.dart';
import 'package:sentroy_client_sdk/src/auth/types.dart';
import 'package:sentroy_client_sdk/src/errors.dart';

final user = SentroyAuthUser(
  id: '1',
  authProjectId: 'p',
  email: 'a@example.com',
  emailVerified: true,
  createdAt: 'now',
  updatedAt: 'now',
);

class FailingClearStorage extends MemoryAuthSessionStorage {
  @override
  Future<void> clear() async => throw StateError('clear failed');
}

void main() {
  test(
    'session storage, bearer precedence, rotating refresh coalescing',
    () async {
      final gate = Completer<void>();
      var refreshes = 0;
      final headers = <String?>[];
      final client = MockClient((req) async {
        headers.add(req.headers['authorization']);
        if (req.url.path.endsWith('/refresh')) {
          refreshes++;
          await gate.future;
          return http.Response(
            jsonEncode({
              'accessToken': 'new',
              'refreshToken': 'rotated',
              'expiresIn': 300,
              'tokenType': 'Bearer',
            }),
            200,
          );
        }
        return http.Response(jsonEncode(user.toJson()), 200);
      });
      final storage = MemoryAuthSessionStorage();
      final auth = SentroyAuth(
        projectSlug: 'demo',
        apiKey: 'project-key',
        httpClient: client,
        storage: storage,
      );
      final changes = <AuthSession?>[];
      final sub = auth.changes.listen(changes.add);
      await auth.setSession(
        AuthSession(accessToken: 'old', refreshToken: 'refresh', user: user),
      );
      final a = auth.refreshNow(), b = auth.refreshNow();
      await Future<void>.delayed(Duration.zero);
      expect(refreshes, 1);
      gate.complete();
      await Future.wait([a, b]);
      expect(auth.currentSession!.refreshToken, 'rotated');
      await auth.getCurrentUser();
      expect(headers, ['Bearer project-key', 'Bearer new']);
      expect((await storage.read())!.accessToken, 'new');
      await Future<void>.delayed(Duration.zero);
      expect(changes.length, 4);
      await sub.cancel();
      await auth.close();
    },
  );
  test('unknown refresh outcome cannot replay a rotating token', () async {
    var count = 0;
    final auth = SentroyAuth(
      projectSlug: 'p',
      httpClient: MockClient((_) async {
        count++;
        throw http.ClientException('offline');
      }),
    );
    await auth.setSession(
      AuthSession(accessToken: 'a', refreshToken: 'r', user: user),
    );
    await expectLater(auth.refreshNow(), throwsA(isA<SentroyException>()));
    await expectLater(auth.refreshNow(), throwsA(isA<SentroyAuthException>()));
    expect(count, 1);
    await auth.close();
  });
  test(
    'refresh clears durable state before dispatch and cannot replay after restart',
    () async {
      final storage = MemoryAuthSessionStorage();
      var calls = 0;
      final client = MockClient((_) async {
        calls++;
        expect(await storage.read(), isNull);
        throw http.ClientException('response lost');
      });
      final auth = SentroyAuth(
        projectSlug: 'p',
        storage: storage,
        httpClient: client,
      );
      await auth.setSession(
        AuthSession(accessToken: 'a', refreshToken: 'r', user: user),
      );
      await expectLater(auth.refreshNow(), throwsA(isA<SentroyException>()));
      expect(auth.currentSession, isNull);
      final restarted = SentroyAuth(
        projectSlug: 'p',
        storage: storage,
        httpClient: client,
      );
      expect(await restarted.restore(), isNull);
      await expectLater(
        restarted.refreshNow(),
        throwsA(isA<SentroyAuthException>()),
      );
      expect(calls, 1);
      await auth.close();
      await restarted.close();
    },
  );
  test('failed durable clear prevents refresh dispatch', () async {
    final storage = FailingClearStorage();
    var calls = 0;
    final auth = SentroyAuth(
      projectSlug: 'p',
      storage: storage,
      httpClient: MockClient((_) async {
        calls++;
        return http.Response('', 200);
      }),
    );
    await auth.setSession(
      AuthSession(accessToken: 'a', refreshToken: 'r', user: user),
    );
    await expectLater(auth.refreshNow(), throwsStateError);
    expect(calls, 0);
    expect((await storage.read())!.refreshToken, 'r');
    await auth.close();
  });
  test('delayed responses do not replace a newer session', () async {
    for (final operation in [
      'me',
      'password',
      'email',
      'delete',
      'logout',
      'redirect',
    ]) {
      final started = Completer<void>(), gate = Completer<void>();
      final auth = SentroyAuth(
        projectSlug: 'p',
        httpClient: MockClient((req) async {
          started.complete();
          await gate.future;
          return http.Response(jsonEncode(user.toJson()), 200);
        }),
      );
      await auth.setSession(
        AuthSession(accessToken: 'old', refreshToken: 'old-r', user: user),
      );
      late Future<dynamic> pending;
      switch (operation) {
        case 'me':
          pending = auth.getCurrentUser();
        case 'password':
          pending = auth.changePassword(
            currentPassword: 'old',
            newPassword: 'new',
          );
        case 'email':
          pending = auth.confirmEmailChange('token');
        case 'delete':
          pending = auth.confirmAccountDeletion('token');
        case 'logout':
          pending = auth.signOut();
        case 'redirect':
          pending = auth.consumeRedirectFragment(
            '#access_token=a&refresh_token=r',
          );
      }
      await started.future;
      await auth.setSession(
        AuthSession(accessToken: 'new', refreshToken: 'new-r', user: user),
      );
      gate.complete();
      await pending;
      expect(auth.currentSession!.accessToken, 'new', reason: operation);
      await auth.close();
    }
  });
  test('delayed profile response cannot restore a cleared session', () async {
    final started = Completer<void>(), gate = Completer<void>();
    final auth = SentroyAuth(
      projectSlug: 'p',
      httpClient: MockClient((_) async {
        started.complete();
        await gate.future;
        return http.Response(jsonEncode(user.toJson()), 200);
      }),
    );
    await auth.setSession(
      AuthSession(accessToken: 'old', refreshToken: 'old-r', user: user),
    );
    final pending = auth.getCurrentUser();
    await started.future;
    await auth.setSession(null);
    gate.complete();
    await pending;
    expect(auth.currentSession, isNull);
    await auth.close();
  });
  test('duplicate fragment tokens are rejected without requests', () async {
    var calls = 0;
    final auth = SentroyAuth(
      projectSlug: 'p',
      httpClient: MockClient((_) async {
        calls++;
        return http.Response('{}', 200);
      }),
    );
    expect(
      await auth.consumeRedirectFragment(
        '#access_token=a&access_token=b&refresh_token=r',
      ),
      isNull,
    );
    expect(
      await auth.consumeRedirectFragment(
        '#access_token=a&refresh_token=r&refresh_token=x',
      ),
      isNull,
    );
    expect(calls, 0);
    await auth.close();
  });
  test(
    'request serialization and error details are preserved safely',
    () async {
      final auth = SentroyAuth(
        projectSlug: 'demo',
        apiKey: 'project-key',
        httpClient: MockClient((req) async {
          expect(jsonDecode(req.body), {
            'email': 'a@example.com',
            'password': 'secret',
            'rememberMe': true,
          });
          return http.Response(
            jsonEncode({
              'error': 'bad_credentials',
              'error_description': 'Invalid login',
            }),
            401,
          );
        }),
      );
      await expectLater(
        auth.signIn(
          const SignInRequest(
            email: 'a@example.com',
            password: 'secret',
            rememberMe: true,
          ),
        ),
        throwsA(
          isA<SentroyAuthException>()
              .having((e) => e.code, 'code', 'bad_credentials')
              .having((e) => e.statusCode, 'status', 401),
        ),
      );
      await auth.close();
    },
  );
  test(
    'RS256 verifies claims and caches only a uniquely identified signing key',
    () async {
      final key = JsonWebKey.generate('RS256');
      final pub = Map<String, dynamic>.from(
        JsonWebKey.fromCryptoKeys(
          publicKey: key.cryptoKeyPair.publicKey,
        ).toJson(),
      )..addAll({'kid': 'key1', 'alg': 'RS256', 'use': 'sig'});
      var calls = 0;
      final client = MockClient((req) async {
        calls++;
        return http.Response(
          jsonEncode({
            'keys': [pub],
          }),
          200,
        );
      });
      final admin = SentroyAuthAdmin(
        baseUrl: Uri.parse('https://auth.example'),
        projectSlug: 'demo',
        apiKey: 'abcdefghijkl-secret',
        httpClient: client,
      );
      String jwt(Map<String, dynamic> changes) {
        final builder = JsonWebSignatureBuilder()
          ..jsonContent = {
            'sub': 'u',
            'iss': 'https://auth.example/p/demo',
            'aud': 'abcdefghijkl',
            'exp': DateTime.now().millisecondsSinceEpoch ~/ 1000 + 300,
            ...changes,
          }
          ..setProtectedHeader('kid', 'key1')
          ..addRecipient(key, algorithm: 'RS256');
        return builder.build().toCompactSerialization();
      }

      final results = await Future.wait([
        admin.verifyIdToken(jwt({})),
        admin.verifyIdToken(jwt({})),
      ]);
      expect(results.first['sub'], 'u');
      expect(calls, 1);
      await expectLater(
        admin.verifyIdToken(jwt({'iss': 'https://evil.example/p/demo'})),
        throwsA(isA<SentroyAuthException>()),
      );
      await expectLater(
        admin.verifyIdToken(jwt({'aud': 'a'})),
        throwsA(isA<SentroyAuthException>()),
      );
      await expectLater(
        admin.verifyIdToken(jwt({'exp': 0})),
        throwsA(isA<SentroyAuthException>()),
      );
      final original = jwt({}).split('.');
      final attacker = JsonWebKey.generate('RS256');
      final forgedBuilder = JsonWebSignatureBuilder()
        ..jsonContent = {
          'sub': 'u',
          'iss': 'https://auth.example/p/demo',
          'aud': 'abcdefghijkl',
          'exp': DateTime.now().millisecondsSinceEpoch ~/ 1000 + 300,
        }
        ..setProtectedHeader('kid', 'key1')
        ..addRecipient(attacker, algorithm: 'RS256');
      final forgedSignature = forgedBuilder
          .build()
          .toCompactSerialization()
          .split('.')
          .last;
      await expectLater(
        admin.verifyIdToken('${original[0]}.${original[1]}.$forgedSignature'),
        throwsA(isA<SentroyAuthException>()),
      );
      admin.invalidateJwksCache();
      await admin.verifyIdToken(jwt({}));
      expect(calls, 2);
      await admin.close();
    },
  );
}
