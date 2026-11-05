import 'package:flutter_test/flutter_test.dart';
import 'package:sentroy_client_sdk/src/thumbnails.dart';
import 'package:sentroy_client_sdk/src/types/storage.dart';

Media media({String? url, String? downloadUrl}) => Media(
  id: '1',
  bucketId: 'b',
  companyId: 'c',
  fileName: 'a.jpg',
  originalName: 'a.jpg',
  type: 'image',
  size: 3,
  mimeType: 'image/jpeg',
  folder: '',
  uploadedBy: 'u',
  tags: const [],
  isPublic: true,
  createdAt: '',
  updatedAt: '',
  url: url,
  downloadUrl: downloadUrl,
  imageMeta: const MediaImageMeta(
    width: 1000,
    height: 1000,
    orientation: 'square',
    thumbnails: [
      MediaThumbnail(width: 500, height: 500, fileName: '500.jpg', size: 2),
      MediaThumbnail(width: 128, height: 128, fileName: '128.jpg', size: 1),
    ],
  ),
);
void main() {
  test('chooses smallest covering thumbnail without mutating list', () {
    final m = media(url: 'https://cdn/b/a.jpg');
    expect(pickThumbnailUrl(m, 129), 'https://cdn/b/500.jpg');
    expect(pickPresetThumbnailUrl(m, 'avatar'), 'https://cdn/b/128.jpg');
    expect(m.imageMeta!.thumbnails.first.width, 500);
  });
  test('uses private download endpoint and existing query', () {
    expect(
      pickThumbnailUrl(media(downloadUrl: '/file?token=a'), 999),
      '/file?token=a&quality=500',
    );
  });
  test('URL queries cannot move the thumbnail base directory', () {
    final original = media(
      url: 'https://cdn/b/a.jpg?redirect=https://other/path#x/y',
    );
    final minimal = ThumbnailSourceMedia(
      type: original.type,
      url: original.url,
      imageMeta: original.imageMeta,
    );
    expect(pickThumbnailUrl(minimal, 129), 'https://cdn/b/500.jpg');
  });
}
