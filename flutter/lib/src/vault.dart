/// Instance-scoped Env Vault access. Vault credentials use the `stk_env_`
/// namespace and are distinct from ordinary Sentroy API credentials.
/// Values are held in memory. Browser applications must not embed secrets.
library;

import 'dart:convert';
import 'dart:async';

import 'package:crypto/crypto.dart';
import 'package:http/http.dart' as http;

import 'errors.dart';
import 'json.dart';
import 'http.dart';

const defaultVaultWebhookMaxAge = Duration(minutes: 5);

class VaultConfig {
  VaultConfig({
    Uri? baseUrl,
    this.apiKey,
    this.cacheTtl = const Duration(minutes: 5),
    this.timeout = const Duration(seconds: 5),
  }) : baseUrl = baseUrl ?? Uri.parse('https://sentroy.com') {
    if (apiKey != null &&
        (!apiKey!.startsWith('stk_env_') || apiKey!.length == 8)) {
      throw ArgumentError(
        'Vault API key must start with stk_env_ and have a value',
      );
    }
    if (cacheTtl.isNegative || timeout <= Duration.zero) {
      throw ArgumentError('Invalid vault cache TTL or timeout');
    }
  }

  /// Construct from an explicitly supplied environment map. No process
  /// environment is read implicitly, so this also works on Flutter Web.
  factory VaultConfig.fromMap(Map<String, String> environment) {
    String? first(List<String> keys) {
      for (final key in keys) {
        final value = environment[key];
        if (value != null && value.isNotEmpty) return value;
      }
      return null;
    }

    final url = first([
      'NEXT_PUBLIC_SENTROY_ENV_API_URL',
      'SENTROY_ENV_API_URL',
      'NEXT_PUBLIC_CORE_APP_URL',
    ]);
    return VaultConfig(
      baseUrl: url == null ? null : Uri.parse(url),
      apiKey: first(['SENTROY_ENV_API_KEY']),
    );
  }

  final Uri baseUrl;
  final String? apiKey;
  final Duration cacheTtl;
  final Duration timeout;
}

class EnvVariable {
  const EnvVariable({
    required this.key,
    required this.value,
    required this.type,
    required this.public,
  });
  factory EnvVariable.fromJson(JsonMap json) => EnvVariable(
    key: json['key'] as String,
    value: json['value'] as String,
    type: json['type'] as String,
    public: json['public'] as bool,
  );
  final String key;
  final String value;
  final String type;
  final bool public;
}

class EnvCacheState {
  EnvCacheState({
    required this.fetchedAt,
    required Map<String, EnvVariable> variables,
    required this.project,
    required this.environment,
  }) : variables = Map.unmodifiable(variables);
  final DateTime fetchedAt;
  final Map<String, EnvVariable> variables;
  final String project;
  final String environment;
}

class _VaultState {
  EnvCacheState? cache;
  Future<EnvCacheState>? pending;
  int generation = 0;
}

typedef VaultFallbackResolver = FutureOr<String?> Function(String key);

class VaultClient {
  VaultClient(VaultConfig config, {http.Client? client})
    : _config = config,
      _state = _VaultState(),
      _http = SentroyHttp(
        baseUrl: config.baseUrl,
        accessToken: config.apiKey,
        client: client,
        timeout: config.timeout,
      );
  VaultClient._(this._config, this._state, this._http);
  final VaultConfig _config;
  final _VaultState _state;
  final SentroyHttp _http;

  /// A clone shares this client's cache and transport.
  VaultClient clone() => VaultClient._(_config, _state, _http);

  Future<EnvCacheState> _fetch() async {
    if (_config.apiKey == null) {
      throw const SentroyException('Vault API key is not configured');
    }
    final response = jsonObject(await _http.get('/api/env-vault/fetch'));
    final data = response; // The shared transport unwraps exactly once.
    final variables = jsonList(data['variables'], EnvVariable.fromJson);
    return EnvCacheState(
      fetchedAt: DateTime.now(),
      variables: {for (final variable in variables) variable.key: variable},
      project: data['project'] as String,
      environment: data['environment'] as String,
    );
  }

  Future<EnvCacheState> _ensure() async {
    final cache = _state.cache;
    if (cache != null &&
        DateTime.now().difference(cache.fetchedAt) < _config.cacheTtl) {
      return cache;
    }
    final pending = _state.pending;
    if (pending != null) return pending;
    final generation = _state.generation;
    late Future<EnvCacheState> future;
    future = _fetch()
        .then((value) {
          if (_state.generation == generation) _state.cache = value;
          return value;
        })
        .whenComplete(() {
          if (identical(_state.pending, future)) _state.pending = null;
        });
    _state.pending = future;
    return future;
  }

