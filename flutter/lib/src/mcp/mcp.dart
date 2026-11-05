import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';
import 'package:crypto/crypto.dart';
import 'package:http/http.dart' as http;
import 'package:mcp_dart/mcp_dart.dart' as mcp;
import '../errors.dart';

export 'package:mcp_dart/mcp_dart.dart'
    show McpClient, Implementation, CallToolResult, CallToolRequest;

class SentroyMcpError extends SentroyException {
  const SentroyMcpError(this.code, [int? status])
    : super(code, statusCode: status);
  final String code;
}

typedef McpTokenProvider = FutureOr<String> Function();
const _origins = {
  'core': 'https://sentroy.com',
  'mail': 'https://mail.sentroy.com',
  'storage': 'https://storage.sentroy.com',
  'linear': 'https://linear.sentroy.com',
  'chaby': 'https://chaby.sentroy.com',
};
final _slug = RegExp(r'^[a-z0-9][a-z0-9_-]{0,99}$');
final _id = RegExp(r'^[a-f0-9]{24}$');
final _hex = RegExp(r'^[a-f0-9]{64}$');
final _uuid = RegExp(
  r'^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$',
);
const _contactCap = 1024 * 1024,
    _storageCap = 10 * 1024 * 1024,
    _downloadCap = 64 * 1024 * 1024;

String sentroyMcpResource({
  required String app,
  required String companySlug,
  String? origin,
}) {
  if (!_origins.containsKey(app) || !_slug.hasMatch(companySlug)) {
    throw const SentroyMcpError('invalid_mcp_resource');
  }
  final u = Uri.tryParse(origin ?? _origins[app]!);
  if (u == null ||
      !u.hasAuthority ||
      u.host.isEmpty ||
      u.userInfo.isNotEmpty ||
      u.hasQuery ||
      u.hasFragment ||
      (u.path.isNotEmpty && u.path != '/') ||
      !(u.scheme == 'https' ||
          (u.scheme == 'http' &&
              ['localhost', '127.0.0.1', '::1'].contains(u.host)))) {
    throw const SentroyMcpError('invalid_mcp_origin');
  }
  return '${u.origin}/mcp/${Uri.encodeComponent(companySlug)}';
}

String sentroyMcpResourceMetadata({
  required String app,
  required String companySlug,
  String? origin,
}) {
  final u = Uri.parse(
    sentroyMcpResource(app: app, companySlug: companySlug, origin: origin),
  );
  return '${u.origin}/.well-known/oauth-protected-resource${u.path}';
}

Future<String> _token(Object source) async {
  Object? value;
  try {
    value = source is String ? source : await (source as McpTokenProvider)();
  } catch (_) {
    throw const SentroyMcpError('mcp_token_unavailable');
  }
  if (value is! String ||
      !RegExp(r'^mcp_(?:at_)?[A-Za-z0-9_-]{43}$').hasMatch(value)) {
    throw const SentroyMcpError('invalid_mcp_token');
  }
  return value;
}

const _ext = <String, List<String>>{
  'application/pdf': ['pdf'],
  'image/jpeg': ['jpg', 'jpeg'],
  'image/png': ['png'],
  'image/webp': ['webp'],
  'text/plain': ['txt', 'log'],
  'text/csv': ['csv'],
  'audio/mpeg': ['mp3'],
  'audio/wav': ['wav'],
  'audio/ogg': ['ogg', 'oga'],
  'audio/mp4': ['m4a', 'mp4'],
  'audio/webm': ['webm'],
  'video/mp4': ['mp4'],
  'video/webm': ['webm'],
  'video/quicktime': ['mov'],
};
bool _name(dynamic name, dynamic mime) =>
    name is String &&
    mime is String &&
    name.isNotEmpty &&
    name.length <= 200 &&
    name.trim() == name &&
    utf8.decode(utf8.encode(name)) == name &&
    !RegExp(r'[/\\\x00-\x1f\x7f]').hasMatch(name) &&
    name.lastIndexOf('.') > 0 &&
    (_ext[mime]?.contains(
          name.substring(name.lastIndexOf('.') + 1).toLowerCase(),
        ) ??
        false);
Uint8List _copy(List<int> body, int cap, String code) {
  if (body.isEmpty || body.length > cap || body.any((v) => v < 0 || v > 255)) {
    throw SentroyMcpError(code);
  }
  return Uint8List.fromList(body);
}

