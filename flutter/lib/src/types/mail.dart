import '../json.dart';

/// A single string or a map of language codes to strings.
typedef LocalizedString = Object;

/// A single email address or a list of email addresses.
typedef MailAddresses = Object;

Object? _localized(Object? value) {
  if (value == null || value is String) return value;
  if (value is Map &&
      value.entries.every((e) => e.key is String && e.value is String)) {
    return value;
  }
  throw const FormatException(
    'Expected a string or a string-to-string locale map',
  );
}

Object? _addresses(Object? value) {
  if (value == null || value is String) return value;
  if (value is List && value.every((item) => item is String)) return value;
  throw const FormatException(
    'Expected an address string or list of address strings',
  );
}

class Domain {
  const Domain({
    required this.id,
    required this.domain,
    required this.status,
    required this.spfVerified,
    required this.dkimVerified,
    required this.dmarcVerified,
    required this.createdAt,
    required this.updatedAt,
  });
  final String id;
  final String domain;
  final String status;
  final bool spfVerified;
  final bool dkimVerified;
  final bool dmarcVerified;
  final String createdAt;
  final String updatedAt;
  factory Domain.fromJson(JsonMap json) => Domain(
    id: json['id'] as String,
    domain: json['domain'] as String,
    status: json['status'] as String,
    spfVerified: json['spfVerified'] as bool,
    dkimVerified: json['dkimVerified'] as bool,
    dmarcVerified: json['dmarcVerified'] as bool,
    createdAt: json['createdAt'] as String,
    updatedAt: json['updatedAt'] as String,
  );
  JsonMap toJson() => {
    'id': id,
    'domain': domain,
    'status': status,
    'spfVerified': spfVerified,
    'dkimVerified': dkimVerified,
    'dmarcVerified': dmarcVerified,
    'createdAt': createdAt,
    'updatedAt': updatedAt,
  };
}

class MailboxUser {
  const MailboxUser({
    required this.email,
    required this.domain,
    required this.username,
  });
  final String email;
  final String domain;
  final String username;
  factory MailboxUser.fromJson(JsonMap json) => MailboxUser(
    email: json['email'] as String,
    domain: json['domain'] as String,
    username: json['username'] as String,
  );
  JsonMap toJson() => {'email': email, 'domain': domain, 'username': username};
}

class Template {
  const Template({
    required this.id,
    required this.name,
    required this.subject,
    required this.mjmlBody,
    this.htmlBody,
    this.variables,
    this.domainId,
    this.domainName,
    required this.createdAt,
    required this.updatedAt,
  });
  final String id;
  final LocalizedString name;
  final LocalizedString subject;
  final LocalizedString mjmlBody;
  final LocalizedString? htmlBody;
  final List<String>? variables;
  final String? domainId;
  final String? domainName;
  final String createdAt;
  final String updatedAt;
  factory Template.fromJson(JsonMap json) => Template(
    id: json['id'] as String,
    name: _localized(json['name'])!,
    subject: _localized(json['subject'])!,
    mjmlBody: _localized(json['mjmlBody'])!,
    htmlBody: _localized(json['htmlBody']),
    variables: (json['variables'] as List?)?.cast<String>(),
    domainId: json['domainId'] as String?,
    domainName: json['domainName'] as String?,
    createdAt: json['createdAt'] as String,
    updatedAt: json['updatedAt'] as String,
  );
  JsonMap toJson() => {
    'id': id,
    'name': _localized(name),
    'subject': _localized(subject),
    'mjmlBody': _localized(mjmlBody),
    if (htmlBody != null) 'htmlBody': _localized(htmlBody),
    if (variables != null) 'variables': variables,
    if (domainId != null) 'domainId': domainId,
    if (domainName != null) 'domainName': domainName,
    'createdAt': createdAt,
    'updatedAt': updatedAt,
  };
}

class CreateTemplateParams {
  const CreateTemplateParams({
    required this.name,
    required this.subject,
    required this.mjmlBody,
    required this.domainId,
  });
  final LocalizedString name;
  final LocalizedString subject;
  final LocalizedString mjmlBody;
  final String domainId;
  factory CreateTemplateParams.fromJson(JsonMap json) => CreateTemplateParams(
    name: _localized(json['name'])!,
    subject: _localized(json['subject'])!,
    mjmlBody: _localized(json['mjmlBody'])!,
    domainId: json['domainId'] as String,
  );
  JsonMap toJson() => {
    'name': _localized(name),
    'subject': _localized(subject),
    'mjmlBody': _localized(mjmlBody),
    'domainId': domainId,
  };
}

