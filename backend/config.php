<?php

if (!function_exists('monitoring_config_load_env_file')) {
    function monitoring_config_load_env_file(string $path): void
    {
        if (!is_file($path) || !is_readable($path)) {
            return;
        }

        $lines = file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
        if (!is_array($lines)) {
            return;
        }

        foreach ($lines as $line) {
            $line = trim((string)$line);
            if ($line === '' || str_starts_with($line, '#')) {
                continue;
            }

            if (str_starts_with($line, 'export ')) {
                $line = trim(substr($line, 7));
            }

            $separatorPosition = strpos($line, '=');
            if ($separatorPosition === false) {
                continue;
            }

            $key = trim(substr($line, 0, $separatorPosition));
            $value = trim(substr($line, $separatorPosition + 1));
            if ($key === '' || !preg_match('/^[A-Za-z_][A-Za-z0-9_]*$/', $key)) {
                continue;
            }

            if (
                (str_starts_with($value, '"') && str_ends_with($value, '"'))
                || (str_starts_with($value, "'") && str_ends_with($value, "'"))
            ) {
                $value = substr($value, 1, -1);
            } else {
                $hashPosition = strpos($value, ' #');
                if ($hashPosition !== false) {
                    $value = rtrim(substr($value, 0, $hashPosition));
                }
            }

            if (getenv($key) === false) {
                putenv($key . '=' . $value);
            }

            if (!array_key_exists($key, $_ENV)) {
                $_ENV[$key] = $value;
            }

            if (!array_key_exists($key, $_SERVER)) {
                $_SERVER[$key] = $value;
            }
        }
    }
}

monitoring_config_load_env_file(__DIR__ . '/.env');
monitoring_config_load_env_file(dirname(__DIR__) . '/.env');

if (!function_exists('monitoring_load_local_api_config')) {
    function monitoring_load_local_api_config(): array
    {
        static $config = null;
        if ($config !== null) {
            return $config;
        }

        $config = [];
        $configPath = __DIR__ . '/api/smtp_config.php';
        if (is_file($configPath)) {
            $loaded = require $configPath;
            if (is_array($loaded)) {
                $config = $loaded;
            }
        }

        return $config;
    }
}

if (!function_exists('monitoring_config_value')) {
    function monitoring_config_value(string $key, $default = null, array $aliases = [])
    {
        foreach (array_merge([$key], $aliases) as $candidateKey) {
            $candidateKey = trim((string)$candidateKey);
            if ($candidateKey === '') {
                continue;
            }

            $envValue = getenv($candidateKey);
            if ($envValue !== false && $envValue !== null && $envValue !== '') {
                return $envValue;
            }

            if (array_key_exists($candidateKey, $_SERVER) && $_SERVER[$candidateKey] !== '') {
                return $_SERVER[$candidateKey];
            }

            if (array_key_exists($candidateKey, $_ENV) && $_ENV[$candidateKey] !== '') {
                return $_ENV[$candidateKey];
            }
        }

        return $default;
    }
}

if (!function_exists('monitoring_read_api_config_value')) {
    function monitoring_read_api_config_value(string $key, $default = null)
    {
        $value = monitoring_config_value($key, null);
        if ($value !== null && $value !== '') {
            return $value;
        }

        $localConfig = monitoring_load_local_api_config();
        if (array_key_exists($key, $localConfig) && $localConfig[$key] !== '') {
            return $localConfig[$key];
        }

        return $default;
    }
}

if (!function_exists('monitoring_config_bool')) {
    function monitoring_config_bool(string $key, bool $default = false): bool
    {
        $value = monitoring_config_value($key, null);
        if ($value === null || $value === '') {
            return $default;
        }

        if (is_bool($value)) {
            return $value;
        }

        $normalized = strtolower(trim((string)$value));
        if (in_array($normalized, ['1', 'true', 'yes', 'on'], true)) {
            return true;
        }

        if (in_array($normalized, ['0', 'false', 'no', 'off'], true)) {
            return false;
        }

        return $default;
    }
}