String _hash(List<int> b) => sha256.convert(b).toString();
Map<String, dynamic> sentroyMcpContactImportFileInfo(
  List<int> body,
  String format,
) {
  if (!['csv', 'jsonl'].contains(format)) {
    throw const SentroyMcpError('invalid_mcp_contact_file');
  }
  final b = _copy(body, _contactCap, 'invalid_mcp_contact_file');
  return {'format': format, 'bytes': b.length, 'fileHash': _hash(b)};
}

Map<String, dynamic> sentroyMcpStorageUploadFileInfo(
  List<int> body, {
  required String name,
  required String mimeType,
}) {
  if (!_name(name, mimeType)) {
    throw const SentroyMcpError('invalid_mcp_storage_upload');
  }
  final b = _copy(body, _storageCap, 'invalid_mcp_storage_upload');
  return {
    'name': name,
    'mimeType': mimeType,
    'bytes': b.length,
    'sha256': _hash(b),
  };
}

bool _future(dynamic s) {
  if (s is! String ||
      !RegExp(r'^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$').hasMatch(s)) {
    return false;
  }
  final d = DateTime.tryParse(s);
  return d != null &&
      d.toUtc().toIso8601String() == s &&
      d.isAfter(DateTime.now().toUtc());
}

bool _timestamp(dynamic s) {
  if (s is! String ||
      !RegExp(r'^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$').hasMatch(s)) {
    return false;
  }
  final d = DateTime.tryParse(s);
  return d != null && d.toUtc().toIso8601String() == s;
}

bool _re(RegExp r, dynamic s) => s is String && r.hasMatch(s);
Map<String, dynamic> _snapshot(Map<String, dynamic> raw) =>
    Map<String, dynamic>.from(jsonDecode(jsonEncode(raw)) as Map);
Uri _url(dynamic raw, Uri resource, String code) {
  final u = raw is String && raw.length <= 5000 ? Uri.tryParse(raw) : null;
  if (u == null ||
      !u.hasAuthority ||
      u.origin != resource.origin ||
      u.userInfo.isNotEmpty ||
      u.hasFragment) {
    throw SentroyMcpError(code);
  }
  return u;
}

bool _query(Uri u, Set<String> names) =>
    u.queryParametersAll.length == names.length &&
    u.queryParametersAll.keys.toSet().containsAll(names) &&
    u.queryParametersAll.values.every((v) => v.length == 1);

class SentroyMcpConnection {
  SentroyMcpConnection._(
    this.app,
    this.resource,
    this._source,
    this._http,
    this.client,
  );
  final String app;
  final String resource;
  final Object _source;
  final http.Client _http;
  final mcp.McpClient client;
  Uri get _resource => Uri.parse(resource);
  bool _closed = false;
  final Set<Completer<void>> _transfers = {};
  Future<void> close() async {
    if (_closed) return;
    _closed = true;
    for (final abort in _transfers.toList()) {
      if (!abort.isCompleted) abort.complete();
    }
    await client.close();
  }

