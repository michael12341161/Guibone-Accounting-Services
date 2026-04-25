<?php

require_once __DIR__ . '/status_helpers.php';

if (!function_exists('monitoring_get_inactive_account_message')) {
    function monitoring_get_inactive_account_message(): string
    {
        return 'Your account is currently inactive. Please contact the administrator to restore access.';
    }
}

if (!function_exists('monitoring_user_status_connection')) {
    function monitoring_user_status_connection(): ?PDO
    {
        if (isset($GLOBALS['conn']) && $GLOBALS['conn'] instanceof PDO) {
            return $GLOBALS['conn'];
        }

        $conn = null;
        require __DIR__ . '/connection-pdo.php';
        if (isset($conn) && $conn instanceof PDO) {
            $GLOBALS['conn'] = $conn;
            return $conn;
        }

        return null;
    }
}

if (!function_exists('monitoring_resolve_employment_status_id')) {
    function monitoring_resolve_employment_status_id(PDO $conn, string $label): ?int
    {
        $normalized = monitoring_normalize_status_key($label);
        if ($normalized === 'active') {
            return monitoring_resolve_status_id($conn, 'EMPLOYMENT', ['Active'], 3);
        }
        if ($normalized === 'inactive') {
            return monitoring_resolve_status_id($conn, 'EMPLOYMENT', ['Inactive'], 4);
        }
        if ($normalized === 'resigned') {
            return monitoring_resolve_status_id($conn, 'EMPLOYMENT', ['Resigned'], 5);
        }

        return null;
    }
}

if (!function_exists('monitoring_default_employment_status_id')) {
    function monitoring_default_employment_status_id(PDO $conn): int
    {
        return monitoring_resolve_employment_status_id($conn, 'Active') ?? 3;
    }
}

if (!function_exists('monitoring_ensure_user_employment_status_column')) {
    function monitoring_ensure_user_employment_status_column(PDO $conn): void
    {
        static $checked = false;
        if ($checked) {
            return;
        }

        $checked = true;
        monitoring_require_schema_table($conn, 'user', 'user account status');
        monitoring_require_schema_columns(
            $conn,
            'user',
            ['Employment_status_id'],
            'user account status'
        );
    }
}

if (!function_exists('monitoring_employee_status_label')) {
    function monitoring_employee_status_label(?string $statusName, $statusId, string $fallback = 'Active'): string
    {
        if (monitoring_status_matches($statusName, ['Active'])) {
            return 'Active';
        }
        if (monitoring_status_matches($statusName, ['Inactive'])) {
            return 'Inactive';
        }
        if (monitoring_status_matches($statusName, ['Resigned'])) {
            return 'Resigned';
        }

        $value = (int)($statusId ?? 0);
        if ($value === 3) {
            return 'Active';
        }
        if ($value === 4) {
            return 'Inactive';
        }
        if ($value === 5) {
            return 'Resigned';
        }

        return $fallback;
    }
}

if (!function_exists('monitoring_client_activity_status')) {
    function monitoring_client_activity_status(?string $statusName, $statusId, string $fallback = 'Pending'): string
    {
        if (monitoring_status_matches($statusName, ['Active', 'Approved'])) {
            return 'Active';
        }
        if (monitoring_status_matches($statusName, ['Inactive', 'Rejected', 'Reject', 'Declined', 'Cancelled', 'Canceled'])) {
            return 'Inactive';
        }
        if (monitoring_status_matches($statusName, ['Pending', 'Not Started'])) {
            return 'Pending';
        }

        $value = (int)($statusId ?? 0);
        if ($value === 1) {
            return 'Active';
        }
        if ($value === 2) {
            return 'Inactive';
        }

        return $fallback;
    }
}

