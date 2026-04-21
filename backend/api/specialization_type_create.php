<?php
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/connection-pdo.php';
require_once __DIR__ . '/management_catalog_settings_helper.php';

monitoring_bootstrap_api(['POST', 'OPTIONS']);

function respond($code, $payload) {
    http_response_code($code);
    echo json_encode($payload);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
    respond(405, ['success' => false, 'message' => 'Method not allowed']);
}

try {
    monitoring_require_roles([MONITORING_ROLE_ADMIN]);
    $conn->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    monitoring_require_schema_columns($conn, 'specialization_type', ['specialization_type_ID', 'Name'], 'specialization');
    monitoring_require_schema_columns($conn, 'services_type', ['Services_type_Id', 'Name'], 'service');

    $raw = file_get_contents('php://input');
    $data = json_decode($raw, true);
    if (!is_array($data)) {
        respond(400, ['success' => false, 'message' => 'Invalid JSON payload']);
    }

    $name = trim((string)($data['name'] ?? $data['specialization_name'] ?? ''));
    $serviceIds = array_values(array_unique(array_filter(array_map('intval', (array)($data['service_ids'] ?? [])), function ($value) {
        return $value > 0;
    })));

    if ($name === '') {
        respond(422, ['success' => false, 'message' => 'Specialization name is required.']);
    }
    if (mb_strlen($name) > 150) {
        respond(422, ['success' => false, 'message' => 'Specialization name must be 150 characters or fewer.']);
    }

    if (!empty($serviceIds)) {
        $placeholders = implode(',', array_fill(0, count($serviceIds), '?'));
        $serviceStmt = $conn->prepare("SELECT Services_type_Id FROM services_type WHERE Services_type_Id IN ($placeholders)");
        $serviceStmt->execute($serviceIds);
        $foundServiceIds = array_map('intval', $serviceStmt->fetchAll(PDO::FETCH_COLUMN) ?: []);
        sort($foundServiceIds);
        $expectedIds = $serviceIds;
        sort($expectedIds);
        if ($foundServiceIds !== $expectedIds) {
            respond(422, ['success' => false, 'message' => 'One or more selected services are invalid.']);
        }
    }

    $checkStmt = $conn->prepare(
        'SELECT specialization_type_ID, Name
         FROM specialization_type
         WHERE LOWER(TRIM(Name)) = LOWER(TRIM(:name))
         LIMIT 1'
    );
    $checkStmt->execute([':name' => $name]);
    $existing = $checkStmt->fetch(PDO::FETCH_ASSOC);
    if ($existing) {
        respond(409, [
            'success' => false,
            'message' => 'Specialization already exists.',
            'specialization' => [
                'id' => (int)$existing['specialization_type_ID'],
                'name' => (string)$existing['Name'],
            ],
        ]);
    }

    $insertStmt = $conn->prepare('INSERT INTO specialization_type (Name) VALUES (:name)');
    $insertStmt->execute([':name' => $name]);
    $specializationId = (int)$conn->lastInsertId();

    monitoring_set_specialization_management_config($conn, $specializationId, [
        'disabled' => false,
        'service_ids' => $serviceIds,
    ]);

    respond(201, [
        'success' => true,
        'message' => 'Specialization added successfully.',
        'specialization' => [
            'id' => $specializationId,
            'name' => $name,
            'disabled' => false,
            'service_ids' => $serviceIds,
        ],
    ]);
} catch (Throwable $e) {
    error_log('specialization_type_create error: ' . $e->getMessage());
    respond(500, ['success' => false, 'message' => 'Server error']);
}