  Future<Uint8List> _transfer(
    String method,
    Uri url, {
    List<int>? body,
    required int cap,
    int? expected,
    int timeoutMs = 60000,
    String prefix = 'mcp_download',
    String? expiresAt,
    bool requireJson = false,
  }) async {
    if (timeoutMs < 1 || timeoutMs > 120000) {
      throw const SentroyMcpError('invalid_mcp_timeout');
    }
    if (_closed) throw const SentroyMcpError('mcp_connection_closed');
    final abort = Completer<void>();
    _transfers.add(abort);
    var sent = false;
    Timer? timer;
    StreamSubscription<List<int>>? sub;
    try {
      timer = Timer(Duration(milliseconds: timeoutMs), () {
        if (!abort.isCompleted) abort.complete();
        sub?.cancel();
      });
      final bearer = await Future.any([
        _token(_source),
        abort.future.then<String>(
          (_) => throw SentroyMcpError('${prefix}_aborted'),
        ),
      ]);
      if (expiresAt != null && !_future(expiresAt)) {
        throw SentroyMcpError(
          url.path.contains('/contacts/')
              ? 'invalid_mcp_contact_file_reference'
              : 'invalid_mcp_storage_upload_reference',
        );
      }
      final req = http.AbortableRequest(method, url, abortTrigger: abort.future)
        ..followRedirects = false
        ..headers['Authorization'] = 'Bearer $bearer';
      if (body != null) {
        req.headers['Content-Type'] = 'application/octet-stream';
        req.bodyBytes = body;
      }
      sent = true;
      final response = await Future.any([
        _http.send(req),
        abort.future.then<http.StreamedResponse>(
          (_) => throw SentroyMcpError('${prefix}_aborted'),
        ),
      ]);
      if (response.statusCode != 200) {
        await response.stream.listen(null).cancel();
        throw SentroyMcpError(
          method == 'GET'
              ? 'mcp_download_failed'
              : (response.statusCode >= 500 || response.statusCode < 400
                    ? 'mcp_upload_outcome_unknown'
                    : 'mcp_upload_failed'),
          response.statusCode,
        );
      }
      if (requireJson &&
          response.headers['content-type']?.split(';').first.trim() !=
              'application/json') {
        await response.stream.listen(null).cancel();
        throw const SentroyMcpError('mcp_upload_outcome_unknown');
      }
      final encoding = response.headers['content-encoding']?.toLowerCase(),
          length = response.headers['content-length'];
      if ((encoding == null || encoding == 'identity') &&
          length != null &&
          (!RegExp(r'^\d+$').hasMatch(length) ||
              (int.tryParse(length) ?? cap + 1) > cap ||
              (expected != null && int.tryParse(length) != expected))) {
        await response.stream.listen(null).cancel();
        throw SentroyMcpError('${prefix}_size_mismatch');
      }
      final result = BytesBuilder();
      final done = Completer<Uint8List>();
      var count = 0;
      sub = response.stream.listen(
        (chunk) {
          count += chunk.length;
          if (count > cap || (expected != null && count > expected)) {
            sub?.cancel();
            if (!done.isCompleted) {
              done.completeError(SentroyMcpError('${prefix}_size_mismatch'));
            }
          } else {
            result.add(chunk);
          }
        },
        onError: (Object _) {
          if (!done.isCompleted) {
            done.completeError(SentroyMcpError('${prefix}_failed'));
          }
        },
        onDone: () {
          if (!done.isCompleted) {
            if (expected != null && count != expected) {
              done.completeError(SentroyMcpError('${prefix}_size_mismatch'));
            } else {
              done.complete(result.takeBytes());
            }
          }
        },
      );
      return await Future.any([
        done.future,
        abort.future.then<Uint8List>(
          (_) => throw SentroyMcpError('${prefix}_aborted'),
        ),
      ]);
    } on SentroyMcpError catch (error) {
      if (method == 'PUT' &&
          sent &&
          error.code != 'mcp_upload_failed' &&
          error.code != 'mcp_upload_outcome_unknown') {
        throw const SentroyMcpError('mcp_upload_outcome_unknown');
      }
      rethrow;
    } catch (_) {
      throw SentroyMcpError(
        method == 'PUT' && sent
            ? 'mcp_upload_outcome_unknown'
            : '${prefix}_failed',
      );
    } finally {
      _transfers.remove(abort);
      timer?.cancel();
      if (!abort.isCompleted) abort.complete();
      await sub?.cancel();
    }
  }

  Future<Uint8List> downloadFile(
    Map<String, dynamic> raw, {
    int timeoutMs = 60000,
  }) async {
    if (app != 'storage') {
      throw const SentroyMcpError('mcp_download_not_supported');
    }
    final r = _snapshot(raw), f = r['file'];
    if (r['requiresAuthorization'] != true ||
        r['method'] != 'GET' ||
        f is! Map ||
        !_re(_id, f['id']) ||
        f['size'] is! int ||
        f['size'] < 0 ||
        f['size'] > _downloadCap ||
        r['downloadUrl'] is! String ||
        (r['downloadUrl'] as String).length > 4000) {
      throw const SentroyMcpError('invalid_mcp_download');
    }
    final u = _url(r['downloadUrl'], _resource, 'invalid_mcp_download'),
        prefix = '${_resource.path}/files/';
    final p = u.path.startsWith(prefix)
        ? u.path.substring(prefix.length).split('/')
        : <String>[];
    if (p.length != 2 ||
        !_slug.hasMatch(p[0]) ||
        p[1] != f['id'] ||
        !_query(u, {'connection', 'version'}) ||
        !_re(_id, u.queryParameters['connection']) ||
        !_timestamp(u.queryParameters['version'])) {
      throw const SentroyMcpError('invalid_mcp_download');
    }
    return _transfer(
      'GET',
      u,
      cap: _downloadCap,
      expected: f['size'] as int,
      timeoutMs: timeoutMs,
    );
  }

