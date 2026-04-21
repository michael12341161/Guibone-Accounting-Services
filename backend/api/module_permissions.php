<?php

require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/connection-pdo.php';
require_once __DIR__ . '/audit_logs_helper.php';
require_once __DIR__ . '/module_permission_store.php';

monitoring_bootstrap_api(['GET', 'POST', 'OPTIONS']);

function module_permissions_respond(int $code, array $payload): void
{
    http_response_code($code);
    header('Content-Type: application/json');
    echo json_encode($payload);
    exit;
}

function module_permissions_build_display_name(array $user): string
{
    $parts = [];
    foreach (['first_name', 'middle_name', 'last_name'] as $key) {
        $value = trim((string)($user[$key] ?? ''));
        if ($value !== '') {
            $parts[] = $value;
        }
    }

    if (!empty($parts)) {
        return trim(implode(' ', $parts));
    }

    return trim((string)($user['username'] ?? ''));
}

function module_permissions_select_user_ids_by_role(PDO $conn, int $roleId): array
{
    if ($roleId <= 0) {
        return [];
    }

    $stmt = $conn->prepare(
        'SELECT User_id
         FROM user
         WHERE Role_id = :role_id'
    );
    $stmt->execute([':role_id' => $roleId]);

    $ids = [];
    foreach ($stmt->fetchAll(PDO::FETCH_COLUMN) ?: [] as $value) {
        $userId = (int)$value;
        if ($userId > 0) {
            $ids[$userId] = true;
        }
    }

    return array_values(array_map('intval', array_keys($ids)));
}

function module_permissions_ensure_notifications_table(PDO $conn): void
{
    monitoring_require_schema_columns(
        $conn,
        'notifications',
        ['notifications_ID', 'user_id', 'sender_id', 'type', 'message', 'is_read', 'created_at'],
        'module permission notifications'
    );
}

function module_permissions_insert_notification(
    PDO $conn,
    int $userId,
    ?int $senderId,
    string $type,
    string $message
): void {
    if ($userId <= 0 || trim($type) === '' || trim($message) === '') {
        return;
    }

    $stmt = $conn->prepare(
        'INSERT INTO notifications (user_id, sender_id, type, message, is_read)
         VALUES (:user_id, :sender_id, :type, :message, 0)'
    );
    $stmt->execute([
        ':user_id' => $userId,
        ':sender_id' => ($senderId !== null && $senderId > 0) ? $senderId : null,
        ':type' => trim($type),
        ':message' => trim($message),
    ]);
}

function module_permissions_humanize_label(string $value): string
{
    $normalized = trim(str_replace(['-', '_'], ' ', $value));
    if ($normalized === '') {
        return 'Module';
    }

    return ucwords($normalized);
}

function module_permissions_format_label_list(array $labels): string
{
    $items = array_values(array_filter(array_map(static function ($value) {
        return trim((string)$value);
    }, $labels)));

    $count = count($items);
    if ($count === 0) {
        return 'this module';
    }
    if ($count === 1) {
        return $items[0];
    }
    if ($count === 2) {
        return $items[0] . ' and ' . $items[1];
    }

    $last = array_pop($items);
    return implode(', ', $items) . ', and ' . $last;
}

function module_permissions_collect_granted_feature_labels(
    array $previousPermissions,
    array $nextPermissions,
    string $roleKey
): array {
    $labels = [];

    foreach ($nextPermissions as $featureKey => $featurePermissions) {
        if (!is_array($featurePermissions)) {
            continue;
        }

        $previousFeaturePermissions = isset($previousPermissions[$featureKey]) && is_array($previousPermissions[$featureKey])
            ? $previousPermissions[$featureKey]
            : [];
        $previousEnabled = (bool)($previousFeaturePermissions[$roleKey] ?? false);
        $nextEnabled = (bool)($featurePermissions[$roleKey] ?? false);
        $hasGrant = !$previousEnabled && $nextEnabled;

        $previousActions = isset($previousFeaturePermissions['actions']) && is_array($previousFeaturePermissions['actions'])
            ? $previousFeaturePermissions['actions']
            : [];
        $nextActions = isset($featurePermissions['actions']) && is_array($featurePermissions['actions'])
            ? $featurePermissions['actions']
            : [];

        if (!$hasGrant) {
            foreach ($nextActions as $actionKey => $actionPermissions) {
                if (!is_array($actionPermissions)) {
                    continue;
                }

                $previousActionEnabled = (bool)($previousActions[$actionKey][$roleKey] ?? false);
                $nextActionEnabled = (bool)($actionPermissions[$roleKey] ?? false);
                if (!$previousActionEnabled && $nextActionEnabled) {
                    $hasGrant = true;
                    break;
                }
            }
        }

        if ($hasGrant) {
            $labels[$featureKey] = module_permissions_humanize_label((string)$featureKey);
        }
    }

    return array_values($labels);
}

