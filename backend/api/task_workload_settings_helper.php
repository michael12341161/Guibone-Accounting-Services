<?php

const MONITORING_TASK_WORKLOAD_SETTINGS_KEY = 'task_workload_settings';
const MONITORING_TASK_WORKLOAD_DEFAULT_LIMIT = 5;
const MONITORING_TASK_WORKLOAD_MIN_LIMIT = 1;
const MONITORING_TASK_WORKLOAD_MAX_LIMIT = 999;

if (!function_exists('monitoring_task_workload_ensure_settings_table')) {
    function monitoring_task_workload_ensure_settings_table(PDO $conn): void
    {
        monitoring_require_schema_columns(
            $conn,
            'settings',
            ['Settings_ID', 'setting_key', 'setting_value'],
            'task workload settings'
        );
    }
}

if (!function_exists('monitoring_normalize_task_workload_limit')) {
    function monitoring_normalize_task_workload_limit($value, int $fallback = MONITORING_TASK_WORKLOAD_DEFAULT_LIMIT): int
    {
        $normalizedFallback = $fallback;
        if ($normalizedFallback < MONITORING_TASK_WORKLOAD_MIN_LIMIT || $normalizedFallback > MONITORING_TASK_WORKLOAD_MAX_LIMIT) {
            $normalizedFallback = MONITORING_TASK_WORKLOAD_DEFAULT_LIMIT;
        }

        if (is_int($value) || is_float($value)) {
            $normalized = (int)$value;
            if ($normalized >= MONITORING_TASK_WORKLOAD_MIN_LIMIT && $normalized <= MONITORING_TASK_WORKLOAD_MAX_LIMIT) {
                return $normalized;
            }
            return $normalizedFallback;
        }

        $raw = trim((string)($value ?? ''));
        if (!preg_match('/^\d+$/', $raw)) {
            return $normalizedFallback;
        }

        $normalized = (int)$raw;
        if ($normalized < MONITORING_TASK_WORKLOAD_MIN_LIMIT || $normalized > MONITORING_TASK_WORKLOAD_MAX_LIMIT) {
            return $normalizedFallback;
        }

        return $normalized;
    }
}

if (!function_exists('monitoring_get_task_workload_settings')) {
    function monitoring_get_task_workload_settings(PDO $conn): array
    {
        monitoring_task_workload_ensure_settings_table($conn);

        $stmt = $conn->prepare(
            'SELECT setting_value
             FROM settings
             WHERE setting_key = :setting_key
             LIMIT 1'
        );
        $stmt->execute([':setting_key' => MONITORING_TASK_WORKLOAD_SETTINGS_KEY]);
        $rawValue = $stmt->fetchColumn();

        if ($rawValue === false || $rawValue === null || trim((string)$rawValue) === '') {
            return [
                'limit' => MONITORING_TASK_WORKLOAD_DEFAULT_LIMIT,
            ];
        }

        $decoded = json_decode((string)$rawValue, true);
        if (!is_array($decoded)) {
            $decoded = ['limit' => $rawValue];
        }

        return [
            'limit' => monitoring_normalize_task_workload_limit(
                $decoded['limit'] ?? null,
                MONITORING_TASK_WORKLOAD_DEFAULT_LIMIT
            ),
        ];
    }
}

if (!function_exists('monitoring_upsert_task_workload_settings')) {
    function monitoring_upsert_task_workload_settings(PDO $conn, array $settings): array
    {
        monitoring_task_workload_ensure_settings_table($conn);

        $normalized = [
            'limit' => monitoring_normalize_task_workload_limit(
                $settings['limit'] ?? null,
                MONITORING_TASK_WORKLOAD_DEFAULT_LIMIT
            ),
        ];

        $statement = $conn->prepare(
            'INSERT INTO settings (setting_key, setting_value)
             VALUES (:setting_key, :setting_value)
             ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)'
        );
        $statement->execute([
            ':setting_key' => MONITORING_TASK_WORKLOAD_SETTINGS_KEY,
            ':setting_value' => json_encode($normalized, JSON_UNESCAPED_SLASHES),
        ]);

        return $normalized;
    }
}
