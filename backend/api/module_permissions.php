<?php

require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/connection-pdo.php';
require_once __DIR__ . '/audit_logs_helper.php';

monitoring_bootstrap_api(['GET', 'POST', 'OPTIONS']);

const MONITORING_MODULE_PERMISSIONS_FILE = __DIR__ . '/../data/module_permissions.json';

function module_permissions_respond(int $code, array $payload): void
{
    http_response_code($code);
    header('Content-Type: application/json');
    echo json_encode($payload);
    exit;
}

function module_permissions_storage_directory(): string
{
    return dirname(MONITORING_MODULE_PERMISSIONS_FILE);
}

function module_permissions_ensure_storage_directory(): void
{
    $directory = module_permissions_storage_directory();
    if (is_dir($directory)) {
        return;
    }

    if (!@mkdir($directory, 0777, true) && !is_dir($directory)) {
        throw new RuntimeException('Unable to create permissions storage directory.');
    }
}

function module_permissions_read_file_contents(): ?string
{
    if (!is_file(MONITORING_MODULE_PERMISSIONS_FILE)) {
        return null;
    }

    $contents = @file_get_contents(MONITORING_MODULE_PERMISSIONS_FILE);
    if ($contents === false) {
        throw new RuntimeException('Unable to read module permissions storage.');
    }

    return $contents;
}

function module_permissions_definitions(): array
{
    return [
        'dashboard' => ['admin' => true, 'secretary' => true, 'accountant' => true, 'client' => false],
        'user-management' => [
            'admin' => true,
            'secretary' => false,
            'accountant' => false,
            'client' => false,
            'actions' => [
                'view' => ['admin' => true, 'secretary' => false, 'accountant' => false, 'client' => false],
                'edit' => ['admin' => true, 'secretary' => false, 'accountant' => false, 'client' => false],
                'add-user' => ['admin' => true, 'secretary' => false, 'accountant' => false, 'client' => false],
            ],
        ],
        'permissions' => ['admin' => true, 'secretary' => false, 'accountant' => false, 'client' => false],
        'settings' => ['admin' => true, 'secretary' => false, 'accountant' => false, 'client' => false],
        'client-management' => [
            'admin' => true,
            'secretary' => true,
            'accountant' => false,
            'client' => false,
            'actions' => [
                'view' => ['admin' => true, 'secretary' => true, 'accountant' => false, 'client' => false],
                'edit' => ['admin' => true, 'secretary' => true, 'accountant' => false, 'client' => false],
                'add-new-client' => ['admin' => true, 'secretary' => true, 'accountant' => false, 'client' => false],
                'location' => ['admin' => true, 'secretary' => true, 'accountant' => false, 'client' => false],
                'file-upload' => ['admin' => true, 'secretary' => false, 'accountant' => false, 'client' => false],
            ],
        ],
        'new-client-management' => ['admin' => true, 'secretary' => true, 'accountant' => false, 'client' => false],
        'documents' => [
            'admin' => true,
            'secretary' => false,
            'accountant' => false,
            'client' => false,
            'actions' => [
                'upload' => ['admin' => true, 'secretary' => false, 'accountant' => false, 'client' => false],
                'view-only' => ['admin' => true, 'secretary' => false, 'accountant' => false, 'client' => false],
            ],
        ],
        'certificate' => [
            'admin' => true,
            'secretary' => false,
            'accountant' => false,
            'client' => false,
            'actions' => [
                'edit' => ['admin' => true, 'secretary' => false, 'accountant' => false, 'client' => false],
                'remove' => ['admin' => true, 'secretary' => false, 'accountant' => false, 'client' => false],
                'remove-auto-send' => ['admin' => true, 'secretary' => false, 'accountant' => false, 'client' => false],
            ],
        ],
        'edit-certificate' => [
            'admin' => true,
            'secretary' => false,
            'accountant' => false,
            'client' => false,
            'actions' => [
                'header-tools-properties' => ['admin' => true, 'secretary' => false, 'accountant' => false, 'client' => false],
            ],
        ],
        'business-status' => ['admin' => true, 'secretary' => false, 'accountant' => false, 'client' => false],
        'appointments' => [
            'admin' => true,
            'secretary' => true,
            'accountant' => false,
            'client' => false,
            'actions' => [
                'approve' => ['admin' => true, 'secretary' => true, 'accountant' => false, 'client' => false],
                'decline' => ['admin' => true, 'secretary' => true, 'accountant' => false, 'client' => false],
                'view-files' => ['admin' => true, 'secretary' => true, 'accountant' => false, 'client' => false],
            ],
        ],
        'scheduling' => [
            'admin' => true,
            'secretary' => true,
            'accountant' => false,
            'client' => false,
            'actions' => [
                'approve' => ['admin' => true, 'secretary' => true, 'accountant' => false, 'client' => false],
                'decline' => ['admin' => true, 'secretary' => true, 'accountant' => false, 'client' => false],
                'reschedule' => ['admin' => true, 'secretary' => true, 'accountant' => false, 'client' => false],
                'configure-times' => ['admin' => true, 'secretary' => false, 'accountant' => false, 'client' => false],
            ],
        ],
        'tasks' => [
            'admin' => true,
            'secretary' => true,
            'accountant' => true,
            'client' => false,
            'actions' => [
                'create-task' => ['admin' => true, 'secretary' => true, 'accountant' => true, 'client' => false],
                'client-appointments' => ['admin' => true, 'secretary' => true, 'accountant' => false, 'client' => false],
                'task-limit' => ['admin' => true, 'secretary' => false, 'accountant' => false, 'client' => false],
                'edit-step' => ['admin' => true, 'secretary' => true, 'accountant' => true, 'client' => false],
                'remove-step' => ['admin' => true, 'secretary' => true, 'accountant' => true, 'client' => false],
            ],
        ],
        'calendar' => ['admin' => true, 'secretary' => true, 'accountant' => true, 'client' => false],
        'work-update' => [
            'admin' => true,
            'secretary' => true,
            'accountant' => false,
            'client' => false,
            'actions' => [
                'check-steps' => ['admin' => true, 'secretary' => true, 'accountant' => false, 'client' => false],
                'history' => ['admin' => true, 'secretary' => true, 'accountant' => false, 'client' => false],
                'edit' => ['admin' => true, 'secretary' => true, 'accountant' => false, 'client' => false],
                'mark-done' => ['admin' => true, 'secretary' => true, 'accountant' => false, 'client' => false],
                'decline' => ['admin' => true, 'secretary' => true, 'accountant' => false, 'client' => false],
                'archive' => ['admin' => true, 'secretary' => true, 'accountant' => false, 'client' => false],
                'restore' => ['admin' => true, 'secretary' => true, 'accountant' => false, 'client' => false],
            ],
        ],
        'my-tasks' => ['admin' => true, 'secretary' => false, 'accountant' => true, 'client' => false],
        'messaging' => ['admin' => true, 'secretary' => true, 'accountant' => false, 'client' => false],
        'invoices' => ['admin' => true, 'secretary' => false, 'accountant' => true, 'client' => false],
        'reports' => ['admin' => true, 'secretary' => true, 'accountant' => true, 'client' => false],
        'client-account' => ['admin' => false, 'secretary' => false, 'accountant' => false, 'client' => true],
    ];
}

