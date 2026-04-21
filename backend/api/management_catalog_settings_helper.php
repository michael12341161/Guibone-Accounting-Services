<?php

const MONITORING_ROLE_MANAGEMENT_SETTINGS_KEY = 'role_management_settings';
const MONITORING_SPECIALIZATION_MANAGEMENT_SETTINGS_KEY = 'specialization_management_settings';

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

            $normalized['roles'][$normalizedId] = [
                'disabled' => !empty($config['disabled']),
            ];
        }

        return $normalized;
    }
}

if (!function_exists('monitoring_set_role_management_config')) {
    function monitoring_set_role_management_config(PDO $conn, int $roleId, array $config): array
    {
        if ($roleId <= 0) {
            throw new InvalidArgumentException('Invalid role id.');
        }

        $settings = monitoring_get_role_management_settings($conn);
        $settings['roles'][(string)$roleId] = [
            'disabled' => !empty($config['disabled']),
        ];

        return monitoring_management_settings_write_json($conn, MONITORING_ROLE_MANAGEMENT_SETTINGS_KEY, $settings);
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