class UpdateTemplateParams {
  const UpdateTemplateParams({this.name, this.subject, this.mjmlBody});
  final LocalizedString? name;
  final LocalizedString? subject;
  final LocalizedString? mjmlBody;
  factory UpdateTemplateParams.fromJson(JsonMap json) => UpdateTemplateParams(
    name: _localized(json['name']),
    subject: _localized(json['subject']),
    mjmlBody: _localized(json['mjmlBody']),
  );
  JsonMap toJson() => {
    if (name != null) 'name': _localized(name),
    if (subject != null) 'subject': _localized(subject),
    if (mjmlBody != null) 'mjmlBody': _localized(mjmlBody),
  };
}

class TemplateListParams {
  const TemplateListParams({this.domainId});
  final String? domainId;
  factory TemplateListParams.fromJson(JsonMap json) =>
      TemplateListParams(domainId: json['domainId'] as String?);
  JsonMap toJson() => {if (domainId != null) 'domainId': domainId};
}

class MessageAddress {
  const MessageAddress({required this.name, required this.address});
  final String name;
  final String address;
  factory MessageAddress.fromJson(JsonMap json) => MessageAddress(
    name: json['name'] as String,
    address: json['address'] as String,
  );
  JsonMap toJson() => {'name': name, 'address': address};
}

class AttachmentInfo {
  const AttachmentInfo({
    required this.partId,
    required this.filename,
    required this.size,
    required this.contentType,
    this.contentId,
  });
  final String partId;
  final String filename;
  final int size;
  final String contentType;
  final String? contentId;
  factory AttachmentInfo.fromJson(JsonMap json) => AttachmentInfo(
    partId: json['partId'] as String,
    filename: json['filename'] as String,
    size: json['size'] as int,
    contentType: json['contentType'] as String,
    contentId: json['contentId'] as String?,
  );
  JsonMap toJson() => {
    'partId': partId,
    'filename': filename,
    'size': size,
    'contentType': contentType,
    if (contentId != null) 'contentId': contentId,
  };
}

class MessageSummary {
  const MessageSummary({
    required this.uid,
    required this.subject,
    required this.from,
    required this.to,
    required this.date,
    required this.seen,
    required this.flagged,
    required this.size,
    required this.hasAttachments,
    required this.preview,
    this.messageId,
    this.inReplyTo,
    required this.category,
  });
  final int uid;
  final String subject;
  final MessageAddress from;
  final List<MessageAddress> to;
  final String date;
  final bool seen;
  final bool flagged;
  final int size;
  final bool hasAttachments;
  final String preview;
  final String? messageId;
  final String? inReplyTo;
  final String category;
  factory MessageSummary.fromJson(JsonMap json) => MessageSummary(
    uid: json['uid'] as int,
    subject: json['subject'] as String,
    from: MessageAddress.fromJson(jsonObject(json['from'])),
    to: jsonList(json['to'], MessageAddress.fromJson),
    date: json['date'] as String,
    seen: json['seen'] as bool,
    flagged: json['flagged'] as bool,
    size: json['size'] as int,
    hasAttachments: json['hasAttachments'] as bool,
    preview: json['preview'] as String,
    messageId: json['messageId'] as String?,
    inReplyTo: json['inReplyTo'] as String?,
    category: json['category'] as String,
  );
  JsonMap toJson() => {
    'uid': uid,
    'subject': subject,
    'from': from.toJson(),
    'to': to.map((e) => e.toJson()).toList(),
    'date': date,
    'seen': seen,
    'flagged': flagged,
    'size': size,
    'hasAttachments': hasAttachments,
    'preview': preview,
    if (messageId != null) 'messageId': messageId,
    if (inReplyTo != null) 'inReplyTo': inReplyTo,
    'category': category,
  };
}

class MessageDetail {
  const MessageDetail({
    required this.uid,
    required this.subject,
    required this.from,
    required this.to,
    required this.cc,
    this.replyTo,
    required this.date,
    required this.seen,
    required this.flagged,
    this.textBody,
    this.htmlBody,
    required this.attachments,
    required this.headers,
    this.messageId,
    this.inReplyTo,
    required this.references,
    this.folder,
  });
  final int uid;
  final String subject;
  final MessageAddress from;
  final List<MessageAddress> to;
  final List<MessageAddress> cc;
  final MessageAddress? replyTo;
  final String date;
  final bool seen;
  final bool flagged;
  final String? textBody;
  final String? htmlBody;
  final List<AttachmentInfo> attachments;
  final Map<String, String> headers;
  final String? messageId;
  final String? inReplyTo;
  final List<String> references;
  final String? folder;
  factory MessageDetail.fromJson(JsonMap json) => MessageDetail(
    uid: json['uid'] as int,
    subject: json['subject'] as String,
    from: MessageAddress.fromJson(jsonObject(json['from'])),
    to: jsonList(json['to'], MessageAddress.fromJson),
    cc: jsonList(json['cc'], MessageAddress.fromJson),
    replyTo: json['replyTo'] == null
        ? null
        : MessageAddress.fromJson(jsonObject(json['replyTo'])),
    date: json['date'] as String,
    seen: json['seen'] as bool,
    flagged: json['flagged'] as bool,
    textBody: json['textBody'] as String?,
    htmlBody: json['htmlBody'] as String?,
    attachments: jsonList(json['attachments'], AttachmentInfo.fromJson),
    headers: (json['headers'] as Map).cast<String, String>(),
    messageId: json['messageId'] as String?,
    inReplyTo: json['inReplyTo'] as String?,
    references: (json['references'] as List).cast<String>(),
    folder: json['folder'] as String?,
  );
  JsonMap toJson() => {
    'uid': uid,
    'subject': subject,
    'from': from.toJson(),
    'to': to.map((e) => e.toJson()).toList(),
    'cc': cc.map((e) => e.toJson()).toList(),
    if (replyTo != null) 'replyTo': replyTo?.toJson(),
    'date': date,
    'seen': seen,
    'flagged': flagged,
    if (textBody != null) 'textBody': textBody,
    if (htmlBody != null) 'htmlBody': htmlBody,
    'attachments': attachments.map((e) => e.toJson()).toList(),
    'headers': headers,
    if (messageId != null) 'messageId': messageId,
    if (inReplyTo != null) 'inReplyTo': inReplyTo,
    'references': references,
    if (folder != null) 'folder': folder,
  };
}

