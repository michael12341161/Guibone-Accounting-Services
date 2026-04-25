<?php

function monitoring_read_local_jwt_config(): array
{
    static $config = null;
    if ($config !== null) {
        return $config;
    }

    $config = [];
    if (is_file(MONITORING_JWT_LOCAL_CONFIG_FILE)) {
        $loaded = require MONITORING_JWT_LOCAL_CONFIG_FILE;
        if (is_array($loaded)) {
            $config = $loaded;
        }
    }

    return $config;
}

function monitoring_read_auth_config_value(string $key, $default = null)
{
    $envValue = getenv($key);
    if ($envValue !== false && $envValue !== null && $envValue !== '') {
        return $envValue;
    }

    if (isset($_SERVER[$key]) && $_SERVER[$key] !== '') {
        return $_SERVER[$key];
    }

    $localConfig = monitoring_read_local_jwt_config();
    if (array_key_exists($key, $localConfig) && $localConfig[$key] !== '') {
        return $localConfig[$key];
    }

    return $default;
}

function monitoring_read_persisted_jwt_secret(): string
{
    if (!is_file(MONITORING_JWT_SECRET_FILE)) {
        return '';
    }

    $loaded = require MONITORING_JWT_SECRET_FILE;
    if (is_string($loaded)) {
        return trim($loaded);
    }

    if (is_array($loaded) && isset($loaded['secret'])) {
        return trim((string)$loaded['secret']);
    }

    return '';
}

function monitoring_generate_and_persist_jwt_secret(): string
{
    $dir = dirname(MONITORING_JWT_SECRET_FILE);
    if (!is_dir($dir) && !mkdir($dir, 0755, true) && !is_dir($dir)) {
        throw new RuntimeException('Unable to create JWT secret directory.');
    }

    $secret = bin2hex(random_bytes(32));
    $contents = "<?php\nreturn [\n    'secret' => " . var_export($secret, true) . ",\n];\n";
    if (file_put_contents(MONITORING_JWT_SECRET_FILE, $contents, LOCK_EX) === false) {
        throw new RuntimeException('Unable to write JWT secret file.');
    }

    return $secret;
}

function monitoring_get_jwt_secret(): string
{
    static $secret = null;
    if ($secret !== null) {
        return $secret;
    }

    $configuredSecret = trim((string)monitoring_read_auth_config_value('MONITORING_JWT_SECRET', ''));
    if ($configuredSecret !== '') {
        $secret = $configuredSecret;
        return $secret;
    }

    $persistedSecret = monitoring_read_persisted_jwt_secret();
    if ($persistedSecret !== '') {
        $secret = $persistedSecret;
        return $secret;
    }

    $secret = monitoring_generate_and_persist_jwt_secret();
    return $secret;
}

function monitoring_get_jwt_issuer(): string
{
    $configuredIssuer = trim((string)monitoring_read_auth_config_value('MONITORING_JWT_ISSUER', ''));
    if ($configuredIssuer !== '') {
        return $configuredIssuer;
    }

    $scheme = monitoring_is_https() ? 'https' : 'http';
    $host = trim((string)($_SERVER['HTTP_HOST'] ?? 'localhost'));
    return $scheme . '://' . $host;
}

function monitoring_base64url_encode(string $value): string
{
    return rtrim(strtr(base64_encode($value), '+/', '-_'), '=');
}

function monitoring_base64url_decode(string $value): ?string
{
    $normalized = strtr($value, '-_', '+/');
    $padding = strlen($normalized) % 4;
    if ($padding !== 0) {
        $normalized .= str_repeat('=', 4 - $padding);
    }

    $decoded = base64_decode($normalized, true);
    return $decoded === false ? null : $decoded;
}

function monitoring_json_encode_compact(array $payload): string
{
    $encoded = json_encode($payload, JSON_UNESCAPED_SLASHES);
    if (!is_string($encoded)) {
        throw new RuntimeException('Unable to encode JWT payload.');
    }

    return $encoded;
}

function monitoring_get_authorization_header(): string
{
    $candidates = [
        $_SERVER['HTTP_AUTHORIZATION'] ?? null,
        $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? null,
    ];

    if (function_exists('getallheaders')) {
        $headers = getallheaders();
        if (is_array($headers)) {
            foreach ($headers as $name => $value) {
                if (strcasecmp((string)$name, 'Authorization') === 0) {
                    $candidates[] = $value;
                }
            }
        }
    }

    foreach ($candidates as $candidate) {
        $value = trim((string)$candidate);
        if ($value !== '') {
            return $value;
        }
    }

    return '';
}