  Future<Uint8List> downloadMailAttachment(
    Map<String, dynamic> raw, {
    int timeoutMs = 60000,
  }) async {
    if (app != 'mail') {
      throw const SentroyMcpError('mcp_download_not_supported');
    }
    final r = _snapshot(raw), a = r['attachment'];
    if (r['requiresAuthorization'] != true ||
        r['method'] != 'GET' ||
        r['maxBytes'] is! int ||
        r['maxBytes'] < 1 ||
        r['maxBytes'] > 8 * 1024 * 1024 ||
        a is! Map ||
        a['encodedSize'] is! int ||
        a['encodedSize'] < 0 ||
        a['encodedSize'] > 12 * 1024 * 1024 ||
        a['partId'] is! String ||
        (a['partId'] as String).length > 80 ||
        !RegExp(r'^\d+(?:\.\d+)*$').hasMatch(a['partId'])) {
      throw const SentroyMcpError('invalid_mcp_download');
    }
    final u = _url(r['downloadUrl'], _resource, 'invalid_mcp_download'),
        prefix = '${_resource.path}/attachments/';
    final encoded = u.path.startsWith(prefix)
        ? u.path.substring(prefix.length)
        : '';
    if (!RegExp(r'^[A-Za-z0-9_-]{1,2500}$').hasMatch(encoded) ||
        !_query(u, {'connection', 'version'}) ||
        !_re(_id, u.queryParameters['connection']) ||
        !_re(_hex, u.queryParameters['version'])) {
      throw const SentroyMcpError('invalid_mcp_download');
    }
    try {
      final d =
          jsonDecode(
                utf8.decode(base64Url.decode(base64Url.normalize(encoded))),
              )
              as Map;
      final ref = d['reference'] as Map;
      bool clean(dynamic x, int n) =>
          x is String &&
          x.isNotEmpty &&
          x.length <= n &&
          !RegExp(r'[\r\n\x00]').hasMatch(x);
      if (d.length != 2 ||
          d['partId'] != a['partId'] ||
          ref.length != 5 ||
          !clean(ref['companyId'], 100) ||
          !clean(ref['folder'], 512) ||
          (ref['folder'] as String).startsWith('__') ||
          ref['mailbox'] is! String ||
          (ref['mailbox'] as String).length > 320 ||
          !RegExp(r'^[^\s@]+@[^\s@]+$').hasMatch(ref['mailbox']) ||
          !_re(RegExp(r'^[1-9]\d{0,19}$'), ref['uidValidity']) ||
          ref['uid'] is! int ||
          ref['uid'] < 1 ||
          ref['uid'] > 4294967295) {
        throw const FormatException();
      }
    } catch (_) {
      throw const SentroyMcpError('invalid_mcp_download');
    }
    return _transfer('GET', u, cap: r['maxBytes'] as int, timeoutMs: timeoutMs);
  }

  Uri _contact(Map<String, dynamic> r, bool upload) {
    if (app != 'mail') {
      throw const SentroyMcpError('mcp_contact_files_not_supported');
    }
    final id = r[upload ? 'uploadId' : 'exportId'], hash = r['fileHash'];
    if (r['requiresOriginalBearer'] != true ||
        r['bytes'] is! int ||
        r['bytes'] < (upload ? 1 : 0) ||
        r['bytes'] > _contactCap ||
        !_future(r['expiresAt']) ||
        !_re(_uuid, id) ||
        !_re(_hex, hash) ||
        (!upload && !['csv', 'jsonl'].contains(r['format']))) {
      throw const SentroyMcpError('invalid_mcp_contact_file_reference');
    }
    final raw = r[upload ? 'uploadUrl' : 'downloadUrl'];
    if (raw is! String || raw.length > 4000) {
      throw const SentroyMcpError('invalid_mcp_contact_file_reference');
    }
    final u = _url(raw, _resource, 'invalid_mcp_contact_file_reference');
    if (u.path !=
            '${_resource.path}/contacts/${upload ? 'imports' : 'exports'}/$id' ||
        !_query(u, upload ? {'connection'} : {'connection', 'hash'}) ||
        !_re(_id, u.queryParameters['connection']) ||
        (!upload && u.queryParameters['hash'] != hash)) {
      throw const SentroyMcpError('invalid_mcp_contact_file_reference');
    }
    return u;
  }

