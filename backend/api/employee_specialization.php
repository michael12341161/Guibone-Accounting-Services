<?php

if (!function_exists('monitoring_quote_identifier')) {
    function monitoring_quote_identifier(string $name): string {
        return '`' . str_replace('`', '``', $name) . '`';
    }
}

if (!function_exists('monitoring_table_exists')) {
    function monitoring_table_exists(PDO $conn, string $tableName): bool {
        try {
            $stmt = $conn->prepare('SHOW TABLES LIKE :table_name');
            $stmt->execute([':table_name' => $tableName]);
            return (bool)$stmt->fetchColumn();
        } catch (Throwable $__) {
            return false;
        }
    }
}

if (!function_exists('monitoring_column_exists')) {
    function monitoring_column_exists(PDO $conn, string $tableName, string $columnName): bool {
        try {
            $sql = 'SHOW COLUMNS FROM ' . monitoring_quote_identifier($tableName) . ' LIKE :column_name';
            $stmt = $conn->prepare($sql);
            $stmt->execute([':column_name' => $columnName]);
            return (bool)$stmt->fetch(PDO::FETCH_ASSOC);
        } catch (Throwable $__) {
            return false;
        }
    }
}

if (!function_exists('monitoring_security_setting_definitions')) {
    function monitoring_security_setting_definitions(): array {
        return [
            'maxPasswordLength' => [
                'db_key' => 'max_password_length',
                'default' => 64,
                'validator' => static function (int $value): ?string {
                    return ($value >= 6 && $value <= 256)
                        ? null
                        : 'Maximum Password Length must be between 6 and 256.';
                },
            ],
            'passwordExpiryDays' => [
                'db_key' => 'password_expiry_days',
                'default' => 90,
                'validator' => static function (int $value): ?string {
                    return $value >= 0
                        ? null
                        : 'Password Expiry must be 0 or greater.';
                },
            ],
            'sessionTimeoutMinutes' => [
                'db_key' => 'session_timeout_minutes',
                'default' => 30,
                'validator' => static function (int $value): ?string {
                    return $value > 0
                        ? null
                        : 'Session Timeout must be greater than 0.';
                },
            ],
            'lockoutAttempts' => [
                'db_key' => 'lockout_attempts',
                'default' => 5,
                'validator' => static function (int $value): ?string {
                    return $value > 0
                        ? null
                        : 'Lockout After Failed Attempts must be greater than 0.';
                },
            ],
            'lockoutDurationMinutes' => [
                'db_key' => 'lockout_duration_minutes',
                'default' => 15,
                'validator' => static function (int $value): ?string {
                    return $value > 0
                        ? null
                        : 'Lockout Duration must be greater than 0.';
                },
            ],
        ];
    }
}

if (!function_exists('monitoring_default_security_settings')) {
    function monitoring_default_security_settings(): array {
        $defaults = [];
        foreach (monitoring_security_setting_definitions() as $frontendKey => $definition) {
            $defaults[$frontendKey] = (int)$definition['default'];
        }
        return $defaults;
    }
}

if (!function_exists('monitoring_password_min_length')) {
    function monitoring_password_min_length(): int {
        return 6;
    }
}

if (!function_exists('monitoring_password_complexity_errors')) {
    function monitoring_password_complexity_errors(string $password): array {
        $errors = [];

        if (!preg_match('/[A-Z]/', $password)) {
            $errors[] = 'At least one uppercase letter';
        }

        if (!preg_match('/[a-z]/', $password)) {
            $errors[] = 'At least one lowercase letter';
        }

        if (!preg_match('/\d/', $password)) {
            $errors[] = 'At least one number';
        }

        if (!preg_match('/[^A-Za-z0-9\s]/', $password)) {
            $errors[] = 'At least one special character';
        }

        return $errors;
    }
}

if (!function_exists('monitoring_format_password_complexity_message')) {
    function monitoring_format_password_complexity_message(array $errors): string {
        if (empty($errors)) {
            return '';
        }

        return "Password must contain:\n" . implode("\n", $errors);
    }
}

