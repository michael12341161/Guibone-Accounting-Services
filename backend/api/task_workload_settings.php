<?php
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/connection-pdo.php';
require_once __DIR__ . '/audit_logs_helper.php';
require_once __DIR__ . '/task_workload_settings_helper.php';

monitoring_bootstrap_api(['GET', 'POST', 'OPTIONS']);

function respond($code, $payload) {
    http_response_code($code);
    echo json_encode($payload);
    exit;
}

try {
    $sessionUser = monitoring_require_auth();
    $conn->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

    if ($_SERVER['REQUEST_METHOD'] === 'GET') {
        monitoring_require_roles([MONITORING_ROLE_ADMIN, MONITORING_ROLE_SECRETARY], $sessionUser);

        respond(200, [
            'success' => true,
            'settings' => monitoring_get_task_workload_settings($conn),
        ]);
    }

    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        respond(405, ['success' => false, 'message' => 'Method not allowed']);
    }

    monitoring_require_roles([MONITORING_ROLE_ADMIN], $sessionUser);

    $raw = file_get_contents('php://input');
    $data = json_decode($raw, true);
    if (!is_array($data)) {
        respond(400, ['success' => false, 'message' => 'Invalid JSON payload']);
    }

    $limitInput = trim((string)($data['limit'] ?? ''));
    if (!preg_match('/^\d+$/', $limitInput)) {
        respond(422, ['success' => false, 'message' => 'Workload limit must be a whole number.']);
    }

    $limit = (int)$limitInput;
    if ($limit < MONITORING_TASK_WORKLOAD_MIN_LIMIT || $limit > MONITORING_TASK_WORKLOAD_MAX_LIMIT) {
        respond(422, [
            'success' => false,
            'message' => 'Workload limit must be between ' . MONITORING_TASK_WORKLOAD_MIN_LIMIT . ' and ' . MONITORING_TASK_WORKLOAD_MAX_LIMIT . '.',
        ]);
    }

    $settings = monitoring_upsert_task_workload_settings($conn, ['limit' => $limit]);
    monitoring_write_audit_log(
        $conn,
        (int)($sessionUser['id'] ?? 0),
        'Task workload limit updated to ' . (int)$settings['limit']
    );

    respond(200, [
        'success' => true,
        'message' => 'Task workload limit saved successfully.',
        'settings' => $settings,
    ]);
} catch (Throwable $e) {
    respond(500, ['success' => false, 'message' => 'Server error', 'error' => $e->getMessage()]);
}