if (!function_exists('monitoring_map_account_access_status')) {
    function monitoring_map_account_access_status(array $row): array
    {
        $roleId = isset($row['role_id']) ? (int)$row['role_id'] : 0;
        $clientStatusId = isset($row['client_status_id']) ? (int)$row['client_status_id'] : null;
        $clientStatusName = isset($row['client_status_name']) ? (string)$row['client_status_name'] : null;
        $employmentStatusId = isset($row['employment_status_id']) ? (int)$row['employment_status_id'] : null;
        $employmentStatusName = isset($row['employment_status_name']) ? (string)$row['employment_status_name'] : null;
        $clientActivityStatus = monitoring_client_activity_status($clientStatusName, $clientStatusId, 'Pending');
        $approvalStatus = $roleId === MONITORING_ROLE_CLIENT
            ? monitoring_client_approval_status($clientStatusName, $clientStatusId, 'Pending')
            : null;
        $employmentStatus = monitoring_employee_status_label($employmentStatusName, $employmentStatusId, 'Active');
        $rejectionReason = trim((string)($row['client_rejection_reason'] ?? ''));
        $blockedMessage = null;
        $isInactive = false;

        if ($roleId === MONITORING_ROLE_CLIENT) {
            if ($clientActivityStatus === 'Inactive' && $rejectionReason === '') {
                $isInactive = true;
                $blockedMessage = monitoring_get_inactive_account_message();
            } elseif (strcasecmp((string)$approvalStatus, 'Approved') !== 0) {
                $blockedMessage = strcasecmp((string)$approvalStatus, 'Rejected') === 0
                    ? 'Your registration was rejected. Please check your email for the reason and submit a new application after completing the requirements.'
                    : 'Your account is still pending approval. Please wait for approval before logging in.';
            }
        } elseif ($roleId > 0 && strcasecmp($employmentStatus, 'Active') !== 0) {
            $isInactive = true;
            $blockedMessage = monitoring_get_inactive_account_message();
        }

        return [
            'user_id' => isset($row['user_id']) ? (int)$row['user_id'] : 0,
            'role_id' => $roleId,
            'client_id' => isset($row['client_id']) && $row['client_id'] !== null ? (int)$row['client_id'] : null,
            'client_status_id' => $clientStatusId,
            'client_status_name' => $clientStatusName,
            'client_activity_status' => $clientActivityStatus,
            'employment_status_id' => $employmentStatusId,
            'employment_status_name' => $employmentStatus,
            'approval_status' => $approvalStatus,
            'rejection_reason' => $rejectionReason !== '' ? $rejectionReason : null,
            'is_inactive' => $isInactive,
            'blocked_message' => $blockedMessage,
        ];
    }
}

if (!function_exists('monitoring_fetch_account_access_status_by_user_id')) {
    function monitoring_fetch_account_access_status_by_user_id(PDO $conn, int $userId): ?array
    {
        if ($userId <= 0) {
            return null;
        }

        monitoring_ensure_user_employment_status_column($conn);
        $statement = $conn->prepare(
            'SELECT u.User_id AS user_id,
                    u.Role_id AS role_id,
                    u.Employment_status_id AS employment_status_id,
                    es.Status_name AS employment_status_name,
                    c.Client_ID AS client_id,
                    c.Status_id AS client_status_id,
                    cs.Status_name AS client_status_name,
                    c.Rejection_reason AS client_rejection_reason
             FROM user u
             LEFT JOIN status es ON es.Status_id = u.Employment_status_id
             LEFT JOIN client c ON c.User_id = u.User_id
             LEFT JOIN status cs ON cs.Status_id = c.Status_id
             WHERE u.User_id = :user_id
             LIMIT 1'
        );
        $statement->execute([':user_id' => $userId]);
        $row = $statement->fetch(PDO::FETCH_ASSOC);
        if (!$row) {
            return null;
        }

        return monitoring_map_account_access_status($row);
    }
}

if (!function_exists('monitoring_fetch_account_access_status_by_email')) {
    function monitoring_fetch_account_access_status_by_email(PDO $conn, string $email): ?array
    {
        $normalizedEmail = trim($email);
        if ($normalizedEmail === '') {
            return null;
        }

        monitoring_ensure_user_employment_status_column($conn);
        $statement = $conn->prepare(
            'SELECT u.User_id AS user_id,
                    u.Role_id AS role_id,
                    u.Employment_status_id AS employment_status_id,
                    es.Status_name AS employment_status_name,
                    c.Client_ID AS client_id,
                    c.Status_id AS client_status_id,
                    cs.Status_name AS client_status_name,
                    c.Rejection_reason AS client_rejection_reason
             FROM user u
             LEFT JOIN status es ON es.Status_id = u.Employment_status_id
             LEFT JOIN client c ON c.User_id = u.User_id
             LEFT JOIN status cs ON cs.Status_id = c.Status_id
             WHERE LOWER(u.Email) = LOWER(:email)
             LIMIT 1'
        );
        $statement->execute([':email' => $normalizedEmail]);
        $row = $statement->fetch(PDO::FETCH_ASSOC);
        if (!$row) {
            return null;
        }

        return monitoring_map_account_access_status($row);
    }
}
