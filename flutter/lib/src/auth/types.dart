import '../json.dart';

class SentroyAuthUser {
  SentroyAuthUser({
    required this.id,
    required this.authProjectId,
    required this.email,
    required this.emailVerified,
    this.displayName,
    this.image,
    this.metadata = const {},
    this.lastLoginAt,
    required this.createdAt,
    required this.updatedAt,
  });
  final String id, authProjectId, email, createdAt, updatedAt;
  final bool emailVerified;
  final String? displayName, image, lastLoginAt;
  final JsonMap metadata;
  factory SentroyAuthUser.fromJson(JsonMap j) => SentroyAuthUser(
    id: j['id'] as String,
    authProjectId: j['authProjectId'] as String,
    email: j['email'] as String,
    emailVerified: j['emailVerified'] as bool,
    displayName: j['displayName'] as String?,
    image: j['image'] as String?,
    metadata: j['metadata'] == null ? {} : jsonObject(j['metadata']),
    lastLoginAt: j['lastLoginAt'] as String?,
    createdAt: j['createdAt'] as String,
    updatedAt: j['updatedAt'] as String,
  );
  JsonMap toJson() => {
    'id': id,
    'authProjectId': authProjectId,
    'email': email,
    'emailVerified': emailVerified,
    'displayName': displayName,
    'image': image,
    'metadata': metadata,
    'lastLoginAt': lastLoginAt,
    'createdAt': createdAt,
    'updatedAt': updatedAt,
  };
}

class AuthSession {
  const AuthSession({
    required this.accessToken,
    required this.refreshToken,
    required this.user,
  });
  final String accessToken, refreshToken;
  final SentroyAuthUser user;
  factory AuthSession.fromJson(JsonMap j) => AuthSession(
    accessToken: j['accessToken'] as String,
    refreshToken: j['refreshToken'] as String,
    user: SentroyAuthUser.fromJson(jsonObject(j['user'])),
  );
  JsonMap toJson() => {
    'accessToken': accessToken,
    'refreshToken': refreshToken,
    'user': user.toJson(),
  };
}

class SignInRequest {
  const SignInRequest({
    required this.email,
    required this.password,
    this.rememberMe,
  });
  final String email, password;
  final bool? rememberMe;
  JsonMap toJson() => {
    'email': email,
    'password': password,
    if (rememberMe != null) 'rememberMe': rememberMe,
  };
}

class SignUpRequest {
  const SignUpRequest({
    required this.email,
    required this.password,
    this.displayName,
    this.metadata,
  });
  final String email, password;
  final String? displayName;
  final JsonMap? metadata;
  JsonMap toJson() => {
    'email': email,
    'password': password,
    if (displayName != null) 'displayName': displayName,
    if (metadata != null) 'metadata': metadata,
  };
}

class MfaVerifyRequest {
  const MfaVerifyRequest({
    required this.mfaToken,
    this.code,
    this.recoveryCode,
  });
  final String mfaToken;
  final String? code, recoveryCode;
  JsonMap toJson() => {
    'mfaToken': mfaToken,
    if (code != null) 'code': code,
    if (recoveryCode != null) 'recoveryCode': recoveryCode,
  };
}

class AuthTokensResponse {
  const AuthTokensResponse({
    required this.accessToken,
    required this.refreshToken,
    required this.expiresIn,
    required this.tokenType,
  });
  final String accessToken, refreshToken, tokenType;
  final int expiresIn;
  factory AuthTokensResponse.fromJson(JsonMap j) => AuthTokensResponse(
    accessToken: j['accessToken'] as String,
    refreshToken: j['refreshToken'] as String,
    expiresIn: j['expiresIn'] as int,
    tokenType: j['tokenType'] as String,
  );
}

class LoginResponse extends AuthTokensResponse {
  const LoginResponse({
    required this.user,
    required super.accessToken,
    required super.refreshToken,
    required super.expiresIn,
    required super.tokenType,
  });
  final SentroyAuthUser user;
  factory LoginResponse.fromJson(JsonMap j) => LoginResponse(
    user: SentroyAuthUser.fromJson(jsonObject(j['user'])),
    accessToken: j['accessToken'] as String,
    refreshToken: j['refreshToken'] as String,
    expiresIn: j['expiresIn'] as int,
    tokenType: j['tokenType'] as String,
  );
  AuthSession get session => AuthSession(
    accessToken: accessToken,
    refreshToken: refreshToken,
    user: user,
  );
}

