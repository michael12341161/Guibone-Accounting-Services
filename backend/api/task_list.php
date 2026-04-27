<?php
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/connection-pdo.php';
require_once __DIR__ . '/client_service_steps_schema.php';
require_once __DIR__ . '/task_deadline_monitor.php';
require_once __DIR__ . '/employee_specialization.php';

monitoring_bootstrap_api(['GET', 'OPTIONS']);

function respond($code, $payload) {
    http_response_code($code);
    echo json_encode($payload);
    exit;
}

function quoteIdentifier(string $name): string {
    return '`' . str_replace('`', '``', $name) . '`';
}

function resolveTaskCreatedByColumn(PDO $conn): ?string {
    static $cached = null;
    if ($cached !== null) {
        return $cached !== '' ? $cached : null;
    }

    try {
        $stmt = $conn->prepare('SHOW COLUMNS FROM `client_services` LIKE :column');
        $stmt->execute([':column' => 'created_by']);
        if ($stmt->fetch(PDO::FETCH_ASSOC)) {
            $cached = 'created_by';
            return $cached;
        }
    } catch (Throwable $__) {
        // Fall through and return null.
    }

    $cached = '';
    return null;
}

function resolveTaskCreatedAtColumn(PDO $conn): ?string {
    static $cached = null;
    if ($cached !== null) {
        return $cached !== '' ? $cached : null;
    }

    foreach (['created_at', 'Created_at', 'date_created', 'created_on', 'timestamp'] as $column) {
        try {
            $stmt = $conn->prepare('SHOW COLUMNS FROM `client_services` LIKE :column');
            $stmt->execute([':column' => $column]);
            if ($stmt->fetch(PDO::FETCH_ASSOC)) {
                $cached = $column;
                return $cached;
            }
        } catch (Throwable $__) {
            // Try the next possible column name.
        }
    }

    $cached = '';
    return null;
}

function readTaskMetaLine(string $source, string $key): string {
    $pattern = '/^\s*\[' . preg_quote($key, '/') . '\]\s*([^\r\n]*)\s*$/im';
    if (preg_match($pattern, $source, $matches)) {
        return trim((string)($matches[1] ?? ''));
    }
    return '';
}

function resolveTaskPartnerId(string $description): int {
    $raw = readTaskMetaLine($description, 'PartnerId');
    $value = (int)$raw;
    return $value > 0 ? $value : 0;
}

function taskListAccountantCanAccessService(PDO $conn, int $userId, int $serviceId): bool {
    if ($userId <= 0 || $serviceId <= 0) {
        return false;
    }

    $specializationIds = employeeSpecializationGetUserAssignments($conn, $userId);
    $allowedServiceIds = employeeSpecializationResolveServiceIds($conn, $specializationIds);
    return in_array($serviceId, $allowedServiceIds, true);
}

function resolveUserDisplayName(PDO $conn, int $userId): string {
    static $cache = [];

    if ($userId <= 0) {
        return '';
    }
    if (array_key_exists($userId, $cache)) {
        return $cache[$userId];
    }

    $stmt = $conn->prepare(
        'SELECT
            u.Username AS username,
            u.first_name AS first_name,
            u.middle_name AS middle_name,
            u.last_name AS last_name
         FROM user u
         WHERE u.User_id = :uid
         LIMIT 1'
    );
    $stmt->execute([':uid' => $userId]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$row) {
        $cache[$userId] = '';
        return '';
    }

    $parts = [];
    foreach (['first_name', 'middle_name', 'last_name'] as $field) {
        $value = trim((string)($row[$field] ?? ''));
        if ($value !== '') {
            $parts[] = $value;
        }
    }

    $fullName = trim(implode(' ', $parts));
    $cache[$userId] = $fullName !== '' ? $fullName : trim((string)($row['username'] ?? ''));
    return $cache[$userId];
}

function extractProgress(string $description): int {
    if (preg_match('/^\s*\[Progress\]\s*(\d{1,3})\s*$/mi', $description, $m)) {
        $value = (int)$m[1];
        if ($value < 0) {
            return 0;
        }
        if ($value > 100) {
            return 100;
        }
        return $value;
    }
    return 0;
}