if (!function_exists('monitoring_validate_password_value')) {
    function monitoring_validate_password_value(string $password, int $maxPasswordLength): ?string {
        $minPasswordLength = monitoring_password_min_length();

        if (strlen($password) < $minPasswordLength) {
            return 'Password must be at least ' . $minPasswordLength . ' characters.';
        }

        if ($maxPasswordLength > 0 && strlen($password) > $maxPasswordLength) {
            return 'Password must not exceed ' . $maxPasswordLength . ' characters.';
        }

        $complexityErrors = monitoring_password_complexity_errors($password);
        if (!empty($complexityErrors)) {
            return monitoring_format_password_complexity_message($complexityErrors);
        }

        return null;
    }
}

if (!function_exists('monitoring_parse_int_setting')) {
    function monitoring_parse_int_setting($value): ?int {
        if (is_int($value)) {
            return $value;
        }
        if (is_float($value) && floor($value) === $value) {
            return (int)$value;
        }

        $normalized = trim((string)($value ?? ''));
        if ($normalized === '' || !preg_match('/^-?\d+$/', $normalized)) {
            return null;
        }

        return (int)$normalized;
    }
}

if (!function_exists('monitoring_validate_security_settings')) {
    function monitoring_validate_security_settings(array $payload): array {
        $definitions = monitoring_security_setting_definitions();
        $settings = monitoring_default_security_settings();
        $errors = [];

        foreach ($definitions as $frontendKey => $definition) {
            $dbKey = $definition['db_key'];
            $candidate = array_key_exists($frontendKey, $payload)
                ? $payload[$frontendKey]
                : ($payload[$dbKey] ?? $definition['default']);
            $value = monitoring_parse_int_setting($candidate);

            if ($value === null) {
                $errors[$frontendKey] = 'A whole number is required.';
                continue;
            }

            $validator = $definition['validator'];
            $message = $validator($value);
            if ($message !== null) {
                $errors[$frontendKey] = $message;
                continue;
            }

            $settings[$frontendKey] = $value;
        }

        return [
            'settings' => $settings,
            'errors' => $errors,
        ];
    }
}

if (!function_exists('monitoring_ensure_settings_table')) {
    function monitoring_ensure_settings_table(PDO $conn): void {
        $conn->exec(
            'CREATE TABLE IF NOT EXISTS settings (
                Settings_ID INT PRIMARY KEY AUTO_INCREMENT,
                setting_key VARCHAR(100) UNIQUE,
                setting_value TEXT
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci'
        );
    }
}

if (!function_exists('monitoring_ensure_user_security_columns')) {
    function monitoring_ensure_user_security_columns(PDO $conn): void {
        if (!monitoring_column_exists($conn, 'user', 'Password_changed_at')) {
            $conn->exec(
                'ALTER TABLE user
                 ADD COLUMN Password_changed_at DATETIME NULL DEFAULT CURRENT_TIMESTAMP
                 AFTER Password'
            );
        }

        if (!monitoring_column_exists($conn, 'user', 'Failed_login_attempts')) {
            $conn->exec(
                'ALTER TABLE user
                 ADD COLUMN Failed_login_attempts INT NOT NULL DEFAULT 0
                 AFTER Password_changed_at'
            );
        }

        if (!monitoring_column_exists($conn, 'user', 'Locked_until')) {
            $conn->exec(
                'ALTER TABLE user
                 ADD COLUMN Locked_until DATETIME NULL DEFAULT NULL
                 AFTER Failed_login_attempts'
            );
        }

        try {
            $conn->exec(
                'UPDATE user
                 SET Password_changed_at = COALESCE(Password_changed_at, Created_at, NOW())
                 WHERE Password_changed_at IS NULL'
            );
        } catch (Throwable $__) {
        }
    }
}

if (!function_exists('monitoring_upsert_security_settings')) {
    function monitoring_upsert_security_settings(PDO $conn, array $settings): array {
        monitoring_ensure_settings_table($conn);

        $validated = monitoring_validate_security_settings($settings);
        if (!empty($validated['errors'])) {
            return $validated;
        }

        $definitions = monitoring_security_setting_definitions();
        $statement = $conn->prepare(
            'INSERT INTO settings (setting_key, setting_value)
             VALUES (:setting_key, :setting_value)
             ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)'
        );

        foreach ($validated['settings'] as $frontendKey => $value) {
            if (!isset($definitions[$frontendKey])) {
                continue;
            }

            $statement->execute([
                ':setting_key' => $definitions[$frontendKey]['db_key'],
                ':setting_value' => (string)$value,
            ]);
        }

        return $validated;
    }
}

