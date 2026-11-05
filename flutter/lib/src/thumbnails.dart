import 'types/storage.dart';

const thumbnailPresets = <String, int>{
  'avatar': 128,
  'card': 500,
  'preview': 960,
  'hero': 1600,
};

String? pickThumbnailUrl(ThumbnailSourceMedia media, num targetPx) {
  final thumbnails = media.imageMeta?.thumbnails;
  if (media.type != 'image' ||
      thumbnails == null ||
      thumbnails.isEmpty ||
      (targetPx <= 0 || targetPx.isNaN)) {
    return media.url ?? media.downloadUrl;
  }
  final sorted = [...thumbnails]..sort((a, b) => a.width.compareTo(b.width));
  final fit = sorted.firstWhere(
    (t) => t.width >= targetPx,
    orElse: () => sorted.last,
  );
  if (fit.url?.isNotEmpty == true) return fit.url;
  final url = media.url;
  if (url != null && url.isNotEmpty) {
    final cleanUrl = url.split(RegExp(r'[?#]')).first;
    final slash = cleanUrl.lastIndexOf('/');
    if (slash >= 0) return cleanUrl.substring(0, slash + 1) + fit.fileName;
  }
  final download = media.downloadUrl;
  if (download != null && download.isNotEmpty) {
    return '$download${download.contains('?') ? '&' : '?'}quality=${fit.width}';
  }
  return null;
}

String? pickPresetThumbnailUrl(ThumbnailSourceMedia media, String preset) {
  final target = thumbnailPresets[preset];
  if (target == null) throw ArgumentError.value(preset, 'preset');
  return pickThumbnailUrl(media, target);
}
