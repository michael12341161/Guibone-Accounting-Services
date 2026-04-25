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
    $conn->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    monitoring_require_role_or_any_module_access($conn, [MONITORING_ROLE_ADMIN], ['user-management', 'permissions']);
    $includeDisabled = !empty($_GET['include_disabled']);

    monitoring_permission_page_require_schema($conn);
    $settings = monitoring_get_role_management_settings($conn);
    $roleConfigMap = is_array($settings['roles'] ?? null) ? $settings['roles'] : [];

    $stmt = $conn->query(
        'SELECT r.Role_id AS id,
                r.Role_name AS name,
                r.Permission_page_status_id AS permission_page_status_id,
                ps.Status_name AS permission_page_status_name
         FROM role r
         LEFT JOIN status ps
           ON ps.Status_id = r.Permission_page_status_id
          AND LOWER(ps.Status_group) = LOWER("' . MONITORING_PERMISSION_PAGE_STATUS_GROUP . '")
         WHERE r.Role_name IS NOT NULL AND TRIM(r.Role_name) <> ""
         ORDER BY r.Role_id DESC'
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
        $permissionPageStatusId = isset($row['permission_page_status_id']) ? (int)$row['permission_page_status_id'] : null;
        $permissionPageStatusName = trim((string)($row['permission_page_status_name'] ?? ''));
        if ($permissionPageStatusId <= 0 || $permissionPageStatusName === '') {
            throw new RuntimeException(
                'Role permission page statuses are missing or invalid. Import the latest monitoring.sql update first.'
            );
        }
        $editingLocked = monitoring_permission_page_is_locked($permissionPageStatusName);
        if ($disabled && !$includeDisabled) {
            continue;
        }

        $roles[] = [
            'id' => $roleId,
            'name' => $roleName,
            'disabled' => $disabled,
            'permission_page_status_id' => $permissionPageStatusId,
            'permission_page_status_name' => $permissionPageStatusName,
            'editing_locked' => $editingLocked,
            'specialization_type_ids' => monitoring_get_role_effective_specialization_ids($conn, $roleId, $roleName),
            'specialization_type_names' => monitoring_get_role_effective_specialization_names($conn, $roleId, $roleName),
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
