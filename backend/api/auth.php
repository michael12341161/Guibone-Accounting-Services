<?php

const MONITORING_ROLE_ADMIN = 1;
const MONITORING_ROLE_SECRETARY = 2;
const MONITORING_ROLE_ACCOUNTANT = 3;
const MONITORING_ROLE_CLIENT = 4;
const MONITORING_SESSION_KEY = 'monitoring_auth';
const MONITORING_SIGNUP_UPLOAD_KEY = 'monitoring_signup_uploads';
const MONITORING_JWT_RESPONSE_HEADER = 'X-Monitoring-JWT';
const MONITORING_JWT_LOCAL_CONFIG_FILE = __DIR__ . '/jwt_config.php';
const MONITORING_JWT_SECRET_FILE = __DIR__ . '/../data/jwt_secret.php';
const MONITORING_JWT_ALGORITHM = 'HS256';
const MONITORING_JWT_LEEWAY_SECONDS = 5;

require_once __DIR__ . '/auth_jwt.php';
require_once __DIR__ . '/employee_specialization.php';
require_once __DIR__ . '/account_status_helpers.php';
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

    // Check configurable whitelist first (comma-separated env var for production).
    $allowedOrigins = getenv('ALLOWED_ORIGINS') ?: '';
    if ($allowedOrigins !== '') {
        $whitelist = array_map('trim', explode(',', $allowedOrigins));
        if (in_array($origin, $whitelist, true)) {
            return true;
        }
        // If a whitelist is configured, only allow whitelisted origins.
        return false;
    }

    // Development fallback: allow any localhost origin.
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
    header('Access-Control-Expose-Headers: ' . MONITORING_JWT_RESPONSE_HEADER);
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
    if (function_exists('monitoring_clear_auth_cookie')) {
        monitoring_clear_auth_cookie();
    }

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

function monitoring_request_activity_mode(): string
{
    $mode = strtolower(trim((string)($_SERVER['HTTP_X_MONITORING_ACTIVITY'] ?? 'active')));
    return $mode === 'passive' ? 'passive' : 'active';
}

function monitoring_request_refreshes_session_activity(): bool
{
    return monitoring_request_activity_mode() !== 'passive';
}

function monitoring_auth_settings_connection(): ?PDO
{
    static $attempted = false;
    static $connection = null;

    if ($attempted) {
        return $connection instanceof PDO ? $connection : null;
    }

    $attempted = true;

    try {
        $host = getenv('DB_HOST') ?: 'localhost';
        $database = getenv('DB_NAME') ?: 'dbmonitoring';
        $username = getenv('DB_USER') ?: 'root';
        $password = getenv('DB_PASS') ?: '';

        $connection = new PDO(
            "mysql:host={$host};dbname={$database};charset=utf8mb4",
            $username,
            $password,
            [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            ]
        );
    } catch (Throwable $__) {
        $connection = null;
    }

    return $connection instanceof PDO ? $connection : null;
}

function monitoring_read_current_security_settings(): ?array
{
    static $loaded = false;
    static $settings = null;

    if ($loaded) {
        return is_array($settings) ? $settings : null;
    }

    $loaded = true;

    if (
        !function_exists('monitoring_security_setting_definitions')
        || !function_exists('monitoring_default_security_settings')
    ) {
        return null;
    }

    try {
        $conn = monitoring_auth_settings_connection();
        if (!$conn) {
            return null;
        }

        if (function_exists('monitoring_ensure_settings_table')) {
            monitoring_ensure_settings_table($conn);
        }

        $definitions = monitoring_security_setting_definitions();
        $settings = monitoring_default_security_settings();
        $dbKeys = array_map(static function (array $definition): string {
            return (string)($definition['db_key'] ?? '');
        }, array_values($definitions));
        $dbKeys = array_values(array_filter($dbKeys, static function (string $dbKey): bool {
            return $dbKey !== '';
        }));

        if (!empty($dbKeys)) {
            $placeholders = implode(',', array_fill(0, count($dbKeys), '?'));
            $stmt = $conn->prepare(
                "SELECT setting_key, setting_value
                 FROM settings
                 WHERE setting_key IN ({$placeholders})"
            );

            foreach ($dbKeys as $index => $dbKey) {
                $stmt->bindValue($index + 1, $dbKey, PDO::PARAM_STR);
            }

            $stmt->execute();
            $rows = $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];

            foreach ($definitions as $frontendKey => $definition) {
                $dbKey = (string)($definition['db_key'] ?? '');
                if ($dbKey === '') {
                    continue;
                }

                foreach ($rows as $row) {
                    if (($row['setting_key'] ?? '') !== $dbKey) {
                        continue;
                    }

                    $type = strtolower((string)($definition['type'] ?? 'int'));
                    $value = $type === 'bool'
                        ? (function_exists('monitoring_parse_bool_setting')
                            ? monitoring_parse_bool_setting($row['setting_value'] ?? null)
                            : null)
                        : (function_exists('monitoring_parse_int_setting')
                            ? monitoring_parse_int_setting($row['setting_value'] ?? null)
                            : null);
                    if ($value === null) {
                        continue;
                    }

                    $validator = $definition['validator'] ?? null;
                    if (is_callable($validator) && $validator($value) === null) {
                        $settings[$frontendKey] = $value;
                    }
                    break;
                }
            }
        }
    } catch (Throwable $__) {
        $settings = null;
    }

    return is_array($settings) ? $settings : null;
}

