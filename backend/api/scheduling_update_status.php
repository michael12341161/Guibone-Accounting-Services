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

function normalizeSchedulingStatus(string $statusName): string {
    $key = strtolower(trim($statusName));
    $aliasMap = [
        'approve' => 'approved',
        'approved' => 'approved',
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
        'cancel' => 'rejected',
        'cancelled' => 'rejected',
        'canceled' => 'rejected',
        'pending' => 'pending',
        'not started' => 'pending',
    ];
    return isset($aliasMap[$key]) ? $aliasMap[$key] : $key;
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

function mapSchedulingCandidates(string $statusName): array {
    $canonical = normalizeSchedulingStatus($statusName);

    if ($canonical === 'approved') {
        return ['Approved', 'Active', 'Started', 'In Progress'];
    }
    if ($canonical === 'rejected') {
        return ['Reject', 'Rejected', 'Declined', 'Cancelled'];
    }
    if ($canonical === 'pending') {
        return ['Not Started', 'Pending'];
    }
    return [$statusName];
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
        respond(400, ['success' => false, 'message' => 'Invalid JSON body']);
    }

    $schedulingId = isset($data['scheduling_id']) ? (int)$data['scheduling_id'] : 0;
    if ($schedulingId <= 0 && isset($data['Scheduling_ID'])) {
        $schedulingId = (int)$data['Scheduling_ID'];
    }
    if ($schedulingId <= 0 && isset($data['id'])) {
        $schedulingId = (int)$data['id'];
    }
    $status = isset($data['status']) ? trim((string)$data['status']) : '';
    if ($status === '' && isset($data['Status'])) {
        $status = trim((string)$data['Status']);
    }

    if ($schedulingId <= 0) {
        respond(400, ['success' => false, 'message' => 'scheduling_id is required']);
    }
    if ($status === '') {
        respond(400, ['success' => false, 'message' => 'status is required']);
    }

    $candidates = mapSchedulingCandidates($status);
    $candidates[] = $status;
    $candidates = array_values(array_unique(array_map('trim', $candidates)));

    $statusId = 0;
    $lookup = $conn->prepare(
        'SELECT Status_id
         FROM status
         WHERE Status_group = "CONSULTATION"
           AND LOWER(Status_name) = LOWER(:name)
         LIMIT 1'
    );
    foreach ($candidates as $candidate) {
        if ($candidate === '') {
            continue;
        }
        $lookup->execute([':name' => $candidate]);
        $id = (int)($lookup->fetchColumn() ?: 0);
        if ($id > 0) {
            $statusId = $id;
            break;
        }
    }

    if ($statusId <= 0) {
        $fallback = [
            'pending' => 15,
            'not started' => 15,
            'approve' => 14,
            'approved' => 14,
            'active' => 14,
            'started' => 14,
            'in progress' => 14,
            'complete' => 14,
            'completed' => 14,
            'done' => 14,
            'reject' => 16,
            'rejected' => 16,
            'decline' => 16,
            'declined' => 16,
            'cancel' => 16,
            'cancelled' => 16,
            'canceled' => 16,
        ];
        $key = strtolower(trim($status));
        $statusId = isset($fallback[$key]) ? (int)$fallback[$key] : 0;
    }

    if ($statusId <= 0) {
        respond(422, ['success' => false, 'message' => 'Unknown status: ' . $status]);
    }

    $ownerStmt = $conn->prepare('SELECT Client_ID FROM consultation WHERE Scheduling_ID = :id LIMIT 1');
    $ownerStmt->execute([':id' => $schedulingId]);
    $ownerRow = $ownerStmt->fetch(PDO::FETCH_ASSOC);
    if (!$ownerRow) {
        respond(404, ['success' => false, 'message' => 'Scheduling request not found']);
    }
    monitoring_require_client_access((int)($ownerRow['Client_ID'] ?? 0), [MONITORING_ROLE_ADMIN, MONITORING_ROLE_SECRETARY]);

    $normalizedStatus = normalizeSchedulingStatus($status);
    $actionColumn = resolveConsultationActionColumn($conn);
    $params = [
        ':sid' => $statusId,
        ':id' => $schedulingId,
    ];
    $sql = 'UPDATE consultation SET Status_ID = :sid';

    if ($actionColumn !== null) {
        if ($normalizedStatus === 'approved' || $normalizedStatus === 'rejected') {
            $sql .= ', ' . quoteIdentifier($actionColumn) . ' = :action_by';
            $params[':action_by'] = (int)($sessionUser['id'] ?? 0) > 0 ? (int)$sessionUser['id'] : null;
        } elseif ($normalizedStatus === 'pending') {
            $sql .= ', ' . quoteIdentifier($actionColumn) . ' = NULL';
        }
    }

    $sql .= ' WHERE Scheduling_ID = :id';
    $update = $conn->prepare($sql);
    $update->execute($params);

    if ($update->rowCount() < 1) {
        $check = $conn->prepare('SELECT Scheduling_ID FROM consultation WHERE Scheduling_ID = :id LIMIT 1');
        $check->execute([':id' => $schedulingId]);
        if (!$check->fetch(PDO::FETCH_ASSOC)) {
            respond(404, ['success' => false, 'message' => 'Scheduling request not found']);
        }
    }

    respond(200, ['success' => true]);
} catch (Throwable $e) {
    respond(500, ['success' => false, 'message' => 'Failed to update scheduling status', 'error' => $e->getMessage()]);
}