class Mailbox {
  const Mailbox({
    required this.name,
    required this.path,
    this.specialUse,
    required this.totalMessages,
    required this.unreadMessages,
  });
  final String name;
  final String path;
  final String? specialUse;
  final int totalMessages;
  final int unreadMessages;
  factory Mailbox.fromJson(JsonMap json) => Mailbox(
    name: json['name'] as String,
    path: json['path'] as String,
    specialUse: json['specialUse'] as String?,
    totalMessages: json['totalMessages'] as int,
    unreadMessages: json['unreadMessages'] as int,
  );
  JsonMap toJson() => {
    'name': name,
    'path': path,
    if (specialUse != null) 'specialUse': specialUse,
    'totalMessages': totalMessages,
    'unreadMessages': unreadMessages,
  };
}

class InboxListParams {
  const InboxListParams({
    this.mailbox,
    this.folder,
    this.page,
    this.limit,
    this.unreadOnly,
  });
  final String? mailbox;
  final String? folder;
  final int? page;
  final int? limit;
  final bool? unreadOnly;
  factory InboxListParams.fromJson(JsonMap json) => InboxListParams(
    mailbox: json['mailbox'] as String?,
    folder: json['folder'] as String?,
    page: json['page'] as int?,
    limit: json['limit'] as int?,
    unreadOnly: json['unreadOnly'] as bool?,
  );
  JsonMap toJson() => {
    if (mailbox != null) 'mailbox': mailbox,
    if (folder != null) 'folder': folder,
    if (page != null) 'page': page,
    if (limit != null) 'limit': limit,
    if (unreadOnly != null) 'unreadOnly': unreadOnly,
  };
}

class Attachment {
  const Attachment({
    required this.filename,
    required this.content,
    this.contentType,
  });
  final String filename;
  final String content;
  final String? contentType;
  factory Attachment.fromJson(JsonMap json) => Attachment(
    filename: json['filename'] as String,
    content: json['content'] as String,
    contentType: json['contentType'] as String?,
  );
  JsonMap toJson() => {
    'filename': filename,
    'content': content,
    if (contentType != null) 'contentType': contentType,
  };
}

class SendParams {
  const SendParams({
    required this.to,
    required this.from,
    required this.subject,
    required this.domainId,
    this.cc,
    this.bcc,
    this.requestId,
    this.templateId,
    this.lang,
    this.html,
    this.text,
    this.variables,
    this.replyTo,
    this.attachments,
    this.scheduledAt,
    this.headers,
    this.inReplyTo,
    this.references,
  });
  final MailAddresses to;
  final String from;
  final String subject;
  final String domainId;
  final MailAddresses? cc;
  final MailAddresses? bcc;
  final String? requestId;
  final String? templateId;
  final String? lang;
  final String? html;
  final String? text;
  final Map<String, dynamic>? variables;
  final String? replyTo;
  final List<Attachment>? attachments;
  final String? scheduledAt;
  final Map<String, String>? headers;
  final String? inReplyTo;
  final List<String>? references;
  factory SendParams.fromJson(JsonMap json) => SendParams(
    to: _addresses(json['to'])!,
    from: json['from'] as String,
    subject: json['subject'] as String,
    domainId: json['domainId'] as String,
    cc: _addresses(json['cc']),
    bcc: _addresses(json['bcc']),
    requestId: json['requestId'] as String?,
    templateId: json['templateId'] as String?,
    lang: json['lang'] as String?,
    html: json['html'] as String?,
    text: json['text'] as String?,
    variables: (json['variables'] as Map?)?.cast<String, dynamic>(),
    replyTo: json['replyTo'] as String?,
    attachments: json['attachments'] == null
        ? null
        : jsonList(json['attachments'], Attachment.fromJson),
    scheduledAt: json['scheduledAt'] as String?,
    headers: (json['headers'] as Map?)?.cast<String, String>(),
    inReplyTo: json['inReplyTo'] as String?,
    references: (json['references'] as List?)?.cast<String>(),
  );
  JsonMap toJson() => {
    'to': _addresses(to),
    'from': from,
    'subject': subject,
    'domainId': domainId,
    if (cc != null) 'cc': _addresses(cc),
    if (bcc != null) 'bcc': _addresses(bcc),
    if (requestId != null) 'requestId': requestId,
    if (templateId != null) 'templateId': templateId,
    if (lang != null) 'lang': lang,
    if (html != null) 'html': html,
    if (text != null) 'text': text,
    if (variables != null) 'variables': variables,
    if (replyTo != null) 'replyTo': replyTo,
    if (attachments != null)
      'attachments': attachments?.map((e) => e.toJson()).toList(),
    if (scheduledAt != null) 'scheduledAt': scheduledAt,
    if (headers != null) 'headers': headers,
    if (inReplyTo != null) 'inReplyTo': inReplyTo,
    if (references != null) 'references': references,
  };
}