function module_permissions_role_defaults(array $definition): array
{
    return [
        'admin' => (bool)($definition['admin'] ?? false),
        'secretary' => (bool)($definition['secretary'] ?? false),
        'accountant' => (bool)($definition['accountant'] ?? false),
        'client' => (bool)($definition['client'] ?? false),
    ];
}

function module_permissions_default_permissions(): array
{
    $defaults = [];
    foreach (module_permissions_definitions() as $featureKey => $featureDefinition) {
        $defaults[$featureKey] = module_permissions_role_defaults($featureDefinition);

        if (isset($featureDefinition['actions']) && is_array($featureDefinition['actions'])) {
            $defaults[$featureKey]['actions'] = [];
            foreach ($featureDefinition['actions'] as $actionKey => $actionDefinition) {
                $defaults[$featureKey]['actions'][$actionKey] = module_permissions_role_defaults($actionDefinition);
            }
        }
    }

    return $defaults;
}

function module_permissions_normalize_bool($value, bool $default = false): bool
{
    if (is_bool($value)) {
        return $value;
    }

    if (is_int($value)) {
        return $value !== 0;
    }

    if (is_float($value)) {
        return ((int)$value) !== 0;
    }

    $normalized = strtolower(trim((string)($value ?? '')));
    if ($normalized === '') {
        return $default;
    }

    if (in_array($normalized, ['1', 'true', 'yes', 'on'], true)) {
        return true;
    }

    if (in_array($normalized, ['0', 'false', 'no', 'off'], true)) {
        return false;
    }

    return $default;
}

