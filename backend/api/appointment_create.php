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

function resolveAppointmentActionColumn(PDO $conn): ?string {
    static $cached = null;
    if ($cached !== null) {
        return $cached !== '' ? $cached : null;
    }

    foreach (['action_by', 'User_ID'] as $column) {
        try {
            $sql = 'SHOW COLUMNS FROM `appointment` LIKE :column';
            $stmt = $conn->prepare($sql);
            $stmt->execute([':column' => $column]);
            if ($stmt->fetch(PDO::FETCH_ASSOC)) {
                $cached = $column;
                return $cached;
            }
        } catch (Throwable $e) {
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

        // Some callers send User_id by mistake.
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
    }

    $fallback = $conn->query('SELECT Services_type_Id, Name FROM services_type ORDER BY Services_type_Id ASC LIMIT 1');
    $row = $fallback ? $fallback->fetch(PDO::FETCH_ASSOC) : null;
    if (!$row) {
        return [0, $name];
    }
    return [(int)$row['Services_type_Id'], (string)$row['Name']];
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

function appointmentHasDescriptionColumn(PDO $conn): bool {
    static $cached = null;
    if ($cached !== null) {
        return $cached;
    }

    try {
        $check = $conn->query("SHOW COLUMNS FROM appointment LIKE 'Description'");
        $cached = (bool)($check && $check->fetch(PDO::FETCH_ASSOC));
    } catch (Throwable $e) {
        $cached = false;
    }

    return $cached;
}

function processingDocumentCatalog(): array {
    return [
        'business_permit' => 'Business Permit',
        'dti' => 'DTI',
        'sec' => 'SEC',
        'lgu' => 'LGU',
    ];
}

function normalizeProcessingDocumentKey(string $value): string {
    $normalized = strtolower(trim($value));
    $normalized = preg_replace('/[^a-z0-9]+/', '_', $normalized);
    $normalized = trim((string)$normalized, '_');

    if ($normalized === 'businesspermit') {
        return 'business_permit';
    }

    return $normalized;
}

function resolveProcessingDocuments($value): array {
    $catalog = processingDocumentCatalog();
    if (!is_array($value)) {
        return [];
    }

    $resolved = [];
    foreach ($value as $item) {
        $key = normalizeProcessingDocumentKey((string)$item);
        if ($key === '' || !isset($catalog[$key]) || isset($resolved[$key])) {
            continue;
        }

        $resolved[$key] = $catalog[$key];
    }

    return $resolved;
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
    $appointmentType = isset($data['appointment_type']) ? trim((string)$data['appointment_type']) : 'Service';
    $meetingType = isset($data['meeting_type']) ? trim((string)$data['meeting_type']) : '';
    $date = isset($data['date']) ? trim((string)$data['date']) : '';
    $time = isset($data['time']) ? trim((string)$data['time']) : '';
    $notes = isset($data['notes']) ? trim((string)$data['notes']) : '';
    $processingDocuments = resolveProcessingDocuments($data['processing_documents'] ?? []);
    $roleId = (int)($sessionUser['role_id'] ?? 0);
    if ($roleId === MONITORING_ROLE_CLIENT) {
        $clientId = (int)($sessionUser['client_id'] ?? 0);
        $clientUsername = '';
        if ($clientId <= 0) {
            monitoring_auth_respond(403, ['success' => false, 'message' => 'Access denied.']);
        }
        if (!monitoring_client_appointments_enabled($conn)) {
            $supportEmail = monitoring_get_system_support_email($conn);
            respond(403, [
                'success' => false,
                'message' => monitoring_append_support_contact_message(
                    'Appointment requests are temporarily unavailable.',
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
    if ($time !== '' && !preg_match('/^\d{2}:\d{2}(:\d{2})?$/', $time)) {
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
    $businessRegistered = !empty($serviceAccessState['business_registered']);
    [$serviceId, $serviceName] = resolveService($conn, $serviceInput);
    if ($serviceId <= 0) {
        respond(500, ['success' => false, 'message' => 'No services configured']);
    }
    if (!$businessRegistered && !monitoring_service_name_is_processing($serviceName)) {
        respond(422, [
            'success' => false,
            'message' => monitoring_client_service_restriction_message(
                $roleId === MONITORING_ROLE_CLIENT,
                $serviceAccessState['restriction_reason'] ?? null
            ),
            'allowed_services' => ['Processing'],
        ]);
    }
    if (monitoring_service_name_is_processing($serviceName) && empty($processingDocuments)) {
        respond(422, [
            'success' => false,
            'message' => 'Please select at least one document to process.',
        ]);
    }

    $descriptionLines = ["[Service] {$serviceName}"];
    foreach ($processingDocuments as $documentLabel) {
        $descriptionLines[] = '[Processing_Document] ' . $documentLabel;
    }
    if ($meetingType !== '') {
        $descriptionLines[] = '[Appointment_Type] ' . $meetingType;
    }
    if ($time !== '') {
        $descriptionLines[] = '[Time] ' . $time;
    }
    if ($notes !== '') {
        $cleanNotes = preg_replace('/[\r\n]+/', ' ', $notes);
        $descriptionLines[] = '[Notes] ' . trim((string)$cleanNotes);
    }
    $description = implode("\n", array_filter($descriptionLines, function ($line) {
        return trim((string)$line) !== '';
    }));

    $pendingId = resolveStatusId($conn, 'APPOINTMENT', ['Pending', 'Not Started'], 6);
    $rejectedId = resolveStatusId($conn, 'APPOINTMENT', ['Reject', 'Rejected', 'Declined', 'Cancelled'], 8);

    // Schema no longer stores time in appointment; enforce one open request per date/service/client.
    $dup = $conn->prepare(
        'SELECT Appointment_ID
         FROM appointment
         WHERE Client_ID = :cid
           AND Services_type_Id = :sid
           AND Date = :d
           AND Status_ID <> :rejected
         LIMIT 1'
    );
    $dup->execute([
        ':cid' => $resolvedClientId,
        ':sid' => $serviceId,
        ':d' => $date,
        ':rejected' => $rejectedId,
    ]);
    if ($dup->fetchColumn()) {
        respond(409, ['success' => false, 'message' => 'An appointment for this service and date already exists.']);
    }

    $actionColumn = resolveAppointmentActionColumn($conn);
    $insertColumns = ['Client_ID', 'Services_type_Id', 'Status_ID', 'Date'];
    $insertValues = [':cid', ':sid', ':stid', ':d'];
    $insertParams = [
        ':cid' => $resolvedClientId,
        ':sid' => $serviceId,
        ':stid' => $pendingId,
        ':d' => $date,
    ];

    if ($actionColumn !== null) {
        $insertColumns[] = quoteIdentifier($actionColumn);
        $insertValues[] = ':action_by';
        $insertParams[':action_by'] = null;
    }

    if (appointmentHasDescriptionColumn($conn)) {
        $insertColumns[] = 'Description';
        $insertValues[] = ':desc';
        $insertParams[':desc'] = $description !== '' ? $description : null;
    }

    $ins = $conn->prepare(
        'INSERT INTO appointment (' . implode(', ', $insertColumns) . ')
         VALUES (' . implode(', ', $insertValues) . ')'
    );
    $ins->execute($insertParams);

    $newId = (int)$conn->lastInsertId();

    respond(201, [
        'success' => true,
        'appointment' => [
            'id' => $newId,
            'Appointment_ID' => $newId,
            'client_id' => $resolvedClientId,
            'Client_ID' => $resolvedClientId,
            'user_id' => null,
            'action_by' => null,
            'Action_by' => null,
            'service_id' => $serviceId,
            'service' => $serviceName,
            'service_name' => $serviceName,
            'appointment_type' => $appointmentType,
            'meeting_type' => $meetingType !== '' ? $meetingType : null,
            'processing_documents' => array_keys($processingDocuments),
            'processing_document_labels' => array_values($processingDocuments),
            'date' => $date,
            'Date' => $date,
            'time' => $time !== '' ? $time : null,
            'Time' => $time !== '' ? $time : null,
            'notes' => $notes !== '' ? $notes : null,
            'status' => 'Pending',
            'Status_name' => 'Pending',
        ],
    ]);
} catch (Throwable $e) {
    error_log('appointment_create error: ' . $e->getMessage());
    respond(500, ['success' => false, 'message' => 'Server error']);
}
