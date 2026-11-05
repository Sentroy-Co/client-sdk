import '../json.dart';

class WhatsAppNumber {
  const WhatsAppNumber({
    required this.sessionId,
    this.phoneNumber,
    this.label,
    required this.status,
    required this.connected,
  });
  final String sessionId;
  final String? phoneNumber;
  final String? label;
  final String status;
  final bool connected;
  factory WhatsAppNumber.fromJson(JsonMap json) => WhatsAppNumber(
    sessionId: json['sessionId'] as String,
    phoneNumber: json['phoneNumber'] as String?,
    label: json['label'] as String?,
    status: json['status'] as String,
    connected: json['connected'] as bool,
  );
  JsonMap toJson() => {
    'sessionId': sessionId,
    'phoneNumber': phoneNumber,
    'label': label,
    'status': status,
    'connected': connected,
  };
}

class WhatsAppTemplate {
  const WhatsAppTemplate({
    required this.id,
    required this.name,
    required this.body,
    required this.variables,
    this.mediaUrl,
    this.category,
    required this.createdAt,
    required this.updatedAt,
  });
  final String id;
  final String name;
  final String body;
  final List<String> variables;
  final String? mediaUrl;
  final String? category;
  final String createdAt;
  final String updatedAt;
  factory WhatsAppTemplate.fromJson(JsonMap json) => WhatsAppTemplate(
    id: json['id'] as String,
    name: json['name'] as String,
    body: json['body'] as String,
    variables: (json['variables'] as List).cast<String>(),
    mediaUrl: json['mediaUrl'] as String?,
    category: json['category'] as String?,
    createdAt: json['createdAt'] as String,
    updatedAt: json['updatedAt'] as String,
  );
  JsonMap toJson() => {
    'id': id,
    'name': name,
    'body': body,
    'variables': variables,
    'mediaUrl': mediaUrl,
    'category': category,
    'createdAt': createdAt,
    'updatedAt': updatedAt,
  };
}

class CreateWhatsAppTemplateParams {
  const CreateWhatsAppTemplateParams({
    required this.name,
    required this.body,
    this.mediaUrl,
    this.category,
  });
  final String name;
  final String body;
  final String? mediaUrl;
  final String? category;
  JsonMap toJson() => {
    'name': name,
    'body': body,
    if (mediaUrl != null) 'mediaUrl': mediaUrl,
    if (category != null) 'category': category,
  };
}

class UpdateWhatsAppTemplateParams {
  const UpdateWhatsAppTemplateParams({
    this.name,
    this.body,
    this.mediaUrl,
    this.category,
  });
  final String? name;
  final String? body;
  final PatchValue<String>? mediaUrl;
  final PatchValue<String>? category;
  JsonMap toJson() => {
    if (name != null) 'name': name,
    if (body != null) 'body': body,
    if (mediaUrl != null) 'mediaUrl': mediaUrl!.value,
    if (category != null) 'category': category!.value,
  };
}

class WhatsAppAudienceEntry {
  const WhatsAppAudienceEntry({required this.phone, this.variables});
  final String phone;
  final Map<String, String>? variables;
  factory WhatsAppAudienceEntry.fromJson(JsonMap json) => WhatsAppAudienceEntry(
    phone: json['phone'] as String,
    variables: (json['variables'] as Map?)?.cast<String, String>(),
  );
  JsonMap toJson() => {
    'phone': phone,
    if (variables != null) 'variables': variables,
  };
}

class WhatsAppAudience {
  const WhatsAppAudience({
    required this.id,
    required this.name,
    this.description,
    required this.entries,
    required this.entryCount,
    required this.createdAt,
    required this.updatedAt,
  });
  final String id;
  final String name;
  final String? description;
  final List<WhatsAppAudienceEntry> entries;
  final int entryCount;
  final String createdAt;
  final String updatedAt;
  factory WhatsAppAudience.fromJson(JsonMap json) => WhatsAppAudience(
    id: json['id'] as String,
    name: json['name'] as String,
    description: json['description'] as String?,
    entries: jsonList(json['entries'], WhatsAppAudienceEntry.fromJson),
    entryCount: json['entryCount'] as int,
    createdAt: json['createdAt'] as String,
    updatedAt: json['updatedAt'] as String,
  );
  JsonMap toJson() => {
    'id': id,
    'name': name,
    'description': description,
    'entries': entries.map((v) => v.toJson()).toList(),
    'entryCount': entryCount,
    'createdAt': createdAt,
    'updatedAt': updatedAt,
  };
}

class CreateWhatsAppAudienceParams {
  const CreateWhatsAppAudienceParams({
    required this.name,
    this.description,
    required this.entries,
  });
  final String name;
  final String? description;
  final List<Object> entries;
  JsonMap toJson() => {
    'name': name,
    if (description != null) 'description': description,
    'entries': entries
        .map((v) => v is WhatsAppAudienceEntry ? v.toJson() : v)
        .toList(),
  };
}