class SendJob {
  const SendJob({this.to, this.jobId, this.mailLogId, this.error});
  final String? to;
  final String? jobId;
  final String? mailLogId;
  final String? error;
  factory SendJob.fromJson(JsonMap json) => SendJob(
    to: json['to'] as String?,
    jobId: json['jobId'] as String?,
    mailLogId: json['mailLogId'] as String?,
    error: json['error'] as String?,
  );
  JsonMap toJson() => {
    if (to != null) 'to': to,
    if (jobId != null) 'jobId': jobId,
    if (mailLogId != null) 'mailLogId': mailLogId,
    if (error != null) 'error': error,
  };
}

class SendResult {
  const SendResult({
    this.jobId,
    this.mailLogId,
    this.requestId,
    this.canRetry,
    this.totalQueued,
    this.jobs,
    required this.status,
    this.scheduledAt,
  });
  final String? jobId;
  final String? mailLogId;
  final String? requestId;
  final bool? canRetry;
  final int? totalQueued;
  final List<SendJob>? jobs;
  final String status;
  final String? scheduledAt;
  factory SendResult.fromJson(JsonMap json) => SendResult(
    jobId: json['jobId'] as String?,
    mailLogId: json['mailLogId'] as String?,
    requestId: json['requestId'] as String?,
    canRetry: json['canRetry'] as bool?,
    totalQueued: json['totalQueued'] as int?,
    jobs: json['jobs'] == null
        ? null
        : jsonList(json['jobs'], SendJob.fromJson),
    status: json['status'] as String,
    scheduledAt: json['scheduledAt'] as String?,
  );
  JsonMap toJson() => {
    if (jobId != null) 'jobId': jobId,
    if (mailLogId != null) 'mailLogId': mailLogId,
    if (requestId != null) 'requestId': requestId,
    if (canRetry != null) 'canRetry': canRetry,
    if (totalQueued != null) 'totalQueued': totalQueued,
    if (jobs != null) 'jobs': jobs?.map((e) => e.toJson()).toList(),
    'status': status,
    if (scheduledAt != null) 'scheduledAt': scheduledAt,
  };
}

class SaveDraftParams {
  const SaveDraftParams({
    required this.mailbox,
    this.from,
    this.to,
    this.cc,
    this.bcc,
    this.requestId,
    this.replyTo,
    this.subject,
    this.html,
    this.text,
    this.templateId,
    this.lang,
    this.variables,
    this.attachments,
    this.inReplyTo,
    this.references,
    this.headers,
  });
  final String mailbox;
  final String? from;
  final MailAddresses? to;
  final MailAddresses? cc;
  final MailAddresses? bcc;
  final String? requestId;
  final MailAddresses? replyTo;
  final String? subject;
  final String? html;
  final String? text;
  final String? templateId;
  final String? lang;
  final Map<String, dynamic>? variables;
  final List<Attachment>? attachments;
  final String? inReplyTo;
  final List<String>? references;
  final Map<String, String>? headers;
  factory SaveDraftParams.fromJson(JsonMap json) => SaveDraftParams(
    mailbox: json['mailbox'] as String,
    from: json['from'] as String?,
    to: _addresses(json['to']),
    cc: _addresses(json['cc']),
    bcc: _addresses(json['bcc']),
    requestId: json['requestId'] as String?,
    replyTo: _addresses(json['replyTo']),
    subject: json['subject'] as String?,
    html: json['html'] as String?,
    text: json['text'] as String?,
    templateId: json['templateId'] as String?,
    lang: json['lang'] as String?,
    variables: (json['variables'] as Map?)?.cast<String, dynamic>(),
    attachments: json['attachments'] == null
        ? null
        : jsonList(json['attachments'], Attachment.fromJson),
    inReplyTo: json['inReplyTo'] as String?,
    references: (json['references'] as List?)?.cast<String>(),
    headers: (json['headers'] as Map?)?.cast<String, String>(),
  );
  JsonMap toJson() => {
    'mailbox': mailbox,
    if (from != null) 'from': from,
    if (to != null) 'to': _addresses(to),
    if (cc != null) 'cc': _addresses(cc),
    if (bcc != null) 'bcc': _addresses(bcc),
    if (requestId != null) 'requestId': requestId,
    if (replyTo != null) 'replyTo': _addresses(replyTo),
    if (subject != null) 'subject': subject,
    if (html != null) 'html': html,
    if (text != null) 'text': text,
    if (templateId != null) 'templateId': templateId,
    if (lang != null) 'lang': lang,
    if (variables != null) 'variables': variables,
    if (attachments != null)
      'attachments': attachments?.map((e) => e.toJson()).toList(),
    if (inReplyTo != null) 'inReplyTo': inReplyTo,
    if (references != null) 'references': references,
    if (headers != null) 'headers': headers,
  };
}

