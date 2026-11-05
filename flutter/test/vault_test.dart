import 'dart:async';
import 'dart:convert';

import 'package:crypto/crypto.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:sentroy_client_sdk/src/vault.dart';

void main() {
  const payload =
      '{"data":{"project":"p","environment":"test","variables":[{"key":"A","value":"private","type":"string","public":false},{"key":"B","value":"visible","type":"string","public":true}]}}';
  test(
    'coalesces fetches, shares clone cache, filters and invalidates',
    () async {
      var calls = 0;
      final gate = Completer<void>();
      final transport = MockClient((request) async {
        calls++;
        expect(request.headers['authorization'], 'Bearer stk_env_example');
        if (calls == 1) await gate.future;
        return http.Response(payload, 200);
      });
      final client = VaultClient(
        VaultConfig(apiKey: 'stk_env_example'),
        client: transport,
      );
      final clone = client.clone();
      final first = client.get('A');
      final second = clone.get('B');
      gate.complete();
      expect(await first, 'private');
      expect(await second, 'visible');
      expect(calls, 1);
      expect(await client.public(), {'B': 'visible'});
      expect(await client.all(), {'A': 'private', 'B': 'visible'});
      expect(await client.get('missing'), isNull);
      await expectLater(
        client.getOrThrow('missing'),
        throwsA(isA<Exception>()),
      );
      clone.invalidate();
      await client.preload();
      expect(calls, 2);
      await client.refresh();
      expect(calls, 3);
    },
  );

  test('independent clients isolate cache and fallback is explicit', () async {
    var calls = 0;
    final transport = MockClient((request) async {
      calls++;
      return http.Response(payload, 200);
    });
    final a = VaultClient(VaultConfig(apiKey: 'stk_env_a'), client: transport);
    final b = VaultClient(VaultConfig(apiKey: 'stk_env_b'), client: transport);
    await a.get('A');
    await b.get('A');
    expect(calls, 2);
    expect(await a.getWithFallback('A', (_) => 'fallback'), 'private');
    expect(await a.getWithFallback('missing', (_) => 'fallback'), 'fallback');
    final noKey = VaultClient(VaultConfig(), client: transport);
    expect(await noKey.getWithFallback('A', (_) async => 'local'), 'local');
    await expectLater(noKey.get('A'), throwsA(isA<Exception>()));
    expect(calls, 2);
  });

  test(
    'webhook authenticates raw bytes and rejects replay and future timestamps',
    () {
      const secret = 'secret';
      List<int> body(int timestamp) => utf8.encode(
        jsonEncode({
          'event': 'vault.variable.changed',
          'project': 'p',
          'environment': 'test',
          'action': 'update',
          'keys': ['A'],
          'timestamp': timestamp,
        }),
      );
      String sign(List<int> bytes) =>
          'sha256=${Hmac(sha256, utf8.encode(secret)).convert(bytes)}';
      final now = DateTime.now().millisecondsSinceEpoch;
      final bytes = body(now);
      expect(
        verifyVaultWebhook(
          secret: secret,
          signature: sign(bytes),
          body: bytes,
        ).keys,
        ['A'],
      );
      for (final bad in [body(now - 301000), body(now + 60000)]) {
        expect(
          () => verifyVaultWebhook(
            secret: secret,
            signature: sign(bad),
            body: bad,
          ),
          throwsA(
            isA<VaultWebhookException>().having(
              (e) => e.kind,
              'kind',
              VaultWebhookErrorKind.timestampOutsideWindow,
            ),
          ),
        );
      }
      expect(
        () => verifyVaultWebhook(
          secret: secret,
          signature: '${sign(bytes)}0',
          body: bytes,
        ),
        throwsA(isA<VaultWebhookException>()),
      );
      expect(
        () => verifyVaultWebhook(
          secret: secret,
          signature: sign(bytes),
          body: [...bytes, 32],
        ),
        throwsA(isA<VaultWebhookException>()),
      );
    },
  );
  test(
    'webhook invalidates lazily and stale in-flight fetch cannot repopulate cache',
    () async {
      var calls = 0;
      final gate = Completer<void>();
      final transport = MockClient((request) async {
        calls++;
        if (calls == 1) await gate.future;
        return http.Response(payload, 200);
      });
      final client = VaultClient(
        VaultConfig(apiKey: 'stk_env_a'),
        client: transport,
      );
      final pending = client.get('A');
      final bytes = utf8.encode(
        jsonEncode({
          'event': 'vault.variable.changed',
          'project': 'p',
          'environment': 'test',
          'action': 'update',
          'keys': ['A'],
          'timestamp': DateTime.now().millisecondsSinceEpoch,
        }),
      );
      final signature =
          'sha256=${Hmac(sha256, utf8.encode('secret')).convert(bytes)}';
      client.handleWebhook(secret: 'secret', signature: signature, body: bytes);
      gate.complete();
      await pending;
      expect(calls, 1);
      await client.get('A');
      expect(calls, 2);
    },
  );
}