if (!function_exists('monitoring_get_security_settings')) {
    function monitoring_get_security_settings(PDO $conn): array {
        monitoring_ensure_settings_table($conn);
        monitoring_ensure_user_security_columns($conn);

        $definitions = monitoring_security_setting_definitions();
        $defaults = monitoring_default_security_settings();
        $settings = $defaults;
        $dbKeys = array_map(static function (array $definition): string {
            return $definition['db_key'];
        }, array_values($definitions));

        if (!empty($dbKeys)) {
            $placeholders = implode(',', array_fill(0, count($dbKeys), '?'));
            $stmt = $conn->prepare(
                "SELECT setting_key, setting_value
                 FROM settings
                 WHERE setting_key IN ({$placeholders})"
            );

            foreach ($dbKeys as $index => $dbKey) {
                $stmt->bindValue($index + 1, $dbKey, PDO::PARAM_STR);
            }

            $stmt->execute();
            $rows = $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];

            foreach ($definitions as $frontendKey => $definition) {
                foreach ($rows as $row) {
                    if (($row['setting_key'] ?? '') !== $definition['db_key']) {
                        continue;
                    }

                    $value = monitoring_parse_int_setting($row['setting_value'] ?? null);
                    if ($value === null) {
                        continue;
                    }

                    $validator = $definition['validator'];
                    if ($validator($value) === null) {
                        $settings[$frontendKey] = $value;
                    }
                    break;
                }
            }
        }

        monitoring_upsert_security_settings($conn, $settings);
        return $settings;
    }
}

if (!function_exists('monitoring_parse_bool_setting')) {
    function monitoring_parse_bool_setting($value): ?bool {
        if (is_bool($value)) {
            return $value;
        }

        if (is_int($value) || (is_float($value) && floor($value) === $value)) {
            if ((int)$value === 1) {
                return true;
            }
            if ((int)$value === 0) {
                return false;
            }
        }

        $normalized = strtolower(trim((string)($value ?? '')));
        if ($normalized === '') {
            return null;
        }

        if (in_array($normalized, ['1', 'true', 'yes', 'on'], true)) {
            return true;
        }

        if (in_array($normalized, ['0', 'false', 'no', 'off'], true)) {
            return false;
        }

        return null;
    }
}

if (!function_exists('monitoring_setting_length')) {
    function monitoring_setting_length(string $value): int {
        if (function_exists('mb_strlen')) {
            return (int)mb_strlen($value);
        }

        return strlen($value);
    }
}

if (!function_exists('monitoring_load_local_api_config')) {
    function monitoring_load_local_api_config(): array {
        static $config = null;
        if ($config !== null) {
            return $config;
        }

        $config = [];
        $configPath = __DIR__ . '/smtp_config.php';
        if (file_exists($configPath)) {
            $loaded = require $configPath;
            if (is_array($loaded)) {
                $config = $loaded;
            }
        }

        return $config;
    }
}

if (!function_exists('monitoring_read_api_config_value')) {
    function monitoring_read_api_config_value(string $key, $default = null) {
        $envValue = getenv($key);
        if ($envValue !== false && $envValue !== null && $envValue !== '') {
            return $envValue;
        }

        if (isset($_SERVER[$key]) && $_SERVER[$key] !== '') {
            return $_SERVER[$key];
        }

        $localConfig = monitoring_load_local_api_config();
        if (array_key_exists($key, $localConfig) && $localConfig[$key] !== '') {
            return $localConfig[$key];
        }

        return $default;
    }
}

if (!function_exists('monitoring_parse_host_and_port')) {
    function monitoring_parse_host_and_port(string $value): array {
        $normalized = trim($value);
        if ($normalized === '') {
            return ['host' => '', 'port' => null];
        }

        $parts = parse_url(strpos($normalized, '://') !== false ? $normalized : 'http://' . $normalized);
        return [
            'host' => strtolower((string)($parts['host'] ?? '')),
            'port' => isset($parts['port']) ? (int)$parts['port'] : null,
        ];
    }
}

if (!function_exists('monitoring_application_base_path')) {
    function monitoring_application_base_path(): string {
        $scriptName = str_replace('\\', '/', (string)($_SERVER['SCRIPT_NAME'] ?? ''));
        if ($scriptName === '') {
            return '';
        }

        $marker = '/backend/api/';
        $position = stripos($scriptName, $marker);
        if ($position === false) {
            return '';
        }

        return rtrim(substr($scriptName, 0, $position), '/');
    }
}