class SaveDraftResult {
  const SaveDraftResult({
    this.status,
    this.folder,
    this.requestId,
    this.canRetry,
    this.message,
  });
  final String? status;
  final String? folder;
  final String? requestId;
  final bool? canRetry;
  final String? message;
  factory SaveDraftResult.fromJson(JsonMap json) => SaveDraftResult(
    status: json['status'] as String?,
    folder: json['folder'] as String?,
    requestId: json['requestId'] as String?,
    canRetry: json['canRetry'] as bool?,
    message: json['message'] as String?,
  );
  JsonMap toJson() => {
    if (status != null) 'status': status,
    if (folder != null) 'folder': folder,
    if (requestId != null) 'requestId': requestId,
    if (canRetry != null) 'canRetry': canRetry,
    if (message != null) 'message': message,
  };
}

class Contact {
  const Contact({
    required this.id,
    required this.companyId,
    required this.email,
    this.name,
    required this.tags,
    required this.status,
    required this.metadata,
    this.lastEmailedAt,
    required this.createdAt,
    required this.updatedAt,
  });
  final String id;
  final String companyId;
  final String email;
  final String? name;
  final List<String> tags;
  final String status;
  final Map<String, dynamic> metadata;
  final String? lastEmailedAt;
  final String createdAt;
  final String updatedAt;
  factory Contact.fromJson(JsonMap json) => Contact(
    id: json['id'] as String,
    companyId: json['companyId'] as String,
    email: json['email'] as String,
    name: json['name'] as String?,
    tags: (json['tags'] as List).cast<String>(),
    status: json['status'] as String,
    metadata: (json['metadata'] as Map).cast<String, dynamic>(),
    lastEmailedAt: json['lastEmailedAt'] as String?,
    createdAt: json['createdAt'] as String,
    updatedAt: json['updatedAt'] as String,
  );
  JsonMap toJson() => {
    'id': id,
    'companyId': companyId,
    'email': email,
    if (name != null) 'name': name,
    'tags': tags,
    'status': status,
    'metadata': metadata,
    if (lastEmailedAt != null) 'lastEmailedAt': lastEmailedAt,
    'createdAt': createdAt,
    'updatedAt': updatedAt,
  };
}

class ContactList {
  const ContactList({
    required this.id,
    required this.companyId,
    required this.name,
    this.description,
    this.memberCount,
    required this.createdAt,
    required this.updatedAt,
  });
  final String id;
  final String companyId;
  final String name;
  final String? description;
  final int? memberCount;
  final String createdAt;
  final String updatedAt;
  factory ContactList.fromJson(JsonMap json) => ContactList(
    id: json['id'] as String,
    companyId: json['companyId'] as String,
    name: json['name'] as String,
    description: json['description'] as String?,
    memberCount: json['memberCount'] as int?,
    createdAt: json['createdAt'] as String,
    updatedAt: json['updatedAt'] as String,
  );
  JsonMap toJson() => {
    'id': id,
    'companyId': companyId,
    'name': name,
    if (description != null) 'description': description,
    if (memberCount != null) 'memberCount': memberCount,
    'createdAt': createdAt,
    'updatedAt': updatedAt,
  };
}

class CreateContactParams {
  const CreateContactParams({
    required this.email,
    this.name,
    this.tags,
    this.metadata,
  });
  final String email;
  final String? name;
  final List<String>? tags;
  final Map<String, dynamic>? metadata;
  factory CreateContactParams.fromJson(JsonMap json) => CreateContactParams(
    email: json['email'] as String,
    name: json['name'] as String?,
    tags: (json['tags'] as List?)?.cast<String>(),
    metadata: (json['metadata'] as Map?)?.cast<String, dynamic>(),
  );
  JsonMap toJson() => {
    'email': email,
    if (name != null) 'name': name,
    if (tags != null) 'tags': tags,
    if (metadata != null) 'metadata': metadata,
  };
}

