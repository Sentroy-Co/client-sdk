import 'dart:async';
import 'package:flutter/material.dart';
import 'package:sentroy_client_sdk/sentroy_flutter.dart';

void main() => runApp(const MaterialApp(home: SentroyExample()));

class SentroyExample extends StatefulWidget {
  const SentroyExample({super.key});
  @override
  State<SentroyExample> createState() => _SentroyExampleState();
}

class _SentroyExampleState extends State<SentroyExample> {
  final _email = TextEditingController();
  final _password = TextEditingController();
  final _slug = TextEditingController();
  final _token = TextEditingController();
  final _auth = SentroyAuth(
    projectSlug: const String.fromEnvironment(
      'SENTROY_AUTH_PROJECT',
      defaultValue: 'demo',
    ),
  );
  late final _controller = SentroyAuthController(_auth);
  String? _message;
  bool _loading = false;
  @override
  void initState() {
    super.initState();
    unawaited(_controller.initialize());
  }

  @override
  void dispose() {
    _controller.dispose();
    unawaited(_auth.close());
    _email.dispose();
    _password.dispose();
    _slug.dispose();
    _token.dispose();
    super.dispose();
  }

  Future<void> _login() async {
    try {
      final result = await _controller.signIn(
        SignInRequest(email: _email.text, password: _password.text),
      );
      if (mounted) {
        setState(
          () => _message = result.mfa == null
              ? 'Signed in.'
              : 'MFA required: call verifyMfa with the challenge and user code.',
        );
      }
    } on SentroyException catch (e) {
      if (mounted) setState(() => _message = e.message);
    }
  }

  Future<void> _domains() async {
    setState(() => _loading = true);
    Sentroy? sdk;
    try {
      sdk = Sentroy(companySlug: _slug.text, accessToken: _token.text);
      final domains = await sdk.domains.list();
      if (mounted) {
        setState(() => _message = '${domains.length} mail domains available.');
      }
    } catch (_) {
      if (mounted) {
        setState(
          () => _message =
              'Could not load domains. Check your company and access permissions.',
        );
      }
    } finally {
      sdk?.close();
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) => SentroyAuthScope(
    controller: _controller,
    child: Builder(
      builder: (context) {
        final auth = SentroyAuthScope.of(context);
        return Scaffold(
          appBar: AppBar(title: const Text('Sentroy SDK')),
          body: SafeArea(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(24),
              child: Center(
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 480),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Text(
                        'Identity',
                        style: Theme.of(context).textTheme.headlineSmall,
                      ),
                      if (auth.isSignedIn) ...[
                        Text(auth.user!.email),
                        TextButton(
                          onPressed: auth.isBusy ? null : auth.signOut,
                          child: const Text('Sign out'),
                        ),
                      ] else ...[
                        TextField(
                          controller: _email,
                          keyboardType: TextInputType.emailAddress,
                          decoration: const InputDecoration(labelText: 'Email'),
                        ),
                        TextField(
                          controller: _password,
                          obscureText: true,
                          decoration: const InputDecoration(
                            labelText: 'Password',
                          ),
                        ),
                        FilledButton(
                          onPressed: auth.isBusy ? null : _login,
                          child: Text(auth.isBusy ? 'Signing in…' : 'Sign in'),
                        ),
                      ],
                      const SizedBox(height: 32),
                      Text(
                        'Company Mail API',
                        style: Theme.of(context).textTheme.headlineSmall,
                      ),
                      const Text(
                        'Enter a company access token at runtime to try a read operation.',
                      ),
                      TextField(
                        controller: _slug,
                        decoration: const InputDecoration(
                          labelText: 'Company slug',
                        ),
                      ),
                      TextField(
                        controller: _token,
                        obscureText: true,
                        decoration: const InputDecoration(
                          labelText: 'Access token',
                        ),
                      ),
                      FilledButton(
                        onPressed: _loading ? null : _domains,
                        child: Text(
                          _loading ? 'Loading…' : 'List mail domains',
                        ),
                      ),
                      if (_message != null)
                        Padding(
                          padding: const EdgeInsets.only(top: 24),
                          child: Text(_message!),
                        ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        );
      },
    ),
  );
}
