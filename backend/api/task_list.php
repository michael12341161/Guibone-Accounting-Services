<?php
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/connection-pdo.php';

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

    if ($roleId === MONITORING_ROLE_ACCOUNTANT) {
        $filters[] = 'cs.User_ID = :accountant_id';
        $params[':accountant_id'] = (int)$sessionUser['id'];
    } elseif (!in_array($roleId, [MONITORING_ROLE_ADMIN, MONITORING_ROLE_SECRETARY, MONITORING_ROLE_CLIENT], true)) {
        monitoring_auth_respond(403, ['success' => false, 'message' => 'Access denied.']);
    }

    $createdByColumn = resolveTaskCreatedByColumn($conn);
    $createdBySelect = 'NULL AS created_by,
                NULL AS created_by_name,
                NULL AS created_by_username';
    $createdByJoin = '';
    if ($createdByColumn !== null) {
        $creatorIdExpr = 'cs.' . quoteIdentifier($createdByColumn);
        $creatorNameExpr = "NULLIF(TRIM(CONCAT_WS(' ', NULLIF(TRIM(uc.first_name), ''), NULLIF(TRIM(uc.middle_name), ''), NULLIF(TRIM(uc.last_name), ''))), '')";
        $createdBySelect = "{$creatorIdExpr} AS created_by,
                COALESCE({$creatorNameExpr}, NULLIF(TRIM(uc.Username), ''), CASE WHEN {$creatorIdExpr} IS NOT NULL THEN CONCAT('User #', {$creatorIdExpr}) ELSE NULL END) AS created_by_name,
                uc.Username AS created_by_username";
        $createdByJoin = ' LEFT JOIN user uc ON uc.User_id = ' . $creatorIdExpr;
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
                ' . $createdBySelect . '
            FROM client_services cs
            LEFT JOIN services_type s ON s.Services_type_Id = cs.Services_type_Id
            LEFT JOIN status st ON st.Status_id = cs.Status_ID
            LEFT JOIN client c ON c.Client_ID = cs.Client_ID
            LEFT JOIN user u ON u.User_id = cs.User_ID' . $createdByJoin;

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
        $status = normalizeTaskStatus((string)($row['status_name'] ?? ''), $description);

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
            'created_by' => isset($row['created_by']) && $row['created_by'] !== null ? (int)$row['created_by'] : null,
            'created_by_name' => $row['created_by_name'] ?? null,
            'created_by_username' => $row['created_by_username'] ?? null,
            'accountant_id' => isset($row['accountant_id']) ? (int)$row['accountant_id'] : null,
            'accountant_name' => $row['accountant_name'] ?? null,
            'deadline' => $deadline !== '' ? $deadline : null,
            'due_date' => $deadline !== '' ? $deadline : ($row['due_date'] ?? null),
        ];
    }

    respond(200, ['success' => true, 'tasks' => $tasks]);
} catch (Throwable $e) {
    respond(500, ['success' => false, 'message' => 'Server error', 'error' => $e->getMessage()]);
}
