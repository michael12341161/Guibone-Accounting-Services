<?php

const MONITORING_SERVICE_BUNDLE_SETTINGS_KEY = 'service_bundle_settings';

if (!function_exists('monitoring_service_bundle_require_settings_table')) {
    function monitoring_service_bundle_require_settings_table(PDO $conn): void
    {
        monitoring_require_schema_columns(
            $conn,
            'settings',
            ['Settings_ID', 'setting_key', 'setting_value'],
            'service bundle settings'
        );
    }
}

if (!function_exists('monitoring_service_bundle_require_table')) {
    function monitoring_service_bundle_require_table(PDO $conn): void
    {
        monitoring_require_schema_columns(
            $conn,
            'bundle_tasks',
            ['Bundle_Tasks_ID', 'Services_type_Id', 'Step_Number', 'Assignee', 'Step_Text'],
            'service bundle tasks'
        );
    }
}

if (!function_exists('monitoring_normalize_service_bundle_step')) {
    function monitoring_normalize_service_bundle_step($step): ?array
    {
        if (!is_array($step)) {
            return null;
        }

        $text = trim((string)($step['text'] ?? ''));
        if ($text === '') {
            return null;
        }

        $assigneeRaw = trim((string)($step['assignee'] ?? 'accountant'));
        $assignee = strtolower($assigneeRaw);
        if (!in_array($assignee, ['accountant', 'secretary', 'owner'], true)) {
            $assignee = 'accountant';
        }

        return [
            'text' => $text,
            'assignee' => $assignee,
        ];
    }
}

if (!function_exists('monitoring_normalize_service_bundle_steps')) {
    function monitoring_normalize_service_bundle_steps($steps): array
    {
        $normalized = [];
        foreach (is_array($steps) ? $steps : [] as $step) {
            $candidate = monitoring_normalize_service_bundle_step($step);
            if ($candidate !== null) {
                $normalized[] = $candidate;
            }
        }
        return array_values($normalized);
    }
}

if (!function_exists('monitoring_get_service_bundle_disabled_map')) {
    function monitoring_get_service_bundle_disabled_map(PDO $conn): array
    {
        monitoring_service_bundle_require_settings_table($conn);

        $stmt = $conn->prepare(
            'SELECT setting_value
             FROM settings
             WHERE setting_key = :setting_key
             ORDER BY Settings_ID DESC
             LIMIT 1'
        );
        $stmt->execute([':setting_key' => MONITORING_SERVICE_BUNDLE_SETTINGS_KEY]);
        $rawValue = $stmt->fetchColumn();
        if ($rawValue === false || $rawValue === null || trim((string)$rawValue) === '') {
            return [];
        }

        $decoded = json_decode((string)$rawValue, true);
        if (!is_array($decoded)) {
            return [];
        }

        $services = is_array($decoded['services'] ?? null) ? $decoded['services'] : [];
        $disabledMap = [];
        foreach ($services as $serviceId => $serviceConfig) {
            $normalizedId = trim((string)$serviceId);
            if ($normalizedId === '' || !is_array($serviceConfig)) {
                continue;
            }
            $disabledMap[$normalizedId] = !empty($serviceConfig['disabled']);
        }

        return $disabledMap;
    }
}

if (!function_exists('monitoring_upsert_service_bundle_disabled_map')) {
    function monitoring_upsert_service_bundle_disabled_map(PDO $conn, array $disabledMap): array
    {
        monitoring_service_bundle_require_settings_table($conn);

        $normalized = ['services' => []];
        foreach ($disabledMap as $serviceId => $disabled) {
            $normalizedId = trim((string)$serviceId);
            if ($normalizedId === '') {
                continue;
            }
            $normalized['services'][$normalizedId] = [
                'disabled' => !empty($disabled),
            ];
        }

        $jsonValue = json_encode($normalized, JSON_UNESCAPED_SLASHES);
        $existingStmt = $conn->prepare(
            'SELECT Settings_ID
             FROM settings
             WHERE setting_key = :setting_key
             ORDER BY Settings_ID DESC
             LIMIT 1'
        );
        $existingStmt->execute([':setting_key' => MONITORING_SERVICE_BUNDLE_SETTINGS_KEY]);
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
                ':setting_key' => MONITORING_SERVICE_BUNDLE_SETTINGS_KEY,
                ':setting_value' => $jsonValue,
            ]);
        }

        return $normalized;
    }
}

if (!function_exists('monitoring_get_service_bundle_settings')) {
    function monitoring_get_service_bundle_settings(PDO $conn): array
    {
        monitoring_service_bundle_require_settings_table($conn);
        monitoring_service_bundle_require_table($conn);

        $disabledMap = monitoring_get_service_bundle_disabled_map($conn);
        $services = [];

        foreach ($disabledMap as $serviceId => $disabled) {
            $services[(string)$serviceId] = [
                'disabled' => !empty($disabled),
                'bundle_steps' => [],
            ];
        }

        $stmt = $conn->query(
            'SELECT Bundle_Tasks_ID, Services_type_Id, Step_Number, Assignee, Step_Text
             FROM bundle_tasks
             ORDER BY Services_type_Id ASC, Step_Number ASC, Bundle_Tasks_ID ASC'
        );
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];

        foreach ($rows as $row) {
            $serviceId = trim((string)($row['Services_type_Id'] ?? ''));
            if ($serviceId === '') {
                continue;
            }

            if (!isset($services[$serviceId])) {
                $services[$serviceId] = [
                    'disabled' => false,
                    'bundle_steps' => [],
                ];
            }

            $step = monitoring_normalize_service_bundle_step([
                'assignee' => $row['Assignee'] ?? 'accountant',
                'text' => $row['Step_Text'] ?? '',
            ]);
            if ($step !== null) {
                $services[$serviceId]['bundle_steps'][] = $step;
            }
        }

        return ['services' => $services];
    }
}

if (!function_exists('monitoring_set_single_service_bundle_config')) {
    function monitoring_set_single_service_bundle_config(PDO $conn, int $serviceId, array $config): array
    {
        $serviceKey = trim((string)$serviceId);
        if ($serviceId <= 0 || $serviceKey === '') {
            throw new InvalidArgumentException('Invalid service id.');
        }

        monitoring_service_bundle_require_settings_table($conn);
        monitoring_service_bundle_require_table($conn);

        $bundleSteps = monitoring_normalize_service_bundle_steps($config['bundle_steps'] ?? []);
        $disabledMap = monitoring_get_service_bundle_disabled_map($conn);
        $disabledMap[$serviceKey] = !empty($config['disabled']);
        monitoring_upsert_service_bundle_disabled_map($conn, $disabledMap);

        $deleteStmt = $conn->prepare('DELETE FROM bundle_tasks WHERE Services_type_Id = :service_id');
        $deleteStmt->execute([':service_id' => $serviceId]);

        if (!empty($bundleSteps)) {
            $insertStmt = $conn->prepare(
                'INSERT INTO bundle_tasks (Services_type_Id, Step_Number, Assignee, Step_Text)
                 VALUES (:service_id, :step_number, :assignee, :step_text)'
            );

            foreach (array_values($bundleSteps) as $index => $step) {
                $insertStmt->execute([
                    ':service_id' => $serviceId,
                    ':step_number' => $index + 1,
                    ':assignee' => $step['assignee'],
                    ':step_text' => $step['text'],
                ]);
            }
        }

        return [
            'services' => [
                $serviceKey => [
                    'disabled' => !empty($disabledMap[$serviceKey]),
                    'bundle_steps' => $bundleSteps,
                ],
            ],
        ];
    }
}
