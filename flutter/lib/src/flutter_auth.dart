import 'dart:async';
import 'package:flutter/widgets.dart';
import 'auth/client.dart';
import 'auth/types.dart';

/// A notifier for session restoration and interactive authentication. The
/// application owns the supplied auth client and its secure storage adapter.
class SentroyAuthController extends ChangeNotifier {
  SentroyAuthController(this.auth) : _session = auth.currentSession {
    _subscription = auth.changes.listen((session) {
      if (_disposed) return;
      _session = session;
      notifyListeners();
    });
  }
  final SentroyAuth auth;
  late final StreamSubscription<AuthSession?> _subscription;
  AuthSession? _session;
  bool _busy = false;
  bool _initialized = false;
  bool _disposed = false;
  Object? _error;
  AuthSession? get session => _session;
  SentroyAuthUser? get user => _session?.user;
  bool get isSignedIn => _session != null;
  bool get isBusy => _busy;
  bool get isInitialized => _initialized;
  Object? get error => _error;

  Future<T> _run<T>(Future<T> Function() action) async {
    if (_disposed) throw StateError('Auth controller is disposed');
    if (_busy) throw StateError('An authentication action is already running');
    _busy = true;
    _error = null;
    notifyListeners();
    try {
      final result = await action();
      _session = auth.currentSession;
      return result;
    } catch (error) {
      _error = error;
      rethrow;
    } finally {
      _busy = false;
      if (!_disposed) notifyListeners();
    }
  }

  Future<void> initialize() => _run(() async {
    await auth.restore();
    _initialized = true;
  });
  Future<LoginOutcome> signIn(SignInRequest request) =>
      _run(() => auth.signIn(request));
  Future<SignupResponse> signUp(SignUpRequest request) =>
      _run(() => auth.signUp(request));
  Future<LoginResponse> verifyMfa(MfaVerifyRequest request) =>
      _run(() => auth.verifyMfa(request));
  Future<void> refresh() => _run(auth.refreshNow);
  Future<void> signOut() => _run(auth.signOut);
  void clearError() {
    if (_disposed || _error == null) return;
    _error = null;
    notifyListeners();
  }

  @override
  void dispose() {
    if (_disposed) return;
    _disposed = true;
    unawaited(_subscription.cancel());
    super.dispose();
  }
}

/// Makes a controller available to descendant widgets and rebuilds consumers
/// when session, loading or error state changes.
class SentroyAuthScope extends InheritedNotifier<SentroyAuthController> {
  const SentroyAuthScope({
    super.key,
    required SentroyAuthController controller,
    required super.child,
  }) : super(notifier: controller);
  static SentroyAuthController of(BuildContext context) {
    final scope = context
        .dependOnInheritedWidgetOfExactType<SentroyAuthScope>();
    if (scope?.notifier == null) {
      throw FlutterError('SentroyAuthScope was not found in this context');
    }
    return scope!.notifier!;
  }
}
