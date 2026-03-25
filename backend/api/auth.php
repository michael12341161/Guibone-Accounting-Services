<?php

const MONITORING_ROLE_ADMIN = 1;
const MONITORING_ROLE_SECRETARY = 2;
const MONITORING_ROLE_ACCOUNTANT = 3;
const MONITORING_ROLE_CLIENT = 4;
const MONITORING_SESSION_KEY = 'monitoring_auth';
const MONITORING_IMPERSONATION_KEY = 'monitoring_impersonation';
const MONITORING_SIGNUP_UPLOAD_KEY = 'monitoring_signup_uploads';

function monitoring_is_https(): bool
{
    $https = strtolower((string)($_SERVER['HTTPS'] ?? ''));
    if ($https !== '' && $https !== 'off' && $https !== '0') {
        return true;
    }

    $forwardedProto = strtolower((string)($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? ''));
    return $forwardedProto === 'https';
}

function monitoring_is_allowed_origin(string $origin): bool
{
    $origin = trim($origin);
    if ($origin === '') {
        return false;
    }

    $parts = parse_url($origin);
    if (!is_array($parts)) {
        return false;
    }

    $scheme = strtolower((string)($parts['scheme'] ?? ''));
    $host = strtolower((string)($parts['host'] ?? ''));
    if ($scheme === '' || $host === '') {
        return false;
    }

    if (($scheme === 'http' || $scheme === 'https') && in_array($host, ['localhost', '127.0.0.1'], true)) {
        return true;
    }

    $currentHost = strtolower((string)($_SERVER['HTTP_HOST'] ?? ''));
    if ($currentHost !== '') {
        $currentHost = explode(':', $currentHost)[0];
        if ($host === $currentHost) {
            return true;
        }
    }

    return false;
}

function monitoring_bootstrap_api(array $methods, array $options = []): void
{
    $sendJsonHeader = array_key_exists('send_json_header', $options) ? (bool)$options['send_json_header'] : true;
    $allowCredentials = array_key_exists('allow_credentials', $options) ? (bool)$options['allow_credentials'] : true;
    $defaultHeaders = isset($options['allow_headers']) && is_array($options['allow_headers'])
        ? $options['allow_headers']
        : ['Content-Type', 'Authorization', 'Accept', 'X-Requested-With'];

    if ($sendJsonHeader) {
        header('Content-Type: application/json');
    }

    $origin = trim((string)($_SERVER['HTTP_ORIGIN'] ?? ''));
    if ($origin !== '' && monitoring_is_allowed_origin($origin)) {
        header('Access-Control-Allow-Origin: ' . $origin);
        if ($allowCredentials) {
            header('Access-Control-Allow-Credentials: true');
        }
        header('Vary: Origin');
    } elseif ($origin !== '') {
        header('Vary: Origin');
    }

    header('Access-Control-Allow-Methods: ' . implode(', ', array_values(array_unique($methods))));
    $requestedHeaders = trim((string)($_SERVER['HTTP_ACCESS_CONTROL_REQUEST_HEADERS'] ?? ''));
    if ($requestedHeaders === '') {
        $requestedHeaders = implode(', ', $defaultHeaders);
    }
    header('Access-Control-Allow-Headers: ' . $requestedHeaders);
    header('Access-Control-Max-Age: 86400');

    if (strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'GET')) === 'OPTIONS') {
        http_response_code(204);
        exit;
    }

    monitoring_start_session();
}

function monitoring_start_session(): void
{
    if (session_status() === PHP_SESSION_ACTIVE) {
        return;
    }

    session_name('MONITORINGSESSID');
    session_set_cookie_params([
        'lifetime' => 0,
        'path' => '/',
        'domain' => '',
        'secure' => monitoring_is_https(),
        'httponly' => true,
        'samesite' => 'Lax',
    ]);

    session_start();
}

function monitoring_auth_respond(int $code, array $payload): void
{
    http_response_code($code);
    header('Content-Type: application/json');
    echo json_encode($payload);
    exit;
}

function monitoring_destroy_session(): void
{
    if (session_status() !== PHP_SESSION_ACTIVE) {
        return;
    }

    $_SESSION = [];

    if (ini_get('session.use_cookies')) {
        $params = session_get_cookie_params();
        setcookie(
            session_name(),
            '',
            time() - 42000,
            $params['path'] ?? '/',
            $params['domain'] ?? '',
            (bool)($params['secure'] ?? false),
            (bool)($params['httponly'] ?? true)
        );
    }

    session_destroy();
}

function monitoring_normalize_session_timeout_minutes($value): int
{
    $timeout = (int)$value;
    return $timeout > 0 ? $timeout : 30;
}