if (!function_exists('monitoring_db_config')) {
    function monitoring_db_config(): array
    {
        $port = monitoring_config_value('DB_PORT', '3306');
        $port = filter_var($port, FILTER_VALIDATE_INT) ?: 3306;

        return [
            'host' => (string)monitoring_config_value('DB_HOST', '127.0.0.1'),
            'port' => max(1, (int)$port),
            'database' => (string)monitoring_config_value('DB_NAME', 'dbmonitoring', ['DB_DATABASE']),
            'username' => (string)monitoring_config_value('DB_USER', 'root', ['DB_USERNAME']),
            'password' => (string)monitoring_config_value('DB_PASS', '', ['DB_PASSWORD']),
            'charset' => (string)monitoring_config_value('DB_CHARSET', 'utf8mb4'),
            'timeout' => max(1, (int)(filter_var(monitoring_config_value('DB_TIMEOUT', 5), FILTER_VALIDATE_INT) ?: 5)),
        ];
    }
}

if (!function_exists('monitoring_config_normalize_origin')) {
    function monitoring_config_normalize_origin(string $origin): string
    {
        $origin = trim($origin);
        if ($origin === '') {
            return '';
        }

        $parts = parse_url($origin);
        if (!is_array($parts)) {
            return '';
        }

        $scheme = strtolower((string)($parts['scheme'] ?? ''));
        $host = strtolower((string)($parts['host'] ?? ''));
        if (($scheme !== 'http' && $scheme !== 'https') || $host === '') {
            return '';
        }

        $port = isset($parts['port']) ? ':' . (int)$parts['port'] : '';
        return $scheme . '://' . $host . $port;
    }
}

if (!function_exists('monitoring_config_origin_host')) {
    function monitoring_config_origin_host(string $origin): string
    {
        $parts = parse_url($origin);
        if (!is_array($parts)) {
            return '';
        }

        return strtolower((string)($parts['host'] ?? ''));
    }
}

if (!function_exists('monitoring_config_split_csv')) {
    function monitoring_config_split_csv($value): array
    {
        return array_values(array_filter(array_map('trim', explode(',', (string)$value))));
    }
}

if (!function_exists('monitoring_configured_cors_origins')) {
    function monitoring_configured_cors_origins(): array
    {
        $origins = [];
        foreach (['ALLOWED_ORIGINS', 'FRONTEND_URL', 'APP_BASE_URL'] as $key) {
            foreach (monitoring_config_split_csv(monitoring_config_value($key, '')) as $origin) {
                $normalized = monitoring_config_normalize_origin($origin);
                if ($normalized !== '') {
                    $origins[] = $normalized;
                }
            }
        }

        return array_values(array_unique($origins));
    }
}

if (!function_exists('monitoring_config_is_local_origin')) {
    function monitoring_config_is_local_origin(string $origin): bool
    {
        $parts = parse_url($origin);
        if (!is_array($parts)) {
            return false;
        }

        $scheme = strtolower((string)($parts['scheme'] ?? ''));
        $host = strtolower((string)($parts['host'] ?? ''));
        return ($scheme === 'http' || $scheme === 'https')
            && in_array($host, ['localhost', '127.0.0.1', '::1'], true);
    }
}

if (!function_exists('monitoring_config_is_dev_tunnel_origin')) {
    function monitoring_config_is_dev_tunnel_origin(string $origin): bool
    {
        $host = monitoring_config_origin_host($origin);
        if ($host === '') {
            return false;
        }

        foreach (['devtunnels.ms', 'githubpreview.dev', 'app.github.dev'] as $suffix) {
            if ($host === $suffix || str_ends_with($host, '.' . $suffix)) {
                return true;
            }
        }

        return false;
    }
}

if (!function_exists('monitoring_config_allows_dev_tunnels')) {
    function monitoring_config_allows_dev_tunnels(): bool
    {
        $appEnv = strtolower(trim((string)monitoring_config_value('APP_ENV', 'development')));
        return monitoring_config_bool('ALLOW_DEV_TUNNEL_ORIGINS', $appEnv !== 'production');
    }
}

if (!function_exists('monitoring_config_same_host_origin')) {
    function monitoring_config_same_host_origin(string $origin): bool
    {
        $originHost = monitoring_config_origin_host($origin);
        $currentHost = strtolower((string)($_SERVER['HTTP_HOST'] ?? ''));
        $currentHost = explode(':', $currentHost)[0] ?? '';

        return $originHost !== '' && $currentHost !== '' && $originHost === $currentHost;
    }
}

