<?php

require_once __DIR__ . '/connection-pdo.php';

if (!function_exists('monitoring_module_permission_builtin_role_key_map')) {
    function monitoring_module_permission_builtin_role_key_map(): array
    {
        return [
            (int)(defined('MONITORING_ROLE_ADMIN') ? MONITORING_ROLE_ADMIN : 1) => 'admin',
            (int)(defined('MONITORING_ROLE_SECRETARY') ? MONITORING_ROLE_SECRETARY : 2) => 'secretary',
            (int)(defined('MONITORING_ROLE_ACCOUNTANT') ? MONITORING_ROLE_ACCOUNTANT : 3) => 'accountant',
            (int)(defined('MONITORING_ROLE_CLIENT') ? MONITORING_ROLE_CLIENT : 4) => 'client',
        ];
    }
}

if (!function_exists('monitoring_module_permission_role_key_for_id')) {
    function monitoring_module_permission_role_key_for_id(int $roleId): ?string
    {
        if ($roleId <= 0) {
            return null;
        }

        $builtinMap = monitoring_module_permission_builtin_role_key_map();
        if (isset($builtinMap[$roleId])) {
            return $builtinMap[$roleId];
        }

        return 'role_' . $roleId;
    }
}

if (!function_exists('monitoring_module_permission_select_role_ids')) {
    function monitoring_module_permission_select_role_ids(?PDO $conn = null): array
    {
        $roleIds = [];

        if ($conn instanceof PDO) {
            monitoring_require_schema_columns($conn, 'role', ['Role_id'], 'role');

            $stmt = $conn->query(
                'SELECT Role_id
                 FROM role
                 WHERE Role_id IS NOT NULL
                 ORDER BY Role_id ASC'
            );

            foreach ($stmt->fetchAll(PDO::FETCH_COLUMN) ?: [] as $value) {
                $roleId = (int)$value;
                if ($roleId > 0) {
                    $roleIds[$roleId] = true;
                }
            }
        }

        foreach (array_keys(monitoring_module_permission_builtin_role_key_map()) as $builtinRoleId) {
            $roleIds[(int)$builtinRoleId] = true;
        }

        $normalizedRoleIds = array_map('intval', array_keys($roleIds));
        sort($normalizedRoleIds, SORT_NUMERIC);

        return $normalizedRoleIds;
    }
}

if (!function_exists('monitoring_module_permission_role_key_map')) {
    function monitoring_module_permission_role_key_map(?PDO $conn = null): array
    {
        $map = [];
        foreach (monitoring_module_permission_select_role_ids($conn) as $roleId) {
            $roleKey = monitoring_module_permission_role_key_for_id((int)$roleId);
            if ($roleKey === null || $roleKey === '') {
                continue;
            }

            $map[(int)$roleId] = $roleKey;
        }

        return $map;
    }
}

