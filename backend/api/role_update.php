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
    monitoring_require_schema_columns($conn, 'role', ['Role_id', 'Role_name'], 'role');

    $raw = file_get_contents('php://input');
    $data = json_decode($raw, true);
    if (!is_array($data)) {
        respond(400, ['success' => false, 'message' => 'Invalid JSON payload']);
    }

    $roleId = isset($data['role_id']) ? (int)$data['role_id'] : 0;
    if ($roleId <= 0) {
        respond(422, ['success' => false, 'message' => 'Role id is required.']);
    }

    $roleStmt = $conn->prepare('SELECT Role_id, Role_name FROM role WHERE Role_id = :id LIMIT 1');
    $roleStmt->execute([':id' => $roleId]);
    $existing = $roleStmt->fetch(PDO::FETCH_ASSOC);
    if (!$existing) {
        respond(404, ['success' => false, 'message' => 'Role not found.']);
    }

    $nextName = trim((string)($data['name'] ?? $data['role_name'] ?? $existing['Role_name'] ?? ''));
    $disabled = !empty($data['disabled']);
    $specializationPayloadProvided = array_key_exists('specialization_type_ids', $data)
        || array_key_exists('allowed_specialization_type_ids', $data);
    $specializationIds = [];

    if ($nextName === '') {
        respond(422, ['success' => false, 'message' => 'Role name is required.']);
    }
    if (mb_strlen($nextName) > 100) {
        respond(422, ['success' => false, 'message' => 'Role name must be 100 characters or fewer.']);
    }

    if ($specializationPayloadProvided) {
        $specializationPayload = array_key_exists('specialization_type_ids', $data)
            ? $data['specialization_type_ids']
            : $data['allowed_specialization_type_ids'];
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
    }

    $duplicateStmt = $conn->prepare(
        'SELECT Role_id
         FROM role
         WHERE LOWER(TRIM(Role_name)) = LOWER(TRIM(:name))
           AND Role_id <> :id
         LIMIT 1'
    );
    $duplicateStmt->execute([
        ':name' => $nextName,
        ':id' => $roleId,
    ]);
    if ($duplicateStmt->fetchColumn()) {
        respond(409, ['success' => false, 'message' => 'Another role already uses that name.']);
    }

    $updateStmt = $conn->prepare('UPDATE role SET Role_name = :name WHERE Role_id = :id');
    $updateStmt->execute([
        ':name' => $nextName,
        ':id' => $roleId,
    ]);

    $roleConfigPayload = ['disabled' => $disabled];
    if ($specializationPayloadProvided) {
        $roleConfigPayload['specialization_type_ids'] = $specializationIds;
    }
    monitoring_set_role_management_config($conn, $roleId, $roleConfigPayload);

    respond(200, [
        'success' => true,
        'message' => $disabled ? 'Role disabled successfully.' : 'Role updated successfully.',
        'role' => [
            'id' => $roleId,
            'name' => $nextName,
            'disabled' => $disabled,
            'specialization_type_ids' => monitoring_get_role_effective_specialization_ids($conn, $roleId, $nextName),
            'specialization_type_names' => monitoring_get_role_effective_specialization_names($conn, $roleId, $nextName),
        ],
    ]);
} catch (Throwable $e) {
    error_log('role_update error: ' . $e->getMessage());
    respond(500, ['success' => false, 'message' => 'Server error']);
}