function monitoring_get_bearer_token(): string
{
    $authorization = monitoring_get_authorization_header();
    if ($authorization === '') {
        return '';
    }

    if (preg_match('/^\s*Bearer\s+(.+?)\s*$/i', $authorization, $matches) !== 1) {
        return '';
    }

    return trim((string)($matches[1] ?? ''));
}

function monitoring_build_jwt_payload(array $user, ?int $issuedAtOverride = null): array
{
    $preparedUser = monitoring_prepare_session_user($user);
    $issuedAt = ($issuedAtOverride !== null && $issuedAtOverride > 0) ? $issuedAtOverride : time();
    $timeoutMinutes = monitoring_normalize_session_timeout_minutes(
        $preparedUser['security_settings']['sessionTimeoutMinutes'] ?? null
    );

    $payload = [
        'iss' => monitoring_get_jwt_issuer(),
        'sub' => (string)$preparedUser['id'],
        'iat' => $issuedAt,
        'nbf' => max(0, $issuedAt - MONITORING_JWT_LEEWAY_SECONDS),
        'exp' => $issuedAt + ($timeoutMinutes * 60),
        'jti' => bin2hex(random_bytes(16)),
        'user' => $preparedUser,
    ];
    return $payload;
}

function monitoring_encode_jwt(array $payload): string
{
    $header = ['alg' => MONITORING_JWT_ALGORITHM, 'typ' => 'JWT'];
    $encodedHeader = monitoring_base64url_encode(monitoring_json_encode_compact($header));
    $encodedPayload = monitoring_base64url_encode(monitoring_json_encode_compact($payload));
    $signatureInput = $encodedHeader . '.' . $encodedPayload;
    $signature = hash_hmac('sha256', $signatureInput, monitoring_get_jwt_secret(), true);

    return $signatureInput . '.' . monitoring_base64url_encode($signature);
}

function monitoring_issue_jwt_for_user(array $user, ?int $issuedAtOverride = null): string
{
    return monitoring_encode_jwt(monitoring_build_jwt_payload($user, $issuedAtOverride));
}

function monitoring_clear_auth_cookie(): void
{
    setcookie(
        'monitoring_auth_jwt',
        '',
        [
            'expires' => time() - 42000,
            'path' => '/',
            'secure' => monitoring_is_https(),
            'httponly' => true,
            'samesite' => 'Lax',
        ]
    );

    unset($_COOKIE['monitoring_auth_jwt']);
}

function monitoring_queue_jwt_response_header(array $user, ?int $issuedAtOverride = null): void
{
    $token = monitoring_issue_jwt_for_user($user, $issuedAtOverride);
    header(MONITORING_JWT_RESPONSE_HEADER . ': ' . $token);
    
    setcookie(
        'monitoring_auth_jwt',
        $token,
        [
            'expires' => 0, // Session cookie
            'path' => '/',
            'secure' => monitoring_is_https(),
            'httponly' => true,
            'samesite' => 'Lax'
        ]
    );
}

function monitoring_decode_jwt(string $token): ?array
{
    $parts = explode('.', $token);
    if (count($parts) !== 3) {
        return null;
    }

    [$encodedHeader, $encodedPayload, $encodedSignature] = $parts;
    $decodedHeaderJson = monitoring_base64url_decode($encodedHeader);
    $decodedPayloadJson = monitoring_base64url_decode($encodedPayload);
    $decodedSignature = monitoring_base64url_decode($encodedSignature);
    if ($decodedHeaderJson === null || $decodedPayloadJson === null || $decodedSignature === null) {
        return null;
    }

    $header = json_decode($decodedHeaderJson, true);
    $payload = json_decode($decodedPayloadJson, true);
    if (!is_array($header) || !is_array($payload)) {
        return null;
    }

    if (strcasecmp((string)($header['alg'] ?? ''), MONITORING_JWT_ALGORITHM) !== 0) {
        return null;
    }

    $signatureInput = $encodedHeader . '.' . $encodedPayload;
    $expectedSignature = hash_hmac('sha256', $signatureInput, monitoring_get_jwt_secret(), true);
    if (!hash_equals($expectedSignature, $decodedSignature)) {
        return null;
    }

    $now = time();
    $issuer = trim((string)($payload['iss'] ?? ''));
    if ($issuer !== '' && $issuer !== monitoring_get_jwt_issuer()) {
        return null;
    }

    $notBefore = isset($payload['nbf']) ? (int)$payload['nbf'] : 0;
    if ($notBefore > 0 && ($notBefore - MONITORING_JWT_LEEWAY_SECONDS) > $now) {
        return null;
    }

    $expiresAt = isset($payload['exp']) ? (int)$payload['exp'] : 0;
    if ($expiresAt <= 0 || $now >= $expiresAt) {
        return null;
    }

    if (!is_array($payload['user'] ?? null)) {
        return null;
    }

    $preparedUser = monitoring_prepare_session_user($payload['user']);
    if ($preparedUser['id'] <= 0 || $preparedUser['role_id'] <= 0) {
        return null;
    }

    $subject = trim((string)($payload['sub'] ?? ''));
    if ($subject !== '' && $subject !== (string)$preparedUser['id']) {
        return null;
    }

    return [
        'user' => $preparedUser,
        'issued_at' => isset($payload['iat']) ? (int)$payload['iat'] : 0,
    ];
}