function monitoring_refresh_auth_user_security_settings(array $user, bool $persistSession = true): array
{
    $settings = monitoring_read_current_security_settings();
    if (!is_array($settings)) {
        return $user;
    }

    $user['security_settings'] = $settings;
    $user['session_timeout_minutes'] = monitoring_normalize_session_timeout_minutes(
        $settings['sessionTimeoutMinutes'] ?? null
    );

    if (
        $persistSession
        && session_status() === PHP_SESSION_ACTIVE
        && isset($_SESSION[MONITORING_SESSION_KEY])
        && is_array($_SESSION[MONITORING_SESSION_KEY])
    ) {
        $_SESSION[MONITORING_SESSION_KEY]['security_settings'] = $settings;
        $_SESSION[MONITORING_SESSION_KEY]['session_timeout_minutes'] = $user['session_timeout_minutes'];
    }

    return $user;
}

function monitoring_fallback_role_name(int $roleId): ?string
{
    if ($roleId === MONITORING_ROLE_ADMIN) {
        return 'Admin';
    }
    if ($roleId === MONITORING_ROLE_SECRETARY) {
        return 'Secretary';
    }
    if ($roleId === MONITORING_ROLE_ACCOUNTANT) {
        return 'Accountant';
    }
    if ($roleId === MONITORING_ROLE_CLIENT) {
        return 'Client';
    }

    return null;
}

function monitoring_resolve_session_role_name(array $user): ?string
{
    $candidates = [
        $user['role'] ?? null,
        $user['role_name'] ?? null,
        $user['Role_name'] ?? null,
        $user['Role'] ?? null,
    ];

    foreach ($candidates as $candidate) {
        $normalized = trim((string)$candidate);
        if ($normalized !== '') {
            return $normalized;
        }
    }

    $roleId = isset($user['role_id'])
        ? (int)$user['role_id']
        : (isset($user['Role_id']) ? (int)$user['Role_id'] : 0);
    if ($roleId <= 0) {
        return null;
    }

    try {
        $conn = monitoring_user_status_connection();
        if ($conn instanceof PDO) {
            $stmt = $conn->prepare('SELECT Role_name FROM role WHERE Role_id = :id LIMIT 1');
            $stmt->execute([':id' => $roleId]);
            $roleName = $stmt->fetchColumn();
            if ($roleName !== false) {
                $normalized = trim((string)$roleName);
                if ($normalized !== '') {
                    return $normalized;
                }
            }
        }
    } catch (Throwable $__) {
    }

    return monitoring_fallback_role_name($roleId);
}

function monitoring_prepare_session_user(array $user): array
{
    $securitySettings = is_array($user['security_settings'] ?? null) ? $user['security_settings'] : [];
    $passwordChangedAt = isset($user['password_changed_at']) && $user['password_changed_at'] !== ''
        ? (string)$user['password_changed_at']
        : null;
    $passwordExpiresAt = isset($user['password_expires_at']) && $user['password_expires_at'] !== ''
        ? (string)$user['password_expires_at']
        : null;
    $passwordDaysUntilExpiry = isset($user['password_days_until_expiry']) && $user['password_days_until_expiry'] !== null
        ? (int)$user['password_days_until_expiry']
        : null;

    if (
        $passwordChangedAt !== null
        && array_key_exists('passwordExpiryDays', $securitySettings)
        && function_exists('monitoring_resolve_password_expiry_info')
    ) {
        $passwordExpiryInfo = monitoring_resolve_password_expiry_info(
            $securitySettings,
            $passwordChangedAt,
            null
        );
        $passwordChangedAt = $passwordExpiryInfo['password_changed_at'];
        $passwordExpiresAt = $passwordExpiryInfo['password_expires_at'];
        $passwordDaysUntilExpiry = $passwordExpiryInfo['password_days_until_expiry'];
    }

    $roleName = monitoring_resolve_session_role_name($user);

    return [
        'id' => isset($user['id']) ? (int)$user['id'] : 0,
        'username' => isset($user['username']) ? (string)$user['username'] : '',
        'role_id' => isset($user['role_id']) ? (int)$user['role_id'] : 0,
        'role' => $roleName,
        'role_name' => $roleName,
        'client_id' => isset($user['client_id']) && $user['client_id'] !== null ? (int)$user['client_id'] : null,
        'email' => isset($user['email']) && $user['email'] !== '' ? (string)$user['email'] : null,
        'first_name' => isset($user['first_name']) && $user['first_name'] !== '' ? (string)$user['first_name'] : null,
        'middle_name' => isset($user['middle_name']) && $user['middle_name'] !== '' ? (string)$user['middle_name'] : null,
        'last_name' => isset($user['last_name']) && $user['last_name'] !== '' ? (string)$user['last_name'] : null,
        'profile_image' => isset($user['profile_image']) && $user['profile_image'] !== '' ? (string)$user['profile_image'] : null,
        'password_changed_at' => $passwordChangedAt,
        'password_expires_at' => $passwordExpiresAt,
        'password_days_until_expiry' => $passwordDaysUntilExpiry,
        'registration_source' => isset($user['registration_source']) && $user['registration_source'] !== '' ? (string)$user['registration_source'] : null,
        'approval_status' => isset($user['approval_status']) && $user['approval_status'] !== '' ? (string)$user['approval_status'] : null,
        'security_settings' => $securitySettings,
    ];
}

