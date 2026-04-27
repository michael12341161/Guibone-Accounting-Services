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

function statusLabel(string $statusName): string {
    $value = strtolower(trim($statusName));
    if ($value === 'not started' || $value === 'pending') {
        return 'Pending';
    }
    if ($value === 'started' || $value === 'in progress' || $value === 'approved' || $value === 'active') {
        return 'Approved';
    }
    if ($value === 'reject' || $value === 'rejected' || $value === 'cancelled' || $value === 'declined' || $value === 'canceled') {
        return 'Declined';
    }
    if ($value === 'completed' || $value === 'done') {
        return 'Completed';
    }
    return $statusName !== '' ? $statusName : 'Pending';
}

function readDescriptionMetaValue(string $text, string $key): ?string {
    $source = trim($text);
    if ($source === '') {
        return null;
    }

    $escapedKey = preg_quote($key, '/');
    if (!preg_match_all('/^\s*\[' . $escapedKey . '\]\s*([^\r\n]*)\s*$/im', $source, $matches)) {
        return null;
    }

    $values = array_values(array_filter(array_map(static function ($value) {
        return trim((string)$value);
    }, $matches[1]), static function ($value) {
        return $value !== '';
    }));

    if (empty($values)) {
        return null;
    }

    return $values[count($values) - 1];
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

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    respond(405, ['success' => false, 'message' => 'Method not allowed']);
}

