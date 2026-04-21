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
                'type' => 'int',
                'validator' => static function (int $value): ?string {
                    return ($value >= 6 && $value <= 256)
                        ? null
                        : 'Maximum Password Length must be between 6 and 256.';
                },
            ],
            'passwordExpiryDays' => [
                'db_key' => 'password_expiry_days',
                'default' => 90,
                'type' => 'int',
                'validator' => static function (int $value): ?string {
                    return $value >= 0
                        ? null
                        : 'Password Expiry must be 0 or greater.';
                },
            ],
            'sessionTimeoutMinutes' => [
                'db_key' => 'session_timeout_minutes',
                'default' => 30,
                'type' => 'int',
                'validator' => static function (int $value): ?string {
                    return $value > 0
                        ? null
                        : 'Session Timeout must be greater than 0.';
                },
            ],
            'lockoutAttempts' => [
                'db_key' => 'lockout_attempts',
                'default' => 5,
                'type' => 'int',
                'validator' => static function (int $value): ?string {
                    return $value > 0
                        ? null
                        : 'Lockout After Failed Attempts must be greater than 0.';
                },
            ],
            'lockoutDurationMinutes' => [
                'db_key' => 'lockout_duration_minutes',
                'default' => 15,
                'type' => 'int',
                'validator' => static function (int $value): ?string {
                    return $value > 0
                        ? null
                        : 'Lockout Duration must be greater than 0.';
                },
            ],
            'loginVerificationEnabled' => [
                'db_key' => 'login_verification_enabled',
                'default' => true,
                'type' => 'bool',
                'validator' => static function (bool $value): ?string {
                    return null;
                },
            ],
        ];
    }
}

