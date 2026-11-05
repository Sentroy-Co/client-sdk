import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';
import 'package:http/http.dart' as http;
import 'package:http_parser/http_parser.dart';
import 'errors.dart';

/// Shared HTTP transport. A supplied client remains caller-owned.
class SentroyHttp {
  SentroyHttp({
    required Uri baseUrl,
    String? accessToken,
    http.Client? client,
    Duration timeout = const Duration(seconds: 30),
  }) : this._(
         baseUrl,
         accessToken,
         client ?? http.Client(),
         client == null,
         timeout,
       );

  SentroyHttp._(
    Uri baseUrl,
    this._accessToken,
    this._client,
    this._ownsClient,
    this.timeout,
  ) : _baseUrl = baseUrl.toString().replaceFirst(RegExp(r'/+$'), '') {
    if (!['http', 'https'].contains(baseUrl.scheme) ||
        !baseUrl.hasAuthority ||
        baseUrl.host.isEmpty ||
        baseUrl.userInfo.isNotEmpty ||
        baseUrl.hasQuery ||
        baseUrl.hasFragment ||
        timeout <= Duration.zero) {
      throw ArgumentError(
        'Base URL must be HTTP(S) without credentials, query or fragment; timeout must be positive',
      );
    }
    if (_accessToken != null &&
        (_accessToken.isEmpty ||
            RegExp(r'[^\x21-\x7e]').hasMatch(_accessToken))) {
      throw ArgumentError('Invalid bearer token');
    }
  }

  static const int jsonLimit = 16 * 1024 * 1024;
  final String _baseUrl;
  final String? _accessToken;
  final http.Client _client;
  final bool _ownsClient;
  final Duration timeout;
  bool _closed = false;

  SentroyHttp withBearer(String? token) {
    if (_closed) throw const SentroyException('HTTP client is closed');
    return SentroyHttp._(Uri.parse(_baseUrl), token, _client, false, timeout);
  }

  Uri _uri(String path, Map<String, Object?>? query) {
    if (!path.startsWith('/') ||
        path.startsWith('//') ||
        path.contains('?') ||
        path.contains('#') ||
        path.runes.any((c) => c < 32 || c == 127)) {
      throw ArgumentError('Invalid relative API path');
    }
    final values = <String, String>{};
    String scalar(Object? item) {
      if (item is String || item is num || item is bool) return '$item';
      throw ArgumentError('Query fields must contain scalar values');
    }

    for (final entry in (query ?? <String, Object?>{}).entries) {
      final value = entry.value;
      if (value == null) continue;
      values[entry.key] = value is List
          ? value.map(scalar).join(',')
          : scalar(value);
    }
    final uri = Uri.parse('$_baseUrl$path');
    return values.isEmpty ? uri : uri.replace(queryParameters: values);
  }

  void _headers(http.BaseRequest request) {
    if (_closed) throw const SentroyException('HTTP client is closed');
    request.followRedirects = false;
    request.maxRedirects = 0;
    request.headers['Accept'] = 'application/json';
    if (_accessToken != null) {
      request.headers['Authorization'] = 'Bearer $_accessToken';
    }
  }

  Future<Uint8List> _bounded(http.StreamedResponse response, int? cap) async {
    if (cap != null &&
        response.contentLength != null &&
        response.contentLength! > cap) {
      await response.stream.listen(null).cancel();
      throw const SentroyException('Response exceeds byte limit');
    }
    final builder = BytesBuilder();
    await for (final chunk in response.stream) {
      if (cap != null && chunk.length > cap - builder.length) {
        throw const SentroyException('Response exceeds byte limit');
      }
      builder.add(chunk);
    }
    return builder.takeBytes();
  }

