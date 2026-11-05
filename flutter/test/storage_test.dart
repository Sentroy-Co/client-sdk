import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:sentroy_client_sdk/src/http.dart';
import 'package:sentroy_client_sdk/src/resources/storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sentroy_client_sdk/src/json.dart';
import 'package:sentroy_client_sdk/src/types/storage.dart';

void main() {
  test('bucket patches distinguish an omitted description from a clear', () {
    expect(const UpdateBucketParams().toJson(), isEmpty);
    expect(
      const UpdateBucketParams(
        description: PatchValue(null),
        isPublic: false,
      ).toJson(),
      {'description': null, 'isPublic': false},
    );
  });
  test('usage parses nested quota and breakdown', () {
    final usage = StorageUsage.fromJson({
      'quota': {'used': 12, 'limit': 100, 'mailUsed': 3, 'planName': 'pro'},
      'buckets': [
        {
          'id': '1',
          'name': 'N',
          'slug': 'n',
          'storageUsed': 12,
          'fileCount': 1,
          'isPublic': false,
        },
      ],
      'byType': [
        {'type': 'image', 'count': 1, 'bytes': 12},
      ],
    });
    expect(usage.quota.planName, 'pro');
    expect(usage.buckets.single.storageUsed, 12);
    expect(usage.toJson()['byType'], [
      {'type': 'image', 'count': 1, 'bytes': 12},
    ]);
  });
  test(
    'media upload sends multipart flags and download sends quality',
    () async {
      final requests = <http.Request>[];
      final client = MockClient((request) async {
        requests.add(request);
        if (request.url.path.endsWith('/download')) {
          return http.Response.bytes([0, 128, 255], 200);
        }
        return http.Response(
          jsonEncode({
            'data': {
              'id': 'i',
              'bucketId': 'b',
              'companyId': 'c',
              'fileName': 'a',
              'originalName': 'a',
              'type': 'video',
              'size': 1,
              'mimeType': 'video/mp4',
              'folder': '',
              'uploadedBy': 'u',
              'tags': [],
              'isPublic': false,
              'createdAt': '',
              'updatedAt': '',
            },
          }),
          200,
          headers: {'content-type': 'application/json'},
        );
      });
      final resource = MediaResource(
        SentroyHttp(baseUrl: Uri.parse('https://example.test'), client: client),
      );
      await resource.upload(
        'my bucket',
        const UploadMediaParams(
          body: [1, 2],
          filename: 'a.mp4',
          isPublic: false,
          tags: ['a', 'b'],
          compressVideo: true,
          transcodeVideo: true,
        ),
      );
      expect(requests.first.body, contains('name="public"'));
      expect(requests.first.body, contains('name="compressVideo"'));
      expect(requests.first.body, contains('name="transcodeVideo"'));
      expect(requests.first.body, contains('a,b'));
      expect(await resource.download('my bucket', 'id', quality: 500), [
        0,
        128,
        255,
      ]);
      expect(requests.last.url.queryParameters['quality'], '500');
      await resource.download('my bucket', 'id', quality: 'original');
      expect(requests.last.url.queryParameters, isEmpty);
    },
  );
}
