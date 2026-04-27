<?php

require_once __DIR__ . '/status_helpers.php';

const MONITORING_ROLE_MANAGEMENT_SETTINGS_KEY = 'role_management_settings';
const MONITORING_PAYMENT_METHOD_MANAGEMENT_SETTINGS_KEY = 'payment_method_management_settings';
const MONITORING_SPECIALIZATION_MANAGEMENT_SETTINGS_KEY = 'specialization_management_settings';
const MONITORING_ROLE_SPECIALIZATION_DEFAULTS = [
    'secretary' => ['Accounting Operations'],
    'accountant' => ['Tax Filing Operations', 'Auditing Operations', 'Book Keeping Operations'],
];
const MONITORING_PERMISSION_PAGE_STATUS_GROUP = 'PERMISSION_PAGE';
const MONITORING_PERMISSION_PAGE_UNLOCKED_STATUS = 'Unlocked';
const MONITORING_PERMISSION_PAGE_LOCKED_STATUS = 'Locked';

if (!function_exists('monitoring_permission_page_require_schema')) {
    function monitoring_permission_page_require_schema(PDO $conn): void
    {
        monitoring_require_schema_columns(
            $conn,
            'role',
            ['Role_id', 'Role_name', 'Permission_page_status_id'],
            'permission page role status'
        );
        monitoring_require_schema_columns(
            $conn,
            'status',
            ['Status_id', 'Status_group', 'Status_name'],
            'permission page role status'
        );
    }
}

if (!function_exists('monitoring_permission_page_status_name')) {
    function monitoring_permission_page_status_name(bool $locked): string
    {
        return $locked ? MONITORING_PERMISSION_PAGE_LOCKED_STATUS : MONITORING_PERMISSION_PAGE_UNLOCKED_STATUS;
    }
}

if (!function_exists('monitoring_permission_page_status_id')) {
    function monitoring_permission_page_status_id(PDO $conn, bool $locked): int
    {
        monitoring_permission_page_require_schema($conn);

        $statusId = monitoring_resolve_status_id(
            $conn,
            MONITORING_PERMISSION_PAGE_STATUS_GROUP,
            [monitoring_permission_page_status_name($locked)]
        );
        if ($statusId === null || $statusId <= 0) {
            throw new RuntimeException(
                'Missing permission page statuses in the status table. Import the latest monitoring.sql update first.'
            );
        }

        return (int)$statusId;
    }
}

if (!function_exists('monitoring_permission_page_validate_status_id')) {
    function monitoring_permission_page_validate_status_id(PDO $conn, $statusId): ?int
    {
        $normalizedStatusId = (int)($statusId ?? 0);
        if ($normalizedStatusId <= 0) {
            return null;
        }

        monitoring_permission_page_require_schema($conn);
        return monitoring_validate_status_id($conn, MONITORING_PERMISSION_PAGE_STATUS_GROUP, $normalizedStatusId);
    }
}

if (!function_exists('monitoring_permission_page_is_locked')) {
    function monitoring_permission_page_is_locked(?string $statusName): bool
    {
        return monitoring_status_matches($statusName, [MONITORING_PERMISSION_PAGE_LOCKED_STATUS]);
    }
}

if (!function_exists('monitoring_management_settings_require_table')) {
    function monitoring_management_settings_require_table(PDO $conn): void
    {
        monitoring_require_schema_columns(
            $conn,
            'settings',
            ['Settings_ID', 'setting_key', 'setting_value'],
            'management settings'
        );
    }
}

if (!function_exists('monitoring_management_settings_read_json')) {
    function monitoring_management_settings_read_json(PDO $conn, string $settingKey): array
    {
        monitoring_management_settings_require_table($conn);

        $stmt = $conn->prepare(
            'SELECT setting_value
             FROM settings
             WHERE setting_key = :setting_key
             ORDER BY Settings_ID DESC
             LIMIT 1'
        );
        $stmt->execute([':setting_key' => $settingKey]);
        $rawValue = $stmt->fetchColumn();
        if ($rawValue === false || $rawValue === null || trim((string)$rawValue) === '') {
            return [];
        }

        $decoded = json_decode((string)$rawValue, true);
        return is_array($decoded) ? $decoded : [];
    }
}

