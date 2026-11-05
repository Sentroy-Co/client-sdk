import 'dart:async';
import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:sentroy_client_sdk/sentroy_client_sdk.dart';
import 'package:sentroy_client_sdk/src/http.dart';

class _Client extends http.BaseClient {
  _Client(this.handle);
  final Future<http.StreamedResponse> Function(http.BaseRequest) handle;
  bool closed = false;
  @override
  Future<http.StreamedResponse> send(http.BaseRequest r) => handle(r);
  @override
  void close() {
    closed = true;
  }
}

void main() {
  test(
    'company gateway routes and escaped identifiers use one bearer',
    () async {
      final seen = <Uri>[];
      final client = MockClient((r) async {
        seen.add(r.url);
        expect(r.headers['Authorization'], 'Bearer token');
        expect(r.followRedirects, isFalse);
        return http.Response(
          '{"data":[]}',
          200,
          headers: {'content-type': 'application/json'},
        );
      });
      final sdk = Sentroy(
        companySlug: 'tenant/name',
        accessToken: 'token',
        httpClient: client,
      );
      await sdk.domains.list();
      await sdk.buckets.list();
      await sdk.whatsapp.numbers.list();
      expect(seen.map((u) => u.toString()), [
        'https://sentroy.com/api/mail/companies/tenant%2Fname/domains',
        'https://sentroy.com/api/storage/companies/tenant%2Fname/buckets',
        'https://sentroy.com/api/whatsapp/companies/tenant%2Fname/numbers',
      ]);
      sdk.close();
      await expectLater(sdk.domains.list(), throwsA(isA<SentroyException>()));
    },
  );
  test('query values, bodyless request and one-level data envelope', () async {
    final client = MockClient((r) async {
      expect(r.url.queryParameters, {
        'enabled': 'false',
        'page': '0',
        'tags': 'a,b',
      });
      expect(r.bodyBytes, isEmpty);
      expect(r.headers.containsKey('content-type'), isFalse);
      return http.Response('{"data":{"data":[1],"total":1}}', 200);
    });
    final transport = SentroyHttp(
      baseUrl: Uri.parse('https://example.com'),
      client: client,
    );
    expect(
      await transport.get(
        '/items',
        query: {
          'enabled': false,
          'page': 0,
          'tags': ['a', 'b'],
          'skip': null,
        },
      ),
      {
        'data': [1],
        'total': 1,
      },
    );
  });
  test(
    'injected client stays open; transport credentials stay out of errors',
    () async {
      final client = _Client(
        (_) async => http.StreamedResponse(
          Stream.value(utf8.encode('{"error":"private-token"}')),
          403,
        ),
      );
      final transport = SentroyHttp(
        baseUrl: Uri.parse('https://example.com'),
        accessToken: 'private-token',
        client: client,
      );
      try {
        await transport.get('/denied');
        fail('Expected API error');
      } on SentroyException catch (e) {
        expect(e.statusCode, 403);
        expect(e.body, {'error': 'private-token'});
        expect(e.toString(), isNot(contains('private-token')));
      }
      expect(transport.toString(), isNot(contains('private-token')));
      transport.close();
      expect(client.closed, isFalse);
      expect(
        () => transport.withBearer('another'),
        throwsA(isA<SentroyException>()),
      );
    },
  );
  test(
    'JSON limits apply to chunked responses and binary failures preserve status',
    () async {
      var cancelled = false;
      final chunks = StreamController<List<int>>(sync: true);
      chunks.onListen = () {
        chunks.add(List.filled(4097, 32));
      };
      chunks.onCancel = () {
        cancelled = true;
      };
      final client = _Client(
        (_) async => http.StreamedResponse(
          chunks.stream,
          200,
          headers: {'content-type': 'application/json'},
        ),
      );
      final transport = SentroyHttp(
        baseUrl: Uri.parse('https://example.com'),
        client: client,
      );
      await expectLater(
        transport.postOnce('/send-bcc', {}),
        throwsA(isA<SentroyException>()),
      );
      expect(cancelled, isTrue);
      await chunks.close();
      final denied = SentroyHttp(
        baseUrl: Uri.parse('https://example.com'),
        client: MockClient((_) async => http.Response('denied', 404)),
      );
      await expectLater(
        denied.getBytes('/private'),
        throwsA(
          isA<SentroyException>().having((e) => e.statusCode, 'status', 404),
        ),
      );
    },
  );
  test('total request deadline triggers HTTP abortion', () async {
    final aborted = Completer<void>();
    final client = _Client((r) {
      expect(r, isA<http.Abortable>());
      (r as http.Abortable).abortTrigger!.then((_) => aborted.complete());
      return Completer<http.StreamedResponse>().future;
    });
    final transport = SentroyHttp(
      baseUrl: Uri.parse('https://example.com'),
      client: client,
      timeout: const Duration(milliseconds: 40),
    );
    await expectLater(
      transport.get('/slow'),
      throwsA(
        isA<SentroyException>().having(
          (e) => e.message,
          'message',
          contains('timed out'),
        ),
      ),
    );
    await aborted.future.timeout(const Duration(seconds: 1));
  });
  test('invalid origins, path escapes and bearer headers fail before IO', () {
    for (final uri in [
      'file:///tmp/a',
      'https://user:pass@example.com',
      'https://example.com/?token=a',
      'https://example.com/#a',
    ]) {
      expect(() => SentroyHttp(baseUrl: Uri.parse(uri)), throwsArgumentError);
    }
    expect(
      () => SentroyHttp(
        baseUrl: Uri.parse('https://example.com'),
        accessToken: 'bad\r\nheader',
      ),
      throwsArgumentError,
    );
    expect(
      () => SentroyHttp(
        baseUrl: Uri.parse('https://example.com'),
        timeout: Duration.zero,
      ),
      throwsArgumentError,
    );
    expect(() => Sentroy(companySlug: '..'), throwsArgumentError);
  });
}