function monitoring_persist_session_user(array $user, bool $regenerateId = true, ?int $lastActivityAt = null): array
{
    monitoring_start_session();
    if ($regenerateId) {
        session_regenerate_id(true);
    }

    $preparedUser = monitoring_prepare_session_user($user);
    $preparedUser['session_timeout_minutes'] = monitoring_normalize_session_timeout_minutes(
        $preparedUser['security_settings']['sessionTimeoutMinutes'] ?? null
    );
    $preparedUser['last_activity_at'] = ($lastActivityAt !== null && $lastActivityAt > 0)
        ? $lastActivityAt
        : time();
    $_SESSION[MONITORING_SESSION_KEY] = $preparedUser;

    return $preparedUser;
}

function monitoring_read_session_user_from_session(bool $enforceTimeout = true, bool $issueJwt = true): ?array
{
    monitoring_start_session();
    $raw = $_SESSION[MONITORING_SESSION_KEY] ?? null;
    if (!is_array($raw)) {
        return null;
    }

    $userId = isset($raw['id']) ? (int)$raw['id'] : 0;
    $roleId = isset($raw['role_id']) ? (int)$raw['role_id'] : 0;
    if ($userId <= 0 || $roleId <= 0) {
        unset($_SESSION[MONITORING_SESSION_KEY]);
        return null;
    }

    $raw = monitoring_refresh_auth_user_security_settings($raw);
    $refreshActivity = monitoring_request_refreshes_session_activity();
    $timeoutMinutes = monitoring_normalize_session_timeout_minutes($raw['session_timeout_minutes'] ?? null);
    $lastActivityAt = isset($raw['last_activity_at']) ? (int)$raw['last_activity_at'] : 0;
    if ($enforceTimeout && $lastActivityAt > 0 && (time() - $lastActivityAt) >= ($timeoutMinutes * 60)) {
        monitoring_destroy_session();
        return null;
    }

    $activityTimestamp = $lastActivityAt > 0 ? $lastActivityAt : time();
    if ($refreshActivity) {
        $activityTimestamp = time();
        $_SESSION[MONITORING_SESSION_KEY]['last_activity_at'] = $activityTimestamp;
    }

    $user = monitoring_prepare_session_user($_SESSION[MONITORING_SESSION_KEY]);
    $user['session_timeout_minutes'] = $timeoutMinutes;
    $user['last_activity_at'] = $activityTimestamp;

    if ($issueJwt) {
        monitoring_queue_jwt_response_header($user, $activityTimestamp);
    }

    return $user;
}

function monitoring_read_session_user_from_jwt(): ?array
{
    $token = monitoring_get_bearer_token();
    if ($token === '') {
        $token = $_COOKIE['monitoring_auth_jwt'] ?? '';
    }
    
    if ($token === '') {
        return null;
    }

    $decoded = monitoring_decode_jwt($token);
    if (!is_array($decoded) || !is_array($decoded['user'] ?? null)) {
        return null;
    }

    $decoded['user'] = monitoring_refresh_auth_user_security_settings($decoded['user'], false);
    $timeoutMinutes = monitoring_normalize_session_timeout_minutes(
        $decoded['user']['security_settings']['sessionTimeoutMinutes'] ?? null
    );
    $issuedAt = isset($decoded['issued_at']) ? (int)$decoded['issued_at'] : 0;
    if ($issuedAt > 0 && ($issuedAt + ($timeoutMinutes * 60)) <= time()) {
        monitoring_destroy_session();
        return null;
    }

    $refreshActivity = monitoring_request_refreshes_session_activity();
    $activityTimestamp = $issuedAt > 0 ? $issuedAt : time();
    if ($refreshActivity) {
        $activityTimestamp = time();
    }

    $preparedUser = monitoring_persist_session_user($decoded['user'], false, $activityTimestamp);
    $preparedUser['last_activity_at'] = $activityTimestamp;

    monitoring_queue_jwt_response_header($preparedUser, $activityTimestamp);
    return $preparedUser;
}