if (!function_exists('monitoring_management_settings_write_json')) {
    function monitoring_management_settings_write_json(PDO $conn, string $settingKey, array $payload): array
    {
        monitoring_management_settings_require_table($conn);

        $jsonValue = json_encode($payload, JSON_UNESCAPED_SLASHES);
        $existingStmt = $conn->prepare(
            'SELECT Settings_ID
             FROM settings
             WHERE setting_key = :setting_key
             ORDER BY Settings_ID DESC
             LIMIT 1'
        );
        $existingStmt->execute([':setting_key' => $settingKey]);
        $existingId = (int)($existingStmt->fetchColumn() ?: 0);

        if ($existingId > 0) {
            $updateStmt = $conn->prepare(
                'UPDATE settings
                 SET setting_value = :setting_value
                 WHERE Settings_ID = :settings_id'
            );
            $updateStmt->execute([
                ':setting_value' => $jsonValue,
                ':settings_id' => $existingId,
            ]);
        } else {
            $insertStmt = $conn->prepare(
                'INSERT INTO settings (setting_key, setting_value)
                 VALUES (:setting_key, :setting_value)'
            );
            $insertStmt->execute([
                ':setting_key' => $settingKey,
                ':setting_value' => $jsonValue,
            ]);
        }

        return $payload;
    }
}

if (!function_exists('monitoring_get_role_management_settings')) {
    function monitoring_get_role_management_settings(PDO $conn): array
    {
        $decoded = monitoring_management_settings_read_json($conn, MONITORING_ROLE_MANAGEMENT_SETTINGS_KEY);
        $roles = is_array($decoded['roles'] ?? null) ? $decoded['roles'] : [];
        $normalized = ['roles' => []];

        foreach ($roles as $roleId => $config) {
            $normalizedId = trim((string)$roleId);
            if ($normalizedId === '' || !is_array($config)) {
                continue;
            }

            $specializationConfigured = array_key_exists('specialization_type_ids', $config)
                || array_key_exists('allowed_specialization_type_ids', $config);
            $specializationIds = [];
            if ($specializationConfigured) {
                $sourceIds = array_key_exists('specialization_type_ids', $config)
                    ? $config['specialization_type_ids']
                    : $config['allowed_specialization_type_ids'];
                $specializationIds = monitoring_management_normalize_positive_ids($sourceIds);
            }

            $normalized['roles'][$normalizedId] = [
                'disabled' => !empty($config['disabled']),
                'specialization_type_ids' => $specializationIds,
                'specialization_configured' => $specializationConfigured,
            ];
        }

        return $normalized;
    }
}

if (!function_exists('monitoring_get_payment_method_management_settings')) {
    function monitoring_get_payment_method_management_settings(PDO $conn): array
    {
        $decoded = monitoring_management_settings_read_json($conn, MONITORING_PAYMENT_METHOD_MANAGEMENT_SETTINGS_KEY);
        $paymentMethods = is_array($decoded['payment_methods'] ?? null) ? $decoded['payment_methods'] : [];
        $normalized = ['payment_methods' => []];

        foreach ($paymentMethods as $paymentMethodId => $config) {
            $normalizedId = trim((string)$paymentMethodId);
            if ($normalizedId === '' || !is_array($config)) {
                continue;
            }

            $normalized['payment_methods'][$normalizedId] = [
                'disabled' => !empty($config['disabled']),
            ];
        }

        return $normalized;
    }
}

if (!function_exists('monitoring_management_normalize_positive_ids')) {
    function monitoring_management_normalize_positive_ids($values): array
    {
        if (!is_array($values)) {
            return [];
        }

        $ids = [];
        foreach ($values as $value) {
            $raw = trim((string)$value);
            if ($raw === '' || !ctype_digit($raw)) {
                continue;
            }

            $id = (int)$raw;
            if ($id > 0) {
                $ids[] = $id;
            }
        }

        $ids = array_values(array_unique($ids));
        sort($ids);
        return $ids;
    }
}

if (!function_exists('monitoring_management_normalize_name_key')) {
    function monitoring_management_normalize_name_key($value): string
    {
        return strtolower(trim(preg_replace('/\s+/', ' ', (string)$value)));
    }
}