function monitoring_prepare_session_user(array $user): array
{
    return [
        'id' => isset($user['id']) ? (int)$user['id'] : 0,
        'username' => isset($user['username']) ? (string)$user['username'] : '',
        'role_id' => isset($user['role_id']) ? (int)$user['role_id'] : 0,
        'client_id' => isset($user['client_id']) && $user['client_id'] !== null ? (int)$user['client_id'] : null,
        'email' => isset($user['email']) && $user['email'] !== '' ? (string)$user['email'] : null,
        'first_name' => isset($user['first_name']) && $user['first_name'] !== '' ? (string)$user['first_name'] : null,
        'middle_name' => isset($user['middle_name']) && $user['middle_name'] !== '' ? (string)$user['middle_name'] : null,
        'last_name' => isset($user['last_name']) && $user['last_name'] !== '' ? (string)$user['last_name'] : null,
        'profile_image' => isset($user['profile_image']) && $user['profile_image'] !== '' ? (string)$user['profile_image'] : null,
        'registration_source' => isset($user['registration_source']) && $user['registration_source'] !== '' ? (string)$user['registration_source'] : null,
        'approval_status' => isset($user['approval_status']) && $user['approval_status'] !== '' ? (string)$user['approval_status'] : null,
        'security_settings' => is_array($user['security_settings'] ?? null) ? $user['security_settings'] : [],
    ];
}

function monitoring_store_session_user(array $user): void
{
    monitoring_start_session();
    session_regenerate_id(true);

    $preparedUser = monitoring_prepare_session_user($user);
    $preparedUser['session_timeout_minutes'] = monitoring_normalize_session_timeout_minutes(
        $preparedUser['security_settings']['sessionTimeoutMinutes'] ?? null
    );
    $preparedUser['last_activity_at'] = time();

    $_SESSION[MONITORING_SESSION_KEY] = $preparedUser;
}

function monitoring_store_impersonation_state(array $originalUser): void
{
    monitoring_start_session();
    $_SESSION[MONITORING_IMPERSONATION_KEY] = [
        'active' => true,
        'original_user' => monitoring_prepare_session_user($originalUser),
        'started_at' => time(),
    ];
}

function monitoring_read_impersonation_state(): ?array
{
    monitoring_start_session();
    $raw = $_SESSION[MONITORING_IMPERSONATION_KEY] ?? null;
    if (!is_array($raw) || !is_array($raw['original_user'] ?? null)) {
        return null;
    }

    return [
        'active' => true,
        'original_user' => monitoring_prepare_session_user($raw['original_user']),
        'started_at' => isset($raw['started_at']) ? (int)$raw['started_at'] : time(),
    ];
}

function monitoring_clear_impersonation_state(): void
{
    monitoring_start_session();
    unset($_SESSION[MONITORING_IMPERSONATION_KEY]);
}

function monitoring_update_session_timeout(int $minutes): void
{
    monitoring_start_session();
    if (!isset($_SESSION[MONITORING_SESSION_KEY]) || !is_array($_SESSION[MONITORING_SESSION_KEY])) {
        return;
    }

    $_SESSION[MONITORING_SESSION_KEY]['session_timeout_minutes'] = monitoring_normalize_session_timeout_minutes($minutes);
    if (!isset($_SESSION[MONITORING_SESSION_KEY]['security_settings']) || !is_array($_SESSION[MONITORING_SESSION_KEY]['security_settings'])) {
        $_SESSION[MONITORING_SESSION_KEY]['security_settings'] = [];
    }
    $_SESSION[MONITORING_SESSION_KEY]['security_settings']['sessionTimeoutMinutes'] = monitoring_normalize_session_timeout_minutes($minutes);
}

function monitoring_read_session_user(bool $enforceTimeout = true): ?array
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

    $timeoutMinutes = monitoring_normalize_session_timeout_minutes($raw['session_timeout_minutes'] ?? null);
    $lastActivityAt = isset($raw['last_activity_at']) ? (int)$raw['last_activity_at'] : 0;
    if ($enforceTimeout && $lastActivityAt > 0 && (time() - $lastActivityAt) > ($timeoutMinutes * 60)) {
        monitoring_destroy_session();
        return null;
    }

    $_SESSION[MONITORING_SESSION_KEY]['last_activity_at'] = time();
    $raw['last_activity_at'] = $_SESSION[MONITORING_SESSION_KEY]['last_activity_at'];
    $raw['session_timeout_minutes'] = $timeoutMinutes;
    $raw['client_id'] = array_key_exists('client_id', $raw) && $raw['client_id'] !== null ? (int)$raw['client_id'] : null;
    $raw['email'] = isset($raw['email']) && $raw['email'] !== '' ? (string)$raw['email'] : null;
    $raw['first_name'] = isset($raw['first_name']) && $raw['first_name'] !== '' ? (string)$raw['first_name'] : null;
    $raw['middle_name'] = isset($raw['middle_name']) && $raw['middle_name'] !== '' ? (string)$raw['middle_name'] : null;
    $raw['last_name'] = isset($raw['last_name']) && $raw['last_name'] !== '' ? (string)$raw['last_name'] : null;
    $raw['profile_image'] = isset($raw['profile_image']) && $raw['profile_image'] !== '' ? (string)$raw['profile_image'] : null;
    $raw['registration_source'] = isset($raw['registration_source']) && $raw['registration_source'] !== '' ? (string)$raw['registration_source'] : null;
    $raw['approval_status'] = isset($raw['approval_status']) && $raw['approval_status'] !== '' ? (string)$raw['approval_status'] : null;
    $raw['impersonation'] = monitoring_read_impersonation_state();
    return $raw;
}

