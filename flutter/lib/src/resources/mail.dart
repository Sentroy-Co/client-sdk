import 'dart:math';

import '../errors.dart';
import '../http.dart';
import '../json.dart';
import '../types/mail.dart';

String _path(String base, String id) => '$base/${pathSegment(id)}';
JsonMap _query(JsonMap? value) => value ?? <String, dynamic>{};
bool _hasBcc(Object? bcc) =>
    bcc is String ? bcc.trim().isNotEmpty : bcc is List && bcc.isNotEmpty;
String _requestId(String? value) {
  if (value != null && value.isNotEmpty) {
    if (!RegExp(
      r'^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$',
      caseSensitive: false,
    ).hasMatch(value)) {
      throw ArgumentError('requestId must be a UUID');
    }
    return value.toLowerCase();
  }
  final random = Random.secure();
  final bytes = List<int>.generate(16, (_) => random.nextInt(256));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  final s = bytes.map((v) => v.toRadixString(16).padLeft(2, '0')).join();
  return '${s.substring(0, 8)}-${s.substring(8, 12)}-${s.substring(12, 16)}-${s.substring(16, 20)}-${s.substring(20)}';
}

class Domains {
  Domains(this._http);
  final SentroyHttp _http;
  Future<List<Domain>> list() async =>
      jsonList(await _http.get('/domains'), Domain.fromJson);
  Future<Domain> get(String id) async =>
      Domain.fromJson(jsonObject(await _http.get(_path('/domains', id))));
}

class Mailboxes {
  Mailboxes(this._http);
  final SentroyHttp _http;
  Future<List<MailboxUser>> list() async =>
      jsonList(await _http.get('/mailboxes'), MailboxUser.fromJson);
}

class Templates {
  Templates(this._http);
  final SentroyHttp _http;
  Future<List<Template>> list([TemplateListParams? params]) async => jsonList(
    await _http.get('/templates', query: _query(params?.toJson())),
    Template.fromJson,
  );
  Future<Template> get(String id) async =>
      Template.fromJson(jsonObject(await _http.get(_path('/templates', id))));
  Future<Template> create(CreateTemplateParams params) async =>
      Template.fromJson(
        jsonObject(await _http.post('/templates', params.toJson())),
      );
  Future<Template> update(String id, UpdateTemplateParams params) async =>
      Template.fromJson(
        jsonObject(await _http.patch(_path('/templates', id), params.toJson())),
      );
  Future<void> delete(String id) async {
    await _http.delete(_path('/templates', id));
  }
}

class Inbox {
  Inbox(this._http);
  final SentroyHttp _http;
  Future<SaveDraftResult> saveDraft(SaveDraftParams params) async {
    final body = params.toJson();
    if (_hasBcc(params.bcc)) {
      final id = _requestId(params.requestId);
      body['requestId'] = id;
      try {
        final result = jsonObject(
          await _http.postOnce('/inbox/drafts-bcc-v1', body),
        );
        return SaveDraftResult.fromJson({...result, 'requestId': id});
      } catch (e) {
        throw ComposeRequestError(id, e);
      }
    }
    body.remove('bcc');
    body.remove('requestId');
    return SaveDraftResult.fromJson(
      jsonObject(await _http.post('/inbox/drafts', body)),
    );
  }

  Future<List<MessageSummary>> list([InboxListParams? params]) async =>
      jsonList(
        await _http.get('/inbox', query: _query(params?.toJson())),
        MessageSummary.fromJson,
      );
  Future<MessageDetail> get(int uid, {String? mailbox, String? folder}) async =>
      MessageDetail.fromJson(
        jsonObject(
          await _http.get(
            '/inbox/$uid',
            query: {'mailbox': ?mailbox, 'folder': ?folder},
          ),
        ),
      );
  Future<List<Mailbox>> listFolders([String? mailbox]) async => jsonList(
    await _http.get('/inbox/mailboxes', query: {'mailbox': ?mailbox}),
    Mailbox.fromJson,
  );
  Future<List<MessageDetail>> getThread(
    String subject, [
    String? mailbox,
  ]) async => jsonList(
    await _http.get(
      '/inbox/thread',
      query: {'subject': subject, 'mailbox': ?mailbox},
    ),
    MessageDetail.fromJson,
  );
  Future<void> markAsRead(int uid, {String? mailbox, String? folder}) async {
    await _http.post('/inbox/$uid/read', {
      'mailbox': ?mailbox,
      'folder': ?folder,
    });
  }