  Future<Uint8List> downloadMailContactsExport(
    Map<String, dynamic> raw, {
    int timeoutMs = 60000,
  }) async {
    final r = _snapshot(raw), u = _contact(r, false);
    final b = await _transfer(
      'GET',
      u,
      cap: _contactCap,
      expected: r['bytes'] as int,
      timeoutMs: timeoutMs,
      prefix: 'mcp_contact_file',
    );
    if (_hash(b) != r['fileHash']) {
      throw const SentroyMcpError('mcp_contact_file_hash_mismatch');
    }
    return b;
  }

  Future<Map<String, dynamic>> uploadMailContactsImport(
    Map<String, dynamic> raw,
    List<int> body, {
    int timeoutMs = 15000,
  }) async {
    final r = _snapshot(raw),
        u = _contact(r, true),
        b = _copy(body, _contactCap, 'invalid_mcp_contact_file');
    if (b.length != r['bytes']) {
      throw const SentroyMcpError('mcp_contact_file_size_mismatch');
    }
    if (_hash(b) != r['fileHash']) {
      throw const SentroyMcpError('mcp_contact_file_hash_mismatch');
    }
    if (!_future(r['expiresAt'])) {
      throw const SentroyMcpError('invalid_mcp_contact_file_reference');
    }
    final bytes = await _transfer(
      'PUT',
      u,
      body: b,
      cap: 4096,
      timeoutMs: timeoutMs,
      prefix: 'mcp_upload',
      expiresAt: r['expiresAt'] as String,
    );
    dynamic result;
    try {
      result = jsonDecode(utf8.decode(bytes));
    } catch (_) {
      throw const SentroyMcpError('mcp_upload_outcome_unknown');
    }
    if (result is! Map ||
        result['uploadId'] != r['uploadId'] ||
        result['state'] != 'ready' ||
        result['fileHash'] != r['fileHash'] ||
        result['expiresAt'] != r['expiresAt'] ||
        !_future(result['expiresAt']) ||
        result['count'] is! int ||
        result['count'] < 1 ||
        result['count'] > 100) {
      throw const SentroyMcpError('mcp_upload_outcome_unknown');
    }
    return {
      'uploadId': r['uploadId'],
      'state': 'ready',
      'fileHash': r['fileHash'],
      'expiresAt': r['expiresAt'],
      'count': result['count'],
    };
  }

  bool _storageMetadata(Map r) {
    final b = r['bucket'];
    return _re(_uuid, r['uploadId']) &&
        _name(r['name'], r['mimeType']) &&
        r['bytes'] is int &&
        r['bytes'] >= 1 &&
        r['bytes'] <= _storageCap &&
        _re(_hex, r['sha256']) &&
        _re(_hex, r['revision']) &&
        b is Map &&
        _re(_id, b['id']) &&
        _re(_slug, b['slug']) &&
        _re(_hex, b['revision']) &&
        ['waiting', 'ready'].contains(r['state']) &&
        _future(r['expiresAt']) &&
        r['published'] == false &&
        r['malwareScanned'] == false &&
        r['requiresHumanApproval'] == true;
  }

