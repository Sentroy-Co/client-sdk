import 'dart:convert';
import '../json.dart';
import 'types.dart';

abstract class AuthSessionStorage {
  Future<AuthSession?> read();
  Future<void> write(AuthSession session);
  Future<void> clear();
}

class MemoryAuthSessionStorage implements AuthSessionStorage {
  AuthSession? _session;
  @override
  Future<AuthSession?> read() async => _session;
  @override
  Future<void> write(AuthSession session) async {
    _session = session;
  }

  @override
  Future<void> clear() async {
    _session = null;
  }
}

/// Bridges platform secure-storage APIs without adding a platform plugin to
/// every SDK consumer. Supply callbacks bound to a project-specific storage key.
class SerializedAuthSessionStorage implements AuthSessionStorage {
  const SerializedAuthSessionStorage({
    required Future<String?> Function() read,
    required Future<void> Function(String value) write,
    required Future<void> Function() clear,
  }) : _read = read,
       _write = write,
       _clear = clear;
  final Future<String?> Function() _read;
  final Future<void> Function(String value) _write;
  final Future<void> Function() _clear;
  @override
  Future<AuthSession?> read() async {
    final value = await _read();
    return value == null
        ? null
        : AuthSession.fromJson(jsonObject(jsonDecode(value)));
  }

  @override
  Future<void> write(AuthSession session) =>
      _write(jsonEncode(session.toJson()));
  @override
  Future<void> clear() => _clear();
}