function monitoring_store_session_user(array $user): void
{
    $preparedUser = monitoring_persist_session_user($user, true);
    monitoring_queue_jwt_response_header($preparedUser);
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

    monitoring_queue_jwt_response_header($_SESSION[MONITORING_SESSION_KEY]);
}

function monitoring_read_session_user(bool $enforceTimeout = true): ?array
{
    $jwtUser = monitoring_read_session_user_from_jwt();
    if ($jwtUser !== null) {
        return monitoring_validate_session_user_access($jwtUser);
    }

    return monitoring_validate_session_user_access(monitoring_read_session_user_from_session($enforceTimeout, true));
}

function monitoring_validate_session_user_access(?array $user): ?array
{
    if (!is_array($user)) {
        return null;
    }

    $userId = isset($user['id']) ? (int)$user['id'] : 0;
    if ($userId <= 0) {
        return $user;
    }

    try {
        $conn = monitoring_user_status_connection();
        if (!$conn) {
            return $user;
        }

        $access = monitoring_fetch_account_access_status_by_user_id($conn, $userId);
        if (!$access) {
            return $user;
        }

        if (!empty($access['blocked_message'])) {
            monitoring_destroy_session();
            return null;
        }

        if (!empty($access['approval_status'])) {
            $user['approval_status'] = $access['approval_status'];
        }
    } catch (Throwable $__) {
        return $user;
    }

    return $user;
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

function monitoring_user_has_module_access(PDO $conn, array $user, string $moduleKey, ?string $actionKey = null): bool
{
    $roleId = isset($user['role_id']) ? (int)$user['role_id'] : 0;
    $normalizedModuleKey = trim($moduleKey);
    $normalizedActionKey = trim((string)$actionKey);

    if ($roleId <= 0 || $normalizedModuleKey === '') {
        return false;
    }

    if ($roleId === MONITORING_ROLE_ADMIN) {
        return true;
    }

    try {
        require_once __DIR__ . '/module_permission_store.php';
        return monitoring_module_permissions_is_role_allowed(
            $conn,
            $normalizedModuleKey,
            $normalizedActionKey !== '' ? $normalizedActionKey : null,
            $roleId
        );
    } catch (Throwable $__) {
        return false;
    }
}

function monitoring_user_has_any_module_access(PDO $conn, array $user, array $moduleChecks): bool
{
    foreach ($moduleChecks as $moduleCheck) {
        $moduleKey = '';
        $actionKey = null;

        if (is_array($moduleCheck)) {
            $moduleKey = trim((string)($moduleCheck['module'] ?? $moduleCheck[0] ?? ''));
            $actionKey = trim((string)($moduleCheck['action'] ?? $moduleCheck[1] ?? ''));
            if ($actionKey === '') {
                $actionKey = null;
            }
        } else {
            $moduleKey = trim((string)$moduleCheck);
        }

        if ($moduleKey === '') {
            continue;
        }

        if (monitoring_user_has_module_access($conn, $user, $moduleKey, $actionKey)) {
            return true;
        }
    }

    return false;
}

function monitoring_user_has_role_or_any_module_access(
    PDO $conn,
    array $user,
    array $allowedRoleIds,
    array $moduleChecks
): bool {
    return monitoring_user_has_any_role($user, $allowedRoleIds)
        || monitoring_user_has_any_module_access($conn, $user, $moduleChecks);
}

function monitoring_require_role_or_module_access(
    PDO $conn,
    array $allowedRoleIds,
    string $moduleKey,
    ?array $user = null,
    ?string $actionKey = null
): array {
    return monitoring_require_role_or_any_module_access(
        $conn,
        $allowedRoleIds,
        [['module' => $moduleKey, 'action' => $actionKey]],
        $user
    );
}

function monitoring_require_role_or_any_module_access(
    PDO $conn,
    array $allowedRoleIds,
    array $moduleChecks,
    ?array $user = null
): array {
    $user = $user ?? monitoring_require_auth();
    if (!monitoring_user_has_role_or_any_module_access($conn, $user, $allowedRoleIds, $moduleChecks)) {
        monitoring_auth_respond(403, [
            'success' => false,
            'message' => 'Access denied.',
        ]);
    }

    return $user;
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
