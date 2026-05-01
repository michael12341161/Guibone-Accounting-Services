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

    $raw = file_get_contents('php://input');
    $data = json_decode($raw, true);
    if (!is_array($data)) {
        respond(400, ['success' => false, 'message' => 'Invalid JSON payload']);
    }

    monitoring_service_type_require_schema($conn, 'services');

    $serviceName = trim((string)($data['service_name'] ?? $data['raw_name'] ?? $data['name'] ?? ''));
    $serviceDescription = trim((string)($data['description'] ?? $data['service_description'] ?? ''));
    $bundleSteps = monitoring_normalize_service_bundle_steps($data['bundle_steps'] ?? []);
    if ($serviceName === '') {
        respond(422, ['success' => false, 'message' => 'Service name is required.']);
    }

    if (mb_strlen($serviceName) > 150) {
        respond(422, ['success' => false, 'message' => 'Service name must be 150 characters or fewer.']);
    }

    if (mb_strlen($serviceDescription) > 150) {
        respond(422, ['success' => false, 'message' => 'Service description must be 150 characters or fewer.']);
    }

    $checkStmt = $conn->prepare(
        'SELECT Services_type_Id, Name, description
         FROM services_type
         WHERE LOWER(TRIM(Name)) = LOWER(TRIM(:name))
           AND LOWER(TRIM(COALESCE(description, ""))) = LOWER(TRIM(:description))
         LIMIT 1'
    );
    $checkStmt->execute([
        ':name' => $serviceName,
        ':description' => $serviceDescription,
    ]);
    $existing = $checkStmt->fetch(PDO::FETCH_ASSOC);
    if ($existing) {
        $existingPayload = monitoring_service_type_payload($existing);
        respond(409, [
            'success' => false,
            'message' => 'Service already exists.',
            'service' => $existingPayload,
        ]);
    }

    $insertStmt = $conn->prepare('INSERT INTO services_type (Name, description) VALUES (:name, :description)');
    $insertStmt->execute([
        ':name' => $serviceName,
        ':description' => $serviceDescription !== '' ? $serviceDescription : null,
    ]);
    $serviceId = (int)$conn->lastInsertId();
    monitoring_set_single_service_bundle_config($conn, $serviceId, [
        'disabled' => false,
        'bundle_steps' => $bundleSteps,
    ]);

    respond(201, [
        'success' => true,
        'message' => 'Service added successfully.',
        'service' => monitoring_service_type_payload([
            'Services_type_Id' => $serviceId,
            'Name' => $serviceName,
            'description' => $serviceDescription !== '' ? $serviceDescription : null,
        ], false, [
            'bundle_steps' => $bundleSteps,
        ]),
    ]);
} catch (Throwable $e) {
    error_log('services_create error: ' . $e->getMessage());
    respond(500, ['success' => false, 'message' => 'Server error']);
}
