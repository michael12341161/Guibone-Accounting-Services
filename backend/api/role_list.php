<?php
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/connection-pdo.php';
require_once __DIR__ . '/management_catalog_settings_helper.php';

monitoring_bootstrap_api(['GET', 'OPTIONS']);

function respond($code, $payload) {
    http_response_code($code);
    echo json_encode($payload);
    exit;
}

try {
    monitoring_require_roles([MONITORING_ROLE_ADMIN]);
    $conn->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $includeDisabled = !empty($_GET['include_disabled']);

    monitoring_require_schema_columns($conn, 'role', ['Role_id', 'Role_name'], 'role');
    $settings = monitoring_get_role_management_settings($conn);
    $roleConfigMap = is_array($settings['roles'] ?? null) ? $settings['roles'] : [];

    $stmt = $conn->query(
        'SELECT Role_id AS id, Role_name AS name
         FROM role
         WHERE Role_name IS NOT NULL AND TRIM(Role_name) <> ""
         ORDER BY Role_id ASC'
    );

    $roles = [];
    foreach (($stmt->fetchAll(PDO::FETCH_ASSOC) ?: []) as $row) {
        $roleId = (int)($row['id'] ?? 0);
        $roleName = trim((string)($row['name'] ?? ''));
        if ($roleId <= 0 || $roleName === '') {
            continue;
        }

        $config = is_array($roleConfigMap[(string)$roleId] ?? null) ? $roleConfigMap[(string)$roleId] : [];
        $disabled = !empty($config['disabled']);
        if ($disabled && !$includeDisabled) {
            continue;
        }

        $roles[] = [
            'id' => $roleId,
            'name' => $roleName,
            'disabled' => $disabled,
        ];
    }

    respond(200, [
        'success' => true,
        'roles' => $roles,
    ]);
} catch (Throwable $e) {
    error_log('role_list error: ' . $e->getMessage());
    respond(500, ['success' => false, 'message' => 'Server error']);
}
