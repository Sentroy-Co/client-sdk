import '../http.dart';
import '../json.dart';
import '../types/storage.dart';

class Buckets {
  const Buckets(this._http);
  final SentroyHttp _http;
  Future<List<Bucket>> list() async =>
      jsonList(await _http.get('/buckets'), Bucket.fromJson);
  Future<Bucket> get(String slug) async => Bucket.fromJson(
    jsonObject(await _http.get('/buckets/${pathSegment(slug)}')),
  );
  Future<Bucket> create(CreateBucketParams params) async => Bucket.fromJson(
    jsonObject(await _http.post('/buckets', params.toJson())),
  );
  Future<Bucket> update(String slug, UpdateBucketParams params) async =>
      Bucket.fromJson(
        jsonObject(
          await _http.patch('/buckets/${pathSegment(slug)}', params.toJson()),
        ),
      );
  Future<void> delete(String slug, {bool? force}) async {
    await _http.delete(
      '/buckets/${pathSegment(slug)}',
      query: force == true ? {'force': 'true'} : null,
    );
  }
}

class MediaResource {
  const MediaResource(this._http);
  final SentroyHttp _http;
  String _base(String bucket) => '/buckets/${pathSegment(bucket)}/media';
  Future<MediaListResult> list(
    String bucketSlug, [
    MediaListParams? params,
  ]) async => MediaListResult.fromJson(
    jsonObject(await _http.get(_base(bucketSlug), query: params?.toJson())),
  );
  Future<Media> get(String bucketSlug, String mediaId) async => Media.fromJson(
    jsonObject(await _http.get('${_base(bucketSlug)}/${pathSegment(mediaId)}')),
  );
  Future<Media> upload(String bucketSlug, UploadMediaParams params) async {
    final fields = <String, String>{};
    if (params.folder?.isNotEmpty == true) fields['folder'] = params.folder!;
    if (params.isPublic != null) fields['public'] = '${params.isPublic}';
    if (params.alt?.isNotEmpty == true) fields['alt'] = params.alt!;
    if (params.caption?.isNotEmpty == true) fields['caption'] = params.caption!;
    if (params.tags?.isNotEmpty == true) {
      fields['tags'] = params.tags!.join(',');
    }
    if (params.compressVideo == true) fields['compressVideo'] = 'true';
    if (params.transcodeVideo == true) fields['transcodeVideo'] = 'true';
    return Media.fromJson(
      jsonObject(
        await _http.multipart(
          _base(bucketSlug),
          bytes: params.body,
          filename: params.filename ?? 'upload.bin',
          mimeType: params.mimeType,
          fields: fields,
        ),
      ),
    );
  }

  Future<void> delete(String bucketSlug, String mediaId) async {
    await _http.delete('${_base(bucketSlug)}/${pathSegment(mediaId)}');
  }

  Future<List<int>> download(
    String bucketSlug,
    String mediaId, {
    Object? quality,
    int? maxBytes,
  }) async {
    if (quality != null && quality != 'original' && quality is! num) {
      throw ArgumentError.value(
        quality,
        'quality',
        'Must be a number or original',
      );
    }
    return _http.getBytes(
      '${_base(bucketSlug)}/${pathSegment(mediaId)}/download',
      query: quality is num && quality != 0 ? {'quality': '$quality'} : null,
      maxBytes: maxBytes,
    );
  }
}

class Storage {
  const Storage(this._http);
  final SentroyHttp _http;
  Future<StorageQuota> quota() async =>
      StorageQuota.fromJson(jsonObject(await _http.get('/storage-quota')));
  Future<StorageUsage> usage() async =>
      StorageUsage.fromJson(jsonObject(await _http.get('/usage')));
}
