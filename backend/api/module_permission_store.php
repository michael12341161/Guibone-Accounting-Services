<?php

require_once __DIR__ . '/connection-pdo.php';

if (!function_exists('monitoring_module_permission_role_key_map')) {
    function monitoring_module_permission_role_key_map(): array
    {
        return [
            (int)(defined('MONITORING_ROLE_ADMIN') ? MONITORING_ROLE_ADMIN : 1) => 'admin',
            (int)(defined('MONITORING_ROLE_SECRETARY') ? MONITORING_ROLE_SECRETARY : 2) => 'secretary',
            (int)(defined('MONITORING_ROLE_ACCOUNTANT') ? MONITORING_ROLE_ACCOUNTANT : 3) => 'accountant',
            (int)(defined('MONITORING_ROLE_CLIENT') ? MONITORING_ROLE_CLIENT : 4) => 'client',
        ];
    }
}

if (!function_exists('monitoring_module_permission_role_id_map')) {
    function monitoring_module_permission_role_id_map(): array
    {
        static $map = null;
        if ($map !== null) {
            return $map;
        }

        $map = [];
        foreach (monitoring_module_permission_role_key_map() as $roleId => $roleKey) {
            $map[$roleKey] = (int)$roleId;
        }

        return $map;
    }
}

if (!function_exists('monitoring_module_permission_independent_modules')) {
    function monitoring_module_permission_independent_modules(): array
    {
        return [
            'certificate' => true,
            'edit-certificate' => true,
        ];
    }
}

if (!function_exists('monitoring_module_permission_uses_independent_access')) {
    function monitoring_module_permission_uses_independent_access(string $moduleKey): bool
    {
        return isset(monitoring_module_permission_independent_modules()[trim($moduleKey)]);
    }
}

if (!function_exists('monitoring_module_permission_empty_role_map')) {
    function monitoring_module_permission_empty_role_map(): array
    {
        return [
            'admin' => false,
            'secretary' => false,
            'accountant' => false,
            'client' => false,
        ];
    }
}

if (!function_exists('monitoring_module_permission_role_defaults')) {
    function monitoring_module_permission_role_defaults(array $definition): array
    {
        return [
            'admin' => (bool)($definition['admin'] ?? false),
            'secretary' => (bool)($definition['secretary'] ?? false),
            'accountant' => (bool)($definition['accountant'] ?? false),
            'client' => (bool)($definition['client'] ?? false),
        ];
    }
}

if (!function_exists('monitoring_module_permission_normalize_user_id')) {
    function monitoring_module_permission_normalize_user_id($userId): ?int
    {
        $normalized = (int)($userId ?? 0);
        return $normalized > 0 ? $normalized : null;
    }
}

if (!function_exists('monitoring_module_permission_normalize_bool')) {
    function monitoring_module_permission_normalize_bool($value, bool $default = false): bool
    {
        if (is_bool($value)) {
            return $value;
        }
        if (is_int($value)) {
            return $value !== 0;
        }
        if (is_float($value)) {
            return ((int)$value) !== 0;
        }

        $normalized = strtolower(trim((string)($value ?? '')));
        if ($normalized === '') {
            return $default;
        }
        if (in_array($normalized, ['1', 'true', 'yes', 'on'], true)) {
            return true;
        }
        if (in_array($normalized, ['0', 'false', 'no', 'off'], true)) {
            return false;
        }

        return $default;
    }
}

if (!function_exists('monitoring_module_permission_build_name')) {
    function monitoring_module_permission_build_name(string $moduleKey, string $actionKey = ''): string
    {
        $normalizedModuleKey = trim($moduleKey);
        $normalizedActionKey = trim($actionKey);

        return $normalizedActionKey === ''
            ? $normalizedModuleKey
            : $normalizedModuleKey . '.' . $normalizedActionKey;
    }
}

if (!function_exists('monitoring_module_permission_parse_name')) {
    function monitoring_module_permission_parse_name(string $permissionName): array
    {
        $normalized = trim($permissionName);
        if ($normalized === '') {
            return ['', ''];
        }

        $segments = explode('.', $normalized, 2);
        return [
            trim((string)($segments[0] ?? '')),
            trim((string)($segments[1] ?? '')),
        ];
    }
}