if (!function_exists('monitoring_default_frontend_base_url')) {
    function monitoring_default_frontend_base_url(): string {
        $configuredBaseUrl = trim((string)monitoring_read_api_config_value(
            'APP_BASE_URL',
            monitoring_read_api_config_value('FRONTEND_URL', '')
        ));
        if ($configuredBaseUrl !== '' && filter_var($configuredBaseUrl, FILTER_VALIDATE_URL)) {
            return rtrim($configuredBaseUrl, '/');
        }

        $origin = trim((string)($_SERVER['HTTP_ORIGIN'] ?? ''));
        $basePath = monitoring_application_base_path();
        if ($origin !== '' && filter_var($origin, FILTER_VALIDATE_URL)) {
            $originParts = monitoring_parse_host_and_port($origin);
            $serverParts = monitoring_parse_host_and_port((string)($_SERVER['HTTP_HOST'] ?? ''));
            if (
                $originParts['host'] !== ''
                && $originParts['host'] === $serverParts['host']
                && $originParts['port'] === $serverParts['port']
            ) {
                return rtrim($origin, '/') . $basePath;
            }

            return rtrim($origin, '/');
        }

        $host = trim((string)($_SERVER['HTTP_HOST'] ?? 'localhost'));
        $scheme = (!empty($_SERVER['HTTPS']) && strtolower((string)$_SERVER['HTTPS']) !== 'off') ? 'https' : 'http';
        return $scheme . '://' . $host . $basePath;
    }
}

if (!function_exists('monitoring_system_configuration_definitions')) {
    function monitoring_system_configuration_definitions(): array {
        return [
            'companyName' => [
                'db_key' => 'system_company_name',
                'type' => 'string',
            ],
            'appBaseUrl' => [
                'db_key' => 'app_base_url',
                'type' => 'string',
            ],
            'sendClientStatusEmails' => [
                'db_key' => 'send_client_status_emails',
                'type' => 'bool',
            ],
            'smtpHost' => [
                'db_key' => 'smtp_host',
                'type' => 'string',
            ],
            'smtpPort' => [
                'db_key' => 'smtp_port',
                'type' => 'int',
            ],
            'smtpUsername' => [
                'db_key' => 'smtp_username',
                'type' => 'string',
            ],
            'smtpPassword' => [
                'db_key' => 'smtp_password',
                'type' => 'string',
            ],
        ];
    }
}

if (!function_exists('monitoring_default_system_configuration')) {
    function monitoring_default_system_configuration(): array {
        $smtpUsername = trim((string)monitoring_read_api_config_value('SMTP_USER', ''));
        $smtpPassword = trim((string)monitoring_read_api_config_value('SMTP_PASS', ''));
        $smtpHost = trim((string)monitoring_read_api_config_value('SMTP_HOST', 'smtp.gmail.com'));
        $smtpPort = monitoring_parse_int_setting(monitoring_read_api_config_value('SMTP_PORT', 587));
        $companyName = trim((string)monitoring_read_api_config_value(
            'APP_COMPANY_NAME',
            monitoring_read_api_config_value('COMPANY_NAME', 'Guibone Accounting Services (GAS)')
        ));

        return [
            'companyName' => $companyName !== '' ? $companyName : 'Guibone Accounting Services (GAS)',
            'appBaseUrl' => monitoring_default_frontend_base_url(),
            'sendClientStatusEmails' => ($smtpUsername !== '' && $smtpPassword !== ''),
            'smtpHost' => $smtpHost !== '' ? $smtpHost : 'smtp.gmail.com',
            'smtpPort' => ($smtpPort !== null && $smtpPort > 0) ? $smtpPort : 587,
            'smtpUsername' => $smtpUsername,
            'smtpPassword' => $smtpPassword,
        ];
    }
}

