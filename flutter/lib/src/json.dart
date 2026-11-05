/// JSON object returned by the Sentroy API.
typedef JsonMap = Map<String, dynamic>;

/// An explicit nullable patch. A null wrapper omits the field; this wrapper
/// with a null value clears it.
class PatchValue<T> {
  const PatchValue(this.value);
  final T? value;
}

JsonMap jsonObject(dynamic value) {
  if (value is Map<String, dynamic>) return value;
  if (value is Map) return Map<String, dynamic>.from(value);
  throw const FormatException('Expected a JSON object');
}

List<T> jsonList<T>(dynamic value, T Function(JsonMap) decode) {
  if (value is! List) throw const FormatException('Expected a JSON array');
  return value.map((item) => decode(jsonObject(item))).toList(growable: false);
}

/// Encode one route segment without permitting URL dot-segment normalization.
String pathSegment(String value) {
  if (value.isEmpty ||
      value == '.' ||
      value == '..' ||
      value.runes.any((c) => c < 32 || c == 127)) {
    throw ArgumentError('Invalid path segment');
  }
  return Uri.encodeComponent(value);
}
