<?php

require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/connection-pdo.php';
require_once __DIR__ . '/employee_specialization.php';
require_once __DIR__ . '/audit_logs_helper.php';
require_once __DIR__ . '/module_permission_store.php';

monitoring_bootstrap_api(['POST', 'OPTIONS']);

function account_switch_respond(int $code, array $payload): void
{
    http_response_code($code);
    header('Content-Type: application/json');
    echo json_encode($payload);
    exit;
}

function account_switch_build_client_session_user(PDO $conn, int $clientId): array
{
    $stmt = $conn->prepare(
        'SELECT u.User_id AS user_id,
                u.Username AS username,
                u.Email AS user_email,
                u.Role_id AS role_id,
                u.Password_changed_at AS password_changed_at,
                u.Created_at AS created_at,
                c.Client_ID AS client_id,
                c.Email AS client_email,
                c.First_name AS first_name,
                c.Middle_name AS middle_name,
                c.Last_name AS last_name,
                c.Profile_Image AS profile_image
         FROM client c
         INNER JOIN user u ON u.User_id = c.User_id
         WHERE c.Client_ID = :client_id
           AND u.Role_id = :client_role_id
         LIMIT 1'
    );
    $stmt->execute([
        ':client_id' => $clientId,
        ':client_role_id' => MONITORING_ROLE_CLIENT,
    ]);

    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$row) {
        throw new RuntimeException('The selected client account is unavailable.');
    }

    $securitySettings = monitoring_get_security_settings($conn);
    $passwordExpiryInfo = monitoring_resolve_password_expiry_info(
        $securitySettings,
        $row['password_changed_at'] ?? null,
        $row['created_at'] ?? null
    );

    return [
        'id' => (int)$row['user_id'],
        'username' => (string)($row['username'] ?? ''),
        'role_id' => MONITORING_ROLE_CLIENT,
        'client_id' => (int)$row['client_id'],
        'email' => $row['client_email'] ?? $row['user_email'] ?? null,
        'first_name' => $row['first_name'] ?? null,
        'middle_name' => $row['middle_name'] ?? null,
        'last_name' => $row['last_name'] ?? null,
        'profile_image' => $row['profile_image'] ?? null,
        'password_changed_at' => $passwordExpiryInfo['password_changed_at'],
        'password_expires_at' => $passwordExpiryInfo['password_expires_at'],
        'password_days_until_expiry' => $passwordExpiryInfo['password_days_until_expiry'],
        'registration_source' => null,
        'approval_status' => null,
        'security_settings' => $securitySettings,
    ];
}

function account_switch_can_start_client_view(PDO $conn, array $sessionUser): bool
{
    $roleId = (int)($sessionUser['role_id'] ?? 0);
    if ($roleId === MONITORING_ROLE_ADMIN) {
        return true;
    }

    if ($roleId !== MONITORING_ROLE_SECRETARY) {
        return false;
    }

    return monitoring_module_permissions_is_role_allowed($conn, 'client-account', null, MONITORING_ROLE_SECRETARY);
}

try {
    $method = strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'POST'));
    if ($method !== 'POST') {
        account_switch_respond(405, ['success' => false, 'message' => 'Method not allowed.']);
    }

    $raw = file_get_contents('php://input');
    $data = json_decode($raw, true);
    if (!is_array($data)) {
        account_switch_respond(400, ['success' => false, 'message' => 'Invalid JSON payload.']);
    }

    $action = strtolower(trim((string)($data['action'] ?? '')));

    if ($action === 'start_client_view') {
        $sessionUser = monitoring_require_roles([MONITORING_ROLE_ADMIN, MONITORING_ROLE_SECRETARY]);
        if (!account_switch_can_start_client_view($conn, $sessionUser)) {
            account_switch_respond(403, [
                'success' => false,
                'message' => 'You do not have permission to access client accounts.',
            ]);
        }

        if (monitoring_read_impersonation_state() !== null) {
            account_switch_respond(409, [
                'success' => false,
                'message' => 'Finish the current client view before accessing another client account.',
            ]);
        }

        $clientId = (int)($data['client_id'] ?? 0);
        if ($clientId <= 0) {
            account_switch_respond(422, ['success' => false, 'message' => 'client_id is required.']);
        }

        $clientSessionUser = account_switch_build_client_session_user($conn, $clientId);
        monitoring_store_impersonation_state($sessionUser);
        monitoring_store_session_user($clientSessionUser);
        monitoring_write_audit_log($conn, (int)($sessionUser['id'] ?? 0), 'Started client account access');

        account_switch_respond(200, [
            'success' => true,
            'message' => 'Client account access started.',
            'user' => monitoring_read_session_user(false),
        ]);
    }

    if ($action === 'restore_original') {
        monitoring_require_auth();
        $impersonationState = monitoring_read_impersonation_state();
        if ($impersonationState === null || !is_array($impersonationState['original_user'] ?? null)) {
            account_switch_respond(409, [
                'success' => false,
                'message' => 'There is no original account to restore.',
            ]);
        }

        $originalUser = $impersonationState['original_user'];
        monitoring_clear_impersonation_state();
        monitoring_store_session_user($originalUser);
        monitoring_write_audit_log($conn, (int)($originalUser['id'] ?? 0), 'Returned to the original account');

        account_switch_respond(200, [
            'success' => true,
            'message' => 'Returned to the original account.',
            'user' => monitoring_read_session_user(false),
        ]);
    }

    account_switch_respond(400, ['success' => false, 'message' => 'Unsupported action.']);
} catch (Throwable $e) {
    account_switch_respond(500, [
        'success' => false,
        'message' => 'Server error.',
    ]);
}
