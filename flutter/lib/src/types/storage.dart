import '../json.dart';

class Bucket {
  const Bucket({
    required this.id,
    required this.companyId,
    required this.name,
    required this.slug,
    this.description,
    required this.isPublic,
    required this.storageUsed,
    required this.fileCount,
    required this.createdAt,
    required this.updatedAt,
  });
  final String id;
  final String companyId;
  final String name;
  final String slug;
  final String? description;
  final bool isPublic;
  final int storageUsed;
  final int fileCount;
  final String createdAt;
  final String updatedAt;
  factory Bucket.fromJson(JsonMap json) => Bucket(
    id: json['id'] as String,
    companyId: json['companyId'] as String,
    name: json['name'] as String,
    slug: json['slug'] as String,
    description: json['description'] as String?,
    isPublic: json['isPublic'] as bool,
    storageUsed: json['storageUsed'] as int,
    fileCount: json['fileCount'] as int,
    createdAt: json['createdAt'] as String,
    updatedAt: json['updatedAt'] as String,
  );
  JsonMap toJson() => {
    'id': id,
    'companyId': companyId,
    'name': name,
    'slug': slug,
    if (description != null) 'description': description,
    'isPublic': isPublic,
    'storageUsed': storageUsed,
    'fileCount': fileCount,
    'createdAt': createdAt,
    'updatedAt': updatedAt,
  };
}

class CreateBucketParams {
  const CreateBucketParams({
    required this.name,
    this.slug,
    this.description,
    this.isPublic,
  });
  final String name;
  final String? slug;
  final String? description;
  final bool? isPublic;
  JsonMap toJson() => {
    'name': name,
    if (slug != null) 'slug': slug,
    if (description != null) 'description': description,
    if (isPublic != null) 'isPublic': isPublic,
  };
}

class UpdateBucketParams {
  const UpdateBucketParams({this.name, this.description, this.isPublic});
  final String? name;
  final PatchValue<String>? description;
  final bool? isPublic;
  JsonMap toJson() => {
    if (name != null) 'name': name,
    if (description != null) 'description': description!.value,
    if (isPublic != null) 'isPublic': isPublic,
  };
}

class MediaThumbnail {
  const MediaThumbnail({
    required this.width,
    required this.height,
    required this.fileName,
    required this.size,
    this.url,
  });
  final int width;
  final int height;
  final String fileName;
  final int size;
  final String? url;
  factory MediaThumbnail.fromJson(JsonMap json) => MediaThumbnail(
    width: json['width'] as int,
    height: json['height'] as int,
    fileName: json['fileName'] as String,
    size: json['size'] as int,
    url: json['url'] as String?,
  );
  JsonMap toJson() => {
    'width': width,
    'height': height,
    'fileName': fileName,
    'size': size,
    if (url != null) 'url': url,
  };
}

class MediaImageMeta {
  const MediaImageMeta({
    required this.width,
    required this.height,
    required this.orientation,
    required this.thumbnails,
  });
  final int width;
  final int height;
  final String orientation;
  final List<MediaThumbnail> thumbnails;
  factory MediaImageMeta.fromJson(JsonMap json) => MediaImageMeta(
    width: json['width'] as int,
    height: json['height'] as int,
    orientation: json['orientation'] as String,
    thumbnails: jsonList(json['thumbnails'], MediaThumbnail.fromJson),
  );
  JsonMap toJson() => {
    'width': width,
    'height': height,
    'orientation': orientation,
    'thumbnails': thumbnails.map((v) => v.toJson()).toList(),
  };
}

class MediaVideoVariant {
  const MediaVideoVariant({
    required this.height,
    required this.width,
    required this.fileName,
    required this.size,
    this.bitrate,
  });
  final int height;
  final int width;
  final String fileName;
  final int size;
  final int? bitrate;
  factory MediaVideoVariant.fromJson(JsonMap json) => MediaVideoVariant(
    height: json['height'] as int,
    width: json['width'] as int,
    fileName: json['fileName'] as String,
    size: json['size'] as int,
    bitrate: json['bitrate'] as int?,
  );
  JsonMap toJson() => {
    'height': height,
    'width': width,
    'fileName': fileName,
    'size': size,
    if (bitrate != null) 'bitrate': bitrate,
  };
}