  Future<Map<String, dynamic>> uploadStorageFile(
    Map<String, dynamic> raw,
    List<int> body, {
    int timeoutMs = 15000,
  }) async {
    if (app != 'storage') {
      throw const SentroyMcpError('mcp_storage_upload_not_supported');
    }
    final r = _snapshot(raw);
    if (!_storageMetadata(r) ||
        r['requiresOriginalBearer'] != true ||
        r['method'] != 'PUT' ||
        r['contentType'] != 'application/octet-stream' ||
        r['uploadUrl'] is! String ||
        (r['uploadUrl'] as String).length > 4000) {
      throw const SentroyMcpError('invalid_mcp_storage_upload_reference');
    }
    final u = _url(
      r['uploadUrl'],
      _resource,
      'invalid_mcp_storage_upload_reference',
    );
    if (u.path != '${_resource.path}/uploads/${r['uploadId']}' ||
        !_query(u, {'connection'}) ||
        !_re(_id, u.queryParameters['connection'])) {
      throw const SentroyMcpError('invalid_mcp_storage_upload_reference');
    }
    final b = _copy(body, _storageCap, 'invalid_mcp_storage_upload');
    if (b.length != r['bytes']) {
      throw const SentroyMcpError('mcp_storage_upload_size_mismatch');
    }
    if (_hash(b) != r['sha256']) {
      throw const SentroyMcpError('mcp_storage_upload_hash_mismatch');
    }
    if (!_future(r['expiresAt'])) {
      throw const SentroyMcpError('invalid_mcp_storage_upload_reference');
    }
    final bytes = await _transfer(
      'PUT',
      u,
      body: b,
      cap: 4096,
      timeoutMs: timeoutMs,
      prefix: 'mcp_upload',
      expiresAt: r['expiresAt'] as String,
      requireJson: true,
    );
    dynamic v;
    try {
      v = jsonDecode(utf8.decode(bytes));
    } catch (_) {
      throw const SentroyMcpError('mcp_upload_outcome_unknown');
    }
    if (v is! Map ||
        !_storageMetadata(v) ||
        v['state'] != 'ready' ||
        [
          'uploadId',
          'name',
          'mimeType',
          'bytes',
          'sha256',
          'expiresAt',
        ].any((k) => v[k] != r[k]) ||
        [
          'id',
          'slug',
          'revision',
        ].any((k) => v['bucket'][k] != r['bucket'][k])) {
      throw const SentroyMcpError('mcp_upload_outcome_unknown');
    }
    return {
      'uploadId': r['uploadId'],
      'name': r['name'],
      'mimeType': r['mimeType'],
      'bytes': r['bytes'],
      'sha256': r['sha256'],
      'bucket': r['bucket'],
      'state': 'ready',
      'revision': v['revision'],
      'expiresAt': r['expiresAt'],
      'published': false,
      'malwareScanned': false,
      'requiresHumanApproval': true,
    };
  }
}

/// Connect using MCP 2025-03-26 initialization and POST JSON/SSE responses.
/// Server-initiated GET streams, resumption, and MCP 2026 discovery are not supported.
Future<SentroyMcpConnection> connectSentroyMcp({
  required String app,
  required String companySlug,
  required Object token,
  String? origin,
  http.Client? httpClient,
  Map<String, String>? clientInfo,
  Duration connectTimeout = const Duration(seconds: 30),
}) async {
  final resource = sentroyMcpResource(
    app: app,
    companySlug: companySlug,
    origin: origin,
  );
  if (connectTimeout <= Duration.zero ||
      connectTimeout > const Duration(minutes: 2)) {
    throw const SentroyMcpError('invalid_mcp_timeout');
  }
  try {
    await _token(token).timeout(connectTimeout);
  } on TimeoutException {
    throw const SentroyMcpError('mcp_connection_failed');
  }
  final httpClientValue = httpClient ?? http.Client();
  final transport = _SafeTransport(
    Uri.parse(resource),
    token,
    httpClientValue,
    ownsClient: httpClient == null,
  );
  final client = mcp.McpClient(
    mcp.Implementation(
      name: clientInfo?['name'] ?? 'sentroy-client-sdk',
      version: clientInfo?['version'] ?? '0.1.0',
    ),
    options: const mcp.McpClientOptions(
      protocolVersion: '2025-03-26',
      useServerDiscover: false,
    ),
  );
  try {
    await client.connect(transport).timeout(connectTimeout);
  } catch (_) {
    await transport.close();
    throw const SentroyMcpError('mcp_connection_failed');
  }
  return SentroyMcpConnection._(app, resource, token, httpClientValue, client);
}