if (!function_exists('monitoring_is_allowed_cors_origin')) {
    function monitoring_is_allowed_cors_origin(string $origin): bool
    {
        $normalized = monitoring_config_normalize_origin($origin);
        if ($normalized === '') {
            return false;
        }

        if (in_array($normalized, monitoring_configured_cors_origins(), true)) {
            return true;
        }

        if (monitoring_config_is_local_origin($normalized) || monitoring_config_same_host_origin($normalized)) {
            return true;
        }

        return monitoring_config_allows_dev_tunnels()
            && monitoring_config_is_dev_tunnel_origin($normalized);
    }
}

if (!function_exists('monitoring_request_is_https')) {
    function monitoring_request_is_https(): bool
    {
        $https = strtolower((string)($_SERVER['HTTPS'] ?? ''));
        if ($https !== '' && $https !== 'off' && $https !== '0') {
            return true;
        }

        $forwardedProto = strtolower((string)($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? ''));
        if ($forwardedProto === 'https') {
            return true;
        }

        $forwarded = strtolower((string)($_SERVER['HTTP_FORWARDED'] ?? ''));
        return str_contains($forwarded, 'proto=https')
            || (string)($_SERVER['SERVER_PORT'] ?? '') === '443';
    }
}

if (!function_exists('monitoring_site_key_for_host')) {
    function monitoring_site_key_for_host(string $host): string
    {
        $host = strtolower(trim($host));
        if ($host === '' || filter_var($host, FILTER_VALIDATE_IP)) {
            return $host;
        }

        $labels = explode('.', $host);
        if (count($labels) <= 2) {
            return $host;
        }

        return implode('.', array_slice($labels, -2));
    }
}

if (!function_exists('monitoring_request_is_cross_site')) {
    function monitoring_request_is_cross_site(): bool
    {
        $origin = trim((string)($_SERVER['HTTP_ORIGIN'] ?? ''));
        if ($origin === '') {
            return false;
        }

        $originParts = parse_url($origin);
        $originScheme = strtolower((string)($originParts['scheme'] ?? ''));
        $originHost = strtolower((string)($originParts['host'] ?? ''));
        $requestScheme = monitoring_request_is_https() ? 'https' : 'http';
        $requestHost = strtolower((string)($_SERVER['HTTP_HOST'] ?? ''));
        $requestHost = explode(':', $requestHost)[0] ?? '';

        return $originScheme !== $requestScheme
            || monitoring_site_key_for_host($originHost) !== monitoring_site_key_for_host($requestHost);
    }
}

if (!function_exists('monitoring_cookie_same_site')) {
    function monitoring_cookie_same_site(): string
    {
        $configured = strtolower(trim((string)monitoring_config_value('SESSION_SAMESITE', '')));
        if (in_array($configured, ['lax', 'strict', 'none'], true)) {
            return ucfirst($configured);
        }

        return monitoring_request_is_https() && monitoring_request_is_cross_site() ? 'None' : 'Lax';
    }
}

if (!function_exists('monitoring_cookie_secure')) {
    function monitoring_cookie_secure(): bool
    {
        return monitoring_request_is_https() || strcasecmp(monitoring_cookie_same_site(), 'None') === 0;
    }
}

if (!function_exists('monitoring_ensure_writable_directory')) {
    function monitoring_ensure_writable_directory(array $candidates): string
    {
        foreach ($candidates as $candidate) {
            $directory = rtrim((string)$candidate, "\\/");
            if ($directory === '') {
                continue;
            }

            if (!is_dir($directory) && !@mkdir($directory, 0775, true) && !is_dir($directory)) {
                continue;
            }

            if (is_writable($directory)) {
                return $directory;
            }
        }

        return '';
    }
}

if (!function_exists('monitoring_session_save_path')) {
    function monitoring_session_save_path(): string
    {
        static $path = null;
        if ($path !== null) {
            return $path;
        }

        $configuredPath = monitoring_config_value('SESSION_SAVE_PATH', '');
        $path = monitoring_ensure_writable_directory([
            $configuredPath,
            __DIR__ . '/data/sessions',
            rtrim(sys_get_temp_dir(), "\\/") . DIRECTORY_SEPARATOR . 'monitoring_sessions',
        ]);

        return $path;
    }
}

if (!function_exists('monitoring_prepare_session_storage')) {
    function monitoring_prepare_session_storage(): void
    {
        $savePath = monitoring_session_save_path();
        if ($savePath !== '' && session_status() !== PHP_SESSION_ACTIVE) {
            session_save_path($savePath);
        }
    }
}