  Future<void> markAsUnread(int uid, {String? mailbox, String? folder}) async {
    await _http.delete(
      '/inbox/$uid/read',
      query: {'mailbox': ?mailbox, 'folder': ?folder},
    );
  }

  Future<void> move(int uid, String to, {String? from, String? mailbox}) async {
    await _http.post('/inbox/$uid/move', {
      'to': to,
      'from': ?from,
      'mailbox': ?mailbox,
    });
  }

  Future<void> delete(int uid, {String? mailbox, String? folder}) async {
    await _http.delete(
      '/inbox/$uid',
      query: {'mailbox': ?mailbox, 'folder': ?folder},
    );
  }
}

class Send {
  Send(this._http);
  final SentroyHttp _http;
  Future<SendResult> email(SendParams params) async {
    final body = params.toJson();
    if (_hasBcc(params.bcc)) {
      final id = _requestId(params.requestId);
      body['requestId'] = id;
      try {
        final result = jsonObject(await _http.postOnce('/send-bcc', body));
        return SendResult.fromJson({...result, 'requestId': id});
      } catch (e) {
        throw ComposeRequestError(id, e);
      }
    }
    body.remove('bcc');
    body.remove('requestId');
    final to = params.to;
    if (to is List) {
      if (to.isEmpty) {
        throw ArgumentError('At least one To or BCC recipient is required');
      }
      if (to.length == 1) {
        body['to'] = to.first;
      } else {
        body.remove('to');
        final variables = body.remove('variables');
        body['recipients'] = to
            .map((v) => {'to': v, 'variables': ?variables})
            .toList();
      }
    }
    return SendResult.fromJson(jsonObject(await _http.post('/send', body)));
  }
}

class Audience {
  Audience(SentroyHttp http)
    : contacts = AudienceContacts(http),
      lists = AudienceLists(http);
  final AudienceContacts contacts;
  final AudienceLists lists;
}

class AudienceContacts {
  AudienceContacts(this._http);
  final SentroyHttp _http;
  Future<ContactListResult> list([ContactListParams? params]) async {
    final q = _query(params?.toJson());
    if (params?.tags != null) {
      if (params!.tags!.isEmpty) {
        q.remove('tags');
      } else {
        q['tags'] = params.tags!.join(',');
      }
    }
    return ContactListResult.fromJson(
      jsonObject(await _http.get('/audience/contacts', query: q)),
    );
  }

  Future<List<Contact>> search(String q) async => jsonList(
    await _http.get('/audience/contacts', query: {'q': q}),
    Contact.fromJson,
  );
  Future<Contact> get(String id) async => Contact.fromJson(
    jsonObject(await _http.get(_path('/audience/contacts', id))),
  );
  Future<Contact> create(CreateContactParams params) async => Contact.fromJson(
    jsonObject(await _http.post('/audience/contacts', params.toJson())),
  );
  Future<Contact> update(String id, UpdateContactParams params) async =>
      Contact.fromJson(
        jsonObject(
          await _http.patch(_path('/audience/contacts', id), params.toJson()),
        ),
      );
  Future<void> delete(String id) async {
    await _http.delete(_path('/audience/contacts', id));
  }
}