if (!function_exists('monitoring_module_permission_normalize_against_reference')) {
    function monitoring_module_permission_normalize_against_reference(array $permissions, array $reference): array
    {
        $normalized = [];

        foreach ($reference as $moduleKey => $moduleDefinition) {
            $featurePermissions = isset($permissions[$moduleKey]) && is_array($permissions[$moduleKey])
                ? $permissions[$moduleKey]
                : [];
            $defaultFeaturePermissions = monitoring_module_permission_role_defaults($moduleDefinition);

            $normalized[$moduleKey] = [
                'admin' => monitoring_module_permission_normalize_bool(
                    $featurePermissions['admin'] ?? null,
                    (bool)$defaultFeaturePermissions['admin']
                ),
                'secretary' => monitoring_module_permission_normalize_bool(
                    $featurePermissions['secretary'] ?? null,
                    (bool)$defaultFeaturePermissions['secretary']
                ),
                'accountant' => monitoring_module_permission_normalize_bool(
                    $featurePermissions['accountant'] ?? null,
                    (bool)$defaultFeaturePermissions['accountant']
                ),
                'client' => monitoring_module_permission_normalize_bool(
                    $featurePermissions['client'] ?? null,
                    (bool)$defaultFeaturePermissions['client']
                ),
            ];

            if (!isset($moduleDefinition['actions']) || !is_array($moduleDefinition['actions'])) {
                continue;
            }

            $normalized[$moduleKey]['actions'] = [];
            $featureActions = isset($featurePermissions['actions']) && is_array($featurePermissions['actions'])
                ? $featurePermissions['actions']
                : [];
            $hasStoredActions = count($featureActions) > 0;

            foreach ($moduleDefinition['actions'] as $actionKey => $actionDefinition) {
                $actionPermissions = isset($featureActions[$actionKey]) && is_array($featureActions[$actionKey])
                    ? $featureActions[$actionKey]
                    : (($moduleKey === 'tasks' && isset($featureActions['show-actions']) && is_array($featureActions['show-actions']))
                        ? $featureActions['show-actions']
                        : (!$hasStoredActions ? $featurePermissions : []));
                $defaultActionPermissions = monitoring_module_permission_role_defaults($actionDefinition);

                $normalized[$moduleKey]['actions'][$actionKey] = [
                    'admin' => monitoring_module_permission_normalize_bool(
                        $actionPermissions['admin'] ?? null,
                        (bool)$defaultActionPermissions['admin']
                    ),
                    'secretary' => monitoring_module_permission_normalize_bool(
                        $actionPermissions['secretary'] ?? null,
                        (bool)$defaultActionPermissions['secretary']
                    ),
                    'accountant' => monitoring_module_permission_normalize_bool(
                        $actionPermissions['accountant'] ?? null,
                        (bool)$defaultActionPermissions['accountant']
                    ),
                    'client' => monitoring_module_permission_normalize_bool(
                        $actionPermissions['client'] ?? null,
                        (bool)$defaultActionPermissions['client']
                    ),
                ];
            }

            if (monitoring_module_permission_uses_independent_access($moduleKey)) {
                continue;
            }

            $normalized[$moduleKey]['admin'] = false;
            $normalized[$moduleKey]['secretary'] = false;
            $normalized[$moduleKey]['accountant'] = false;
            $normalized[$moduleKey]['client'] = false;

            foreach ($normalized[$moduleKey]['actions'] as $actionPermissions) {
                foreach (['admin', 'secretary', 'accountant', 'client'] as $roleKey) {
                    if (!empty($actionPermissions[$roleKey])) {
                        $normalized[$moduleKey][$roleKey] = true;
                    }
                }
            }
        }

        return $normalized;
    }
}

if (!function_exists('monitoring_module_permission_normalize')) {
    function monitoring_module_permission_normalize(array $permissions, array $reference): array
    {
        return monitoring_module_permission_normalize_against_reference($permissions, $reference);
    }
}

if (!function_exists('monitoring_module_permissions_ensure_store')) {
    function monitoring_module_permissions_ensure_store(PDO $conn): void
    {
        static $checked = false;
        if ($checked) {
            return;
        }

        monitoring_require_schema_columns(
            $conn,
            'permissions',
            ['permission_id', 'module_key', 'action_key', 'permission_name', 'User_ID'],
            'module permissions'
        );
        monitoring_require_schema_columns(
            $conn,
            'role_permissions',
            ['role_permissions_ID', 'Role_id', 'permission_id', 'is_allowed'],
            'module permissions'
        );

        $permissionCount = (int)($conn->query('SELECT COUNT(*) FROM permissions')->fetchColumn() ?: 0);
        if ($permissionCount <= 0) {
            throw new RuntimeException(
                'Module permissions are not configured. Import monitoring/monitoring.sql before using the permissions module.'
            );
        }

        $checked = true;
    }
}

