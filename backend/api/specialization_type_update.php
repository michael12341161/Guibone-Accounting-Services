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

    $specializationId = isset($data['specialization_id']) ? (int)$data['specialization_id'] : 0;
    if ($specializationId <= 0) {
        respond(422, ['success' => false, 'message' => 'Specialization id is required.']);
    }

    $specializationStmt = $conn->prepare(
        'SELECT specialization_type_ID, Name
         FROM specialization_type
         WHERE specialization_type_ID = :id
         LIMIT 1'
    );
    $specializationStmt->execute([':id' => $specializationId]);
    $existing = $specializationStmt->fetch(PDO::FETCH_ASSOC);
    if (!$existing) {
        respond(404, ['success' => false, 'message' => 'Specialization not found.']);
    }

    $nextName = trim((string)($data['name'] ?? $data['specialization_name'] ?? $existing['Name'] ?? ''));
    $disabled = !empty($data['disabled']);
    $serviceIds = array_values(array_unique(array_filter(array_map('intval', (array)($data['service_ids'] ?? [])), function ($value) {
        return $value > 0;
    })));

    if ($nextName === '') {
        respond(422, ['success' => false, 'message' => 'Specialization name is required.']);
    }
    if (mb_strlen($nextName) > 150) {
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

    $duplicateStmt = $conn->prepare(
        'SELECT specialization_type_ID
         FROM specialization_type
         WHERE LOWER(TRIM(Name)) = LOWER(TRIM(:name))
           AND specialization_type_ID <> :id
         LIMIT 1'
    );
    $duplicateStmt->execute([
        ':name' => $nextName,
        ':id' => $specializationId,
    ]);
    if ($duplicateStmt->fetchColumn()) {
        respond(409, ['success' => false, 'message' => 'Another specialization already uses that name.']);
    }

    $updateStmt = $conn->prepare('UPDATE specialization_type SET Name = :name WHERE specialization_type_ID = :id');
    $updateStmt->execute([
        ':name' => $nextName,
        ':id' => $specializationId,
    ]);

    monitoring_set_specialization_management_config($conn, $specializationId, [
        'disabled' => $disabled,
        'service_ids' => $serviceIds,
    ]);

    respond(200, [
        'success' => true,
        'message' => $disabled ? 'Specialization disabled successfully.' : 'Specialization updated successfully.',
        'specialization' => [
            'id' => $specializationId,
            'name' => $nextName,
            'disabled' => $disabled,
            'service_ids' => $serviceIds,
        ],
    ]);
} catch (Throwable $e) {
    error_log('specialization_type_update error: ' . $e->getMessage());
    respond(500, ['success' => false, 'message' => 'Server error']);
}
