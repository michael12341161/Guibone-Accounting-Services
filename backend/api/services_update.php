<?php
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/connection-pdo.php';
require_once __DIR__ . '/service_type_helpers.php';
require_once __DIR__ . '/service_bundle_settings_helper.php';

monitoring_bootstrap_api(['POST', 'OPTIONS']);

function respond($code, $payload) {
    http_response_code($code);
    echo json_encode($payload);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    respond(405, ['success' => false, 'message' => 'Method not allowed']);
}

try {
    monitoring_require_roles([MONITORING_ROLE_ADMIN]);
    $conn->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    monitoring_service_type_require_schema($conn, 'services');

    $raw = file_get_contents('php://input');
    $data = json_decode($raw, true);
    if (!is_array($data)) {
        respond(400, ['success' => false, 'message' => 'Invalid JSON payload']);
    }

    $serviceId = isset($data['service_id']) ? (int)$data['service_id'] : 0;
    if ($serviceId <= 0) {
        respond(422, ['success' => false, 'message' => 'Service id is required.']);
    }

    $serviceStmt = $conn->prepare('SELECT Services_type_Id, Name, description FROM services_type WHERE Services_type_Id = :id LIMIT 1');
    $serviceStmt->execute([':id' => $serviceId]);
    $existing = $serviceStmt->fetch(PDO::FETCH_ASSOC);
    if (!$existing) {
        respond(404, ['success' => false, 'message' => 'Service not found.']);
    }

    $nextName = trim((string)($data['service_name'] ?? $data['raw_name'] ?? $data['name'] ?? $existing['Name'] ?? ''));
    $nextDescription = trim((string)($data['description'] ?? $data['service_description'] ?? $existing['description'] ?? ''));
    $disabled = !empty($data['disabled']);
    $bundleSteps = monitoring_normalize_service_bundle_steps($data['bundle_steps'] ?? []);

    if ($nextName === '') {
        respond(422, ['success' => false, 'message' => 'Service name is required.']);
    }

    if (mb_strlen($nextName) > 150) {
        respond(422, ['success' => false, 'message' => 'Service name must be 150 characters or fewer.']);
    }

    if (mb_strlen($nextDescription) > 150) {
        respond(422, ['success' => false, 'message' => 'Service description must be 150 characters or fewer.']);
    }

    $duplicateStmt = $conn->prepare(
        'SELECT Services_type_Id
         FROM services_type
         WHERE LOWER(TRIM(Name)) = LOWER(TRIM(:name))
           AND LOWER(TRIM(COALESCE(description, ""))) = LOWER(TRIM(:description))
           AND Services_type_Id <> :id
         LIMIT 1'
    );
    $duplicateStmt->execute([
        ':name' => $nextName,
        ':description' => $nextDescription,
        ':id' => $serviceId,
    ]);
    if ($duplicateStmt->fetchColumn()) {
        respond(409, ['success' => false, 'message' => 'Another service already uses that name and description.']);
    }

    $updateStmt = $conn->prepare(
        'UPDATE services_type
         SET Name = :name,
             description = :description
         WHERE Services_type_Id = :id'
    );
    $updateStmt->execute([
        ':name' => $nextName,
        ':description' => $nextDescription !== '' ? $nextDescription : null,
        ':id' => $serviceId,
    ]);

    monitoring_set_single_service_bundle_config($conn, $serviceId, [
        'disabled' => $disabled,
        'bundle_steps' => $bundleSteps,
    ]);

    respond(200, [
        'success' => true,
        'message' => $disabled ? 'Service disabled successfully.' : 'Service updated successfully.',
        'service' => monitoring_service_type_payload([
            'Services_type_Id' => $serviceId,
            'Name' => $nextName,
            'description' => $nextDescription !== '' ? $nextDescription : null,
        ], $disabled, [
            'bundle_steps' => $bundleSteps,
        ]),
    ]);
} catch (Throwable $e) {
    error_log('services_update error: ' . $e->getMessage());
    respond(500, ['success' => false, 'message' => 'Server error']);
}