class UpdateWhatsAppAudienceParams {
  const UpdateWhatsAppAudienceParams({
    this.name,
    this.description,
    this.entries,
  });
  final String? name;
  final PatchValue<String>? description;
  final List<Object>? entries;
  JsonMap toJson() => {
    if (name != null) 'name': name,
    if (description != null) 'description': description!.value,
    if (entries != null)
      'entries': entries
          ?.map((v) => v is WhatsAppAudienceEntry ? v.toJson() : v)
          .toList(),
  };
}

class WhatsAppSendParams {
  const WhatsAppSendParams({
    this.from,
    this.to,
    this.audienceId,
    this.templateId,
    this.body,
    this.variables,
  });
  final String? from;
  final String? to;
  final String? audienceId;
  final String? templateId;
  final String? body;
  final Map<String, String>? variables;
  JsonMap toJson() => {
    if (from != null) 'from': from,
    if (to != null) 'to': to,
    if (audienceId != null) 'audienceId': audienceId,
    if (templateId != null) 'templateId': templateId,
    if (body != null) 'body': body,
    if (variables != null) 'variables': variables,
  };
}

class WhatsAppSendRecipientResult {
  const WhatsAppSendRecipientResult({
    required this.to,
    required this.status,
    this.waMessageId,
    this.error,
  });
  final String to;
  final String status;
  final String? waMessageId;
  final String? error;
  factory WhatsAppSendRecipientResult.fromJson(JsonMap json) =>
      WhatsAppSendRecipientResult(
        to: json['to'] as String,
        status: json['status'] as String,
        waMessageId: json['waMessageId'] as String?,
        error: json['error'] as String?,
      );
  JsonMap toJson() => {
    'to': to,
    'status': status,
    if (waMessageId != null) 'waMessageId': waMessageId,
    if (error != null) 'error': error,
  };
}

class WhatsAppSendResult {
  const WhatsAppSendResult({
    required this.total,
    required this.sent,
    required this.failed,
    required this.results,
  });
  final int total;
  final int sent;
  final int failed;
  final List<WhatsAppSendRecipientResult> results;
  factory WhatsAppSendResult.fromJson(JsonMap json) => WhatsAppSendResult(
    total: json['total'] as int,
    sent: json['sent'] as int,
    failed: json['failed'] as int,
    results: jsonList(json['results'], WhatsAppSendRecipientResult.fromJson),
  );
  JsonMap toJson() => {
    'total': total,
    'sent': sent,
    'failed': failed,
    'results': results.map((v) => v.toJson()).toList(),
  };
}

class WhatsAppLog {
  const WhatsAppLog({
    required this.id,
    required this.sessionId,
    required this.to,
    this.templateId,
    this.audienceId,
    required this.status,
    this.waMessageId,
    this.error,
    required this.createdAt,
  });
  final String id;
  final String sessionId;
  final String to;
  final String? templateId;
  final String? audienceId;
  final String status;
  final String? waMessageId;
  final String? error;
  final String createdAt;
  factory WhatsAppLog.fromJson(JsonMap json) => WhatsAppLog(
    id: json['id'] as String,
    sessionId: json['sessionId'] as String,
    to: json['to'] as String,
    templateId: json['templateId'] as String?,
    audienceId: json['audienceId'] as String?,
    status: json['status'] as String,
    waMessageId: json['waMessageId'] as String?,
    error: json['error'] as String?,
    createdAt: json['createdAt'] as String,
  );
  JsonMap toJson() => {
    'id': id,
    'sessionId': sessionId,
    'to': to,
    'templateId': templateId,
    'audienceId': audienceId,
    'status': status,
    'waMessageId': waMessageId,
    'error': error,
    'createdAt': createdAt,
  };
}

class WhatsAppLogListParams {
  const WhatsAppLogListParams({
    this.page,
    this.limit,
    this.status,
    this.sessionId,
    this.templateId,
  });
  final int? page;
  final int? limit;
  final String? status;
  final String? sessionId;
  final String? templateId;
  JsonMap toJson() => {
    if (page != null) 'page': page,
    if (limit != null) 'limit': limit,
    if (status != null) 'status': status,
    if (sessionId != null) 'sessionId': sessionId,
    if (templateId != null) 'templateId': templateId,
  };
}

class WhatsAppLogListResult {
  const WhatsAppLogListResult({
    required this.data,
    required this.page,
    required this.limit,
    required this.total,
  });
  final List<WhatsAppLog> data;
  final int page;
  final int limit;
  final int total;
  factory WhatsAppLogListResult.fromJson(JsonMap json) => WhatsAppLogListResult(
    data: jsonList(json['data'], WhatsAppLog.fromJson),
    page: json['page'] as int,
    limit: json['limit'] as int,
    total: json['total'] as int,
  );
  JsonMap toJson() => {
    'data': data.map((v) => v.toJson()).toList(),
    'page': page,
    'limit': limit,
    'total': total,
  };
}
