import 'package:flutter_test/flutter_test.dart';
import 'package:sentroy_client_sdk/src/json.dart';
import 'package:sentroy_client_sdk/src/types/whatsapp.dart';

void main() {
  test('audience payload supports phone strings and variable entries', () {
    final body = CreateWhatsAppAudienceParams(
      name: 'A',
      entries: [
        '+100',
        WhatsAppAudienceEntry(phone: '+200', variables: {'name': 'Ada'}),
      ],
    ).toJson();
    expect(body['entries'], [
      '+100',
      {
        'phone': '+200',
        'variables': {'name': 'Ada'},
      },
    ]);
  });
  test('template updates preserve null clears', () {
    expect(
      const UpdateWhatsAppTemplateParams(mediaUrl: PatchValue(null)).toJson(),
      {'mediaUrl': null},
    );
    expect(const UpdateWhatsAppTemplateParams().toJson(), isEmpty);
  });
  test('send results parse individual recipients', () {
    final result = WhatsAppSendResult.fromJson({
      'total': 1,
      'sent': 0,
      'failed': 1,
      'results': [
        {'to': '+100', 'status': 'failed', 'error': 'unavailable'},
      ],
    });
    expect(result.results.single.error, 'unavailable');
  });
}