function module_permissions_collect_revoked_feature_labels(
    array $previousPermissions,
    array $nextPermissions,
    string $roleKey
): array {
    $labels = [];

    foreach ($previousPermissions as $featureKey => $featurePermissions) {
        if (!is_array($featurePermissions)) {
            continue;
        }

        $nextFeaturePermissions = isset($nextPermissions[$featureKey]) && is_array($nextPermissions[$featureKey])
            ? $nextPermissions[$featureKey]
            : [];
        $previousEnabled = (bool)($featurePermissions[$roleKey] ?? false);
        $nextEnabled = (bool)($nextFeaturePermissions[$roleKey] ?? false);
        $hasRevoke = $previousEnabled && !$nextEnabled;

        $previousActions = isset($featurePermissions['actions']) && is_array($featurePermissions['actions'])
            ? $featurePermissions['actions']
            : [];
        $nextActions = isset($nextFeaturePermissions['actions']) && is_array($nextFeaturePermissions['actions'])
            ? $nextFeaturePermissions['actions']
            : [];

        if (!$hasRevoke) {
            foreach ($previousActions as $actionKey => $actionPermissions) {
                if (!is_array($actionPermissions)) {
                    continue;
                }

                $previousActionEnabled = (bool)($actionPermissions[$roleKey] ?? false);
                $nextActionEnabled = (bool)($nextActions[$actionKey][$roleKey] ?? false);
                if ($previousActionEnabled && !$nextActionEnabled) {
                    $hasRevoke = true;
                    break;
                }
            }
        }

        if ($hasRevoke) {
            $labels[$featureKey] = module_permissions_humanize_label((string)$featureKey);
        }
    }

    return array_values($labels);
}

function module_permissions_build_grant_notification_message(array $grantedLabels, array $sessionUser): string
{
    $senderName = module_permissions_build_display_name($sessionUser);
    $senderLabel = trim('Admin' . ($senderName !== '' ? ' ' . $senderName : ''));
    $labelList = module_permissions_format_label_list($grantedLabels);
    $title = count($grantedLabels) === 1
        ? $grantedLabels[0] . ' Access Granted'
        : 'Module Access Granted';
    $body = sprintf(
        '%s granted you access to %s.',
        $senderLabel !== '' ? $senderLabel : 'Admin',
        $labelList
    );

    return $title . ': ' . $body;
}

function module_permissions_build_revoke_notification_message(array $revokedLabels, array $sessionUser): string
{
    $senderName = module_permissions_build_display_name($sessionUser);
    $senderLabel = trim('Admin' . ($senderName !== '' ? ' ' . $senderName : ''));
    $labelList = module_permissions_format_label_list($revokedLabels);
    $title = count($revokedLabels) === 1
        ? $revokedLabels[0] . ' Access Removed'
        : 'Module Access Removed';
    $body = sprintf(
        '%s removed your access to %s.',
        $senderLabel !== '' ? $senderLabel : 'Admin',
        $labelList
    );

    return $title . ': ' . $body;
}

function module_permissions_notify_granted_access(
    PDO $conn,
    array $previousPermissions,
    array $nextPermissions,
    array $sessionUser
): int {
    $roleMap = [
        'secretary' => defined('MONITORING_ROLE_SECRETARY') ? (int)MONITORING_ROLE_SECRETARY : 2,
        'accountant' => defined('MONITORING_ROLE_ACCOUNTANT') ? (int)MONITORING_ROLE_ACCOUNTANT : 3,
        'client' => defined('MONITORING_ROLE_CLIENT') ? (int)MONITORING_ROLE_CLIENT : 4,
    ];

    $senderId = isset($sessionUser['id']) ? (int)$sessionUser['id'] : 0;
    $notifiedCount = 0;

    foreach ($roleMap as $roleKey => $roleId) {
        $grantedLabels = module_permissions_collect_granted_feature_labels(
            $previousPermissions,
            $nextPermissions,
            $roleKey
        );
        if (empty($grantedLabels)) {
            continue;
        }

        $recipientIds = module_permissions_select_user_ids_by_role($conn, $roleId);
        if (empty($recipientIds)) {
            continue;
        }

        module_permissions_ensure_notifications_table($conn);
        $message = module_permissions_build_grant_notification_message($grantedLabels, $sessionUser);

        foreach ($recipientIds as $recipientId) {
            module_permissions_insert_notification(
                $conn,
                (int)$recipientId,
                $senderId > 0 ? $senderId : null,
                'module_permission_granted',
                $message
            );
            $notifiedCount++;
        }
    }

    return $notifiedCount;
}