if (!function_exists('monitoring_module_permission_catalog_rows')) {
    function monitoring_module_permission_catalog_rows(PDO $conn): array
    {
        monitoring_module_permissions_ensure_store($conn);

        $stmt = $conn->query(
            'SELECT permission_id, module_key, action_key, permission_name
             FROM permissions
             ORDER BY permission_id ASC'
        );

        $rows = [];
        foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) ?: [] as $row) {
            $permissionId = (int)($row['permission_id'] ?? 0);
            $moduleKey = trim((string)($row['module_key'] ?? ''));
            $actionKey = trim((string)($row['action_key'] ?? ''));
            $permissionName = trim((string)($row['permission_name'] ?? ''));

            if ($moduleKey === '' && $permissionName !== '') {
                [$moduleKey, $actionKey] = monitoring_module_permission_parse_name($permissionName);
            }
            if ($moduleKey === '') {
                continue;
            }

            $rows[] = [
                'permission_id' => $permissionId,
                'module_key' => $moduleKey,
                'action_key' => $actionKey,
                'permission_name' => $permissionName !== ''
                    ? $permissionName
                    : monitoring_module_permission_build_name($moduleKey, $actionKey),
            ];
        }

        if (empty($rows)) {
            throw new RuntimeException(
                'Module permissions are not configured. Import monitoring/monitoring.sql before using the permissions module.'
            );
        }

        return $rows;
    }
}

if (!function_exists('monitoring_module_permission_reference_catalog')) {
    function monitoring_module_permission_reference_catalog(PDO $conn): array
    {
        $catalog = [];

        foreach (monitoring_module_permission_catalog_rows($conn) as $row) {
            $moduleKey = $row['module_key'];
            $actionKey = $row['action_key'];

            if (!isset($catalog[$moduleKey]) || !is_array($catalog[$moduleKey])) {
                $catalog[$moduleKey] = monitoring_module_permission_empty_role_map();
            }

            if ($actionKey === '') {
                continue;
            }

            if (!isset($catalog[$moduleKey]['actions']) || !is_array($catalog[$moduleKey]['actions'])) {
                $catalog[$moduleKey]['actions'] = [];
            }

            if (!isset($catalog[$moduleKey]['actions'][$actionKey]) || !is_array($catalog[$moduleKey]['actions'][$actionKey])) {
                $catalog[$moduleKey]['actions'][$actionKey] = monitoring_module_permission_empty_role_map();
            }
        }

        return $catalog;
    }
}

if (!function_exists('monitoring_module_permissions_load')) {
    function monitoring_module_permissions_load(PDO $conn): array
    {
        monitoring_module_permissions_ensure_store($conn);

        $permissions = monitoring_module_permission_reference_catalog($conn);
        $roleKeyMap = monitoring_module_permission_role_key_map();
        $stmt = $conn->query(
            'SELECT p.permission_id,
                    p.module_key,
                    p.action_key,
                    p.permission_name,
                    rp.Role_id,
                    rp.is_allowed
             FROM permissions p
             LEFT JOIN role_permissions rp ON rp.permission_id = p.permission_id
             ORDER BY p.permission_id ASC, rp.Role_id ASC'
        );

        foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) ?: [] as $row) {
            $moduleKey = trim((string)($row['module_key'] ?? ''));
            $actionKey = trim((string)($row['action_key'] ?? ''));
            $permissionName = trim((string)($row['permission_name'] ?? ''));
            if ($moduleKey === '' && $permissionName !== '') {
                [$moduleKey, $actionKey] = monitoring_module_permission_parse_name($permissionName);
            }

            if ($moduleKey === '' || !isset($permissions[$moduleKey])) {
                continue;
            }

            $roleId = (int)($row['Role_id'] ?? 0);
            $roleKey = $roleKeyMap[$roleId] ?? null;
            if ($roleKey === null) {
                continue;
            }

            $isAllowed = !empty($row['is_allowed']);
            if ($actionKey !== '' && isset($permissions[$moduleKey]['actions'][$actionKey])) {
                $permissions[$moduleKey]['actions'][$actionKey][$roleKey] = $isAllowed;
                continue;
            }

            $permissions[$moduleKey][$roleKey] = $isAllowed;
        }

        return monitoring_module_permission_normalize($permissions, $permissions);
    }
}