class MediaVideoMeta {
  const MediaVideoMeta({
    required this.width,
    required this.height,
    required this.duration,
    required this.variants,
  });
  final int width;
  final int height;
  final num duration;
  final List<MediaVideoVariant> variants;
  factory MediaVideoMeta.fromJson(JsonMap json) => MediaVideoMeta(
    width: json['width'] as int,
    height: json['height'] as int,
    duration: json['duration'] as num,
    variants: jsonList(json['variants'], MediaVideoVariant.fromJson),
  );
  JsonMap toJson() => {
    'width': width,
    'height': height,
    'duration': duration,
    'variants': variants.map((v) => v.toJson()).toList(),
  };
}

class MediaProcessing {
  const MediaProcessing({
    required this.status,
    this.variantsTotal,
    this.variantsCompleted,
    this.error,
    this.startedAt,
    this.completedAt,
  });
  final String status;
  final int? variantsTotal;
  final int? variantsCompleted;
  final String? error;
  final String? startedAt;
  final String? completedAt;
  factory MediaProcessing.fromJson(JsonMap json) => MediaProcessing(
    status: json['status'] as String,
    variantsTotal: json['variantsTotal'] as int?,
    variantsCompleted: json['variantsCompleted'] as int?,
    error: json['error'] as String?,
    startedAt: json['startedAt'] as String?,
    completedAt: json['completedAt'] as String?,
  );
  JsonMap toJson() => {
    'status': status,
    if (variantsTotal != null) 'variantsTotal': variantsTotal,
    if (variantsCompleted != null) 'variantsCompleted': variantsCompleted,
    if (error != null) 'error': error,
    if (startedAt != null) 'startedAt': startedAt,
    if (completedAt != null) 'completedAt': completedAt,
  };
}

/// Minimal media shape accepted by thumbnail helpers.
class ThumbnailSourceMedia {
  const ThumbnailSourceMedia({
    required this.type,
    this.url,
    this.downloadUrl,
    this.imageMeta,
  });
  final String type;
  final String? url;
  final String? downloadUrl;
  final MediaImageMeta? imageMeta;
}

class Media implements ThumbnailSourceMedia {
  const Media({
    required this.id,
    required this.bucketId,
    required this.companyId,
    required this.fileName,
    required this.originalName,
    required this.type,
    required this.size,
    required this.mimeType,
    required this.folder,
    required this.uploadedBy,
    required this.tags,
    this.alt,
    this.caption,
    required this.isPublic,
    this.imageMeta,
    this.videoMeta,
    this.processing,
    this.url,
    this.downloadUrl,
    required this.createdAt,
    required this.updatedAt,
  });
  final String id;
  final String bucketId;
  final String companyId;
  final String fileName;
  final String originalName;
  @override
  final String type;
  final int size;
  final String mimeType;
  final String folder;
  final String uploadedBy;
  final List<String> tags;
  final String? alt;
  final String? caption;
  final bool isPublic;
  @override
  final MediaImageMeta? imageMeta;
  final MediaVideoMeta? videoMeta;
  final MediaProcessing? processing;
  @override
  final String? url;
  @override
  final String? downloadUrl;
  final String createdAt;
  final String updatedAt;
  factory Media.fromJson(JsonMap json) => Media(
    id: json['id'] as String,
    bucketId: json['bucketId'] as String,
    companyId: json['companyId'] as String,
    fileName: json['fileName'] as String,
    originalName: json['originalName'] as String,
    type: json['type'] as String,
    size: json['size'] as int,
    mimeType: json['mimeType'] as String,
    folder: json['folder'] as String,
    uploadedBy: json['uploadedBy'] as String,
    tags: (json['tags'] as List).cast<String>(),
    alt: json['alt'] as String?,
    caption: json['caption'] as String?,
    isPublic: json['isPublic'] as bool,
    imageMeta: json['imageMeta'] == null
        ? null
        : MediaImageMeta.fromJson(jsonObject(json['imageMeta'])),
    videoMeta: json['videoMeta'] == null
        ? null
        : MediaVideoMeta.fromJson(jsonObject(json['videoMeta'])),
    processing: json['processing'] == null
        ? null
        : MediaProcessing.fromJson(jsonObject(json['processing'])),
    url: json['url'] as String?,
    downloadUrl: json['downloadUrl'] as String?,
    createdAt: json['createdAt'] as String,
    updatedAt: json['updatedAt'] as String,
  );
  JsonMap toJson() => {
    'id': id,
    'bucketId': bucketId,
    'companyId': companyId,
    'fileName': fileName,
    'originalName': originalName,
    'type': type,
    'size': size,
    'mimeType': mimeType,
    'folder': folder,
    'uploadedBy': uploadedBy,
    'tags': tags,
    if (alt != null) 'alt': alt,
    if (caption != null) 'caption': caption,
    'isPublic': isPublic,
    if (imageMeta != null) 'imageMeta': imageMeta?.toJson(),
    if (videoMeta != null) 'videoMeta': videoMeta?.toJson(),
    if (processing != null) 'processing': processing?.toJson(),
    if (url != null) 'url': url,
    if (downloadUrl != null) 'downloadUrl': downloadUrl,
    'createdAt': createdAt,
    'updatedAt': updatedAt,
  };
}