if (!function_exists('monitoring_module_permission_role_id_map')) {
    function monitoring_module_permission_role_id_map(?PDO $conn = null): array
    {
        $map = [];
        foreach (monitoring_module_permission_role_key_map($conn) as $roleId => $roleKey) {
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
    function monitoring_module_permission_empty_role_map(?PDO $conn = null, ?array $roleKeys = null): array
    {
        $resolvedRoleKeys = [];

        if (is_array($roleKeys)) {
            foreach ($roleKeys as $roleKey) {
                $normalizedRoleKey = trim((string)$roleKey);
                if ($normalizedRoleKey !== '') {
                    $resolvedRoleKeys[$normalizedRoleKey] = true;
                }
            }
        }

        if (empty($resolvedRoleKeys)) {
            foreach (array_keys(monitoring_module_permission_role_id_map($conn)) as $roleKey) {
                $resolvedRoleKeys[$roleKey] = true;
            }
        }

        $map = [];
        foreach (array_keys($resolvedRoleKeys) as $roleKey) {
            $map[$roleKey] = false;
        }

        return $map;
    }
}

if (!function_exists('monitoring_module_permission_role_defaults')) {
    function monitoring_module_permission_role_defaults(array $definition, ?PDO $conn = null, ?array $roleKeys = null): array
    {
        $defaults = monitoring_module_permission_empty_role_map($conn, $roleKeys);

        foreach (array_keys($defaults) as $roleKey) {
            $defaults[$roleKey] = (bool)($definition[$roleKey] ?? false);
        }

        return $defaults;
    }
}

if (!function_exists('monitoring_module_permission_known_role_keys')) {
    function monitoring_module_permission_known_role_keys(array $permissions, ?PDO $conn = null): array
    {
        $roleKeys = monitoring_module_permission_empty_role_map($conn);

        foreach ($permissions as $modulePermissions) {
            if (!is_array($modulePermissions)) {
                continue;
            }

            foreach ($modulePermissions as $key => $value) {
                $normalizedKey = trim((string)$key);
                if ($normalizedKey !== '' && $normalizedKey !== 'actions') {
                    $roleKeys[$normalizedKey] = true;
                }
            }

            $actions = $modulePermissions['actions'] ?? [];
            if (!is_array($actions)) {
                continue;
            }

            foreach ($actions as $actionPermissions) {
                if (!is_array($actionPermissions)) {
                    continue;
                }

                foreach ($actionPermissions as $key => $value) {
                    $normalizedKey = trim((string)$key);
                    if ($normalizedKey !== '' && $normalizedKey !== 'actions') {
                        $roleKeys[$normalizedKey] = true;
                    }
                }
            }
        }

        return array_values(array_keys($roleKeys));
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
    function monitoring_module_permission_normalize_against_reference(array $permissions, array $reference, ?PDO $conn = null): array
    {
        $normalized = [];
        $roleKeys = monitoring_module_permission_known_role_keys($reference, $conn);

        foreach ($reference as $moduleKey => $moduleDefinition) {
            $featurePermissions = isset($permissions[$moduleKey]) && is_array($permissions[$moduleKey])
                ? $permissions[$moduleKey]
                : [];
            $defaultFeaturePermissions = monitoring_module_permission_role_defaults($moduleDefinition, $conn, $roleKeys);
            $normalized[$moduleKey] = monitoring_module_permission_empty_role_map($conn, $roleKeys);

            foreach ($roleKeys as $roleKey) {
                $normalized[$moduleKey][$roleKey] = monitoring_module_permission_normalize_bool(
                    $featurePermissions[$roleKey] ?? null,
                    (bool)($defaultFeaturePermissions[$roleKey] ?? false)
                );
            }

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
                $defaultActionPermissions = monitoring_module_permission_role_defaults($actionDefinition, $conn, $roleKeys);
                $normalized[$moduleKey]['actions'][$actionKey] = monitoring_module_permission_empty_role_map($conn, $roleKeys);

                foreach ($roleKeys as $roleKey) {
                    $normalized[$moduleKey]['actions'][$actionKey][$roleKey] = monitoring_module_permission_normalize_bool(
                        $actionPermissions[$roleKey] ?? null,
                        (bool)($defaultActionPermissions[$roleKey] ?? false)
                    );
                }
            }

            if (monitoring_module_permission_uses_independent_access($moduleKey)) {
                continue;
            }

            foreach ($roleKeys as $roleKey) {
                $normalized[$moduleKey][$roleKey] = false;
            }

            foreach ($normalized[$moduleKey]['actions'] as $actionPermissions) {
                foreach ($roleKeys as $roleKey) {
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
    function monitoring_module_permission_normalize(array $permissions, array $reference, ?PDO $conn = null): array
    {
        return monitoring_module_permission_normalize_against_reference($permissions, $reference, $conn);
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
                $catalog[$moduleKey] = monitoring_module_permission_empty_role_map($conn);
            }

            if ($actionKey === '') {
                continue;
            }

            if (!isset($catalog[$moduleKey]['actions']) || !is_array($catalog[$moduleKey]['actions'])) {
                $catalog[$moduleKey]['actions'] = [];
            }

            if (!isset($catalog[$moduleKey]['actions'][$actionKey]) || !is_array($catalog[$moduleKey]['actions'][$actionKey])) {
                $catalog[$moduleKey]['actions'][$actionKey] = monitoring_module_permission_empty_role_map($conn);
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
        $roleKeyMap = monitoring_module_permission_role_key_map($conn);
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

        return monitoring_module_permission_normalize($permissions, $permissions, $conn);
    }
}

if (!function_exists('monitoring_module_permissions_ensure_catalog_entries')) {
    function monitoring_module_permissions_ensure_catalog_entries(PDO $conn, array $permissions): void
    {
        $existingRows = monitoring_module_permission_catalog_rows($conn);
        $existingKeys = [];
        foreach ($existingRows as $row) {
            $existingKeys[$row['module_key'] . "\0" . $row['action_key']] = true;
        }

        $insertStmt = $conn->prepare(
            'INSERT INTO permissions (module_key, action_key, permission_name)
             VALUES (:module_key, :action_key, :permission_name)'
        );

        foreach ($permissions as $moduleKey => $modulePermissions) {
            if (!is_array($modulePermissions)) {
                continue;
            }

            $normalizedModuleKey = trim((string)$moduleKey);
            if ($normalizedModuleKey === '') {
                continue;
            }

            $compositeKey = $normalizedModuleKey . "\0" . '';
            if (!isset($existingKeys[$compositeKey])) {
                $insertStmt->execute([
                    ':module_key' => $normalizedModuleKey,
                    ':action_key' => '',
                    ':permission_name' => monitoring_module_permission_build_name($normalizedModuleKey, ''),
                ]);
                $existingKeys[$compositeKey] = true;
            }

            $actions = $modulePermissions['actions'] ?? [];
            if (!is_array($actions)) {
                continue;
            }

            foreach ($actions as $actionKey => $actionPermissions) {
                $normalizedActionKey = trim((string)$actionKey);
                if ($normalizedActionKey === '') {
                    continue;
                }

                $compositeKey = $normalizedModuleKey . "\0" . $normalizedActionKey;
                if (!isset($existingKeys[$compositeKey])) {
                    $insertStmt->execute([
                        ':module_key' => $normalizedModuleKey,
                        ':action_key' => $normalizedActionKey,
                        ':permission_name' => monitoring_module_permission_build_name($normalizedModuleKey, $normalizedActionKey),
                    ]);
                    $existingKeys[$compositeKey] = true;
                }
            }
        }
    }
}

if (!function_exists('monitoring_module_permissions_save')) {
    function monitoring_module_permissions_save(PDO $conn, array $permissions, ?int $modifiedByUserId = null): array
    {
        monitoring_module_permissions_ensure_store($conn);
        monitoring_module_permissions_ensure_catalog_entries($conn, $permissions);

        $reference = monitoring_module_permissions_load($conn);
        $normalized = monitoring_module_permission_normalize($permissions, $reference, $conn);
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
                    : ($normalized[$moduleKey]['actions'][$actionKey] ?? monitoring_module_permission_empty_role_map($conn));

                foreach (monitoring_module_permission_role_id_map($conn) as $roleKey => $roleId) {
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
        $roleKey = monitoring_module_permission_role_key_for_id($roleId);

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