function module_permissions_normalize(array $permissions): array
{
    $definitions = module_permissions_definitions();
    $defaults = module_permissions_default_permissions();
    $normalized = $defaults;

    foreach ($definitions as $featureKey => $featureDefinition) {
        $featurePermissions = isset($permissions[$featureKey]) && is_array($permissions[$featureKey])
            ? $permissions[$featureKey]
            : [];

        $normalized[$featureKey] = [
            'admin' => module_permissions_normalize_bool($featurePermissions['admin'] ?? null, (bool)$featureDefinition['admin']),
            'secretary' => module_permissions_normalize_bool($featurePermissions['secretary'] ?? null, (bool)$featureDefinition['secretary']),
            'accountant' => module_permissions_normalize_bool($featurePermissions['accountant'] ?? null, (bool)$featureDefinition['accountant']),
            'client' => module_permissions_normalize_bool($featurePermissions['client'] ?? null, (bool)$featureDefinition['client']),
        ];

        if (isset($featureDefinition['actions']) && is_array($featureDefinition['actions'])) {
            $featureActions = isset($featurePermissions['actions']) && is_array($featurePermissions['actions'])
                ? $featurePermissions['actions']
                : [];
            $hasStoredActions = count($featureActions) > 0;

            $normalized[$featureKey]['actions'] = [];
            foreach ($featureDefinition['actions'] as $actionKey => $actionDefinition) {
                $actionPermissions = isset($featureActions[$actionKey]) && is_array($featureActions[$actionKey])
                    ? $featureActions[$actionKey]
                    : (($featureKey === 'tasks' && isset($featureActions['show-actions']) && is_array($featureActions['show-actions']))
                        ? $featureActions['show-actions']
                        : (!$hasStoredActions ? $featurePermissions : []));
                $defaultActionPermissions = $defaults[$featureKey]['actions'][$actionKey] ?? module_permissions_role_defaults($actionDefinition);

                $normalized[$featureKey]['actions'][$actionKey] = [
                    'admin' => module_permissions_normalize_bool($actionPermissions['admin'] ?? null, (bool)$defaultActionPermissions['admin']),
                    'secretary' => module_permissions_normalize_bool($actionPermissions['secretary'] ?? null, (bool)$defaultActionPermissions['secretary']),
                    'accountant' => module_permissions_normalize_bool($actionPermissions['accountant'] ?? null, (bool)$defaultActionPermissions['accountant']),
                    'client' => module_permissions_normalize_bool($actionPermissions['client'] ?? null, (bool)$defaultActionPermissions['client']),
                ];
            }

            if (!in_array($featureKey, ['certificate', 'edit-certificate'], true)) {
                $actionValues = array_values($normalized[$featureKey]['actions']);
                $normalized[$featureKey]['admin'] = false;
                $normalized[$featureKey]['secretary'] = false;
                $normalized[$featureKey]['accountant'] = false;
                $normalized[$featureKey]['client'] = false;
                foreach ($actionValues as $actionValue) {
                    if (($actionValue['admin'] ?? false) === true) {
                        $normalized[$featureKey]['admin'] = true;
                    }
                    if (($actionValue['secretary'] ?? false) === true) {
                        $normalized[$featureKey]['secretary'] = true;
                    }
                    if (($actionValue['accountant'] ?? false) === true) {
                        $normalized[$featureKey]['accountant'] = true;
                    }
                    if (($actionValue['client'] ?? false) === true) {
                        $normalized[$featureKey]['client'] = true;
                    }
                }
            }
        }
    }

    return $normalized;
}

function module_permissions_save(array $permissions): array
{
    $normalized = module_permissions_normalize($permissions);
    $encoded = json_encode($normalized, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
    if ($encoded === false) {
        module_permissions_respond(500, [
            'success' => false,
            'message' => 'Unable to encode module permissions.',
        ]);
    }

    module_permissions_ensure_storage_directory();
    if (@file_put_contents(MONITORING_MODULE_PERMISSIONS_FILE, $encoded, LOCK_EX) === false) {
        module_permissions_respond(500, [
            'success' => false,
            'message' => 'Unable to save module permissions.',
        ]);
    }

    return $normalized;
}

function module_permissions_load(): array
{
    $rawValue = module_permissions_read_file_contents();

    if ($rawValue === false || trim((string)$rawValue) === '') {
        return module_permissions_default_permissions();
    }

    $decoded = json_decode((string)$rawValue, true);
    if (!is_array($decoded)) {
        return module_permissions_default_permissions();
    }

    return module_permissions_normalize($decoded);
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

        $previousEnabled = (bool)($featurePermissions[$roleKey] ?? false);
        $nextFeaturePermissions = isset($nextPermissions[$featureKey]) && is_array($nextPermissions[$featureKey])
            ? $nextPermissions[$featureKey]
            : [];
        $nextEnabled = (bool)($nextFeaturePermissions[$roleKey] ?? false);

        if ($previousEnabled && !$nextEnabled) {
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
            'permissions' => module_permissions_load(),
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

        $previousPermissions = module_permissions_load();
        $permissions = module_permissions_save($payload);
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
        } catch (Throwable $__) {
            $grantedNotifiedUsers = 0;
        }
        try {
            $revokedNotifiedUsers = module_permissions_notify_revoked_access(
                $conn,
                $previousPermissions,
                $permissions,
                $sessionUser
            );
        } catch (Throwable $__) {
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
        'message' => 'Server error',
        'error' => $e->getMessage(),
    ]);
}