class AudienceLists {
  AudienceLists(this._http);
  final SentroyHttp _http;
  Future<List<ContactList>> list() async =>
      jsonList(await _http.get('/audience/lists'), ContactList.fromJson);
  Future<ContactList> get(String id) async => ContactList.fromJson(
    jsonObject(await _http.get(_path('/audience/lists', id))),
  );
  Future<ContactList> create(CreateAudienceListParams params) async =>
      ContactList.fromJson(
        jsonObject(await _http.post('/audience/lists', params.toJson())),
      );
  Future<void> delete(String id) async {
    await _http.delete(_path('/audience/lists', id));
  }

  AudienceListMembers members(String listId) =>
      AudienceListMembers(_http, listId);
}

class AudienceListMembers {
  AudienceListMembers(this._http, this._id);
  final SentroyHttp _http;
  final String _id;
  String get _base => '${_path('/audience/lists', _id)}/members';
  Future<List<Contact>> list() async =>
      jsonList(await _http.get(_base), Contact.fromJson);
  Future<void> add(String contactId) async {
    await _http.post(_base, {'contactId': contactId});
  }

  Future<void> remove(String contactId) async {
    await _http.delete(_base, body: {'contactId': contactId});
  }
}

class Suppressions {
  Suppressions(this._http);
  final SentroyHttp _http;
  Future<List<Suppression>> list([SuppressionListParams? params]) async =>
      jsonList(
        await _http.get('/suppressions', query: _query(params?.toJson())),
        Suppression.fromJson,
      );
  Future<Suppression> add(AddSuppressionParams params) async =>
      Suppression.fromJson(
        jsonObject(await _http.post('/suppressions', params.toJson())),
      );
  Future<void> remove(String id) async {
    await _http.delete(_path('/suppressions', id));
  }
}

class Webhooks {
  Webhooks(this._http);
  final SentroyHttp _http;
  Future<List<Webhook>> list([String? domainId]) async => jsonList(
    await _http.get('/webhooks', query: {'domainId': ?domainId}),
    Webhook.fromJson,
  );
  Future<Webhook> get(String id) async =>
      Webhook.fromJson(jsonObject(await _http.get(_path('/webhooks', id))));
  Future<Webhook> create(CreateWebhookParams params) async => Webhook.fromJson(
    jsonObject(await _http.post('/webhooks', params.toJson())),
  );
  Future<Webhook> update(String id, UpdateWebhookParams params) async =>
      Webhook.fromJson(
        jsonObject(await _http.patch(_path('/webhooks', id), params.toJson())),
      );
  Future<void> delete(String id) async {
    await _http.delete(_path('/webhooks', id));
  }

  Future<WebhookDispatchResult> test(
    String id,
    WebhookTestParams params,
  ) async => WebhookDispatchResult.fromJson(
    jsonObject(
      await _http.post('${_path('/webhooks', id)}/test', params.toJson()),
    ),
  );
  WebhookDeliveries deliveries(String webhookId) =>
      WebhookDeliveries(_http, webhookId);
}

class WebhookDeliveries {
  WebhookDeliveries(this._http, this._id);
  final SentroyHttp _http;
  final String _id;
  String get _base => '${_path('/webhooks', _id)}/deliveries';
  Future<WebhookDeliveryListResult> list([
    WebhookDeliveryListParams? params,
  ]) async => WebhookDeliveryListResult.fromJson(
    jsonObject(await _http.get(_base, query: _query(params?.toJson()))),
  );
  Future<WebhookDelivery> get(String deliveryId) async =>
      WebhookDelivery.fromJson(
        jsonObject(await _http.get(_path(_base, deliveryId))),
      );
  Future<WebhookDispatchResult> replay(String deliveryId) async =>
      WebhookDispatchResult.fromJson(
        jsonObject(await _http.post('${_path(_base, deliveryId)}/replay')),
      );
}

class Logs {
  Logs(this._http);
  final SentroyHttp _http;
  Future<List<MailLog>> list([LogListParams? params]) async => jsonList(
    await _http.get('/logs', query: _query(params?.toJson())),
    MailLog.fromJson,
  );
  Future<MailLog> get(String id) async =>
      MailLog.fromJson(jsonObject(await _http.get(_path('/logs', id))));
}