class UpdateContactParams {
  const UpdateContactParams({
    this.email,
    this.name,
    this.tags,
    this.status,
    this.metadata,
  });
  final String? email;
  final String? name;
  final List<String>? tags;
  final String? status;
  final Map<String, dynamic>? metadata;
  factory UpdateContactParams.fromJson(JsonMap json) => UpdateContactParams(
    email: json['email'] as String?,
    name: json['name'] as String?,
    tags: (json['tags'] as List?)?.cast<String>(),
    status: json['status'] as String?,
    metadata: (json['metadata'] as Map?)?.cast<String, dynamic>(),
  );
  JsonMap toJson() => {
    if (email != null) 'email': email,
    if (name != null) 'name': name,
    if (tags != null) 'tags': tags,
    if (status != null) 'status': status,
    if (metadata != null) 'metadata': metadata,
  };
}

class ContactListParams {
  const ContactListParams({this.page, this.limit, this.status, this.tags});
  final int? page;
  final int? limit;
  final String? status;
  final List<String>? tags;
  factory ContactListParams.fromJson(JsonMap json) => ContactListParams(
    page: json['page'] as int?,
    limit: json['limit'] as int?,
    status: json['status'] as String?,
    tags: (json['tags'] as List?)?.cast<String>(),
  );
  JsonMap toJson() => {
    if (page != null) 'page': page,
    if (limit != null) 'limit': limit,
    if (status != null) 'status': status,
    if (tags != null) 'tags': tags,
  };
}

class ContactListResult {
  const ContactListResult({
    required this.contacts,
    required this.total,
    required this.page,
    required this.limit,
  });
  final List<Contact> contacts;
  final int total;
  final int page;
  final int limit;
  factory ContactListResult.fromJson(JsonMap json) => ContactListResult(
    contacts: jsonList(json['contacts'], Contact.fromJson),
    total: json['total'] as int,
    page: json['page'] as int,
    limit: json['limit'] as int,
  );
  JsonMap toJson() => {
    'contacts': contacts.map((e) => e.toJson()).toList(),
    'total': total,
    'page': page,
    'limit': limit,
  };
}

class CreateAudienceListParams {
  const CreateAudienceListParams({required this.name, this.description});
  final String name;
  final String? description;
  factory CreateAudienceListParams.fromJson(JsonMap json) =>
      CreateAudienceListParams(
        name: json['name'] as String,
        description: json['description'] as String?,
      );
  JsonMap toJson() => {
    'name': name,
    if (description != null) 'description': description,
  };
}

class DomainName {
  const DomainName({required this.domain});
  final String domain;
  factory DomainName.fromJson(JsonMap json) =>
      DomainName(domain: json['domain'] as String);
  JsonMap toJson() => {'domain': domain};
}

class Suppression {
  const Suppression({
    required this.id,
    required this.email,
    required this.reason,
    required this.domainId,
    required this.createdAt,
    this.domain,
  });
  final String id;
  final String email;
  final String reason;
  final String domainId;
  final String createdAt;
  final DomainName? domain;
  factory Suppression.fromJson(JsonMap json) => Suppression(
    id: json['id'] as String,
    email: json['email'] as String,
    reason: json['reason'] as String,
    domainId: json['domainId'] as String,
    createdAt: json['createdAt'] as String,
    domain: json['domain'] == null
        ? null
        : DomainName.fromJson(jsonObject(json['domain'])),
  );
  JsonMap toJson() => {
    'id': id,
    'email': email,
    'reason': reason,
    'domainId': domainId,
    'createdAt': createdAt,
    if (domain != null) 'domain': domain?.toJson(),
  };
}

class AddSuppressionParams {
  const AddSuppressionParams({
    required this.email,
    this.reason,
    required this.domainId,
  });
  final String email;
  final String? reason;
  final String domainId;
  factory AddSuppressionParams.fromJson(JsonMap json) => AddSuppressionParams(
    email: json['email'] as String,
    reason: json['reason'] as String?,
    domainId: json['domainId'] as String,
  );
  JsonMap toJson() => {
    'email': email,
    if (reason != null) 'reason': reason,
    'domainId': domainId,
  };
}

class SuppressionListParams {
  const SuppressionListParams({
    this.page,
    this.limit,
    this.domainId,
    this.reason,
  });
  final int? page;
  final int? limit;
  final String? domainId;
  final String? reason;
  factory SuppressionListParams.fromJson(JsonMap json) => SuppressionListParams(
    page: json['page'] as int?,
    limit: json['limit'] as int?,
    domainId: json['domainId'] as String?,
    reason: json['reason'] as String?,
  );
  JsonMap toJson() => {
    if (page != null) 'page': page,
    if (limit != null) 'limit': limit,
    if (domainId != null) 'domainId': domainId,
    if (reason != null) 'reason': reason,
  };
}

