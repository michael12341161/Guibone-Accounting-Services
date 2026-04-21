<?php
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/connection-pdo.php';
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

    $serviceName = trim((string)($data['name'] ?? $data['service_name'] ?? ''));
    $bundleSteps = monitoring_normalize_service_bundle_steps($data['bundle_steps'] ?? []);
    if ($serviceName === '') {
        respond(422, ['success' => false, 'message' => 'Service name is required.']);
    }

    if (mb_strlen($serviceName) > 150) {
        respond(422, ['success' => false, 'message' => 'Service name must be 150 characters or fewer.']);
    }

    $checkStmt = $conn->prepare('SELECT Services_type_Id, Name FROM services_type WHERE LOWER(TRIM(Name)) = LOWER(TRIM(:name)) LIMIT 1');
    $checkStmt->execute([':name' => $serviceName]);
    $existing = $checkStmt->fetch(PDO::FETCH_ASSOC);
    if ($existing) {
        respond(409, [
            'success' => false,
            'message' => 'Service already exists.',
            'service' => [
                'id' => (int)$existing['Services_type_Id'],
                'name' => (string)$existing['Name'],
            ],
        ]);
    }

    $insertStmt = $conn->prepare('INSERT INTO services_type (Name) VALUES (:name)');
    $insertStmt->execute([':name' => $serviceName]);
    $serviceId = (int)$conn->lastInsertId();
    monitoring_set_single_service_bundle_config($conn, $serviceId, [
        'disabled' => false,
        'bundle_steps' => $bundleSteps,
    ]);

    respond(201, [
        'success' => true,
        'message' => 'Service added successfully.',
        'service' => [
            'id' => $serviceId,
            'name' => $serviceName,
            'disabled' => false,
            'bundle_steps' => $bundleSteps,
        ],
    ]);
} catch (Throwable $e) {
    error_log('services_create error: ' . $e->getMessage());
    respond(500, ['success' => false, 'message' => 'Server error']);
}