if (!function_exists('monitoring_management_load_specialization_maps')) {
    function monitoring_management_load_specialization_maps(PDO $conn): array
    {
        monitoring_require_schema_columns(
            $conn,
            'specialization_type',
            ['specialization_type_ID', 'Name'],
            'specialization type'
        );

        $stmt = $conn->query(
            'SELECT specialization_type_ID AS id, Name AS name
             FROM specialization_type
             WHERE Name IS NOT NULL AND TRIM(Name) <> ""
             ORDER BY specialization_type_ID ASC'
        );

        $byId = [];
        $byName = [];
        foreach (($stmt->fetchAll(PDO::FETCH_ASSOC) ?: []) as $row) {
            $id = (int)($row['id'] ?? 0);
            $name = trim((string)($row['name'] ?? ''));
            if ($id <= 0 || $name === '') {
                continue;
            }

            $byId[$id] = $name;
            $byName[monitoring_management_normalize_name_key($name)] = $id;
        }

        return [
            'by_id' => $byId,
            'by_name' => $byName,
        ];
    }
}

if (!function_exists('monitoring_management_default_role_specialization_ids')) {
    function monitoring_management_default_role_specialization_ids(PDO $conn, string $roleName): array
    {
        $defaultNames = MONITORING_ROLE_SPECIALIZATION_DEFAULTS[monitoring_management_normalize_name_key($roleName)] ?? [];
        if (empty($defaultNames)) {
            return [];
        }

        $maps = monitoring_management_load_specialization_maps($conn);
        $ids = [];
        foreach ($defaultNames as $name) {
            $normalizedName = monitoring_management_normalize_name_key($name);
            if (isset($maps['by_name'][$normalizedName])) {
                $ids[] = (int)$maps['by_name'][$normalizedName];
            }
        }

        $ids = array_values(array_unique($ids));
        sort($ids);
        return $ids;
    }
}

if (!function_exists('monitoring_get_role_effective_specialization_ids')) {
    function monitoring_get_role_effective_specialization_ids(PDO $conn, int $roleId, ?string $roleName = null): array
    {
        if ($roleId <= 0) {
            return [];
        }

        $settings = monitoring_get_role_management_settings($conn);
        $config = is_array($settings['roles'][(string)$roleId] ?? null) ? $settings['roles'][(string)$roleId] : [];
        if (!empty($config['specialization_configured'])) {
            return monitoring_management_normalize_positive_ids($config['specialization_type_ids'] ?? []);
        }

        return monitoring_management_default_role_specialization_ids($conn, (string)$roleName);
    }
}

if (!function_exists('monitoring_get_role_effective_specialization_names')) {
    function monitoring_get_role_effective_specialization_names(PDO $conn, int $roleId, ?string $roleName = null): array
    {
        $ids = monitoring_get_role_effective_specialization_ids($conn, $roleId, $roleName);
        if (empty($ids)) {
            return [];
        }

        $maps = monitoring_management_load_specialization_maps($conn);
        $names = [];
        foreach ($ids as $id) {
            if (isset($maps['by_id'][$id])) {
                $names[] = (string)$maps['by_id'][$id];
            }
        }

        return array_values(array_unique($names));
    }
}

if (!function_exists('monitoring_role_allows_specialization_ids')) {
    function monitoring_role_allows_specialization_ids(PDO $conn, int $roleId, ?string $roleName, array $specializationIds): bool
    {
        $normalizedIds = monitoring_management_normalize_positive_ids($specializationIds);
        if (empty($normalizedIds)) {
            return true;
        }

        $allowedIds = monitoring_get_role_effective_specialization_ids($conn, $roleId, $roleName);
        if (empty($allowedIds)) {
            return false;
        }

        $allowedMap = array_fill_keys($allowedIds, true);
        foreach ($normalizedIds as $specializationId) {
            if (!isset($allowedMap[$specializationId])) {
                return false;
            }
        }

        return true;
    }
}

