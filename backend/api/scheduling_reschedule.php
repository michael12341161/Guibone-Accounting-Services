<?php
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/connection-pdo.php';

monitoring_bootstrap_api(['POST', 'OPTIONS']);

function respond($code, $payload) {
    http_response_code($code);
    echo json_encode($payload);
    exit;
}

function quoteIdentifier(string $name): string {
    return '`' . str_replace('`', '``', $name) . '`';
}

function resolveConsultationActionColumn(PDO $conn): ?string {
    static $cached = null;
    if ($cached !== null) {
        return $cached !== '' ? $cached : null;
    }

    foreach (['action_by', 'User_ID'] as $column) {
        try {
            $stmt = $conn->prepare('SHOW COLUMNS FROM `consultation` LIKE :column');
            $stmt->execute([':column' => $column]);
            if ($stmt->fetch(PDO::FETCH_ASSOC)) {
                $cached = $column;
                return $cached;
            }
        } catch (Throwable $__) {
            // Try the next candidate.
        }
    }

    $cached = '';
    return null;
}

function resolveClientId(PDO $conn, int $clientId, string $clientUsername): int {
    if ($clientId > 0) {
        $c = $conn->prepare('SELECT Client_ID FROM client WHERE Client_ID = :cid LIMIT 1');
        $c->execute([':cid' => $clientId]);
        if ($c->fetchColumn()) {
            return $clientId;
        }

        $map = $conn->prepare('SELECT Client_ID FROM client WHERE User_id = :uid LIMIT 1');
        $map->execute([':uid' => $clientId]);
        $mapped = (int)($map->fetchColumn() ?: 0);
        if ($mapped > 0) {
            $c2 = $conn->prepare('SELECT Client_ID FROM client WHERE Client_ID = :cid LIMIT 1');
            $c2->execute([':cid' => $mapped]);
            if ($c2->fetchColumn()) {
                return $mapped;
            }
        }
    }

    if ($clientUsername !== '') {
        $u = $conn->prepare('SELECT User_id FROM user WHERE Username = :u LIMIT 1');
        $u->execute([':u' => $clientUsername]);
        $resolvedUserId = (int)($u->fetchColumn() ?: 0);
        if ($resolvedUserId > 0) {
            $c = $conn->prepare('SELECT Client_ID FROM client WHERE User_id = :uid LIMIT 1');
            $c->execute([':uid' => $resolvedUserId]);
            $resolvedClientId = (int)($c->fetchColumn() ?: 0);
            if ($resolvedClientId > 0) {
                return $resolvedClientId;
            }
        }
    }

    return 0;
}

function resolveStatusId(PDO $conn, string $group, $names, int $fallback): int {
    $stmt = $conn->prepare(
        'SELECT Status_id
         FROM status
         WHERE Status_group = :grp
           AND LOWER(Status_name) = LOWER(:name)
         LIMIT 1'
    );

    $candidates = is_array($names) ? $names : [$names];
    foreach ($candidates as $name) {
        $name = trim((string)$name);
        if ($name === '') {
            continue;
        }

        $stmt->execute([':grp' => $group, ':name' => $name]);
        $id = (int)($stmt->fetchColumn() ?: 0);
        if ($id > 0) {
            return $id;
        }
    }

    return $fallback;
}

function normalizeSchedulingStatus(string $statusName): string {
    $value = strtolower(trim($statusName));

    if ($value === '' || $value === 'not started' || $value === 'pending') {
        return 'pending';
    }
    if ($value === 'started' || $value === 'in progress' || $value === 'approved' || $value === 'active') {
        return 'approved';
    }
    if ($value === 'reject' || $value === 'rejected' || $value === 'cancelled' || $value === 'declined' || $value === 'canceled') {
        return 'declined';
    }
    if ($value === 'completed' || $value === 'done') {
        return 'completed';
    }

    return $value;
}

function upsertMetaLine(string $description, string $key, string $value): string {
    $line = '[' . trim($key) . '] ' . trim($value);
    $pattern = '/^\s*\[' . preg_quote(trim($key), '/') . '\]\s*.*$/im';

    if (preg_match($pattern, $description)) {
        return trim((string)preg_replace($pattern, $line, $description, 1));
    }

    $description = trim($description);
    return $description === '' ? $line : $description . "\n" . $line;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    respond(405, ['success' => false, 'message' => 'Method not allowed']);
}