function normalizeTaskStatus(string $statusName, string $description): string {
    $status = strtolower(trim($statusName));

    if (preg_match('/^\s*\[Declined reason\]\s*/mi', $description)) {
        return 'Declined';
    }
    if (preg_match('/^\s*\[Done\]\s*$/mi', $description)) {
        return 'Completed';
    }

    if ($status === 'cancelled' || $status === 'declined' || $status === 'canceled') {
        return 'Declined';
    }
    if ($status === 'completed' || $status === 'done') {
        return 'Completed';
    }
    if ($status === 'overdue') {
        return 'Overdue';
    }
    if ($status === 'incomplete') {
        return 'Incomplete';
    }
    if (extractProgress($description) >= 100) {
        return 'Incomplete';
    }
    if ($status === 'in progress' || $status === 'started') {
        return 'In Progress';
    }
    if ($status === 'not started' || $status === 'pending' || $status === '') {
        return 'Not Started';
    }

    return $statusName !== '' ? $statusName : 'Not Started';
}

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    respond(405, ['success' => false, 'message' => 'Method not allowed']);
}

try {
    $sessionUser = monitoring_require_auth();
    $clientId = isset($_GET['client_id']) ? (int)$_GET['client_id'] : 0;
    $conn->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    monitoring_ensure_client_service_steps_column_supports_long_text($conn);
    try {
        monitoring_run_task_deadline_monitor($conn);
    } catch (Throwable $__) {
        // Keep task listing available even if deadline monitoring fails.
    }
    $filters = [];
    $params = [];
    $roleId = (int)($sessionUser['role_id'] ?? 0);

    if ($roleId === MONITORING_ROLE_CLIENT) {
        $clientId = (int)($sessionUser['client_id'] ?? 0);
        if ($clientId <= 0) {
            monitoring_auth_respond(403, ['success' => false, 'message' => 'Access denied.']);
        }
        $filters[] = 'cs.Client_ID = :cid';
        $params[':cid'] = $clientId;
    } elseif ($clientId > 0) {
        $filters[] = 'cs.Client_ID = :cid';
        $params[':cid'] = $clientId;
    }

    if (!monitoring_user_has_role_or_any_module_access(
        $conn,
        $sessionUser,
        [MONITORING_ROLE_ADMIN, MONITORING_ROLE_SECRETARY, MONITORING_ROLE_CLIENT, MONITORING_ROLE_ACCOUNTANT],
        ['tasks', 'work-update', 'calendar', 'reports']
    )) {
        monitoring_auth_respond(403, ['success' => false, 'message' => 'Access denied.']);
    }

    $createdByColumn = resolveTaskCreatedByColumn($conn);
    $createdAtColumn = resolveTaskCreatedAtColumn($conn);
    $createdBySelect = 'NULL AS created_by,
                NULL AS created_by_name,
                NULL AS created_by_username';
    $createdAtSelect = 'NULL AS created_at';
    $createdByJoin = '';
    if ($createdByColumn !== null) {
        $creatorIdExpr = 'cs.' . quoteIdentifier($createdByColumn);
        $creatorNameExpr = "NULLIF(TRIM(CONCAT_WS(' ', NULLIF(TRIM(uc.first_name), ''), NULLIF(TRIM(uc.middle_name), ''), NULLIF(TRIM(uc.last_name), ''))), '')";
        $createdBySelect = "{$creatorIdExpr} AS created_by,
                COALESCE({$creatorNameExpr}, NULLIF(TRIM(uc.Username), ''), CASE WHEN {$creatorIdExpr} IS NOT NULL THEN CONCAT('User #', {$creatorIdExpr}) ELSE NULL END) AS created_by_name,
                uc.Username AS created_by_username";
        $createdByJoin = ' LEFT JOIN user uc ON uc.User_id = ' . $creatorIdExpr;
    }
    if ($createdAtColumn !== null) {
        $createdAtSelect = 'cs.' . quoteIdentifier($createdAtColumn) . ' AS created_at';
    }

    $sql = 'SELECT
                cs.Client_services_ID AS id,
                cs.Name AS name,
                COALESCE(cs.Steps, "") AS description,
                cs.Date AS due_date,
                cs.Status_ID AS status_id,
                st.Status_name AS status_name,
                cs.Client_ID AS client_id,
                cs.Services_type_Id AS service_id,
                s.Name AS service_name,
                CONCAT_WS(" ", c.First_name, c.Middle_name, c.Last_name) AS client_name,
                cs.User_ID AS accountant_id,
                u.Username AS accountant_name,
                cert.certificate_id AS certificate_id,
                cert.issue_date AS certificate_issue_date,
                cert.delivery_status AS certificate_delivery_status,
                cert.delivery_message AS certificate_delivery_message,
                cert.delivered_at AS certificate_delivered_at,
                ' . $createdAtSelect . ',
                ' . $createdBySelect . '
            FROM client_services cs
            LEFT JOIN services_type s ON s.Services_type_Id = cs.Services_type_Id
            LEFT JOIN status st ON st.Status_id = cs.Status_ID
            LEFT JOIN client c ON c.Client_ID = cs.Client_ID
            LEFT JOIN user u ON u.User_id = cs.User_ID
            LEFT JOIN certificates cert ON cert.Client_services_ID = cs.Client_services_ID' . $createdByJoin;

    if (!empty($filters)) {
        $sql .= ' WHERE ' . implode(' AND ', $filters);
    }
    $sql .= ' ORDER BY cs.Client_services_ID DESC';

    $stmt = $conn->prepare($sql);
    $stmt->execute($params);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];

    $tasks = [];
    foreach ($rows as $row) {
        $description = (string)($row['description'] ?? '');
        $partnerId = resolveTaskPartnerId($description);
        if (
            $roleId === MONITORING_ROLE_ACCOUNTANT
            && (int)($row['accountant_id'] ?? 0) !== (int)$sessionUser['id']
            && $partnerId !== (int)$sessionUser['id']
        ) {
            continue;
        }
        if (
            $roleId === MONITORING_ROLE_ACCOUNTANT
            && !taskListAccountantCanAccessService($conn, (int)$sessionUser['id'], (int)($row['service_id'] ?? 0))
        ) {
            continue;
        }

        $status = normalizeTaskStatus((string)($row['status_name'] ?? ''), $description);
        $createdAt = trim((string)($row['created_at'] ?? ''));
        if ($createdAt === '') {
            $createdAt = readTaskMetaLine($description, 'CreatedAt');
        }
        $partnerName = trim(readTaskMetaLine($description, 'PartnerName'));
        if ($partnerId > 0) {
            $resolvedPartnerName = resolveUserDisplayName($conn, $partnerId);
            if ($resolvedPartnerName !== '') {
                $partnerName = $resolvedPartnerName;
            }
        }

        $deadline = '';
        if (preg_match('/^\s*\[Deadline\]\s*([^\r\n]+)\s*$/mi', $description, $m)) {
            $deadline = trim((string)$m[1]);
        } elseif (!empty($row['due_date'])) {
            $deadline = (string)$row['due_date'];
        }

        $tasks[] = [
            'id' => isset($row['id']) ? (int)$row['id'] : null,
            'task_id' => isset($row['id']) ? (int)$row['id'] : null,
            'task_ref_id' => null,
            'title' => $row['name'] ?? null,
            'name' => $row['name'] ?? null,
            'description' => $description,
            'status' => $status,
            'status_id' => isset($row['status_id']) ? (int)$row['status_id'] : null,
            'service' => $row['service_name'] ?? null,
            'service_name' => $row['service_name'] ?? null,
            'service_id' => isset($row['service_id']) ? (int)$row['service_id'] : null,
            'client_id' => isset($row['client_id']) ? (int)$row['client_id'] : null,
            'client_name' => $row['client_name'] ?? null,
            'created_at' => $createdAt !== '' ? $createdAt : null,
            'createdAt' => $createdAt !== '' ? $createdAt : null,
            'created_by' => isset($row['created_by']) && $row['created_by'] !== null ? (int)$row['created_by'] : null,
            'created_by_name' => $row['created_by_name'] ?? null,
            'created_by_username' => $row['created_by_username'] ?? null,
            'accountant_id' => isset($row['accountant_id']) ? (int)$row['accountant_id'] : null,
            'accountant_name' => $row['accountant_name'] ?? null,
            'certificate_id' => isset($row['certificate_id']) ? trim((string)$row['certificate_id']) : null,
            'certificate_issue_date' => $row['certificate_issue_date'] ?? null,
            'certificate_delivery_status' => $row['certificate_delivery_status'] ?? null,
            'certificate_delivery_message' => $row['certificate_delivery_message'] ?? null,
            'certificate_delivered_at' => $row['certificate_delivered_at'] ?? null,
            'partner_id' => $partnerId > 0 ? $partnerId : null,
            'partner_name' => $partnerName !== '' ? $partnerName : null,
            'deadline' => $deadline !== '' ? $deadline : null,
            'due_date' => $deadline !== '' ? $deadline : ($row['due_date'] ?? null),
        ];
    }

    respond(200, ['success' => true, 'tasks' => $tasks]);
} catch (Throwable $e) {
    error_log('task_list error: ' . $e->getMessage());
    respond(500, ['success' => false, 'message' => 'Server error']);
}