if (!function_exists('monitoring_module_permissions_save')) {
    function monitoring_module_permissions_save(PDO $conn, array $permissions, ?int $modifiedByUserId = null): array
    {
        monitoring_module_permissions_ensure_store($conn);

        $reference = monitoring_module_permissions_load($conn);
        $normalized = monitoring_module_permission_normalize($permissions, $reference);
        $modifiedByUserId = monitoring_module_permission_normalize_user_id($modifiedByUserId);

        $catalogRows = monitoring_module_permission_catalog_rows($conn);
        $existingRolePermissions = [];
        $rolePermissionQuery = $conn->query(
            'SELECT role_permissions_ID, Role_id, permission_id, is_allowed
             FROM role_permissions'
        );
        foreach ($rolePermissionQuery->fetchAll(PDO::FETCH_ASSOC) ?: [] as $row) {
            $existingRolePermissions[(int)($row['Role_id'] ?? 0) . ':' . (int)($row['permission_id'] ?? 0)] = [
                'role_permissions_id' => (int)($row['role_permissions_ID'] ?? 0),
                'is_allowed' => !empty($row['is_allowed']),
            ];
        }

        $updateRolePermission = $conn->prepare(
            'UPDATE role_permissions
             SET is_allowed = :is_allowed
             WHERE role_permissions_ID = :role_permissions_id'
        );
        $insertRolePermission = $conn->prepare(
            'INSERT INTO role_permissions (Role_id, permission_id, is_allowed)
             VALUES (:role_id, :permission_id, :is_allowed)'
        );
        $updatePermissionModifier = $conn->prepare(
            'UPDATE permissions
             SET User_ID = :user_id
             WHERE permission_id = :permission_id'
        );

        $conn->beginTransaction();
        try {
            $touchedPermissionIds = [];

            foreach ($catalogRows as $row) {
                $moduleKey = $row['module_key'];
                $actionKey = $row['action_key'];
                $permissionId = (int)$row['permission_id'];
                if ($permissionId <= 0 || !isset($normalized[$moduleKey])) {
                    continue;
                }

                $valueSource = $actionKey === ''
                    ? $normalized[$moduleKey]
                    : ($normalized[$moduleKey]['actions'][$actionKey] ?? monitoring_module_permission_empty_role_map());

                foreach (monitoring_module_permission_role_id_map() as $roleKey => $roleId) {
                    $compositeKey = (int)$roleId . ':' . $permissionId;
                    $isAllowed = !empty($valueSource[$roleKey]);
                    $existingRow = $existingRolePermissions[$compositeKey] ?? null;

                    if ($existingRow !== null) {
                        if ((bool)$existingRow['is_allowed'] === $isAllowed) {
                            continue;
                        }

                        $updateRolePermission->execute([
                            ':is_allowed' => $isAllowed ? 1 : 0,
                            ':role_permissions_id' => (int)$existingRow['role_permissions_id'],
                        ]);
                        $touchedPermissionIds[$permissionId] = true;
                        continue;
                    }

                    $insertRolePermission->execute([
                        ':role_id' => (int)$roleId,
                        ':permission_id' => $permissionId,
                        ':is_allowed' => $isAllowed ? 1 : 0,
                    ]);
                    $touchedPermissionIds[$permissionId] = true;
                }
            }

            if ($modifiedByUserId !== null) {
                foreach (array_keys($touchedPermissionIds) as $permissionId) {
                    $updatePermissionModifier->execute([
                        ':user_id' => $modifiedByUserId,
                        ':permission_id' => (int)$permissionId,
                    ]);
                }
            }

            $conn->commit();
        } catch (Throwable $e) {
            if ($conn->inTransaction()) {
                $conn->rollBack();
            }
            throw $e;
        }

        return monitoring_module_permissions_load($conn);
    }
}

if (!function_exists('monitoring_module_permissions_is_role_allowed')) {
    function monitoring_module_permissions_is_role_allowed(PDO $conn, string $moduleKey, ?string $actionKey, int $roleId): bool
    {
        $permissions = monitoring_module_permissions_load($conn);
        $normalizedModuleKey = trim($moduleKey);
        $normalizedActionKey = trim((string)$actionKey);
        $roleKey = monitoring_module_permission_role_key_map()[$roleId] ?? null;

        if ($normalizedModuleKey === '' || $roleKey === null) {
            return false;
        }
        if (!isset($permissions[$normalizedModuleKey]) || !is_array($permissions[$normalizedModuleKey])) {
            return false;
        }

        if ($normalizedActionKey !== '') {
            return !empty($permissions[$normalizedModuleKey]['actions'][$normalizedActionKey][$roleKey]);
        }

        return !empty($permissions[$normalizedModuleKey][$roleKey]);
    }
}
