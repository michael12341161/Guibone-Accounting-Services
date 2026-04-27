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
    monitoring_permission_page_require_schema($conn);

    $raw = file_get_contents('php://input');
    $data = json_decode($raw, true);
    if (!is_array($data)) {
        respond(400, ['success' => false, 'message' => 'Invalid JSON payload']);
    }

    $roleName = trim((string)($data['name'] ?? $data['role_name'] ?? ''));
    if ($roleName === '') {
        respond(422, ['success' => false, 'message' => 'Role name is required.']);
    }
    if (mb_strlen($roleName) > 100) {
        respond(422, ['success' => false, 'message' => 'Role name must be 100 characters or fewer.']);
    }

    $specializationPayload = $data['specialization_type_ids'] ?? ($data['allowed_specialization_type_ids'] ?? []);
    if (!is_array($specializationPayload)) {
        $specializationPayload = [$specializationPayload];
    }
    $specializationIds = monitoring_management_normalize_positive_ids($specializationPayload);
    if (!empty($specializationIds)) {
        $specializationMaps = monitoring_management_load_specialization_maps($conn);
        foreach ($specializationIds as $specializationId) {
            if (!isset($specializationMaps['by_id'][$specializationId])) {
                respond(422, ['success' => false, 'message' => 'Invalid specialization selection.']);
            }
        }
    }

    $checkStmt = $conn->prepare('SELECT Role_id, Role_name FROM role WHERE LOWER(TRIM(Role_name)) = LOWER(TRIM(:name)) LIMIT 1');
    $checkStmt->execute([':name' => $roleName]);
    $existing = $checkStmt->fetch(PDO::FETCH_ASSOC);
    if ($existing) {
        respond(409, [
            'success' => false,
            'message' => 'Role already exists.',
            'role' => [
                'id' => (int)$existing['Role_id'],
                'name' => (string)$existing['Role_name'],
            ],
        ]);
    }

    $permissionPageStatusId = monitoring_permission_page_status_id($conn, false);
    $insertStmt = $conn->prepare(
        'INSERT INTO role (Role_name, Permission_page_status_id)
         VALUES (:name, :permission_page_status_id)'
    );
    $insertStmt->execute([
        ':name' => $roleName,
        ':permission_page_status_id' => $permissionPageStatusId,
    ]);
    $roleId = (int)$conn->lastInsertId();
    monitoring_set_role_management_config($conn, $roleId, [
        'disabled' => false,
        'specialization_type_ids' => $specializationIds,
    ]);

    respond(201, [
        'success' => true,
        'message' => 'Role added successfully.',
        'role' => [
            'id' => $roleId,
            'name' => $roleName,
            'disabled' => false,
            'permission_page_status_id' => $permissionPageStatusId,
            'permission_page_status_name' => monitoring_permission_page_status_name(false),
            'editing_locked' => false,
            'specialization_type_ids' => monitoring_get_role_effective_specialization_ids($conn, $roleId, $roleName),
            'specialization_type_names' => monitoring_get_role_effective_specialization_names($conn, $roleId, $roleName),
        ],
    ]);
} catch (Throwable $e) {
    error_log('role_create error: ' . $e->getMessage());
    respond(500, ['success' => false, 'message' => 'Server error']);
}