class MediaListResult {
  const MediaListResult({
    required this.items,
    required this.total,
    required this.limit,
    required this.skip,
  });
  final List<Media> items;
  final int total;
  final int limit;
  final int skip;
  factory MediaListResult.fromJson(JsonMap json) => MediaListResult(
    items: jsonList(json['items'], Media.fromJson),
    total: json['total'] as int,
    limit: json['limit'] as int,
    skip: json['skip'] as int,
  );
  JsonMap toJson() => {
    'items': items.map((v) => v.toJson()).toList(),
    'total': total,
    'limit': limit,
    'skip': skip,
  };
}

class MediaListParams {
  const MediaListParams({this.type, this.folder, this.limit, this.skip});
  final String? type;
  final String? folder;
  final int? limit;
  final int? skip;
  JsonMap toJson() => {
    if (type != null) 'type': type,
    if (folder != null) 'folder': folder,
    if (limit != null) 'limit': limit,
    if (skip != null) 'skip': skip,
  };
}

class StorageQuota {
  const StorageQuota({
    required this.used,
    required this.limit,
    required this.mailUsed,
    this.planName,
  });
  final int used;
  final int limit;
  final int mailUsed;
  final String? planName;
  factory StorageQuota.fromJson(JsonMap json) => StorageQuota(
    used: json['used'] as int,
    limit: json['limit'] as int,
    mailUsed: json['mailUsed'] as int,
    planName: json['planName'] as String?,
  );
  JsonMap toJson() => {
    'used': used,
    'limit': limit,
    'mailUsed': mailUsed,
    if (planName != null) 'planName': planName,
  };
}

class StorageUsageBucket {
  const StorageUsageBucket({
    required this.id,
    required this.name,
    required this.slug,
    required this.storageUsed,
    required this.fileCount,
    required this.isPublic,
  });
  final String id;
  final String name;
  final String slug;
  final int storageUsed;
  final int fileCount;
  final bool isPublic;
  factory StorageUsageBucket.fromJson(JsonMap json) => StorageUsageBucket(
    id: json['id'] as String,
    name: json['name'] as String,
    slug: json['slug'] as String,
    storageUsed: json['storageUsed'] as int,
    fileCount: json['fileCount'] as int,
    isPublic: json['isPublic'] as bool,
  );
  JsonMap toJson() => {
    'id': id,
    'name': name,
    'slug': slug,
    'storageUsed': storageUsed,
    'fileCount': fileCount,
    'isPublic': isPublic,
  };
}

class StorageUsageByType {
  const StorageUsageByType({
    required this.type,
    required this.count,
    required this.bytes,
  });
  final String type;
  final int count;
  final int bytes;
  factory StorageUsageByType.fromJson(JsonMap json) => StorageUsageByType(
    type: json['type'] as String,
    count: json['count'] as int,
    bytes: json['bytes'] as int,
  );
  JsonMap toJson() => {'type': type, 'count': count, 'bytes': bytes};
}

class StorageUsage {
  const StorageUsage({
    required this.quota,
    required this.buckets,
    required this.byType,
  });
  final StorageQuota quota;
  final List<StorageUsageBucket> buckets;
  final List<StorageUsageByType> byType;
  factory StorageUsage.fromJson(JsonMap json) => StorageUsage(
    quota: StorageQuota.fromJson(jsonObject(json['quota'])),
    buckets: jsonList(json['buckets'], StorageUsageBucket.fromJson),
    byType: jsonList(json['byType'], StorageUsageByType.fromJson),
  );
  JsonMap toJson() => {
    'quota': quota.toJson(),
    'buckets': buckets.map((v) => v.toJson()).toList(),
    'byType': byType.map((v) => v.toJson()).toList(),
  };
}

class UploadMediaParams {
  const UploadMediaParams({
    required this.body,
    this.filename,
    this.mimeType,
    this.folder,
    this.isPublic,
    this.alt,
    this.caption,
    this.tags,
    this.compressVideo,
    this.transcodeVideo,
  });
  final List<int> body;
  final String? filename, mimeType, folder, alt, caption;
  final bool? isPublic, compressVideo, transcodeVideo;
  final List<String>? tags;
}