if (!function_exists('monitoring_set_role_management_config')) {
    function monitoring_set_role_management_config(PDO $conn, int $roleId, array $config): array
    {
        if ($roleId <= 0) {
            throw new InvalidArgumentException('Invalid role id.');
        }

        $decoded = monitoring_management_settings_read_json($conn, MONITORING_ROLE_MANAGEMENT_SETTINGS_KEY);
        $roles = is_array($decoded['roles'] ?? null) ? $decoded['roles'] : [];
        $currentConfig = is_array($roles[(string)$roleId] ?? null) ? $roles[(string)$roleId] : [];

        $nextConfig = [
            'disabled' => array_key_exists('disabled', $config)
                ? !empty($config['disabled'])
                : !empty($currentConfig['disabled']),
        ];

        if (array_key_exists('specialization_type_ids', $config) || array_key_exists('allowed_specialization_type_ids', $config)) {
            $specializationIds = array_key_exists('specialization_type_ids', $config)
                ? $config['specialization_type_ids']
                : $config['allowed_specialization_type_ids'];
            $nextConfig['specialization_type_ids'] = monitoring_management_normalize_positive_ids($specializationIds);
        } elseif (array_key_exists('specialization_type_ids', $currentConfig) || array_key_exists('allowed_specialization_type_ids', $currentConfig)) {
            $specializationIds = array_key_exists('specialization_type_ids', $currentConfig)
                ? $currentConfig['specialization_type_ids']
                : $currentConfig['allowed_specialization_type_ids'];
            $nextConfig['specialization_type_ids'] = monitoring_management_normalize_positive_ids($specializationIds);
        }

        $roles[(string)$roleId] = $nextConfig;

        return monitoring_management_settings_write_json($conn, MONITORING_ROLE_MANAGEMENT_SETTINGS_KEY, [
            'roles' => $roles,
        ]);
    }
}

if (!function_exists('monitoring_set_payment_method_management_config')) {
    function monitoring_set_payment_method_management_config(PDO $conn, int $paymentMethodId, array $config): array
    {
        if ($paymentMethodId <= 0) {
            throw new InvalidArgumentException('Invalid payment method id.');
        }

        $settings = monitoring_get_payment_method_management_settings($conn);
        $settings['payment_methods'][(string)$paymentMethodId] = [
            'disabled' => !empty($config['disabled']),
        ];

        return monitoring_management_settings_write_json($conn, MONITORING_PAYMENT_METHOD_MANAGEMENT_SETTINGS_KEY, $settings);
    }
}

if (!function_exists('monitoring_get_specialization_management_settings')) {
    function monitoring_get_specialization_management_settings(PDO $conn): array
    {
        $decoded = monitoring_management_settings_read_json($conn, MONITORING_SPECIALIZATION_MANAGEMENT_SETTINGS_KEY);
        $specializations = is_array($decoded['specializations'] ?? null) ? $decoded['specializations'] : [];
        $normalized = ['specializations' => []];

        foreach ($specializations as $specializationId => $config) {
            $normalizedId = trim((string)$specializationId);
            if ($normalizedId === '' || !is_array($config)) {
                continue;
            }

            $serviceIds = [];
            foreach ((array)($config['service_ids'] ?? []) as $serviceId) {
                $normalizedServiceId = (int)$serviceId;
                if ($normalizedServiceId > 0) {
                    $serviceIds[] = $normalizedServiceId;
                }
            }

            $normalized['specializations'][$normalizedId] = [
                'disabled' => !empty($config['disabled']),
                'service_ids' => array_values(array_unique($serviceIds)),
            ];
        }

        return $normalized;
    }
}

if (!function_exists('monitoring_set_specialization_management_config')) {
    function monitoring_set_specialization_management_config(PDO $conn, int $specializationId, array $config): array
    {
        if ($specializationId <= 0) {
            throw new InvalidArgumentException('Invalid specialization id.');
        }

        $serviceIds = [];
        foreach ((array)($config['service_ids'] ?? []) as $serviceId) {
            $normalizedServiceId = (int)$serviceId;
            if ($normalizedServiceId > 0) {
                $serviceIds[] = $normalizedServiceId;
            }
        }

        $settings = monitoring_get_specialization_management_settings($conn);
        $settings['specializations'][(string)$specializationId] = [
            'disabled' => !empty($config['disabled']),
            'service_ids' => array_values(array_unique($serviceIds)),
        ];

        return monitoring_management_settings_write_json($conn, MONITORING_SPECIALIZATION_MANAGEMENT_SETTINGS_KEY, $settings);
    }
}