class SignupResponse {
  const SignupResponse({
    required this.user,
    this.accessToken,
    this.refreshToken,
    this.expiresIn,
    this.tokenType,
    this.emailVerificationRequired,
  });
  final SentroyAuthUser user;
  final String? accessToken, refreshToken, tokenType;
  final int? expiresIn;
  final bool? emailVerificationRequired;
  factory SignupResponse.fromJson(JsonMap j) => SignupResponse(
    user: SentroyAuthUser.fromJson(jsonObject(j['user'])),
    accessToken: j['accessToken'] as String?,
    refreshToken: j['refreshToken'] as String?,
    expiresIn: j['expiresIn'] as int?,
    tokenType: j['tokenType'] as String?,
    emailVerificationRequired: j['emailVerificationRequired'] as bool?,
  );
}

class MfaChallengeResponse {
  const MfaChallengeResponse({
    required this.mfaToken,
    required this.factorType,
  });
  final String mfaToken, factorType;
  factory MfaChallengeResponse.fromJson(JsonMap j) => MfaChallengeResponse(
    mfaToken: j['mfaToken'] as String,
    factorType: j['factorType'] as String,
  );
}

class LoginOutcome {
  const LoginOutcome.tokens(this.tokens) : mfa = null;
  const LoginOutcome.mfa(this.mfa) : tokens = null;
  final LoginResponse? tokens;
  final MfaChallengeResponse? mfa;
  String get kind => mfa == null ? 'tokens' : 'mfa';
}

class SessionSummary {
  SessionSummary.fromJson(JsonMap j)
    : id = j['id'] as String,
      refreshTokenPrefix = j['refreshTokenPrefix'] as String,
      userAgent = j['userAgent'] as String?,
      ip = j['ip'] as String?,
      expiresAt = j['expiresAt'] as String,
      createdAt = j['createdAt'] as String;
  final String id, refreshTokenPrefix, expiresAt, createdAt;
  final String? userAgent, ip;
}

class ActivityEntry {
  ActivityEntry.fromJson(JsonMap j)
    : id = j['id'] as String,
      action = j['action'] as String,
      ipAddress = j['ipAddress'] as String?,
      createdAt = j['createdAt'] as String,
      details = j['details'] == null ? null : jsonObject(j['details']);
  final String id, action, createdAt;
  final String? ipAddress;
  final JsonMap? details;
}

class MfaStatus {
  MfaStatus.fromJson(JsonMap j)
    : enrolled = j['enrolled'] as bool,
      factorType = j['factorType'] as String?,
      verifiedAt = j['verifiedAt'] as String?,
      recoveryCodesRemaining = j['recoveryCodesRemaining'] as int?;
  final bool enrolled;
  final String? factorType, verifiedAt;
  final int? recoveryCodesRemaining;
}

class MfaEnrollResponse {
  MfaEnrollResponse.fromJson(JsonMap j)
    : secret = j['secret'] as String,
      otpauthUri = j['otpauthUri'] as String;
  final String secret, otpauthUri;
}

class MfaVerifyEnrollmentResponse {
  MfaVerifyEnrollmentResponse.fromJson(JsonMap j)
    : enrolled = j['enrolled'] as bool,
      recoveryCodes = List<String>.from(j['recoveryCodes'] as List);
  final bool enrolled;
  final List<String> recoveryCodes;
}

class PasskeySummary {
  PasskeySummary.fromJson(JsonMap j)
    : id = j['id'] as String,
      credentialIdPrefix = j['credentialIdPrefix'] as String,
      deviceName = j['deviceName'] as String?,
      transports = List<String>.from(j['transports'] as List),
      lastUsedAt = j['lastUsedAt'] as String?,
      createdAt = j['createdAt'] as String;
  final String id, credentialIdPrefix, createdAt;
  final String? deviceName, lastUsedAt;
  final List<String> transports;
}

class PasskeyChallenge {
  PasskeyChallenge.fromJson(JsonMap j)
    : options = jsonObject(j['options']),
      challengeToken = j['challengeToken'] as String;
  final JsonMap options;
  final String challengeToken;
}

enum SocialProvider { google, github, facebook, microsoft, twitter, apple }
