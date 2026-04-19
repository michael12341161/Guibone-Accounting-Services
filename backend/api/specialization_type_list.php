<?php
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/connection-pdo.php';
require_once __DIR__ . '/employee_specialization.php';

monitoring_bootstrap_api(['GET', 'OPTIONS']);

function respond($code, $payload) {
    http_response_code($code);
    echo json_encode($payload);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'GET') {
    respond(405, ['success' => false, 'message' => 'Method not allowed']);
}

try {
    monitoring_require_roles([MONITORING_ROLE_ADMIN]);
    $conn->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $specializationTypes = loadSpecializationTypes($conn);

    respond(200, [
        'success' => true,
        'specialization_types' => $specializationTypes,
    ]);
} catch (Throwable $e) {
    error_log('specialization_type_list error: ' . $e->getMessage());
    respond(500, ['success' => false, 'message' => 'Server error']);
}