if (!function_exists('monitoring_validate_system_configuration')) {
    function monitoring_validate_system_configuration(array $payload): array {
        $definitions = monitoring_system_configuration_definitions();
        $settings = monitoring_default_system_configuration();
        $errors = [];

        foreach ($definitions as $frontendKey => $definition) {
            $dbKey = $definition['db_key'];
            $candidate = array_key_exists($frontendKey, $payload)
                ? $payload[$frontendKey]
                : ($payload[$dbKey] ?? $settings[$frontendKey]);

            if ($definition['type'] === 'int') {
                $value = monitoring_parse_int_setting($candidate);
                if ($value === null) {
                    $errors[$frontendKey] = 'A whole number is required.';
                    continue;
                }

                $settings[$frontendKey] = $value;
                continue;
            }

            if ($definition['type'] === 'bool') {
                $value = monitoring_parse_bool_setting($candidate);
                if ($value === null) {
                    $errors[$frontendKey] = 'Choose Enabled or Disabled.';
                    continue;
                }

                $settings[$frontendKey] = $value;
                continue;
            }

            $settings[$frontendKey] = trim((string)($candidate ?? ''));
        }

        if ($settings['companyName'] === '') {
            $errors['companyName'] = 'Company name is required.';
        } elseif (monitoring_setting_length($settings['companyName']) > 150) {
            $errors['companyName'] = 'Company name must be 150 characters or fewer.';
        }

        if ($settings['appBaseUrl'] !== '' && !filter_var($settings['appBaseUrl'], FILTER_VALIDATE_URL)) {
            $errors['appBaseUrl'] = 'Frontend URL must be a valid URL.';
        } elseif (monitoring_setting_length($settings['appBaseUrl']) > 255) {
            $errors['appBaseUrl'] = 'Frontend URL must be 255 characters or fewer.';
        }

        if ($settings['smtpHost'] === '') {
            $errors['smtpHost'] = 'SMTP host is required.';
        } elseif (preg_match('/\s/', $settings['smtpHost'])) {
            $errors['smtpHost'] = 'SMTP host cannot contain spaces.';
        } elseif (monitoring_setting_length($settings['smtpHost']) > 255) {
            $errors['smtpHost'] = 'SMTP host must be 255 characters or fewer.';
        }

        if ($settings['smtpPort'] <= 0 || $settings['smtpPort'] > 65535) {
            $errors['smtpPort'] = 'SMTP port must be between 1 and 65535.';
        }

        if (monitoring_setting_length($settings['smtpUsername']) > 255) {
            $errors['smtpUsername'] = 'SMTP username must be 255 characters or fewer.';
        }

        if (monitoring_setting_length($settings['smtpPassword']) > 255) {
            $errors['smtpPassword'] = 'SMTP password must be 255 characters or fewer.';
        }

        if ($settings['sendClientStatusEmails']) {
            if ($settings['smtpUsername'] === '') {
                $errors['smtpUsername'] = 'SMTP username is required when client status emails are enabled.';
            }
            if ($settings['smtpPassword'] === '') {
                $errors['smtpPassword'] = 'SMTP password is required when client status emails are enabled.';
            }
        }

        return [
            'settings' => $settings,
            'errors' => $errors,
        ];
    }
}

if (!function_exists('monitoring_upsert_system_configuration')) {
    function monitoring_upsert_system_configuration(PDO $conn, array $settings): array {
        monitoring_ensure_settings_table($conn);

        $validated = monitoring_validate_system_configuration($settings);
        if (!empty($validated['errors'])) {
            return $validated;
        }

        $definitions = monitoring_system_configuration_definitions();
        $statement = $conn->prepare(
            'INSERT INTO settings (setting_key, setting_value)
             VALUES (:setting_key, :setting_value)
             ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)'
        );

        foreach ($validated['settings'] as $frontendKey => $value) {
            if (!isset($definitions[$frontendKey])) {
                continue;
            }

            $storedValue = is_bool($value) ? ($value ? '1' : '0') : (string)$value;
            $statement->execute([
                ':setting_key' => $definitions[$frontendKey]['db_key'],
                ':setting_value' => $storedValue,
            ]);
        }

        return $validated;
    }
}