try {
    $sessionUser = monitoring_require_auth();
    $conn->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

    $clientId = isset($_GET['client_id']) ? (int)$_GET['client_id'] : 0;
    $roleId = (int)($sessionUser['role_id'] ?? 0);
    if ($roleId === MONITORING_ROLE_CLIENT) {
        $clientId = (int)($sessionUser['client_id'] ?? 0);
        if ($clientId <= 0) {
            monitoring_auth_respond(403, ['success' => false, 'message' => 'Access denied.']);
        }
    } elseif (!monitoring_user_has_role_or_any_module_access(
        $conn,
        $sessionUser,
        [MONITORING_ROLE_ADMIN, MONITORING_ROLE_SECRETARY],
        ['scheduling', 'calendar', 'reports']
    )) {
        monitoring_auth_respond(403, ['success' => false, 'message' => 'Access denied.']);
    }
    if (session_status() === PHP_SESSION_ACTIVE) {
        session_write_close();
    }

    if ($roleId !== MONITORING_ROLE_CLIENT && $clientId <= 0 && isset($_GET['client_username'])) {
        $username = trim((string)$_GET['client_username']);
        if ($username !== '') {
            $lookup = $conn->prepare(
                'SELECT c.Client_ID
                 FROM client c
                 INNER JOIN user u ON u.User_id = c.User_id
                 WHERE u.Username = :u
                 LIMIT 1'
            );
            $lookup->execute([':u' => $username]);
            $resolved = (int)($lookup->fetchColumn() ?: 0);
            if ($resolved > 0) {
                $clientId = $resolved;
            }
        }
    }

    $where = '';
    $params = [];
    if ($clientId > 0) {
        $where = 'WHERE s.Client_ID = :cid';
        $params[':cid'] = $clientId;
    }
    $actionColumn = resolveConsultationActionColumn($conn);
    $actionSelect = 'NULL AS Action_by,
               NULL AS action_by,
               NULL AS User_ID,
               NULL AS action_by_name,
               NULL AS action_by_username,';
    $actionJoin = '';
    if ($actionColumn !== null) {
        $actionColumnExpr = 's.' . quoteIdentifier($actionColumn);
        $actorNameExpr = "NULLIF(TRIM(CONCAT_WS(' ', NULLIF(TRIM(au.first_name), ''), NULLIF(TRIM(au.middle_name), ''), NULLIF(TRIM(au.last_name), ''))), '')";
        $actionSelect = "{$actionColumnExpr} AS Action_by,
               {$actionColumnExpr} AS action_by,
               {$actionColumnExpr} AS User_ID,
               COALESCE({$actorNameExpr}, NULLIF(TRIM(au.Username), ''), CASE WHEN {$actionColumnExpr} IS NOT NULL THEN CONCAT('User #', {$actionColumnExpr}) ELSE NULL END) AS action_by_name,
               au.Username AS action_by_username,";
        $actionJoin = "LEFT JOIN user au ON au.User_id = {$actionColumnExpr}";
    }

    $sql = "
        SELECT s.Consultation_ID,
               s.Client_ID,
               s.Services_type_Id,
               s.Description,
               s.Date,
               s.Status_ID,
               {$actionSelect}
               st.Status_name,
               sv.Name AS service_name,
               CONCAT_WS(' ', c.First_name, c.Middle_name, c.Last_name) AS Client_name
        FROM consultation s
        LEFT JOIN status st ON st.Status_id = s.Status_ID
        LEFT JOIN services_type sv ON sv.Services_type_Id = s.Services_type_Id
        LEFT JOIN client c ON c.Client_ID = s.Client_ID
        {$actionJoin}
        {$where}
        ORDER BY s.Date DESC, s.Consultation_ID DESC
    ";

    $stmt = $conn->prepare($sql);
    $stmt->execute($params);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];

    $out = [];
    foreach ($rows as $row) {
        $desc = isset($row['Description']) ? (string)$row['Description'] : '';

        $time = '';
        if (preg_match('/^\s*\[Time\]\s*([0-9]{1,2}:[0-9]{2})\s*$/im', $desc, $m)) {
            $time = (string)$m[1];
        }

        $appointmentType = '';
        if (preg_match('/^\s*\[Appointment_Type\]\s*(Online|Onsite)\s*$/im', $desc, $m)) {
            $appointmentType = (string)$m[1];
        }

        $notes = '';
        if (preg_match('/^\s*\[Notes\]\s*(.+)\s*$/im', $desc, $m)) {
            $notes = trim((string)$m[1]);
        }

        $rescheduleReason = '';
        if (preg_match('/^\s*\[Reschedule_Reason\]\s*(.+)\s*$/im', $desc, $m)) {
            $rescheduleReason = trim((string)$m[1]);
        }

        $typeName = '';
        if (preg_match('/^\s*\[Type\]\s*(.+)\s*$/im', $desc, $m)) {
            $typeName = trim((string)$m[1]);
        }

        $selectedServiceName = '';
        if (preg_match('/^\s*\[Service\]\s*(.+)\s*$/im', $desc, $m)) {
            $selectedServiceName = trim((string)$m[1]);
        }

        $appointmentId = null;
        if (preg_match('/^\s*\[Appointment_ID\]\s*(\d+)\s*$/im', $desc, $m)) {
            $appointmentId = (int)$m[1];
        }

        $statusName = isset($row['Status_name']) ? (string)$row['Status_name'] : '';
        $status = statusLabel($statusName);
        $serviceName = $selectedServiceName !== ''
            ? $selectedServiceName
            : (isset($row['service_name']) ? trim((string)$row['service_name']) : '');
        if ($serviceName === '') {
            $serviceName = 'Consultation';
        }
        $recordType = $typeName !== '' ? $typeName : 'Consultation';
        $createdAt = readDescriptionMetaValue($desc, 'CreatedAt');

        $notesValue = $notes;
        if ($rescheduleReason !== '') {
            $notesValue = $notesValue !== ''
                ? $notesValue . "\nReschedule reason: " . $rescheduleReason
                : 'Reschedule reason: ' . $rescheduleReason;
        }

        $out[] = [
            'Consultation_ID' => isset($row['Consultation_ID']) ? (int)$row['Consultation_ID'] : null,
            'Scheduling_ID' => isset($row['Consultation_ID']) ? (int)$row['Consultation_ID'] : null,
            'consultation_id' => isset($row['Consultation_ID']) ? (int)$row['Consultation_ID'] : null,
            'id' => isset($row['Consultation_ID']) ? (int)$row['Consultation_ID'] : null,
            'Appointment_ID' => $appointmentId,
            'Client_ID' => isset($row['Client_ID']) ? (int)$row['Client_ID'] : null,
            'client_id' => isset($row['Client_ID']) ? (int)$row['Client_ID'] : null,
            'Client_name' => $row['Client_name'] ?? null,
            'client_name' => $row['Client_name'] ?? null,
            'user_id' => isset($row['User_ID']) ? (int)$row['User_ID'] : null,
            'action_by' => isset($row['action_by']) && $row['action_by'] !== null ? (int)$row['action_by'] : null,
            'Action_by' => isset($row['Action_by']) && $row['Action_by'] !== null ? (int)$row['Action_by'] : null,
            'action_by_name' => $row['action_by_name'] ?? null,
            'action_by_username' => $row['action_by_username'] ?? null,
            'Date' => $row['Date'] ?? null,
            'date' => $row['Date'] ?? null,
            'Time' => $time !== '' ? $time : null,
            'time' => $time !== '' ? $time : null,
            'Appointment_Type' => $appointmentType !== '' ? $appointmentType : null,
            'appointment_type' => $appointmentType !== '' ? $appointmentType : null,
            'Notes' => $notesValue !== '' ? $notesValue : null,
            'notes' => $notesValue !== '' ? $notesValue : null,
            'Reschedule_Reason' => $rescheduleReason !== '' ? $rescheduleReason : null,
            'reschedule_reason' => $rescheduleReason !== '' ? $rescheduleReason : null,
            'created_at' => $createdAt,
            'createdAt' => $createdAt,
            'Status_ID' => isset($row['Status_ID']) ? (int)$row['Status_ID'] : null,
            'Status_name' => $statusName !== '' ? $statusName : 'Pending',
            'Status' => $status,
            'status' => $status,
            'Services_type_Id' => isset($row['Services_type_Id']) ? (int)$row['Services_type_Id'] : null,
            'service_id' => isset($row['Services_type_Id']) ? (int)$row['Services_type_Id'] : null,
            'Consultation_Service' => $serviceName,
            'consultation_service' => $serviceName,
            'Name' => $serviceName,
            'service' => $serviceName,
            'Type' => $recordType,
            'type' => $recordType,
            'record_kind' => 'consultation',
            'Description' => $desc,
            'description' => $desc,
        ];
    }

    respond(200, ['success' => true, 'rows' => $out]);
} catch (Throwable $e) {
    error_log('scheduling_list error: ' . $e->getMessage());
    respond(500, ['success' => false, 'message' => 'Server error']);
}
