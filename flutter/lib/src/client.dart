import 'package:http/http.dart' as http;
import 'http.dart';
import 'json.dart';
import 'resources/mail.dart';
import 'resources/storage.dart';
import 'resources/whatsapp.dart';

/// One company-scoped SDK. Closes a client it creates, while leaving a supplied
/// platform client under application ownership.
class Sentroy {
  factory Sentroy({
    required String companySlug,
    String? accessToken,
    Uri? baseUrl,
    http.Client? httpClient,
    Duration timeout = const Duration(seconds: 30),
  }) {
    final base = baseUrl ?? Uri.parse('https://sentroy.com');
    if (!['http', 'https'].contains(base.scheme) ||
        !base.hasAuthority ||
        base.userInfo.isNotEmpty ||
        base.hasQuery ||
        base.hasFragment) {
      throw ArgumentError('Invalid Sentroy base URL');
    }
    final slug = pathSegment(companySlug);
    final root = base.toString().replaceFirst(RegExp(r'/+$'), '');
    final client = httpClient ?? http.Client();
    try {
      SentroyHttp gateway(String app) => SentroyHttp(
        baseUrl: Uri.parse('$root/api/$app/companies/$slug'),
        accessToken: accessToken,
        client: client,
        timeout: timeout,
      );
      return Sentroy._(
        gateway('mail'),
        gateway('storage'),
        gateway('whatsapp'),
        client,
        httpClient == null,
      );
    } catch (_) {
      if (httpClient == null) client.close();
      rethrow;
    }
  }
  Sentroy._(
    SentroyHttp mail,
    SentroyHttp storageHttp,
    SentroyHttp whatsappHttp,
    this._client,
    this._ownsClient,
  ) : domains = Domains(mail),
      mailboxes = Mailboxes(mail),
      templates = Templates(mail),
      inbox = Inbox(mail),
      send = Send(mail),
      audience = Audience(mail),
      suppressions = Suppressions(mail),
      webhooks = Webhooks(mail),
      logs = Logs(mail),
      buckets = Buckets(storageHttp),
      media = MediaResource(storageHttp),
      storage = Storage(storageHttp),
      whatsapp = WhatsApp(whatsappHttp),
      _transports = [mail, storageHttp, whatsappHttp];

  final Domains domains;
  final Mailboxes mailboxes;
  final Templates templates;
  final Inbox inbox;
  final Send send;
  final Audience audience;
  final Suppressions suppressions;
  final Webhooks webhooks;
  final Logs logs;
  final Buckets buckets;
  final MediaResource media;
  final Storage storage;
  final WhatsApp whatsapp;
  final http.Client _client;
  final bool _ownsClient;
  final List<SentroyHttp> _transports;
  bool _closed = false;
  void close() {
    if (_closed) return;
    _closed = true;
    for (final transport in _transports) {
      transport.close();
    }
    if (_ownsClient) _client.close();
  }
}