if (!function_exists('monitoring_default_security_settings')) {
    function monitoring_default_security_settings(): array {
        $defaults = [];
        foreach (monitoring_security_setting_definitions() as $frontendKey => $definition) {
            $defaults[$frontendKey] = $definition['default'];
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
            $type = strtolower((string)($definition['type'] ?? 'int'));
            $value = $type === 'bool'
                ? monitoring_parse_bool_setting($candidate)
                : monitoring_parse_int_setting($candidate);

            if ($value === null) {
                $errors[$frontendKey] = $type === 'bool'
                    ? 'A valid enabled or disabled value is required.'
                    : 'A whole number is required.';
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
        monitoring_require_schema_columns(
            $conn,
            'settings',
            ['Settings_ID', 'setting_key', 'setting_value'],
            'system settings'
        );
    }
}

if (!function_exists('monitoring_ensure_user_security_columns')) {
    function monitoring_ensure_user_security_columns(PDO $conn): void {
        monitoring_require_schema_columns(
            $conn,
            'user',
            ['Password_changed_at', 'Failed_login_attempts', 'Locked_until'],
            'authentication security'
        );

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
                ':setting_value' => is_bool($value) ? ($value ? '1' : '0') : (string)$value,
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

                    $type = strtolower((string)($definition['type'] ?? 'int'));
                    $value = $type === 'bool'
                        ? monitoring_parse_bool_setting($row['setting_value'] ?? null)
                        : monitoring_parse_int_setting($row['setting_value'] ?? null);
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

        return $settings;
    }
}

if (!function_exists('monitoring_resolve_password_expiry_info')) {
    function monitoring_resolve_password_expiry_info(
        array $securitySettings,
        $passwordChangedAtRaw = null,
        $createdAtRaw = null,
        ?int $nowTimestamp = null
    ): array {
        $result = [
            'password_changed_at' => null,
            'password_expires_at' => null,
            'password_days_until_expiry' => null,
            'password_expired' => false,
        ];

        $effectiveChangedAt = trim((string)($passwordChangedAtRaw ?? ''));
        if ($effectiveChangedAt === '') {
            $effectiveChangedAt = trim((string)($createdAtRaw ?? ''));
        }

        if ($effectiveChangedAt === '') {
            return $result;
        }

        $changedAtTimestamp = strtotime($effectiveChangedAt);
        if ($changedAtTimestamp === false) {
            return $result;
        }

        $result['password_changed_at'] = date('Y-m-d H:i:s', $changedAtTimestamp);

        $passwordExpiryDays = max(0, (int)($securitySettings['passwordExpiryDays'] ?? 0));
        if ($passwordExpiryDays <= 0) {
            return $result;
        }

        $expiresAtTimestamp = strtotime('+' . $passwordExpiryDays . ' days', $changedAtTimestamp);
        if ($expiresAtTimestamp === false) {
            return $result;
        }

        $currentTimestamp = $nowTimestamp ?? time();
        if ($currentTimestamp < $changedAtTimestamp) {
            $currentTimestamp = $changedAtTimestamp;
        }
        $result['password_expires_at'] = date('Y-m-d H:i:s', $expiresAtTimestamp);

        if ($expiresAtTimestamp <= $currentTimestamp) {
            $result['password_days_until_expiry'] = 0;
            $result['password_expired'] = true;
            return $result;
        }

        $remainingSeconds = $expiresAtTimestamp - $currentTimestamp;
        $result['password_days_until_expiry'] = min(
            $passwordExpiryDays,
            (int)ceil($remainingSeconds / 86400)
        );

        return $result;
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
            'allowClientSelfSignup' => [
                'db_key' => 'allow_client_self_signup',
                'type' => 'bool',
            ],
            'allowClientAppointments' => [
                'db_key' => 'allow_client_appointments',
                'type' => 'bool',
            ],
            'allowClientConsultations' => [
                'db_key' => 'allow_client_consultations',
                'type' => 'bool',
            ],
            'supportEmail' => [
                'db_key' => 'support_email',
                'type' => 'string',
            ],
            'systemNotice' => [
                'db_key' => 'system_notice',
                'type' => 'string',
            ],
            'taskReminderIntervalHours' => [
                'db_key' => 'task_reminder_interval_hours',
                'type' => 'int',
            ],
            'taskReminderIntervalMinutes' => [
                'db_key' => 'task_reminder_interval_minutes',
                'type' => 'int',
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
            'allowClientSelfSignup' => true,
            'allowClientAppointments' => true,
            'allowClientConsultations' => true,
            'supportEmail' => '',
            'systemNotice' => '',
            'taskReminderIntervalHours' => 4,
            'taskReminderIntervalMinutes' => 0,
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

        if ($settings['supportEmail'] !== '' && !filter_var($settings['supportEmail'], FILTER_VALIDATE_EMAIL)) {
            $errors['supportEmail'] = 'Support email must be a valid email address.';
        } elseif (monitoring_setting_length($settings['supportEmail']) > 255) {
            $errors['supportEmail'] = 'Support email must be 255 characters or fewer.';
        }

        if (monitoring_setting_length($settings['systemNotice']) > 500) {
            $errors['systemNotice'] = 'System notice must be 500 characters or fewer.';
        }

        if ($settings['taskReminderIntervalHours'] < 0 || $settings['taskReminderIntervalHours'] > 24) {
            $errors['taskReminderIntervalHours'] = 'Task reminder hours must be between 0 and 24.';
        }

        if ($settings['taskReminderIntervalMinutes'] < 0 || $settings['taskReminderIntervalMinutes'] > 59) {
            $errors['taskReminderIntervalMinutes'] = 'Task reminder minutes must be between 0 and 59.';
        }

        $taskReminderIntervalTotalMinutes = ($settings['taskReminderIntervalHours'] * 60) + $settings['taskReminderIntervalMinutes'];
        if ($taskReminderIntervalTotalMinutes < 1) {
            $errors['taskReminderIntervalHours'] = 'Task reminder interval must be at least 1 minute.';
            $errors['taskReminderIntervalMinutes'] = 'Task reminder interval must be at least 1 minute.';
        } elseif ($taskReminderIntervalTotalMinutes > 1440) {
            $errors['taskReminderIntervalHours'] = 'Task reminder interval cannot exceed 24 hours.';
            $errors['taskReminderIntervalMinutes'] = 'Task reminder interval cannot exceed 24 hours.';
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
                    if ($parsed === null) {
                        continue;
                    }

                    if ($frontendKey === 'taskReminderIntervalHours') {
                        if ($parsed >= 0 && $parsed <= 24) {
                            $settings[$frontendKey] = $parsed;
                        }
                        continue;
                    }

                    if ($frontendKey === 'taskReminderIntervalMinutes') {
                        if ($parsed >= 0 && $parsed <= 59) {
                            $settings[$frontendKey] = $parsed;
                        }
                        continue;
                    }

                    if ($parsed > 0) {
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

if (!function_exists('monitoring_get_system_support_email')) {
    function monitoring_get_system_support_email(PDO $conn): string {
        $settings = monitoring_get_system_configuration($conn);
        $supportEmail = trim((string)($settings['supportEmail'] ?? ''));
        return filter_var($supportEmail, FILTER_VALIDATE_EMAIL) ? $supportEmail : '';
    }
}

if (!function_exists('monitoring_get_system_notice')) {
    function monitoring_get_system_notice(PDO $conn): string {
        $settings = monitoring_get_system_configuration($conn);
        return trim((string)($settings['systemNotice'] ?? ''));
    }
}

if (!function_exists('monitoring_append_support_contact_message')) {
    function monitoring_append_support_contact_message(string $message, string $supportEmail): string {
        $baseMessage = trim($message);
        $email = trim($supportEmail);
        if ($email === '') {
            return $baseMessage;
        }

        return $baseMessage . ' Please contact ' . $email . ' for assistance.';
    }
}

if (!function_exists('monitoring_client_self_signup_enabled')) {
    function monitoring_client_self_signup_enabled(PDO $conn): bool {
        $settings = monitoring_get_system_configuration($conn);
        return !array_key_exists('allowClientSelfSignup', $settings) || !empty($settings['allowClientSelfSignup']);
    }
}

if (!function_exists('monitoring_client_appointments_enabled')) {
    function monitoring_client_appointments_enabled(PDO $conn): bool {
        $settings = monitoring_get_system_configuration($conn);
        return !array_key_exists('allowClientAppointments', $settings) || !empty($settings['allowClientAppointments']);
    }
}

if (!function_exists('monitoring_client_consultations_enabled')) {
    function monitoring_client_consultations_enabled(PDO $conn): bool {
        $settings = monitoring_get_system_configuration($conn);
        return !array_key_exists('allowClientConsultations', $settings) || !empty($settings['allowClientConsultations']);
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
        || array_key_exists('specialization_type_ids', $employeeDetails)
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
    if (array_key_exists('specialization_type_ids', $employeeDetails) && is_array($employeeDetails['specialization_type_ids'])) {
        foreach ($employeeDetails['specialization_type_ids'] as $value) {
            $id = employeeSpecializationNormalizeId($value);
            if ($id !== null) {
                return $id;
            }
        }
    }
    if (array_key_exists('specialization_type_id', $employeeDetails)) {
        return employeeSpecializationNormalizeId($employeeDetails['specialization_type_id']);
    }
    if (array_key_exists('specialization_type_ID', $employeeDetails)) {
        return employeeSpecializationNormalizeId($employeeDetails['specialization_type_ID']);
    }
    return null;
}

function employeeSpecializationPayloadIds(array $employeeDetails): array {
    $values = [];

    if (array_key_exists('specialization_type_ids', $employeeDetails) && is_array($employeeDetails['specialization_type_ids'])) {
        $values = $employeeDetails['specialization_type_ids'];
    } else {
        $singleValue = employeeSpecializationPayloadId($employeeDetails);
        if ($singleValue !== null) {
            $values = [$singleValue];
        }
    }

    $ids = [];
    foreach ($values as $value) {
        $id = employeeSpecializationNormalizeId($value);
        if ($id !== null) {
            $ids[] = $id;
        }
    }

    $ids = array_values(array_unique($ids));
    sort($ids);
    return $ids;
}

if (!defined('MONITORING_USER_SPECIALIZATION_ASSIGNMENTS_KEY')) {
    define('MONITORING_USER_SPECIALIZATION_ASSIGNMENTS_KEY', 'user_specialization_assignments');
}

function employeeSpecializationRequireSettingsTable(PDO $conn): void {
    monitoring_require_schema_columns(
        $conn,
        'settings',
        ['Settings_ID', 'setting_key', 'setting_value'],
        'user specialization settings'
    );
}

function employeeSpecializationReadAssignments(PDO $conn): array {
    employeeSpecializationRequireSettingsTable($conn);

    $stmt = $conn->prepare(
        'SELECT setting_value
         FROM settings
         WHERE setting_key = :setting_key
         ORDER BY Settings_ID DESC
         LIMIT 1'
    );
    $stmt->execute([':setting_key' => MONITORING_USER_SPECIALIZATION_ASSIGNMENTS_KEY]);
    $rawValue = $stmt->fetchColumn();
    if ($rawValue === false || $rawValue === null || trim((string)$rawValue) === '') {
        return [];
    }

    $decoded = json_decode((string)$rawValue, true);
    $users = is_array($decoded['users'] ?? null) ? $decoded['users'] : [];
    $normalized = [];
    foreach ($users as $userId => $specializationIds) {
        $normalizedUserId = (int)$userId;
        if ($normalizedUserId <= 0 || !is_array($specializationIds)) {
            continue;
        }

        $ids = [];
        foreach ($specializationIds as $specializationId) {
            $id = employeeSpecializationNormalizeId($specializationId);
            if ($id !== null) {
                $ids[] = $id;
            }
        }
        $ids = array_values(array_unique($ids));
        sort($ids);
        $normalized[(string)$normalizedUserId] = $ids;
    }

    return $normalized;
}

function employeeSpecializationWriteAssignments(PDO $conn, array $assignments): array {
    employeeSpecializationRequireSettingsTable($conn);

    $normalized = ['users' => []];
    foreach ($assignments as $userId => $specializationIds) {
        $normalizedUserId = (int)$userId;
        if ($normalizedUserId <= 0 || !is_array($specializationIds)) {
            continue;
        }

        $ids = [];
        foreach ($specializationIds as $specializationId) {
            $id = employeeSpecializationNormalizeId($specializationId);
            if ($id !== null) {
                $ids[] = $id;
            }
        }
        $ids = array_values(array_unique($ids));
        sort($ids);
        $normalized['users'][(string)$normalizedUserId] = $ids;
    }

    $jsonValue = json_encode($normalized, JSON_UNESCAPED_SLASHES);
    $existingStmt = $conn->prepare(
        'SELECT Settings_ID
         FROM settings
         WHERE setting_key = :setting_key
         ORDER BY Settings_ID DESC
         LIMIT 1'
    );
    $existingStmt->execute([':setting_key' => MONITORING_USER_SPECIALIZATION_ASSIGNMENTS_KEY]);
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
            ':setting_key' => MONITORING_USER_SPECIALIZATION_ASSIGNMENTS_KEY,
            ':setting_value' => $jsonValue,
        ]);
    }

    return $normalized['users'];
}

function employeeSpecializationSetUserAssignments(PDO $conn, int $userId, array $specializationIds): array {
    if ($userId <= 0) {
        return [];
    }

    $assignments = employeeSpecializationReadAssignments($conn);
    $ids = [];
    foreach ($specializationIds as $specializationId) {
        $id = employeeSpecializationNormalizeId($specializationId);
        if ($id !== null) {
            $ids[] = $id;
        }
    }
    $ids = array_values(array_unique($ids));
    sort($ids);

    $assignments[(string)$userId] = $ids;
    return employeeSpecializationWriteAssignments($conn, $assignments);
}

function employeeSpecializationGetUserAssignments(PDO $conn, int $userId): array {
    if ($userId <= 0) {
        return [];
    }

    $assignments = employeeSpecializationReadAssignments($conn);
    return is_array($assignments[(string)$userId] ?? null) ? $assignments[(string)$userId] : [];
}

function ensureEmployeeSpecializationSchema(PDO $conn): void {
    monitoring_require_schema_columns(
        $conn,
        'specialization_type',
        ['specialization_type_ID', 'Name'],
        'employee specialization'
    );
    monitoring_require_schema_columns(
        $conn,
        'user',
        ['specialization_type_ID'],
        'employee specialization'
    );
}

function loadSpecializationTypes(PDO $conn): array {
    $stmt = $conn->query(
        'SELECT specialization_type_ID AS id, Name AS name
         FROM specialization_type
         WHERE Name IS NOT NULL AND TRIM(Name) <> \'\'
         ORDER BY specialization_type_ID ASC'
    );
    return $stmt ? ($stmt->fetchAll(PDO::FETCH_ASSOC) ?: []) : [];
}

function findSpecializationTypeById(PDO $conn, $value): ?array {
    $id = employeeSpecializationNormalizeId($value);
    if ($id === null) {
        return null;
    }

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

function employeeSpecializationResolveServiceIds(PDO $conn, array $specializationIds): array {
    $settings = monitoring_get_specialization_management_settings($conn);
    $configMap = is_array($settings['specializations'] ?? null) ? $settings['specializations'] : [];
    $serviceIds = [];

    foreach ($specializationIds as $specializationId) {
        $normalizedSpecializationId = employeeSpecializationNormalizeId($specializationId);
        if ($normalizedSpecializationId === null) {
            continue;
        }

        $config = is_array($configMap[(string)$normalizedSpecializationId] ?? null)
            ? $configMap[(string)$normalizedSpecializationId]
            : [];

        foreach ((array)($config['service_ids'] ?? []) as $serviceId) {
            $normalizedServiceId = (int)$serviceId;
            if ($normalizedServiceId > 0) {
                $serviceIds[] = $normalizedServiceId;
            }
        }
    }

    $serviceIds = array_values(array_unique($serviceIds));
    sort($serviceIds);
    return $serviceIds;
}

function employeeSpecializationResolveServiceNames(PDO $conn, array $specializationIds): array {
    $serviceIds = employeeSpecializationResolveServiceIds($conn, $specializationIds);
    if (empty($serviceIds)) {
        return [];
    }

    $placeholders = implode(',', array_fill(0, count($serviceIds), '?'));
    $stmt = $conn->prepare(
        "SELECT Services_type_Id AS id, Name AS name
         FROM services_type
         WHERE Services_type_Id IN ($placeholders)"
    );
    $stmt->execute($serviceIds);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];

    $nameMap = [];
    foreach ($rows as $row) {
        $serviceId = (int)($row['id'] ?? 0);
        $serviceName = trim((string)($row['name'] ?? ''));
        if ($serviceId > 0 && $serviceName !== '') {
            $nameMap[$serviceId] = $serviceName;
        }
    }

    $serviceNames = [];
    foreach ($serviceIds as $serviceId) {
        if (isset($nameMap[$serviceId])) {
            $serviceNames[] = $nameMap[$serviceId];
        }
    }

    return array_values(array_unique($serviceNames));
}
require_once __DIR__ . '/management_catalog_settings_helper.php';
