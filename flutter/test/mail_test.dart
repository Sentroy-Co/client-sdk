import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:sentroy_client_sdk/src/errors.dart';
import 'package:sentroy_client_sdk/src/http.dart';
import 'package:sentroy_client_sdk/src/resources/mail.dart';
import 'package:sentroy_client_sdk/src/types/mail.dart';

void main() {
  SentroyHttp transport(MockClient client) => SentroyHttp(
    baseUrl: Uri.parse('https://example.test'),
    accessToken: 'token',
    client: client,
    timeout: const Duration(seconds: 5),
  );

  test(
    'BCC compose keeps request ID and uses the versioned draft route',
    () async {
      const id = '12345678-1234-4234-8234-123456789abc';
      final paths = <String>[];
      final api = transport(
        MockClient((request) async {
          paths.add(request.url.path);
          final body = jsonDecode(request.body) as Map<String, dynamic>;
          expect(body['requestId'], id);
          expect(body['bcc'], ['private@example.test']);
          return http.Response(
            jsonEncode({
              'data': {'status': 'saved'},
            }),
            200,
            headers: {'content-type': 'application/json'},
          );
        }),
      );
      final result = await Inbox(api).saveDraft(
        const SaveDraftParams(
          mailbox: 'me@example.test',
          bcc: ['private@example.test'],
          requestId: id,
        ),
      );
      expect(result.requestId, id);
      expect(paths.single, endsWith('/inbox/drafts-bcc-v1'));
    },
  );

  test(
    'ambiguous BCC failure exposes the original request ID without replay',
    () async {
      const id = '12345678-1234-4234-8234-123456789abc';
      var calls = 0;
      final api = transport(
        MockClient((request) async {
          calls++;
          throw StateError('connection lost');
        }),
      );
      await expectLater(
        Send(api).email(
          const SendParams(
            to: [],
            from: 'a@example.test',
            subject: 'test',
            domainId: 'd',
            bcc: ['b@example.test'],
            requestId: id,
          ),
        ),
        throwsA(
          isA<ComposeRequestError>().having(
            (e) => e.requestId,
            'requestId',
            id,
          ),
        ),
      );
      expect(calls, 1);
    },
  );

  test('batch send moves variables into each recipient', () async {
    final api = transport(
      MockClient((request) async {
        final body = jsonDecode(request.body) as Map<String, dynamic>;
        expect(body.containsKey('to'), false);
        expect(body['recipients'], [
          {
            'to': 'a@example.test',
            'variables': {'name': 'A'},
          },
          {
            'to': 'b@example.test',
            'variables': {'name': 'A'},
          },
        ]);
        return http.Response(
          '{"data":{"status":"queued"}}',
          200,
          headers: {'content-type': 'application/json'},
        );
      }),
    );
    final result = await Send(api).email(
      const SendParams(
        to: ['a@example.test', 'b@example.test'],
        from: 'sender@example.test',
        subject: 'Hi',
        domainId: 'd',
        variables: {'name': 'A'},
      ),
    );
    expect(result.status, 'queued');
  });

  test('localized templates and nested message addresses decode', () {
    final template = Template.fromJson({
      'id': 't',
      'name': {'en': 'Name'},
      'subject': 'Hello',
      'mjmlBody': {'en': '<mjml/>'},
      'createdAt': 'now',
      'updatedAt': 'now',
    });
    expect(template.toJson()['name'], {'en': 'Name'});
    final message = MessageSummary.fromJson({
      'uid': 1,
      'subject': 'Hi',
      'from': {'name': 'A', 'address': 'a@example.test'},
      'to': [
        {'name': 'B', 'address': 'b@example.test'},
      ],
      'date': 'now',
      'seen': false,
      'flagged': false,
      'size': 3,
      'hasAttachments': false,
      'preview': 'Hi',
      'category': 'other',
    });
    expect(message.to.single.address, 'b@example.test');
    expect(() => Domain.fromJson({}), throwsA(isA<TypeError>()));
  });
  test(
    'contact and inbox filters preserve pagination and encode tags',
    () async {
      final requests = <Uri>[];
      final api = transport(
        MockClient((request) async {
          requests.add(request.url);
          final body = request.url.path.endsWith('/contacts')
              ? '{"data":{"contacts":[],"total":0,"page":0,"limit":10}}'
              : '{"data":[]}';
          return http.Response(
            body,
            200,
            headers: {'content-type': 'application/json'},
          );
        }),
      );
      await Audience(api).contacts.list(
        const ContactListParams(
          page: 0,
          limit: 10,
          status: 'active',
          tags: ['alpha', 'two words'],
        ),
      );
      await Inbox(api).list(
        const InboxListParams(
          mailbox: 'a+b@example.test',
          folder: 'Inbox',
          page: 2,
          limit: 25,
          unreadOnly: true,
        ),
      );
      expect(requests[0].queryParameters, {
        'page': '0',
        'limit': '10',
        'status': 'active',
        'tags': 'alpha,two words',
      });
      expect(requests[1].queryParameters, {
        'mailbox': 'a+b@example.test',
        'folder': 'Inbox',
        'page': '2',
        'limit': '25',
        'unreadOnly': 'true',
      });
    },
  );
  test('membership removal encodes scoped ID and sends DELETE JSON', () async {
    final api = transport(
      MockClient((request) async {
        expect(request.method, 'DELETE');
        expect(
          request.url.toString(),
          endsWith('/audience/lists/list%2Fa/members'),
        );
        expect(request.headers['content-type'], startsWith('application/json'));
        expect(jsonDecode(request.body), {'contactId': 'contact/b'});
        return http.Response(
          '{"data":{"message":"removed"}}',
          200,
          headers: {'content-type': 'application/json'},
        );
      }),
    );
    await Audience(api).lists.members('list/a').remove('contact/b');
  });
  test('uppercase BCC UUID is normalized and returned', () async {
    const upper = 'ABCDEFAB-1234-4234-8234-ABCDEFABCDEF';
    const lower = 'abcdefab-1234-4234-8234-abcdefabcdef';
    final api = transport(
      MockClient((request) async {
        expect(jsonDecode(request.body)['requestId'], lower);
        return http.Response(
          '{"data":{"status":"queued"}}',
          200,
          headers: {'content-type': 'application/json'},
        );
      }),
    );
    final result = await Send(api).email(
      const SendParams(
        to: [],
        from: 'from',
        subject: 's',
        domainId: 'd',
        bcc: 'hidden',
        requestId: upper,
      ),
    );
    expect(result.requestId, lower);
  });
  test(
    'BCC API errors and invalid receipts preserve ID without another request',
    () async {
      const id = '12345678-1234-4234-8234-123456789abc';
      final responses = [
        () => http.Response(
          '{"error":"failed"}',
          503,
          headers: {'content-type': 'application/json'},
        ),
        () => http.Response(
          'bad receipt',
          200,
          headers: {'content-type': 'text/html'},
        ),
        () => http.Response(
          'not-json',
          200,
          headers: {'content-type': 'application/json'},
        ),
        () => http.Response(
          '{"data":{}}',
          302,
          headers: {'content-type': 'application/json'},
        ),
      ];
      for (final makeResponse in responses) {
        var calls = 0;
        final api = transport(
          MockClient((request) async {
            calls++;
            return makeResponse();
          }),
        );
        await expectLater(
          Send(api).email(
            const SendParams(
              to: [],
              from: 'from',
              subject: 's',
              domainId: 'd',
              bcc: 'hidden',
              requestId: id,
            ),
          ),
          throwsA(
            isA<ComposeRequestError>().having(
              (e) => e.requestId,
              'requestId',
              id,
            ),
          ),
        );
        expect(calls, 1);
      }
    },
  );
  test('address and localized union values are validated before IO', () async {
    var calls = 0;
    final api = transport(
      MockClient((request) async {
        calls++;
        return http.Response('{}', 200);
      }),
    );
    await expectLater(
      Send(api).email(
        const SendParams(to: [123], from: 'from', subject: 's', domainId: 'd'),
      ),
      throwsFormatException,
    );
    await expectLater(
      Inbox(api).saveDraft(const SaveDraftParams(mailbox: 'me', bcc: 12)),
      throwsFormatException,
    );
    await expectLater(
      Templates(api).create(
        const CreateTemplateParams(
          name: {'en': 2},
          subject: 's',
          mjmlBody: 'body',
          domainId: 'd',
        ),
      ),
      throwsFormatException,
    );
    expect(calls, 0);
    expect(
      () => Template.fromJson({
        'id': 't',
        'name': 42,
        'subject': 's',
        'mjmlBody': 'body',
        'createdAt': 'now',
        'updatedAt': 'now',
      }),
      throwsFormatException,
    );
  });
}