if (!function_exists('monitoring_get_system_configuration')) {
    function monitoring_get_system_configuration(PDO $conn): array {
        monitoring_ensure_settings_table($conn);

        $definitions = monitoring_system_configuration_definitions();
        $settings = monitoring_default_system_configuration();
        $dbKeys = array_map(static function (array $definition): string {
            return $definition['db_key'];
        }, array_values($definitions));

        if (!empty($dbKeys)) {
            $placeholders = implode(',', array_fill(0, count($dbKeys), '?'));
            $stmt = $conn->prepare(
                "SELECT setting_key, setting_value
                 FROM settings
                 WHERE setting_key IN ({$placeholders})"
            );

            foreach ($dbKeys as $index => $dbKey) {
                $stmt->bindValue($index + 1, $dbKey, PDO::PARAM_STR);
            }

            $stmt->execute();
            $rows = $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];
            $rowsByKey = [];
            foreach ($rows as $row) {
                $rowsByKey[(string)($row['setting_key'] ?? '')] = $row['setting_value'] ?? null;
            }

            foreach ($definitions as $frontendKey => $definition) {
                if (!array_key_exists($definition['db_key'], $rowsByKey)) {
                    continue;
                }

                $rawValue = $rowsByKey[$definition['db_key']];
                if ($definition['type'] === 'int') {
                    $parsed = monitoring_parse_int_setting($rawValue);
                    if ($parsed !== null && $parsed > 0) {
                        $settings[$frontendKey] = $parsed;
                    }
                    continue;
                }

                if ($definition['type'] === 'bool') {
                    $parsed = monitoring_parse_bool_setting($rawValue);
                    if ($parsed !== null) {
                        $settings[$frontendKey] = $parsed;
                    }
                    continue;
                }

                $settings[$frontendKey] = trim((string)($rawValue ?? ''));
            }
        }

        $result = monitoring_upsert_system_configuration($conn, $settings);
        return is_array($result['settings'] ?? null) ? $result['settings'] : $settings;
    }
}

if (!function_exists('monitoring_get_system_smtp_settings')) {
    function monitoring_get_system_smtp_settings(PDO $conn): array {
        $settings = monitoring_get_system_configuration($conn);

        return [
            'user' => trim((string)($settings['smtpUsername'] ?? '')),
            'pass' => trim((string)($settings['smtpPassword'] ?? '')),
            'host' => trim((string)($settings['smtpHost'] ?? 'smtp.gmail.com')),
            'port' => (int)($settings['smtpPort'] ?? 587),
        ];
    }
}

if (!function_exists('monitoring_get_system_company_name')) {
    function monitoring_get_system_company_name(PDO $conn): string {
        $settings = monitoring_get_system_configuration($conn);
        $companyName = trim((string)($settings['companyName'] ?? ''));
        return $companyName !== '' ? $companyName : 'Guibone Accounting Services (GAS)';
    }
}

if (!function_exists('monitoring_send_client_status_emails_enabled')) {
    function monitoring_send_client_status_emails_enabled(PDO $conn): bool {
        $settings = monitoring_get_system_configuration($conn);
        return !empty($settings['sendClientStatusEmails']);
    }
}

if (!function_exists('monitoring_resolve_frontend_base_url')) {
    function monitoring_resolve_frontend_base_url(PDO $conn): string {
        $settings = monitoring_get_system_configuration($conn);
        $configuredBaseUrl = trim((string)($settings['appBaseUrl'] ?? ''));
        if ($configuredBaseUrl !== '' && filter_var($configuredBaseUrl, FILTER_VALIDATE_URL)) {
            return rtrim($configuredBaseUrl, '/');
        }

        return monitoring_default_frontend_base_url();
    }
}

if (!function_exists('monitoring_build_login_url')) {
    function monitoring_build_login_url(PDO $conn): string {
        return rtrim(monitoring_resolve_frontend_base_url($conn), '/') . '/login';
    }
}

function employeeSpecializationTableExists(PDO $conn, string $tableName): bool {
    $stmt = $conn->prepare(
        'SELECT 1
         FROM information_schema.TABLES
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = :table_name
         LIMIT 1'
    );
    $stmt->execute([':table_name' => $tableName]);
    return $stmt->fetchColumn() !== false;
}

function employeeSpecializationColumnExists(PDO $conn, string $tableName, string $columnName): bool {
    $stmt = $conn->prepare(
        'SELECT 1
         FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = :table_name
           AND COLUMN_NAME = :column_name
         LIMIT 1'
    );
    $stmt->execute([
        ':table_name' => $tableName,
        ':column_name' => $columnName,
    ]);
    return $stmt->fetchColumn() !== false;
}

function employeeSpecializationIndexExists(PDO $conn, string $tableName, string $columnName): bool {
    $stmt = $conn->prepare(
        'SELECT 1
         FROM information_schema.STATISTICS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = :table_name
           AND COLUMN_NAME = :column_name
         LIMIT 1'
    );
    $stmt->execute([
        ':table_name' => $tableName,
        ':column_name' => $columnName,
    ]);
    return $stmt->fetchColumn() !== false;
}