  Future<T> _execute<T>(
    http.BaseRequest request,
    Completer<void> abort,
    Future<T> Function(http.StreamedResponse) decode,
  ) async {
    _headers(request);
    try {
      return await (() async => decode(await _client.send(request)))().timeout(
        timeout,
        onTimeout: () {
          if (!abort.isCompleted) abort.complete();
          throw const SentroyException('HTTP request timed out');
        },
      );
    } on SentroyException {
      rethrow;
    } on FormatException catch (error) {
      throw SentroyException('Invalid JSON response', cause: error);
    } catch (error) {
      throw SentroyException('HTTP request failed', cause: error);
    }
  }

  Future<dynamic> _decode(
    http.StreamedResponse response, {
    bool once = false,
  }) async {
    if (once &&
        ((response.statusCode >= 300 && response.statusCode < 400) ||
            !(response.headers['content-type']?.toLowerCase().startsWith(
                  'application/json',
                ) ??
                false))) {
      await response.stream.listen(null).cancel();
      throw const SentroyException('Invalid compose receipt');
    }
    final bytes = await _bounded(response, once ? 4096 : jsonLimit);
    dynamic payload;
    try {
      payload = bytes.isEmpty ? null : jsonDecode(utf8.decode(bytes));
    } on FormatException {
      if (response.statusCode >= 200 && response.statusCode < 300) rethrow;
    }
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw SentroyException(
        'API request failed',
        statusCode: response.statusCode,
        body: payload,
      );
    }
    return payload is Map && payload.containsKey('data')
        ? payload['data']
        : payload;
  }

  Future<dynamic> _json(
    String method,
    String path, {
    Map<String, Object?>? query,
    Object? body,
    bool once = false,
  }) {
    final abort = Completer<void>();
    final request = http.AbortableRequest(
      method,
      _uri(path, query),
      abortTrigger: abort.future,
    );
    if (body != null) {
      request.headers['Content-Type'] = 'application/json';
      request.body = jsonEncode(body);
    }
    return _execute(
      request,
      abort,
      (response) => _decode(response, once: once),
    );
  }

  Future<dynamic> get(String path, {Map<String, Object?>? query}) =>
      _json('GET', path, query: query);
  Future<dynamic> post(String path, [Object? body]) =>
      _json('POST', path, body: body);
  Future<dynamic> patch(String path, Object? body) =>
      _json('PATCH', path, body: body);
  Future<dynamic> delete(
    String path, {
    Map<String, Object?>? query,
    Object? body,
  }) => _json('DELETE', path, query: query, body: body);
  Future<dynamic> postOnce(String path, Object body) {
    if (!['/send-bcc', '/inbox/drafts-bcc-v1'].contains(path)) {
      throw ArgumentError('Invalid compose path');
    }
    return _json('POST', path, body: body, once: true);
  }

  Future<Uint8List> getBytes(
    String path, {
    Map<String, Object?>? query,
    int? maxBytes,
  }) {
    if (maxBytes != null && maxBytes < 0) {
      throw ArgumentError('Invalid byte limit');
    }
    final abort = Completer<void>();
    final request = http.AbortableRequest(
      'GET',
      _uri(path, query),
      abortTrigger: abort.future,
    );
    return _execute(request, abort, (response) async {
      if (response.statusCode < 200 || response.statusCode >= 300) {
        await _decode(response);
      }
      return _bounded(response, maxBytes);
    });
  }

  Future<dynamic> multipart(
    String path, {
    required List<int> bytes,
    required String filename,
    String? mimeType,
    Map<String, String> fields = const {},
  }) {
    final abort = Completer<void>();
    final request = http.AbortableMultipartRequest(
      'POST',
      _uri(path, null),
      abortTrigger: abort.future,
    );
    request.fields.addAll(fields);
    request.files.add(
      http.MultipartFile.fromBytes(
        'file',
        bytes,
        filename: filename,
        contentType: mimeType == null ? null : MediaType.parse(mimeType),
      ),
    );
    return _execute(request, abort, _decode);
  }

  void close() {
    if (_closed) return;
    _closed = true;
    if (_ownsClient) _client.close();
  }

  @override
  String toString() => 'SentroyHttp(authenticated: ${_accessToken != null})';
}
