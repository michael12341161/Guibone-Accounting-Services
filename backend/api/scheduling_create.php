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

function isConsultationPlaceholder(string $value): bool {
    $normalized = strtolower(trim($value));
    return $normalized === '' || $normalized === 'consultation';
}

function resolveConsultationService(PDO $conn, string $serviceName): array {
    $name = trim($serviceName);
    if ($name === '' || isConsultationPlaceholder($name)) {
        return [null, ''];
    }

    $stmt = $conn->prepare('SELECT Services_type_Id, Name FROM services_type WHERE Name = :n LIMIT 1');
    $stmt->execute([':n' => $name]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$row) {
        return [null, $name];
    }

    return [(int)$row['Services_type_Id'], trim((string)$row['Name'])];
}

function resolveDefaultConsultationService(PDO $conn): array {
    $stmt = $conn->query(
        "SELECT Services_type_Id, Name
         FROM services_type
         WHERE Name IS NOT NULL
           AND TRIM(Name) <> ''
           AND LOWER(TRIM(Name)) <> 'processing'
           AND LOWER(TRIM(Name)) <> 'consultation'
         ORDER BY Services_type_Id ASC
         LIMIT 1"
    );
    $row = $stmt ? $stmt->fetch(PDO::FETCH_ASSOC) : null;
    if (!$row) {
        return [null, ''];
    }

    return [(int)$row['Services_type_Id'], trim((string)$row['Name'])];
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
    $consultationServiceInput = isset($data['consultation_service']) ? trim((string)$data['consultation_service']) : '';
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
        if (!monitoring_client_consultations_enabled($conn)) {
            $supportEmail = monitoring_get_system_support_email($conn);
            respond(403, [
                'success' => false,
                'message' => monitoring_append_support_contact_message(
                    'Consultation requests are temporarily unavailable.',
                    $supportEmail
                ),
            ]);
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
    $serviceAccessState = monitoring_client_service_access_state($conn, $resolvedClientId);
    if (empty($serviceAccessState['business_registered'])) {
        respond(422, [
            'success' => false,
            'message' => monitoring_client_service_restriction_message(
                $roleId === MONITORING_ROLE_CLIENT,
                $serviceAccessState['restriction_reason'] ?? null
            ),
            'allowed_services' => ['Processing'],
        ]);
    }

    $selectedConsultationService = $consultationServiceInput !== '' ? $consultationServiceInput : $serviceInput;
    if (isConsultationPlaceholder($selectedConsultationService)) {
        [$serviceId, $serviceName] = resolveDefaultConsultationService($conn);
    } else {
        [$serviceId, $serviceName] = resolveConsultationService($conn, $selectedConsultationService);
    }
    if ($serviceId === null || $serviceName === '') {
        respond(422, ['success' => false, 'message' => 'Please choose a valid consultation service.']);
    }
    if (monitoring_service_name_is_processing($serviceName)) {
        respond(422, ['success' => false, 'message' => 'Processing cannot be selected for consultation requests.']);
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
        'SELECT Consultation_ID
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
    $descriptionParts[] = '[Type] Consultation';
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
    $insertColumns = ['Description', 'Status_ID', 'Services_type_Id', 'Client_ID', 'Date'];
    $insertValues = [':descr', ':status_id', ':service_id', ':cid', ':date'];
    $insertParams = [
        ':descr' => $description,
        ':status_id' => $pendingId,
        ':service_id' => $serviceId,
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
            'Consultation_ID' => $newId,
            'Scheduling_ID' => $newId,
            'consultation_id' => $newId,
            'client_id' => $resolvedClientId,
            'Client_ID' => $resolvedClientId,
            'user_id' => null,
            'action_by' => null,
            'Action_by' => null,
            'Services_type_Id' => $serviceId,
            'service_id' => $serviceId,
            'consultation_service' => $serviceName,
            'Consultation_Service' => $serviceName,
            'name' => $serviceName,
            'Name' => $serviceName,
            'service' => $serviceName,
            'date' => $date,
            'Date' => $date,
            'time' => $time,
            'Time' => $time,
            'appointment_type' => $meetingType,
            'Appointment_Type' => $meetingType,
            'type' => 'Consultation',
            'Type' => 'Consultation',
            'record_kind' => 'consultation',
            'status' => 'Pending',
            'Status' => 'Pending',
            'Description' => $description,
        ],
    ]);
} catch (Throwable $e) {
    respond(500, ['success' => false, 'message' => 'Server error', 'error' => $e->getMessage()]);
}