  Future<String?> get(String key) async =>
      (await _ensure()).variables[key]?.value;
  Future<String> getOrThrow(String key) async {
    final state = await _ensure();
    final value = state.variables[key]?.value;
    if (value == null) {
      throw SentroyException(
        'Required vault variable $key is not defined (project=${state.project}, env=${state.environment})',
      );
    }
    return value;
  }

  /// Explicit migration fallback on missing keys or vault failures.
  Future<String?> getWithFallback(
    String key,
    VaultFallbackResolver resolver,
  ) async {
    if (_config.apiKey != null) {
      try {
        final value = await get(key);
        if (value != null) return value;
      } catch (_) {
        // An explicit fallback is requested for vault failures as well as misses.
      }
    }
    return await resolver(key);
  }

  Future<Map<String, String>> all() async => {
    for (final item in (await _ensure()).variables.values) item.key: item.value,
  };
  Future<Map<String, String>> public() async => {
    for (final item in (await _ensure()).variables.values)
      if (item.public) item.key: item.value,
  };
  Future<void> preload() async {
    await _ensure();
  }

  /// Invalidate immediately; the next read lazily fetches a fresh snapshot.
  void invalidate() {
    _state.generation++;
    _state.cache = null;
    _state.pending = null;
  }

  Future<void> refresh() async {
    invalidate();
    await _ensure();
  }

  /// Verify a webhook and invalidate this client's cache for the next read.
  VaultWebhookPayload handleWebhook({
    required String secret,
    required String signature,
    required List<int> body,
    Duration maxAge = defaultVaultWebhookMaxAge,
  }) {
    final payload = verifyVaultWebhook(
      secret: secret,
      signature: signature,
      body: body,
      maxAge: maxAge,
    );
    invalidate();
    return payload;
  }

  void close() => _http.close();
}

class VaultWebhookPayload {
  const VaultWebhookPayload({
    required this.event,
    required this.project,
    required this.environment,
    required this.action,
    required this.keys,
    required this.timestamp,
  });
  factory VaultWebhookPayload.fromJson(JsonMap json) => VaultWebhookPayload(
    event: json['event'] as String,
    project: json['project'] as String,
    environment: json['environment'] as String,
    action: json['action'] as String,
    keys: List<String>.unmodifiable((json['keys'] as List).cast<String>()),
    timestamp: json['timestamp'] as int,
  );
  final String event;
  final String project;
  final String environment;
  final String action;
  final List<String> keys;

  /// Unix milliseconds.
  final int timestamp;
  JsonMap toJson() => {
    'event': event,
    'project': project,
    'environment': environment,
    'action': action,
    'keys': keys,
    'timestamp': timestamp,
  };
}

enum VaultWebhookErrorKind {
  invalidSignature,
  invalidBody,
  timestampOutsideWindow,
}

class VaultWebhookException implements Exception {
  const VaultWebhookException(this.kind);
  final VaultWebhookErrorKind kind;
  int get statusCode => kind == VaultWebhookErrorKind.invalidBody ? 400 : 401;
  @override
  String toString() => 'VaultWebhookException: ${kind.name}';
}

/// Verifies HMAC over the exact raw request bytes before parsing JSON. A zero
/// maxAge disables the timestamp window; future timestamps are otherwise rejected.
VaultWebhookPayload verifyVaultWebhook({
  required String secret,
  required String signature,
  required List<int> body,
  Duration maxAge = defaultVaultWebhookMaxAge,
}) {
  if (!RegExp(
    r'^sha256=[a-fA-F0-9]{64}$',
    caseSensitive: false,
  ).hasMatch(signature)) {
    throw const VaultWebhookException(VaultWebhookErrorKind.invalidSignature);
  }
  final supplied = signature.substring(7).toLowerCase();
  final expected = Hmac(sha256, utf8.encode(secret)).convert(body).toString();
  var difference = 0;
  for (var i = 0; i < expected.length; i++) {
    difference |= expected.codeUnitAt(i) ^ supplied.codeUnitAt(i);
  }
  if (difference != 0) {
    throw const VaultWebhookException(VaultWebhookErrorKind.invalidSignature);
  }
  late VaultWebhookPayload payload;
  try {
    payload = VaultWebhookPayload.fromJson(
      jsonObject(jsonDecode(utf8.decode(body))),
    );
  } catch (_) {
    throw const VaultWebhookException(VaultWebhookErrorKind.invalidBody);
  }
  if (maxAge != Duration.zero) {
    final age = DateTime.now().millisecondsSinceEpoch - payload.timestamp;
    if (age < 0 || age > maxAge.inMilliseconds) {
      throw const VaultWebhookException(
        VaultWebhookErrorKind.timestampOutsideWindow,
      );
    }
  }
  return payload;
}
