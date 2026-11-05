/// API or transport failure. Bodies may contain private data; toString omits them.
class SentroyException implements Exception {
  const SentroyException(
    this.message, {
    this.statusCode,
    this.body,
    this.cause,
  });
  final String message;
  final int? statusCode;
  final dynamic body;
  final Object? cause;
  @override
  String toString() =>
      'SentroyException${statusCode == null ? '' : ' ($statusCode)'}: $message';
}

class ComposeRequestError extends SentroyException {
  ComposeRequestError(this.requestId, Object cause)
    : super(
        'Compose outcome requires recovery using request $requestId',
        statusCode: cause is SentroyException ? cause.statusCode : null,
        body: cause is SentroyException ? cause.body : null,
        cause: cause,
      );
  final String requestId;
}

class SentroyAuthException extends SentroyException {
  const SentroyAuthException(this.code, super.description, {super.statusCode});
  final String code;
  String get description => message;
}
