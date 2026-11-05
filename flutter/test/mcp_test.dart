import 'dart:async';
import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:sentroy_client_sdk/src/mcp/mcp.dart';

void main() {
  const token = 'mcp_abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ';
  const id = '0123456789abcdef01234567';
  test('resource, origin and token validation', () async {
    expect(
      sentroyMcpResource(app: 'mail', companySlug: 'acme'),
      'https://mail.sentroy.com/mcp/acme',
    );
    expect(
      sentroyMcpResourceMetadata(
        app: 'core',
        companySlug: 'x',
        origin: 'http://localhost:8080',
      ),
      'http://localhost:8080/.well-known/oauth-protected-resource/mcp/x',
    );
    expect(
      () => sentroyMcpResource(
        app: 'mail',
        companySlug: 'x',
        origin: 'http://evil.test',
      ),
      throwsA(isA<SentroyMcpError>()),
    );
    var calls = 0;
    await expectLater(
      connectSentroyMcp(
        app: 'mail',
        companySlug: 'x',
        token: 'stk_bad',
        httpClient: MockClient((_) async {
          calls++;
          return http.Response('', 200);
        }),
      ),
      throwsA(isA<SentroyMcpError>()),
    );
    expect(calls, 0);
  });
  test('local manifests enforce names and hash', () {
    expect(
      sentroyMcpContactImportFileInfo(utf8.encode('abc'), 'csv')['fileHash'],
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
    expect(
      sentroyMcpStorageUploadFileInfo(
        [1],
        name: 'a.txt',
        mimeType: 'text/plain',
      )['bytes'],
      1,
    );
    expect(
      () => sentroyMcpStorageUploadFileInfo(
        [1],
        name: '../a.txt',
        mimeType: 'text/plain',
      ),
      throwsA(isA<SentroyMcpError>()),
    );
  });
  test('handshake, bound download, and rejected references', () async {
    var requests = 0;
    final fake = MockClient((request) async {
      requests++;
      expect(request.followRedirects, false);
      expect(request.headers['authorization'], 'Bearer $token');
      if (request.method == 'GET') return http.Response.bytes([1, 2, 3], 200);
      final msg = jsonDecode(request.body) as Map<String, dynamic>;
      if (msg['method'] == 'initialize') {
        return http.Response(
          jsonEncode({
            'jsonrpc': '2.0',
            'id': msg['id'],
            'result': {
              'protocolVersion': '2025-03-26',
              'capabilities': {},
              'serverInfo': {'name': 'test', 'version': '1'},
            },
          }),
          200,
          headers: {
            'content-type': 'application/json',
            'mcp-session-id': 'session',
          },
        );
      }
      return http.Response('', 202);
    });
    final connection = await connectSentroyMcp(
      app: 'storage',
      companySlug: 'x',
      token: token,
      httpClient: fake,
    );
    final ref = {
      'downloadUrl':
          'https://storage.sentroy.com/mcp/x/files/bucket/$id?connection=$id&version=2026-01-01T00%3A00%3A00.000Z',
      'requiresAuthorization': true,
      'method': 'GET',
      'file': {'id': id, 'size': 3},
    };
    expect(await connection.downloadFile(ref), [1, 2, 3]);
    final previous = requests;
    await expectLater(
      connection.downloadFile({
        ...ref,
        'downloadUrl':
            'https://evil.test/mcp/x/files/bucket/$id?connection=$id&version=2026-01-01T00%3A00%3A00.000Z',
      }),
      throwsA(isA<SentroyMcpError>()),
    );
    expect(requests, previous);
    await connection.close();
  });
  test('all private file helpers bind receipts and never replay', () async {
    const uuid = '12345678-1234-4234-8234-123456789abc';
    const hash =
        'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';
    const rev =
        'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    const expiry = '2099-01-01T00:00:00.000Z';
    final bytes = utf8.encode('abc');
    var transferCount = 0;
    var failUpload = false;
    var uploadMode = 0;
    final info = {
      'uploadId': uuid,
      'name': 'a.txt',
      'mimeType': 'text/plain',
      'bytes': 3,
      'sha256': hash,
      'bucket': {'id': id, 'slug': 'bucket', 'revision': rev},
      'state': 'waiting',
      'revision': rev,
      'expiresAt': expiry,
      'published': false,
      'malwareScanned': false,
      'requiresHumanApproval': true,
    };
    final fake = MockClient((request) async {
      if (request.method == 'POST') {
        final msg = jsonDecode(request.body) as Map<String, dynamic>;
        if (msg['method'] == 'initialize') {
          return http.Response(
            jsonEncode({
              'jsonrpc': '2.0',
              'id': msg['id'],
              'result': {
                'protocolVersion': '2025-03-26',
                'capabilities': {},
                'serverInfo': {'name': 'test', 'version': '1'},
              },
            }),
            200,
            headers: {'content-type': 'application/json'},
          );
        }
        return http.Response('', 202);
      }
      transferCount++;
      expect(request.followRedirects, false);
      if (failUpload) throw Exception('lost acknowledgment');
      if (uploadMode == 1) return http.Response('', 503);
      if (uploadMode == 2) {
        return http.Response(
          '{',
          200,
          headers: {'content-type': 'application/json'},
        );
      }
      if (request.method == 'GET') return http.Response.bytes(bytes, 200);
      if (request.url.path.contains('/contacts/')) {
        return http.Response(
          jsonEncode({
            'uploadId': uuid,
            'state': 'ready',
            'count': 1,
            'fileHash': hash,
            'expiresAt': expiry,
          }),
          200,
        );
      }
      return http.Response(
        jsonEncode({...info, 'state': 'ready'}),
        200,
        headers: {'content-type': 'application/json'},
      );
    });
    final mail = await connectSentroyMcp(
      app: 'mail',
      companySlug: 'x',
      token: token,
      httpClient: fake,
    );
    final encoded = base64Url
        .encode(
          utf8.encode(
            jsonEncode({
              'partId': '1',
              'reference': {
                'companyId': 'x',
                'mailbox': 'a@b',
                'folder': 'INBOX',
                'uidValidity': '1',
                'uid': 1,
              },
            }),
          ),
        )
        .replaceAll('=', '');
    final attachment = {
      'downloadUrl':
          'https://mail.sentroy.com/mcp/x/attachments/$encoded?connection=$id&version=$rev',
      'requiresAuthorization': true,
      'method': 'GET',
      'attachment': {'partId': '1', 'encodedSize': 3},
      'maxBytes': 10,
    };
    expect(await mail.downloadMailAttachment(attachment), bytes);
    await expectLater(
      mail.downloadMailAttachment({...attachment, 'maxBytes': 9000000}),
      throwsA(isA<SentroyMcpError>()),
    );
    final exp = {
      'exportId': uuid,
      'format': 'csv',
      'bytes': 3,
      'fileHash': hash,
      'expiresAt': expiry,
      'downloadUrl':
          'https://mail.sentroy.com/mcp/x/contacts/exports/$uuid?connection=$id&hash=$hash',
      'requiresOriginalBearer': true,
    };
    expect(await mail.downloadMailContactsExport(exp), bytes);
    await expectLater(
      mail.downloadMailContactsExport({...exp, 'fileHash': rev}),
      throwsA(isA<SentroyMcpError>()),
    );
    final imp = {
      'uploadId': uuid,
      'bytes': 3,
      'fileHash': hash,
      'expiresAt': expiry,
      'uploadUrl':
          'https://mail.sentroy.com/mcp/x/contacts/imports/$uuid?connection=$id',
      'requiresOriginalBearer': true,
    };
    expect((await mail.uploadMailContactsImport(imp, bytes))['state'], 'ready');
    final before = transferCount;
    await expectLater(
      mail.uploadMailContactsImport(imp, [1, 2, 3]),
      throwsA(isA<SentroyMcpError>()),
    );
    expect(transferCount, before);
    await mail.close();
    final storage = await connectSentroyMcp(
      app: 'storage',
      companySlug: 'x',
      token: token,
      httpClient: fake,
    );
    final storageRef = {
      ...info,
      'uploadUrl':
          'https://storage.sentroy.com/mcp/x/uploads/$uuid?connection=$id',
      'method': 'PUT',
      'contentType': 'application/octet-stream',
      'requiresOriginalBearer': true,
    };
    expect(
      (await storage.uploadStorageFile(storageRef, bytes))['state'],
      'ready',
    );
    await expectLater(
      storage.uploadStorageFile({
        ...storageRef,
        'uploadUrl': 'https://evil.test/',
      }, bytes),
      throwsA(isA<SentroyMcpError>()),
    );
    for (final mode in [1, 2]) {
      uploadMode = mode;
      await expectLater(
        storage.uploadStorageFile(storageRef, bytes),
        throwsA(
          isA<SentroyMcpError>().having(
            (e) => e.code,
            'code',
            'mcp_upload_outcome_unknown',
          ),
        ),
      );
    }
    uploadMode = 0;
    failUpload = true;
    final count = transferCount;
    await expectLater(
      storage.uploadStorageFile(storageRef, bytes),
      throwsA(
        isA<SentroyMcpError>().having(
          (e) => e.code,
          'code',
          'mcp_upload_outcome_unknown',
        ),
      ),
    );
    expect(transferCount, count + 1);
    await storage.close();
  }, timeout: const Timeout(Duration(seconds: 5)));
  test('SSE initialization and redirect refusal', () async {
    var posts = 0;
    final fake = MockClient((request) async {
      posts++;
      final msg = jsonDecode(request.body) as Map<String, dynamic>;
      if (msg['method'] == 'initialize') {
        final result = jsonEncode({
          'jsonrpc': '2.0',
          'id': msg['id'],
          'result': {
            'protocolVersion': '2025-03-26',
            'capabilities': {},
            'serverInfo': {'name': 'test', 'version': '1'},
          },
        });
        return http.Response(
          ': comment\r\nevent: message\r\ndata: $result\r\n\r\n',
          200,
          headers: {'content-type': 'text/event-stream'},
        );
      }
      return http.Response(
        '',
        302,
        headers: {'location': 'https://evil.test/'},
      );
    });
    await expectLater(
      connectSentroyMcp(
        app: 'mail',
        companySlug: 'x',
        token: token,
        httpClient: fake,
        connectTimeout: const Duration(seconds: 2),
      ),
      throwsA(isA<SentroyMcpError>()),
    );
    expect(posts, 2);
  }, timeout: const Timeout(Duration(seconds: 5)));
  test('oversized SSE is cancelled before a complete line', () async {
    final fake = _OversizedSseClient();
    await expectLater(
      connectSentroyMcp(
        app: 'mail',
        companySlug: 'x',
        token: token,
        httpClient: fake,
        connectTimeout: const Duration(seconds: 2),
      ),
      throwsA(isA<SentroyMcpError>()),
    );
    expect(fake.cancelled, isTrue);
  }, timeout: const Timeout(Duration(seconds: 5)));

  test(
    'close interrupts waiting credentials and prevents later requests',
    () async {
      var calls = 0;
      var requests = 0;
      final pending = Completer<String>();
      Future<String> provider() async {
        calls++;
        return calls <= 3 ? token : pending.future;
      }

      final fake = MockClient((request) async {
        requests++;
        final msg = jsonDecode(request.body) as Map<String, dynamic>;
        if (msg['method'] == 'initialize') {
          return http.Response(
            jsonEncode({
              'jsonrpc': '2.0',
              'id': msg['id'],
              'result': {
                'protocolVersion': '2025-03-26',
                'capabilities': {},
                'serverInfo': {'name': 'test', 'version': '1'},
              },
            }),
            200,
            headers: {'content-type': 'application/json'},
          );
        }
        return http.Response('', 202);
      });
      final c = await connectSentroyMcp(
        app: 'storage',
        companySlug: 'x',
        token: provider,
        httpClient: fake,
      );
      final ref = {
        'downloadUrl':
            'https://storage.sentroy.com/mcp/x/files/bucket/$id?connection=$id&version=2026-01-01T00%3A00%3A00.000Z',
        'requiresAuthorization': true,
        'method': 'GET',
        'file': {'id': id, 'size': 3},
      };
      final transfer = expectLater(
        c.downloadFile(ref),
        throwsA(isA<SentroyMcpError>()),
      );
      await Future<void>.delayed(Duration.zero);
      await c.close();
      await transfer;
      pending.complete(token);
      await expectLater(c.downloadFile(ref), throwsA(isA<SentroyMcpError>()));
      expect(requests, 2);
    },
    timeout: const Timeout(Duration(seconds: 5)),
  );
}

class _OversizedSseClient extends http.BaseClient {
  bool cancelled = false;
  @override
  Future<http.StreamedResponse> send(http.BaseRequest request) async {
    late StreamController<List<int>> controller;
    controller = StreamController<List<int>>(
      onListen: () {
        controller.add(List<int>.filled(1024 * 1024 + 1, 65));
      },
      onCancel: () {
        cancelled = true;
      },
    );
    return http.StreamedResponse(
      controller.stream,
      200,
      headers: {'content-type': 'text/event-stream'},
    );
  }
}
