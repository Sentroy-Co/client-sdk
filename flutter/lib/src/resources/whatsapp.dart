import '../http.dart';
import '../json.dart';
import '../types/whatsapp.dart';

class WhatsAppNumbers {
  const WhatsAppNumbers(this._http);
  final SentroyHttp _http;
  Future<List<WhatsAppNumber>> list() async =>
      jsonList(await _http.get('/numbers'), WhatsAppNumber.fromJson);
}

class WhatsAppTemplates {
  const WhatsAppTemplates(this._http);
  final SentroyHttp _http;
  Future<List<WhatsAppTemplate>> list() async =>
      jsonList(await _http.get('/templates'), WhatsAppTemplate.fromJson);
  Future<WhatsAppTemplate> get(String id) async => WhatsAppTemplate.fromJson(
    jsonObject(await _http.get('/templates/${pathSegment(id)}')),
  );
  Future<WhatsAppTemplate> create(CreateWhatsAppTemplateParams params) async =>
      WhatsAppTemplate.fromJson(
        jsonObject(await _http.post('/templates', params.toJson())),
      );
  Future<WhatsAppTemplate> update(
    String id,
    UpdateWhatsAppTemplateParams params,
  ) async => WhatsAppTemplate.fromJson(
    jsonObject(
      await _http.patch('/templates/${pathSegment(id)}', params.toJson()),
    ),
  );
  Future<void> delete(String id) async {
    await _http.delete('/templates/${pathSegment(id)}');
  }
}

class WhatsAppAudiences {
  const WhatsAppAudiences(this._http);
  final SentroyHttp _http;
  Future<List<WhatsAppAudience>> list() async =>
      jsonList(await _http.get('/audiences'), WhatsAppAudience.fromJson);
  Future<WhatsAppAudience> get(String id) async => WhatsAppAudience.fromJson(
    jsonObject(await _http.get('/audiences/${pathSegment(id)}')),
  );
  Future<WhatsAppAudience> create(CreateWhatsAppAudienceParams params) async =>
      WhatsAppAudience.fromJson(
        jsonObject(await _http.post('/audiences', params.toJson())),
      );
  Future<WhatsAppAudience> update(
    String id,
    UpdateWhatsAppAudienceParams params,
  ) async => WhatsAppAudience.fromJson(
    jsonObject(
      await _http.patch('/audiences/${pathSegment(id)}', params.toJson()),
    ),
  );
  Future<void> delete(String id) async {
    await _http.delete('/audiences/${pathSegment(id)}');
  }
}

class WhatsAppLogs {
  const WhatsAppLogs(this._http);
  final SentroyHttp _http;
  Future<WhatsAppLogListResult> list([WhatsAppLogListParams? params]) async =>
      WhatsAppLogListResult.fromJson(
        jsonObject(await _http.get('/logs', query: params?.toJson())),
      );
}

class WhatsApp {
  WhatsApp(SentroyHttp http)
    : _http = http,
      numbers = WhatsAppNumbers(http),
      templates = WhatsAppTemplates(http),
      audiences = WhatsAppAudiences(http),
      logs = WhatsAppLogs(http);
  final SentroyHttp _http;
  final WhatsAppNumbers numbers;
  final WhatsAppTemplates templates;
  final WhatsAppAudiences audiences;
  final WhatsAppLogs logs;
  Future<WhatsAppSendResult> send(WhatsAppSendParams params) async =>
      WhatsAppSendResult.fromJson(
        jsonObject(await _http.post('/send', params.toJson())),
      );
}
