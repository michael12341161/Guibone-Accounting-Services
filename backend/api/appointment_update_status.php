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

function normalizeAppointmentStatus(string $statusInput): string {
    $value = strtolower(trim($statusInput));
    $aliases = [
        'approve' => 'approved',
        'active' => 'approved',
        'started' => 'approved',
        'in progress' => 'approved',
        'complete' => 'approved',
        'completed' => 'approved',
        'done' => 'approved',
        'reject' => 'rejected',
        'rejected' => 'rejected',
        'decline' => 'rejected',
        'declined' => 'rejected',
        'cancelled' => 'rejected',
        'canceled' => 'rejected',
        'not started' => 'pending',
    ];
    return isset($aliases[$value]) ? $aliases[$value] : $value;
}

function resolveAppointmentActionColumn(PDO $conn): ?string {
    static $cached = null;
    if ($cached !== null) {
        return $cached !== '' ? $cached : null;
    }

    foreach (['action_by', 'User_ID'] as $column) {
        try {
            $stmt = $conn->prepare('SHOW COLUMNS FROM `appointment` LIKE :column');
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

function resolveAppointmentStatusId(PDO $conn, string $statusInput): int {
    $normalized = normalizeAppointmentStatus($statusInput);

    $candidates = [$statusInput];
    if ($normalized === 'approved') {
        $candidates = ['Approved', 'Active', 'Started', 'In Progress'];
    } elseif ($normalized === 'rejected') {
        $candidates = ['Reject', 'Rejected', 'Declined', 'Cancelled'];
    } elseif ($normalized === 'pending' || $normalized === 'not started') {
        $candidates = ['Pending', 'Not Started'];
    }

    $stmt = $conn->prepare(
        'SELECT Status_id
         FROM status
         WHERE Status_group = "APPOINTMENT"
           AND LOWER(Status_name) = LOWER(:n)
         LIMIT 1'
    );

    foreach ($candidates as $candidate) {
        $candidate = trim((string)$candidate);
        if ($candidate === '') {
            continue;
        }
        $stmt->execute([':n' => $candidate]);
        $id = (int)($stmt->fetchColumn() ?: 0);
        if ($id > 0) {
            return $id;
        }
    }

    $fallback = [
        'pending' => 6,
        'approved' => 7,
        'rejected' => 8,
    ];
    return isset($fallback[$normalized]) ? (int)$fallback[$normalized] : 0;
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

    $appointmentId = isset($data['appointment_id']) ? (int)$data['appointment_id'] : 0;
    $status = isset($data['status']) ? trim((string)$data['status']) : '';

    if ($appointmentId <= 0) {
        respond(422, ['success' => false, 'message' => 'appointment_id is required']);
    }
    if ($status === '') {
        respond(422, ['success' => false, 'message' => 'status is required']);
    }

    $check = $conn->prepare('SELECT Appointment_ID, Client_ID FROM appointment WHERE Appointment_ID = :id LIMIT 1');
    $check->execute([':id' => $appointmentId]);
    $appointmentRow = $check->fetch(PDO::FETCH_ASSOC);
    if (!$appointmentRow) {
        respond(404, ['success' => false, 'message' => 'Appointment not found']);
    }
    monitoring_require_client_access((int)($appointmentRow['Client_ID'] ?? 0), [MONITORING_ROLE_ADMIN, MONITORING_ROLE_SECRETARY]);

    $statusId = resolveAppointmentStatusId($conn, $status);
    if ($statusId <= 0) {
        respond(422, ['success' => false, 'message' => 'Unable to map status']);
    }

    $normalizedStatus = normalizeAppointmentStatus($status);
    $actionColumn = resolveAppointmentActionColumn($conn);
    $params = [
        ':sid' => $statusId,
        ':id' => $appointmentId,
    ];
    $sql = 'UPDATE appointment SET Status_ID = :sid';

    if ($actionColumn !== null) {
        if ($normalizedStatus === 'approved' || $normalizedStatus === 'rejected') {
            $sql .= ', ' . quoteIdentifier($actionColumn) . ' = :action_by';
            $params[':action_by'] = (int)($sessionUser['id'] ?? 0) > 0 ? (int)$sessionUser['id'] : null;
        } elseif ($normalizedStatus === 'pending') {
            $sql .= ', ' . quoteIdentifier($actionColumn) . ' = NULL';
        }
    }

    $sql .= ' WHERE Appointment_ID = :id';
    $upd = $conn->prepare($sql);
    $upd->execute($params);

    respond(200, ['success' => true]);
} catch (Throwable $e) {
    respond(500, ['success' => false, 'message' => 'Server error', 'error' => $e->getMessage()]);
}