function employeeSpecializationForeignKeyExists(PDO $conn, string $tableName, string $columnName, string $referencedTable): bool {
    $stmt = $conn->prepare(
        'SELECT 1
         FROM information_schema.KEY_COLUMN_USAGE
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = :table_name
           AND COLUMN_NAME = :column_name
           AND REFERENCED_TABLE_NAME = :referenced_table
         LIMIT 1'
    );
    $stmt->execute([
        ':table_name' => $tableName,
        ':column_name' => $columnName,
        ':referenced_table' => $referencedTable,
    ]);
    return $stmt->fetchColumn() !== false;
}

function employeeSpecializationPayloadProvided(array $employeeDetails): bool {
    return array_key_exists('specialization_type_id', $employeeDetails)
        || array_key_exists('specialization_type_ID', $employeeDetails);
}

function employeeSpecializationNormalizeId($value): ?int {
    if ($value === null) {
        return null;
    }

    $raw = trim((string)$value);
    if ($raw === '' || !ctype_digit($raw)) {
        return null;
    }

    $id = (int)$raw;
    return $id > 0 ? $id : null;
}

function employeeSpecializationPayloadId(array $employeeDetails): ?int {
    if (array_key_exists('specialization_type_id', $employeeDetails)) {
        return employeeSpecializationNormalizeId($employeeDetails['specialization_type_id']);
    }
    if (array_key_exists('specialization_type_ID', $employeeDetails)) {
        return employeeSpecializationNormalizeId($employeeDetails['specialization_type_ID']);
    }
    return null;
}

function ensureEmployeeSpecializationSchema(PDO $conn): void {
    $conn->exec(
        'CREATE TABLE IF NOT EXISTS specialization_type (
            specialization_type_ID INT(11) NOT NULL AUTO_INCREMENT,
            Name VARCHAR(150) NOT NULL,
            PRIMARY KEY (specialization_type_ID)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci'
    );

    $conn->exec(
        "INSERT INTO specialization_type (specialization_type_ID, Name)
         VALUES
            (1, 'Tax Filing'),
            (2, 'Auditing'),
            (3, 'Book Keeping'),
            (4, 'Accounting Operations')
         ON DUPLICATE KEY UPDATE Name = Name"
    );

    if (!employeeSpecializationTableExists($conn, 'user')) {
        return;
    }

    if (!employeeSpecializationColumnExists($conn, 'user', 'specialization_type_ID')) {
        return;
    }

    if (!employeeSpecializationIndexExists($conn, 'user', 'specialization_type_ID')) {
        $conn->exec(
            'ALTER TABLE user
             ADD INDEX specialization_type_ID (specialization_type_ID)'
        );
    }

    if (!employeeSpecializationForeignKeyExists($conn, 'user', 'specialization_type_ID', 'specialization_type')) {
        $conn->exec(
            'ALTER TABLE user
             ADD CONSTRAINT fk_user_specialization_type
             FOREIGN KEY (specialization_type_ID)
             REFERENCES specialization_type(specialization_type_ID)
             ON DELETE SET NULL
             ON UPDATE CASCADE'
        );
    }
}

function loadSpecializationTypes(PDO $conn): array {
    ensureEmployeeSpecializationSchema($conn);

    $stmt = $conn->query(
        'SELECT specialization_type_ID AS id, Name AS name
         FROM specialization_type
         WHERE Name IS NOT NULL AND TRIM(Name) <> \'\'
         ORDER BY specialization_type_ID ASC'
    );
    $rows = $stmt ? ($stmt->fetchAll(PDO::FETCH_ASSOC) ?: []) : [];

    if (!empty($rows)) {
        return $rows;
    }

    return [
        ['id' => 1, 'name' => 'Tax Filing'],
        ['id' => 2, 'name' => 'Auditing'],
        ['id' => 3, 'name' => 'Book Keeping'],
        ['id' => 4, 'name' => 'Accounting Operations'],
    ];
}

function findSpecializationTypeById(PDO $conn, $value): ?array {
    $id = employeeSpecializationNormalizeId($value);
    if ($id === null) {
        return null;
    }

    ensureEmployeeSpecializationSchema($conn);

    $stmt = $conn->prepare(
        'SELECT specialization_type_ID AS id, Name AS name
         FROM specialization_type
         WHERE specialization_type_ID = :id
         LIMIT 1'
    );
    $stmt->execute([':id' => $id]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    return $row ?: null;
}