function module_permissions_notify_revoked_access(
    PDO $conn,
    array $previousPermissions,
    array $nextPermissions,
    array $sessionUser
): int {
    $roleMap = [
        'secretary' => defined('MONITORING_ROLE_SECRETARY') ? (int)MONITORING_ROLE_SECRETARY : 2,
        'accountant' => defined('MONITORING_ROLE_ACCOUNTANT') ? (int)MONITORING_ROLE_ACCOUNTANT : 3,
        'client' => defined('MONITORING_ROLE_CLIENT') ? (int)MONITORING_ROLE_CLIENT : 4,
    ];

    $senderId = isset($sessionUser['id']) ? (int)$sessionUser['id'] : 0;
    $notifiedCount = 0;

    foreach ($roleMap as $roleKey => $roleId) {
        $revokedLabels = module_permissions_collect_revoked_feature_labels(
            $previousPermissions,
            $nextPermissions,
            $roleKey
        );
        if (empty($revokedLabels)) {
            continue;
        }

        $recipientIds = module_permissions_select_user_ids_by_role($conn, $roleId);
        if (empty($recipientIds)) {
            continue;
        }

        module_permissions_ensure_notifications_table($conn);
        $message = module_permissions_build_revoke_notification_message($revokedLabels, $sessionUser);

        foreach ($recipientIds as $recipientId) {
            module_permissions_insert_notification(
                $conn,
                (int)$recipientId,
                $senderId > 0 ? $senderId : null,
                'module_permission_revoked',
                $message
            );
            $notifiedCount++;
        }
    }

    return $notifiedCount;
}

try {
    $sessionUser = monitoring_require_auth();
    $method = strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'GET'));

    if ($method === 'GET') {
        if (session_status() === PHP_SESSION_ACTIVE) {
            session_write_close();
        }

        module_permissions_respond(200, [
            'success' => true,
            'permissions' => monitoring_module_permissions_load($conn),
        ]);
    }

    if ($method === 'POST') {
        monitoring_require_roles([MONITORING_ROLE_ADMIN], $sessionUser);

        $raw = file_get_contents('php://input');
        $data = json_decode($raw, true);
        if (!is_array($data)) {
            $data = $_POST;
        }

        if (!is_array($data) || empty($data)) {
            module_permissions_respond(400, [
                'success' => false,
                'message' => 'Invalid JSON payload',
            ]);
        }

        $payload = isset($data['permissions']) && is_array($data['permissions']) ? $data['permissions'] : $data;
        if (!is_array($payload)) {
            module_permissions_respond(400, [
                'success' => false,
                'message' => 'permissions is required',
            ]);
        }

        $previousPermissions = monitoring_module_permissions_load($conn);
        $permissions = monitoring_module_permissions_save($conn, $payload, (int)($sessionUser['id'] ?? 0));
        monitoring_write_audit_log($conn, (int)($sessionUser['id'] ?? 0), 'Module permissions updated');
        $grantedNotifiedUsers = 0;
        $revokedNotifiedUsers = 0;

        try {
            $grantedNotifiedUsers = module_permissions_notify_granted_access(
                $conn,
                $previousPermissions,
                $permissions,
                $sessionUser
            );
        } catch (Throwable $_unused) {
            $grantedNotifiedUsers = 0;
        }

        try {
            $revokedNotifiedUsers = module_permissions_notify_revoked_access(
                $conn,
                $previousPermissions,
                $permissions,
                $sessionUser
            );
        } catch (Throwable $_unused) {
            $revokedNotifiedUsers = 0;
        }

        module_permissions_respond(200, [
            'success' => true,
            'message' => 'Module permissions saved successfully.',
            'permissions' => $permissions,
            'notified_users' => $grantedNotifiedUsers + $revokedNotifiedUsers,
            'granted_notified_users' => $grantedNotifiedUsers,
            'revoked_notified_users' => $revokedNotifiedUsers,
        ]);
    }

    module_permissions_respond(405, [
        'success' => false,
        'message' => 'Method not allowed',
    ]);
} catch (Throwable $e) {
    module_permissions_respond(500, [
        'success' => false,
        'message' => trim((string)$e->getMessage()) !== '' ? (string)$e->getMessage() : 'Server error',
    ]);
}