class Webhook {
  const Webhook({
    required this.id,
    required this.url,
    required this.events,
    required this.active,
    required this.domainId,
    this.secret,
    required this.createdAt,
    required this.updatedAt,
  });
  final String id;
  final String url;
  final List<String> events;
  final bool active;
  final String domainId;
  final String? secret;
  final String createdAt;
  final String updatedAt;
  factory Webhook.fromJson(JsonMap json) => Webhook(
    id: json['id'] as String,
    url: json['url'] as String,
    events: (json['events'] as List).cast<String>(),
    active: json['active'] as bool,
    domainId: json['domainId'] as String,
    secret: json['secret'] as String?,
    createdAt: json['createdAt'] as String,
    updatedAt: json['updatedAt'] as String,
  );
  JsonMap toJson() => {
    'id': id,
    'url': url,
    'events': events,
    'active': active,
    'domainId': domainId,
    if (secret != null) 'secret': secret,
    'createdAt': createdAt,
    'updatedAt': updatedAt,
  };
}

class CreateWebhookParams {
  const CreateWebhookParams({
    required this.url,
    required this.events,
    required this.domainId,
  });
  final String url;
  final List<String> events;
  final String domainId;
  factory CreateWebhookParams.fromJson(JsonMap json) => CreateWebhookParams(
    url: json['url'] as String,
    events: (json['events'] as List).cast<String>(),
    domainId: json['domainId'] as String,
  );
  JsonMap toJson() => {'url': url, 'events': events, 'domainId': domainId};
}

class UpdateWebhookParams {
  const UpdateWebhookParams({this.url, this.events, this.active});
  final String? url;
  final List<String>? events;
  final bool? active;
  factory UpdateWebhookParams.fromJson(JsonMap json) => UpdateWebhookParams(
    url: json['url'] as String?,
    events: (json['events'] as List?)?.cast<String>(),
    active: json['active'] as bool?,
  );
  JsonMap toJson() => {
    if (url != null) 'url': url,
    if (events != null) 'events': events,
    if (active != null) 'active': active,
  };
}

class WebhookDelivery {
  const WebhookDelivery({
    required this.id,
    required this.webhookId,
    required this.companyId,
    required this.kind,
    required this.event,
    required this.payload,
    required this.url,
    required this.responseStatus,
    required this.responseBody,
    required this.durationMs,
    required this.status,
    this.error,
    this.replayOf,
    required this.triggeredBy,
    required this.createdAt,
  });
  final String id;
  final String webhookId;
  final String companyId;
  final String kind;
  final String event;
  final Map<String, dynamic> payload;
  final String url;
  final int responseStatus;
  final String responseBody;
  final int durationMs;
  final String status;
  final String? error;
  final String? replayOf;
  final String triggeredBy;
  final String createdAt;
  factory WebhookDelivery.fromJson(JsonMap json) => WebhookDelivery(
    id: json['id'] as String,
    webhookId: json['webhookId'] as String,
    companyId: json['companyId'] as String,
    kind: json['kind'] as String,
    event: json['event'] as String,
    payload: (json['payload'] as Map).cast<String, dynamic>(),
    url: json['url'] as String,
    responseStatus: json['responseStatus'] as int,
    responseBody: json['responseBody'] as String,
    durationMs: json['durationMs'] as int,
    status: json['status'] as String,
    error: json['error'] as String?,
    replayOf: json['replayOf'] as String?,
    triggeredBy: json['triggeredBy'] as String,
    createdAt: json['createdAt'] as String,
  );
  JsonMap toJson() => {
    'id': id,
    'webhookId': webhookId,
    'companyId': companyId,
    'kind': kind,
    'event': event,
    'payload': payload,
    'url': url,
    'responseStatus': responseStatus,
    'responseBody': responseBody,
    'durationMs': durationMs,
    'status': status,
    if (error != null) 'error': error,
    if (replayOf != null) 'replayOf': replayOf,
    'triggeredBy': triggeredBy,
    'createdAt': createdAt,
  };
}

class WebhookDeliveryListParams {
  const WebhookDeliveryListParams({this.page, this.limit, this.status});
  final int? page;
  final int? limit;
  final String? status;
  factory WebhookDeliveryListParams.fromJson(JsonMap json) =>
      WebhookDeliveryListParams(
        page: json['page'] as int?,
        limit: json['limit'] as int?,
        status: json['status'] as String?,
      );
  JsonMap toJson() => {
    if (page != null) 'page': page,
    if (limit != null) 'limit': limit,
    if (status != null) 'status': status,
  };
}

