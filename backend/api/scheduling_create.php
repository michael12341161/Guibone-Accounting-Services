<?php
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/connection-pdo.php';
require_once __DIR__ . '/client_service_access.php';

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

        // Fallback when caller passes user id.
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

function resolveService(PDO $conn, string $serviceName): array {
    $name = trim($serviceName);
    if ($name !== '') {
        $stmt = $conn->prepare('SELECT Services_type_Id, Name FROM services_type WHERE Name = :n LIMIT 1');
        $stmt->execute([':n' => $name]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if ($row) {
            return [(int)$row['Services_type_Id'], (string)$row['Name']];
        }
        // Consultation can be a free-form service label not stored in services table.
        return [null, $name];
    }

    $fallback = $conn->query('SELECT Services_type_Id, Name FROM services_type ORDER BY Services_type_Id ASC LIMIT 1');
    $row = $fallback ? $fallback->fetch(PDO::FETCH_ASSOC) : null;
    if (!$row) {
        return [null, $name];
    }
    return [(int)$row['Services_type_Id'], (string)$row['Name']];
}

function resolveClientServiceId(PDO $conn, int $clientId, ?int $serviceId, string $serviceName): int {
    if ($serviceId !== null) {
        $find = $conn->prepare(
            'SELECT Client_services_ID
             FROM client_services
             WHERE Client_ID = :cid
               AND Services_type_Id = :sid
             ORDER BY Client_services_ID DESC
             LIMIT 1'
        );
        $find->execute([':cid' => $clientId, ':sid' => $serviceId]);
        $existing = (int)($find->fetchColumn() ?: 0);
        if ($existing > 0) {
            return $existing;
        }

        $ins = $conn->prepare(
            'INSERT INTO client_services (Client_ID, Services_type_Id, Name)
             VALUES (:cid, :sid, :name)'
        );
        $ins->execute([
            ':cid' => $clientId,
            ':sid' => $serviceId,
            ':name' => $serviceName !== '' ? $serviceName : 'Consultation',
        ]);
        return (int)$conn->lastInsertId();
    }

    $latest = $conn->prepare(
        'SELECT Client_services_ID
         FROM client_services
         WHERE Client_ID = :cid
         ORDER BY Client_services_ID DESC
         LIMIT 1'
    );
    $latest->execute([':cid' => $clientId]);
    $existing = (int)($latest->fetchColumn() ?: 0);
    if ($existing > 0) {
        return $existing;
    }

    $ins = $conn->prepare(
        'INSERT INTO client_services (Client_ID, Services_type_Id, Name)
         VALUES (:cid, NULL, :name)'
    );
    $ins->execute([
        ':cid' => $clientId,
        ':name' => $serviceName !== '' ? $serviceName : 'Consultation',
    ]);
    return (int)$conn->lastInsertId();
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

    $clientId = isset($data['client_id']) ? (int)$data['client_id'] : 0;
    $clientUsername = isset($data['client_username']) ? trim((string)$data['client_username']) : '';
    $serviceInput = isset($data['service']) ? trim((string)$data['service']) : '';
    $type = isset($data['appointment_type']) ? trim((string)$data['appointment_type']) : 'Consultation';
    $meetingType = isset($data['meeting_type']) ? trim((string)$data['meeting_type']) : '';
    $date = isset($data['date']) ? trim((string)$data['date']) : '';
    $time = isset($data['time']) ? trim((string)$data['time']) : '';
    $notes = isset($data['notes']) ? trim((string)$data['notes']) : '';
    $roleId = (int)($sessionUser['role_id'] ?? 0);
    $userId = isset($data['user_id']) ? (int)$data['user_id'] : 0;

    if ($roleId === MONITORING_ROLE_CLIENT) {
        $clientId = (int)($sessionUser['client_id'] ?? 0);
        $clientUsername = '';
        if ($clientId <= 0) {
            monitoring_auth_respond(403, ['success' => false, 'message' => 'Access denied.']);
        }
    } elseif (!in_array($roleId, [MONITORING_ROLE_ADMIN, MONITORING_ROLE_SECRETARY], true)) {
        monitoring_auth_respond(403, ['success' => false, 'message' => 'Access denied.']);
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

    $resolvedClientId = resolveClientId($conn, $clientId, $clientUsername);
    if ($resolvedClientId <= 0) {
        respond(404, ['success' => false, 'message' => 'Client not found']);
    }
    if (!monitoring_client_business_is_registered($conn, $resolvedClientId)) {
        respond(422, [
            'success' => false,
            'message' => $roleId === MONITORING_ROLE_CLIENT
                ? 'Consultation is available only after your business permit is uploaded and your business is registered.'
                : 'Consultation is available only after the client business permit is uploaded and the business is registered.',
            'allowed_services' => ['Processing'],
        ]);
    }

    [$serviceId, $serviceName] = resolveService($conn, $serviceInput);
    $clientServiceId = resolveClientServiceId($conn, $resolvedClientId, $serviceId, $serviceName);
    if ($clientServiceId <= 0) {
        respond(500, ['success' => false, 'message' => 'Unable to resolve client service']);
    }

    if ($userId <= 0) {
        $userId = (int)($sessionUser['id'] ?? 0);
    }
    if ($userId > 0) {
        $checkUser = $conn->prepare('SELECT 1 FROM user WHERE User_id = :uid LIMIT 1');
        $checkUser->execute([':uid' => $userId]);
        if (!$checkUser->fetchColumn()) {
            respond(422, ['success' => false, 'message' => 'Invalid user_id']);
        }
    }

    $pendingId = resolveStatusId($conn, 'CONSULTATION', ['Pending', 'Not Started'], 15);
    $rejectedId = resolveStatusId($conn, 'CONSULTATION', ['Reject', 'Rejected', 'Declined', 'Cancelled'], 16);

    $dup = $conn->prepare(
        'SELECT Scheduling_ID
         FROM consultation
         WHERE Date = :d
           AND Status_ID <> :rejected
           AND Description LIKE :timeLike
         LIMIT 1'
    );
    $dup->execute([
        ':d' => $date,
        ':rejected' => $rejectedId,
        ':timeLike' => "%[Time] {$time}%",
    ]);
    if ($dup->fetchColumn()) {
        respond(409, ['success' => false, 'message' => 'That time slot is already booked. Please choose another slot.']);
    }

    $descriptionParts = [];
    $descriptionParts[] = '[Type] ' . ($type !== '' ? $type : 'Consultation');
    if ($meetingType !== '') {
        $descriptionParts[] = '[Appointment_Type] ' . $meetingType;
    }
    if ($serviceName !== '') {
        $descriptionParts[] = '[Service] ' . $serviceName;
    }
    $descriptionParts[] = '[Time] ' . $time;
    if ($notes !== '') {
        $descriptionParts[] = '[Notes] ' . $notes;
    }
    if ($serviceId !== null) {
        $descriptionParts[] = '[Service_ID] ' . (int)$serviceId;
    }
    $description = implode("\n", $descriptionParts);

    $actionColumn = resolveConsultationActionColumn($conn);
    $insertColumns = ['Description', 'Status_ID', 'Client_services_ID', 'Client_ID', 'Date'];
    $insertValues = [':descr', ':status_id', ':csid', ':cid', ':date'];
    $insertParams = [
        ':descr' => $description,
        ':status_id' => $pendingId,
        ':csid' => $clientServiceId,
        ':cid' => $resolvedClientId,
        ':date' => $date,
    ];

    if ($actionColumn !== null) {
        $insertColumns[] = quoteIdentifier($actionColumn);
        $insertValues[] = ':action_by';
        $insertParams[':action_by'] = null;
    }

    $insert = $conn->prepare(
        'INSERT INTO consultation (' . implode(', ', $insertColumns) . ')
         VALUES (' . implode(', ', $insertValues) . ')'
    );
    $insert->execute($insertParams);

    $newId = (int)$conn->lastInsertId();

    respond(201, [
        'success' => true,
        'scheduling' => [
            'id' => $newId,
            'Scheduling_ID' => $newId,
            'client_id' => $resolvedClientId,
            'Client_ID' => $resolvedClientId,
            'user_id' => null,
            'action_by' => null,
            'Action_by' => null,
            'name' => $serviceName !== '' ? $serviceName : 'Consultation',
            'date' => $date,
            'Date' => $date,
            'time' => $time,
            'Time' => $time,
            'appointment_type' => $meetingType,
            'Appointment_Type' => $meetingType,
            'status' => 'Pending',
            'Status' => 'Pending',
            'Description' => $description,
        ],
    ]);
} catch (Throwable $e) {
    respond(500, ['success' => false, 'message' => 'Server error', 'error' => $e->getMessage()]);
}