class _SafeTransport extends mcp.Transport
    implements mcp.ProtocolVersionAwareTransport {
  _SafeTransport(
    this.url,
    this.source,
    this.httpClient, {
    required this.ownsClient,
  });
  final Uri url;
  final Object source;
  final http.Client httpClient;
  final bool ownsClient;
  String? _session;
  bool _closed = false;
  final Set<Completer<void>> _aborts = {};
  @override
  String? protocolVersion;
  @override
  String? get sessionId => _session;
  @override
  Future<void> start() async {}
  @override
  Future<void> send(mcp.JsonRpcMessage message, {int? relatedRequestId}) async {
    if (_closed) throw const SentroyMcpError('mcp_network_error');
    final abort = Completer<void>();
    _aborts.add(abort);
    try {
      final bearer = await Future.any([
        _token(source),
        abort.future.then<String>(
          (_) => throw const SentroyMcpError('mcp_network_error'),
        ),
      ]);
      if (_closed) throw const SentroyMcpError('mcp_network_error');
      final req = http.AbortableRequest('POST', url, abortTrigger: abort.future)
        ..followRedirects = false
        ..headers.addAll({
          'Authorization': 'Bearer $bearer',
          'Content-Type': 'application/json',
          'Accept': 'application/json, text/event-stream',
          'Mcp-Session-Id': ?_session,
          'Mcp-Protocol-Version': ?protocolVersion,
        })
        ..body = jsonEncode(message.toJson());
      final res = await httpClient.send(req);
      if (res.statusCode >= 300 && res.statusCode < 400) {
        await res.stream.listen(null).cancel();
        throw SentroyMcpError('mcp_redirect_refused', res.statusCode);
      }
      if (res.statusCode != 200 && res.statusCode != 202) {
        await res.stream.listen(null).cancel();
        throw SentroyMcpError('mcp_network_error', res.statusCode);
      }
      final session = res.headers['mcp-session-id'];
      if (session != null &&
          (!RegExp(r'^[\x21-\x7e]{1,256}$').hasMatch(session) ||
              (_session != null && _session != session))) {
        await res.stream.listen(null).cancel();
        throw const SentroyMcpError('mcp_network_error');
      }
      _session ??= session;
      if (res.statusCode == 202) {
        await res.stream.listen(null).cancel();
        return;
      }
      final contentType = res.headers['content-type']?.split(';').first.trim();
      if (contentType == 'application/json') {
        final bytes = BytesBuilder();
        await for (final chunk in res.stream) {
          if (bytes.length + chunk.length > 1024 * 1024) {
            throw const SentroyMcpError('mcp_network_error');
          }
          bytes.add(chunk);
        }
        onmessage?.call(
          mcp.JsonRpcMessage.fromJson(
            jsonDecode(utf8.decode(bytes.takeBytes())) as Map<String, dynamic>,
          ),
        );
      } else if (contentType == 'text/event-stream') {
        final data = <String>[];
        final line = BytesBuilder();
        var size = 0;
        var event = '';
        var afterCr = false;
        void dispatch() {
          if (data.isNotEmpty && (event.isEmpty || event == 'message')) {
            onmessage?.call(
              mcp.JsonRpcMessage.fromJson(
                jsonDecode(data.join('\n')) as Map<String, dynamic>,
              ),
            );
          }
          data.clear();
          size = 0;
          event = '';
        }

        void finishLine() {
          final text = utf8.decode(line.takeBytes());
          if (text.isEmpty) {
            dispatch();
          } else if (!text.startsWith(':')) {
            final colon = text.indexOf(':');
            final field = colon < 0 ? text : text.substring(0, colon);
            var value = colon < 0 ? '' : text.substring(colon + 1);
            if (value.startsWith(' ')) value = value.substring(1);
            if (field == 'data') data.add(value);
            if (field == 'event') event = value;
          }
        }

        await for (final chunk in res.stream) {
          for (final byte in chunk) {
            if (afterCr) {
              afterCr = false;
              if (byte == 10) continue;
            }
            size++;
            if (size > 1024 * 1024) {
              throw const SentroyMcpError('mcp_network_error');
            }
            if (byte == 10 || byte == 13) {
              finishLine();
              afterCr = byte == 13;
            } else {
              line.addByte(byte);
            }
          }
        }
        if (line.length > 0) finishLine();
        dispatch();
      } else {
        await res.stream.listen(null).cancel();
        throw const SentroyMcpError('mcp_network_error');
      }
    } on SentroyMcpError {
      rethrow;
    } catch (_) {
      throw const SentroyMcpError('mcp_network_error');
    } finally {
      _aborts.remove(abort);
      if (!abort.isCompleted) abort.complete();
    }
  }

  @override
  Future<void> close() async {
    if (_closed) return;
    _closed = true;
    for (final abort in _aborts.toList()) {
      if (!abort.isCompleted) abort.complete();
    }
    if (ownsClient) httpClient.close();
    onclose?.call();
  }
}