class WebhookDeliveryListResult {
  const WebhookDeliveryListResult({
    required this.items,
    required this.total,
    required this.page,
    required this.limit,
  });
  final List<WebhookDelivery> items;
  final int total;
  final int page;
  final int limit;
  factory WebhookDeliveryListResult.fromJson(JsonMap json) =>
      WebhookDeliveryListResult(
        items: jsonList(json['items'], WebhookDelivery.fromJson),
        total: json['total'] as int,
        page: json['page'] as int,
        limit: json['limit'] as int,
      );
  JsonMap toJson() => {
    'items': items.map((e) => e.toJson()).toList(),
    'total': total,
    'page': page,
    'limit': limit,
  };
}

class WebhookTestParams {
  const WebhookTestParams({required this.event, required this.payload});
  final String event;
  final Map<String, dynamic> payload;
  factory WebhookTestParams.fromJson(JsonMap json) => WebhookTestParams(
    event: json['event'] as String,
    payload: (json['payload'] as Map).cast<String, dynamic>(),
  );
  JsonMap toJson() => {'event': event, 'payload': payload};
}

class WebhookDispatchResult {
  const WebhookDispatchResult({
    required this.deliveryId,
    required this.responseStatus,
    required this.durationMs,
    required this.status,
    this.error,
  });
  final String deliveryId;
  final int responseStatus;
  final int durationMs;
  final String status;
  final String? error;
  factory WebhookDispatchResult.fromJson(JsonMap json) => WebhookDispatchResult(
    deliveryId: json['deliveryId'] as String,
    responseStatus: json['responseStatus'] as int,
    durationMs: json['durationMs'] as int,
    status: json['status'] as String,
    error: json['error'] as String?,
  );
  JsonMap toJson() => {
    'deliveryId': deliveryId,
    'responseStatus': responseStatus,
    'durationMs': durationMs,
    'status': status,
    if (error != null) 'error': error,
  };
}

class MailLog {
  const MailLog({
    required this.id,
    required this.to,
    required this.from,
    required this.subject,
    required this.status,
    this.messageId,
    required this.domainId,
    this.domain,
    this.templateId,
    this.variables,
    this.scheduledAt,
    this.sentAt,
    this.bouncedAt,
    this.openedAt,
    this.clickedAt,
    this.error,
    required this.createdAt,
  });
  final String id;
  final String to;
  final String from;
  final String subject;
  final String status;
  final String? messageId;
  final String domainId;
  final DomainName? domain;
  final String? templateId;
  final Map<String, dynamic>? variables;
  final String? scheduledAt;
  final String? sentAt;
  final String? bouncedAt;
  final String? openedAt;
  final String? clickedAt;
  final String? error;
  final String createdAt;
  factory MailLog.fromJson(JsonMap json) => MailLog(
    id: json['id'] as String,
    to: json['to'] as String,
    from: json['from'] as String,
    subject: json['subject'] as String,
    status: json['status'] as String,
    messageId: json['messageId'] as String?,
    domainId: json['domainId'] as String,
    domain: json['domain'] == null
        ? null
        : DomainName.fromJson(jsonObject(json['domain'])),
    templateId: json['templateId'] as String?,
    variables: (json['variables'] as Map?)?.cast<String, dynamic>(),
    scheduledAt: json['scheduledAt'] as String?,
    sentAt: json['sentAt'] as String?,
    bouncedAt: json['bouncedAt'] as String?,
    openedAt: json['openedAt'] as String?,
    clickedAt: json['clickedAt'] as String?,
    error: json['error'] as String?,
    createdAt: json['createdAt'] as String,
  );
  JsonMap toJson() => {
    'id': id,
    'to': to,
    'from': from,
    'subject': subject,
    'status': status,
    if (messageId != null) 'messageId': messageId,
    'domainId': domainId,
    if (domain != null) 'domain': domain?.toJson(),
    if (templateId != null) 'templateId': templateId,
    if (variables != null) 'variables': variables,
    if (scheduledAt != null) 'scheduledAt': scheduledAt,
    if (sentAt != null) 'sentAt': sentAt,
    if (bouncedAt != null) 'bouncedAt': bouncedAt,
    if (openedAt != null) 'openedAt': openedAt,
    if (clickedAt != null) 'clickedAt': clickedAt,
    if (error != null) 'error': error,
    'createdAt': createdAt,
  };
}

class LogListParams {
  const LogListParams({
    this.page,
    this.limit,
    this.status,
    this.domainId,
    this.from,
    this.to,
  });
  final int? page;
  final int? limit;
  final String? status;
  final String? domainId;
  final String? from;
  final String? to;
  factory LogListParams.fromJson(JsonMap json) => LogListParams(
    page: json['page'] as int?,
    limit: json['limit'] as int?,
    status: json['status'] as String?,
    domainId: json['domainId'] as String?,
    from: json['from'] as String?,
    to: json['to'] as String?,
  );
  JsonMap toJson() => {
    if (page != null) 'page': page,
    if (limit != null) 'limit': limit,
    if (status != null) 'status': status,
    if (domainId != null) 'domainId': domainId,
    if (from != null) 'from': from,
    if (to != null) 'to': to,
  };
}