try {
    $sessionUser = monitoring_require_auth();
    $conn->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

    $raw = file_get_contents('php://input');
    $data = json_decode($raw, true);
    if (!is_array($data)) {
        respond(400, ['success' => false, 'message' => 'Invalid JSON payload']);
    }

    $schedulingId = isset($data['scheduling_id']) ? (int)$data['scheduling_id'] : 0;
    if ($schedulingId <= 0 && isset($data['Scheduling_ID'])) {
        $schedulingId = (int)$data['Scheduling_ID'];
    }
    if ($schedulingId <= 0 && isset($data['id'])) {
        $schedulingId = (int)$data['id'];
    }

    $clientId = isset($data['client_id']) ? (int)$data['client_id'] : 0;
    $clientUsername = isset($data['client_username']) ? trim((string)$data['client_username']) : '';
    $date = isset($data['date']) ? trim((string)$data['date']) : '';
    $time = isset($data['time']) ? trim((string)$data['time']) : '';
    $reason = isset($data['reason'])
        ? trim((string)$data['reason'])
        : (isset($data['reschedule_reason']) ? trim((string)$data['reschedule_reason']) : '');
    $roleId = (int)($sessionUser['role_id'] ?? 0);

    if ($roleId === MONITORING_ROLE_CLIENT) {
        $clientId = (int)($sessionUser['client_id'] ?? 0);
        $clientUsername = '';
        if ($clientId <= 0) {
            monitoring_auth_respond(403, ['success' => false, 'message' => 'Access denied.']);
        }
    } elseif (!in_array($roleId, [MONITORING_ROLE_ADMIN, MONITORING_ROLE_SECRETARY], true)) {
        monitoring_auth_respond(403, ['success' => false, 'message' => 'Access denied.']);
    }

    if ($schedulingId <= 0) {
        respond(422, ['success' => false, 'message' => 'scheduling_id is required']);
    }
    if ($clientId <= 0 && $clientUsername === '') {
        respond(422, ['success' => false, 'message' => 'client_id or client_username is required']);
    }
    if ($date === '' || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) {
        respond(422, ['success' => false, 'message' => 'date must be YYYY-MM-DD']);
    }
    if ($time === '' || !preg_match('/^\d{2}:\d{2}(:\d{2})?$/', $time)) {
        respond(422, ['success' => false, 'message' => 'time must be HH:MM or HH:MM:SS']);
    }
    if (preg_match('/^\d{2}:\d{2}:\d{2}$/', $time)) {
        $time = substr($time, 0, 5);
    }
    $reason = preg_replace('/\s+/', ' ', $reason ?? '');
    $reason = trim((string)$reason);
    if ($reason === '') {
        respond(422, ['success' => false, 'message' => 'reason is required']);
    }
    if (strlen($reason) > 500) {
        respond(422, ['success' => false, 'message' => 'reason must be 500 characters or fewer']);
    }

    $resolvedClientId = resolveClientId($conn, $clientId, $clientUsername);
    if ($resolvedClientId <= 0) {
        respond(404, ['success' => false, 'message' => 'Client not found']);
    }

    $currentStmt = $conn->prepare(
        'SELECT s.Scheduling_ID,
                s.Client_ID,
                s.Status_ID,
                s.Description,
                s.Date,
                st.Status_name
         FROM consultation s
         LEFT JOIN status st ON st.Status_id = s.Status_ID
         WHERE s.Scheduling_ID = :id
         LIMIT 1'
    );
    $currentStmt->execute([':id' => $schedulingId]);
    $current = $currentStmt->fetch(PDO::FETCH_ASSOC);

    if (!$current) {
        respond(404, ['success' => false, 'message' => 'Consultation not found']);
    }
    if ((int)($current['Client_ID'] ?? 0) !== $resolvedClientId) {
        respond(403, ['success' => false, 'message' => 'You can only reschedule your own consultation']);
    }

    $statusKey = normalizeSchedulingStatus((string)($current['Status_name'] ?? ''));
    if ($statusKey === 'declined' || $statusKey === 'completed') {
        respond(409, ['success' => false, 'message' => 'This consultation can no longer be rescheduled.']);
    }

    $conflictStmt = $conn->prepare(
        'SELECT s.Scheduling_ID
         FROM consultation s
         LEFT JOIN status st ON st.Status_id = s.Status_ID
         WHERE s.Scheduling_ID <> :id
           AND s.Date = :date
           AND s.Description LIKE :time_like
           AND (
               st.Status_name IS NULL OR
               LOWER(st.Status_name) NOT IN ("reject", "rejected", "cancelled", "declined", "canceled")
           )
         LIMIT 1'
    );
    $conflictStmt->execute([
        ':id' => $schedulingId,
        ':date' => $date,
        ':time_like' => "%[Time] {$time}%",
    ]);
    if ($conflictStmt->fetchColumn()) {
        respond(409, ['success' => false, 'message' => 'That time slot is already booked. Please choose another slot.']);
    }

    $pendingId = resolveStatusId($conn, 'CONSULTATION', ['Pending', 'Not Started'], 15);
    $nextStatusId = $pendingId > 0 ? $pendingId : (int)($current['Status_ID'] ?? 0);
    $updatedDescription = upsertMetaLine((string)($current['Description'] ?? ''), 'Time', $time);
    $updatedDescription = upsertMetaLine($updatedDescription, 'Reschedule_Reason', $reason);

    $actionColumn = resolveConsultationActionColumn($conn);
    $updateSql = 'UPDATE consultation
         SET Date = :date,
             Description = :description,
             Status_ID = :status_id';
    if ($actionColumn !== null) {
        $updateSql .= ",
             " . quoteIdentifier($actionColumn) . " = NULL";
    }
    $updateSql .= '
         WHERE Scheduling_ID = :id';
    $updateStmt = $conn->prepare($updateSql);
    $updateStmt->execute([
        ':date' => $date,
        ':description' => $updatedDescription,
        ':status_id' => $nextStatusId,
        ':id' => $schedulingId,
    ]);

    respond(200, [
        'success' => true,
        'message' => 'Consultation rescheduled. The request is pending confirmation.',
        'status_reset' => $statusKey !== 'pending',
        'scheduling' => [
            'id' => $schedulingId,
            'Scheduling_ID' => $schedulingId,
            'Client_ID' => $resolvedClientId,
            'client_id' => $resolvedClientId,
            'Date' => $date,
            'date' => $date,
            'Time' => $time,
            'time' => $time,
            'Status' => 'Pending',
            'status' => 'Pending',
            'Description' => $updatedDescription,
            'description' => $updatedDescription,
            'Reschedule_Reason' => $reason,
            'reschedule_reason' => $reason,
        ],
    ]);
} catch (Throwable $e) {
    respond(500, ['success' => false, 'message' => 'Server error', 'error' => $e->getMessage()]);
}