function monitoring_require_auth(): array
{
    $user = monitoring_read_session_user(true);
    if ($user === null) {
        monitoring_auth_respond(401, [
            'success' => false,
            'message' => 'Authentication is required.',
        ]);
    }

    return $user;
}

function monitoring_user_has_any_role(array $user, array $allowedRoleIds): bool
{
    $roleId = isset($user['role_id']) ? (int)$user['role_id'] : 0;
    foreach ($allowedRoleIds as $allowedRoleId) {
        if ($roleId === (int)$allowedRoleId) {
            return true;
        }
    }

    return false;
}

function monitoring_require_roles(array $allowedRoleIds, ?array $user = null): array
{
    $user = $user ?? monitoring_require_auth();
    if (!monitoring_user_has_any_role($user, $allowedRoleIds)) {
        monitoring_auth_respond(403, [
            'success' => false,
            'message' => 'Access denied.',
        ]);
    }

    return $user;
}

function monitoring_is_self(array $user, int $targetUserId): bool
{
    return isset($user['id']) && (int)$user['id'] === $targetUserId;
}

function monitoring_user_can_access_client(array $user, int $clientId, array $allowedStaffRoles = [MONITORING_ROLE_ADMIN, MONITORING_ROLE_SECRETARY]): bool
{
    if ($clientId <= 0) {
        return false;
    }

    if (monitoring_user_has_any_role($user, $allowedStaffRoles)) {
        return true;
    }

    return (int)($user['role_id'] ?? 0) === MONITORING_ROLE_CLIENT
        && (int)($user['client_id'] ?? 0) === $clientId;
}

function monitoring_require_client_access(int $clientId, array $allowedStaffRoles = [MONITORING_ROLE_ADMIN, MONITORING_ROLE_SECRETARY], ?array $user = null): array
{
    $user = $user ?? monitoring_require_auth();
    if (!monitoring_user_can_access_client($user, $clientId, $allowedStaffRoles)) {
        monitoring_auth_respond(403, [
            'success' => false,
            'message' => 'Access denied.',
        ]);
    }

    return $user;
}

function monitoring_user_can_access_user(array $user, int $targetUserId, array $allowedAdminRoles = [MONITORING_ROLE_ADMIN]): bool
{
    if ($targetUserId <= 0) {
        return false;
    }

    if (monitoring_user_has_any_role($user, $allowedAdminRoles)) {
        return true;
    }

    return monitoring_is_self($user, $targetUserId);
}

function monitoring_require_user_access(int $targetUserId, array $allowedAdminRoles = [MONITORING_ROLE_ADMIN], ?array $user = null): array
{
    $user = $user ?? monitoring_require_auth();
    if (!monitoring_user_can_access_user($user, $targetUserId, $allowedAdminRoles)) {
        monitoring_auth_respond(403, [
            'success' => false,
            'message' => 'Access denied.',
        ]);
    }

    return $user;
}

function monitoring_allow_signup_client_document_upload(int $clientId, int $ttlSeconds = 900): void
{
    if ($clientId <= 0) {
        return;
    }

    monitoring_start_session();
    if (!isset($_SESSION[MONITORING_SIGNUP_UPLOAD_KEY]) || !is_array($_SESSION[MONITORING_SIGNUP_UPLOAD_KEY])) {
        $_SESSION[MONITORING_SIGNUP_UPLOAD_KEY] = [];
    }

    $_SESSION[MONITORING_SIGNUP_UPLOAD_KEY][(string)$clientId] = time() + max(60, $ttlSeconds);
}

function monitoring_guest_can_upload_signup_documents(int $clientId): bool
{
    if ($clientId <= 0) {
        return false;
    }

    monitoring_start_session();
    $allowances = $_SESSION[MONITORING_SIGNUP_UPLOAD_KEY] ?? [];
    if (!is_array($allowances)) {
        return false;
    }

    $key = (string)$clientId;
    $expiresAt = isset($allowances[$key]) ? (int)$allowances[$key] : 0;
    if ($expiresAt <= 0) {
        return false;
    }

    if ($expiresAt < time()) {
        unset($_SESSION[MONITORING_SIGNUP_UPLOAD_KEY][$key]);
        return false;
    }

    return true;
}
