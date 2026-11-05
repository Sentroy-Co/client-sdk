import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:sentroy_client_sdk/sentroy_flutter.dart';

SentroyAuthUser _user() => SentroyAuthUser(
  id: 'u',
  authProjectId: 'p',
  email: 'a@example.com',
  emailVerified: true,
  createdAt: 'now',
  updatedAt: 'now',
);
void main() {
  testWidgets('auth scope rebuilds for restored session, MFA and sign out', (
    tester,
  ) async {
    final store = MemoryAuthSessionStorage();
    await store.write(
      AuthSession(
        accessToken: 'access',
        refreshToken: 'refresh',
        user: _user(),
      ),
    );
    final auth = SentroyAuth(
      projectSlug: 'p',
      storage: store,
      httpClient: MockClient((r) async {
        if (r.url.path.endsWith('/login')) {
          return http.Response(
            jsonEncode({
              'mfaRequired': true,
              'mfaToken': 'challenge',
              'factorType': 'totp',
            }),
            200,
          );
        }
        return http.Response('{}', 200);
      }),
    );
    final controller = SentroyAuthController(auth);
    await tester.pumpWidget(
      MaterialApp(
        home: SentroyAuthScope(
          controller: controller,
          child: Builder(
            builder: (context) {
              final state = SentroyAuthScope.of(context);
              return Text(
                state.isBusy ? 'loading' : state.user?.email ?? 'signed out',
              );
            },
          ),
        ),
      ),
    );
    expect(find.text('signed out'), findsOneWidget);
    await controller.initialize();
    await tester.pump();
    expect(controller.isInitialized, isTrue);
    expect(find.text('a@example.com'), findsOneWidget);
    await controller.signOut();
    await tester.pump();
    expect(find.text('signed out'), findsOneWidget);
    final outcome = await controller.signIn(
      const SignInRequest(email: 'a@example.com', password: 'secret'),
    );
    expect(outcome.mfa, isNotNull);
    expect(controller.isSignedIn, isFalse);
    await tester.pumpWidget(const SizedBox());
    controller.dispose();
    await auth.close();
  });
  test(
    'errors and disposal during pending actions stay well-defined',
    () async {
      final reply = Completer<http.Response>();
      final auth = SentroyAuth(
        projectSlug: 'p',
        httpClient: MockClient((_) => reply.future),
      );
      final controller = SentroyAuthController(auth);
      final request = controller.signIn(
        const SignInRequest(email: 'a', password: 'b'),
      );
      expect(controller.isBusy, isTrue);
      await expectLater(
        controller.signIn(const SignInRequest(email: 'a', password: 'b')),
        throwsStateError,
      );
      controller.dispose();
      reply.complete(
        http.Response(
          '{"error":"bad_login","error_description":"Bad login"}',
          401,
        ),
      );
      await expectLater(request, throwsA(isA<SentroyAuthException>()));
      expect(controller.isBusy, isFalse);
      expect(controller.error, isA<SentroyAuthException>());
      await auth.close();
    },
  );
}
