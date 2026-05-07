<?php

function monitoring_rate_limit_positive_int($value, int $fallback, int $minimum = 1): int
{
    $integer = filter_var($value, FILTER_VALIDATE_INT);
    if ($integer === false || $integer < $minimum) {
        return $fallback;
    }

    return (int)$integer;
}

function monitoring_rate_limit_bool($value, bool $fallback): bool
{
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
        return $fallback;
    }

    if (in_array($normalized, ['1', 'true', 'yes', 'on'], true)) {
        return true;
    }

    if (in_array($normalized, ['0', 'false', 'no', 'off'], true)) {
        return false;
    }

    return $fallback;
}

function monitoring_rate_limit_env_message(string $key, string $fallback): string
{
    $value = getenv($key);
    $message = trim((string)($value !== false ? $value : ''));
    return $message !== '' ? $message : $fallback;
}

function monitoring_rate_limit_message($value, string $fallback): string
{
    $message = trim((string)($value ?? ''));
    if ($message === '') {
        return $fallback;
    }

    if (function_exists('mb_substr')) {
        return mb_substr($message, 0, 240);
    }

    return substr($message, 0, 240);
}

function monitoring_rate_limit_storage_driver(): string
{
    $driver = strtolower(trim((string)(getenv('RATE_LIMIT_STORAGE') ?: '')));
    if (in_array($driver, ['auto', 'file', 'redis'], true)) {
        return $driver;
    }

    return (getenv('REDIS_HOST') !== false || getenv('REDIS_PORT') !== false) ? 'auto' : 'file';
}

function monitoring_rate_limit_default_settings(): array
{
    $defaultWindowSeconds = monitoring_rate_limit_positive_int(getenv('RATE_LIMIT_WINDOW_SECONDS'), 60);
    $enabledEnv = getenv('RATE_LIMIT_ENABLED');

    return [
        'enabled' => $enabledEnv === false ? true : monitoring_rate_limit_bool($enabledEnv, true),
        'default_max_requests' => monitoring_rate_limit_positive_int(getenv('RATE_LIMIT_MAX_REQUESTS'), 100),
        'default_window_seconds' => $defaultWindowSeconds,
        'default_message' => monitoring_rate_limit_env_message(
            'RATE_LIMIT_MESSAGE',
            'Too many requests. Please wait a moment and try again.'
        ),
        'login_max_requests' => monitoring_rate_limit_positive_int(getenv('RATE_LIMIT_LOGIN_MAX_REQUESTS'), 5),
        'login_window_seconds' => monitoring_rate_limit_positive_int(
            getenv('RATE_LIMIT_LOGIN_WINDOW_SECONDS'),
            $defaultWindowSeconds
        ),
        'login_message' => monitoring_rate_limit_env_message(
            'RATE_LIMIT_LOGIN_MESSAGE',
            'Too many login attempts. Please wait a moment and try again.'
        ),
    ];
}

function monitoring_rate_limit_database_setting_map(): array
{
    return [
        'rate_limit_enabled' => ['key' => 'enabled', 'type' => 'bool'],
        'rate_limit_max_requests' => ['key' => 'default_max_requests', 'type' => 'int'],
        'rate_limit_window_seconds' => ['key' => 'default_window_seconds', 'type' => 'int'],
        'rate_limit_message' => ['key' => 'default_message', 'type' => 'string'],
        'rate_limit_login_max_requests' => ['key' => 'login_max_requests', 'type' => 'int'],
        'rate_limit_login_window_seconds' => ['key' => 'login_window_seconds', 'type' => 'int'],
        'rate_limit_login_message' => ['key' => 'login_message', 'type' => 'string'],
    ];
}

function monitoring_rate_limit_database_settings(): array
{
    static $settings = null;

    if (is_array($settings)) {
        return $settings;
    }

    $settings = [];
    if (!class_exists(PDO::class)) {
        return $settings;
    }

    try {
        $map = monitoring_rate_limit_database_setting_map();
        $settingKeys = array_keys($map);
        if (empty($settingKeys)) {
            return $settings;
        }

        $host = getenv('DB_HOST') ?: 'localhost';
        $dbName = getenv('DB_NAME') ?: 'dbmonitoring';
        $dbUser = getenv('DB_USER') ?: 'root';
        $dbPass = getenv('DB_PASS') ?: '';
        $pdo = new PDO(
            'mysql:host=' . $host . ';dbname=' . $dbName . ';charset=utf8mb4',
            $dbUser,
            $dbPass,
            [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_TIMEOUT => 1,
            ]
        );

        $placeholders = implode(',', array_fill(0, count($settingKeys), '?'));
        $statement = $pdo->prepare(
            "SELECT setting_key, setting_value
             FROM settings
             WHERE setting_key IN ({$placeholders})"
        );
        $statement->execute($settingKeys);

        while ($row = $statement->fetch(PDO::FETCH_ASSOC)) {
            $settingKey = (string)($row['setting_key'] ?? '');
            if (!isset($map[$settingKey])) {
                continue;
            }

            $definition = $map[$settingKey];
            $targetKey = $definition['key'];
            $type = $definition['type'];
            $rawValue = $row['setting_value'] ?? null;

            if ($type === 'bool') {
                $settings[$targetKey] = monitoring_rate_limit_bool($rawValue, true);
                continue;
            }

            if ($type === 'int') {
                $parsed = monitoring_rate_limit_positive_int($rawValue, 0);
                if ($parsed > 0) {
                    $settings[$targetKey] = $parsed;
                }
                continue;
            }

            $fallbacks = monitoring_rate_limit_default_settings();
            $settings[$targetKey] = monitoring_rate_limit_message(
                $rawValue,
                (string)($fallbacks[$targetKey] ?? 'Too many requests.')
            );
        }
    } catch (Throwable $e) {
        error_log('Rate limiter settings read skipped: ' . $e->getMessage());
    }

    return $settings;
}

function monitoring_rate_limit_config(): array
{
    $settings = array_merge(
        monitoring_rate_limit_default_settings(),
        monitoring_rate_limit_database_settings()
    );

    return [
        'enabled' => !empty($settings['enabled']),
        'storage' => monitoring_rate_limit_storage_driver(),
        'redis' => [
            'scheme' => 'tcp',
            'host' => getenv('REDIS_HOST') ?: '127.0.0.1',
            'port' => monitoring_rate_limit_positive_int(getenv('REDIS_PORT'), 6379),
            'timeout' => 0.5,
            'read_write_timeout' => 0.5,
        ],
        'file' => [
            'directory' => getenv('RATE_LIMIT_FILE_DIR') ?: __DIR__ . '/data/rate_limit',
        ],
        'default' => [
            'max_requests' => max(1, (int)$settings['default_max_requests']),
            'window_seconds' => max(1, (int)$settings['default_window_seconds']),
            'message' => monitoring_rate_limit_message(
                $settings['default_message'],
                'Too many requests. Please wait a moment and try again.'
            ),
        ],
        'endpoints' => [
            'login.php' => [
                'max_requests' => max(1, (int)$settings['login_max_requests']),
                'window_seconds' => max(1, (int)$settings['login_window_seconds']),
                'message' => monitoring_rate_limit_message(
                    $settings['login_message'],
                    'Too many login attempts. Please wait a moment and try again.'
                ),
            ],
        ],
        'fail_open' => true,
    ];
}

function monitoring_rate_limit_current_endpoint(): string
{
    $scriptName = trim((string)($_SERVER['SCRIPT_NAME'] ?? $_SERVER['PHP_SELF'] ?? ''));
    $endpoint = basename($scriptName);
    if ($endpoint !== '') {
        return $endpoint;
    }

    $scriptFile = trim((string)($_SERVER['SCRIPT_FILENAME'] ?? ''));
    $fallbackEndpoint = basename($scriptFile);
    return $fallbackEndpoint !== '' ? $fallbackEndpoint : 'unknown';
}

function monitoring_rate_limit_client_ip(): string
{
    $ip = trim((string)($_SERVER['REMOTE_ADDR'] ?? ''));
    return filter_var($ip, FILTER_VALIDATE_IP) ? $ip : 'unknown';
}

function monitoring_rate_limit_request_activity_mode(): string
{
    $mode = strtolower(trim((string)($_SERVER['HTTP_X_MONITORING_ACTIVITY'] ?? 'active')));
    return $mode === 'passive' ? 'passive' : 'active';
}

function monitoring_rate_limit_has_auth_cookie(): bool
{
    foreach (['MONITORINGSESSID', 'monitoring_auth_jwt'] as $cookieName) {
        if (trim((string)($_COOKIE[$cookieName] ?? '')) !== '') {
            return true;
        }
    }

    return false;
}

function monitoring_rate_limit_skip_passive_requests(): bool
{
    return monitoring_rate_limit_bool(getenv('RATE_LIMIT_SKIP_PASSIVE_REQUESTS'), true);
}

function monitoring_rate_limit_limit_read_requests(): bool
{
    return monitoring_rate_limit_bool(getenv('RATE_LIMIT_LIMIT_READ_REQUESTS'), false);
}

function monitoring_rate_limit_is_settings_update(string $endpoint): bool
{
    $endpointName = strtolower(basename(trim($endpoint)));
    $method = strtoupper(trim((string)($_SERVER['REQUEST_METHOD'] ?? 'GET')));
    if ($endpointName !== 'user_update.php' || $method !== 'POST') {
        return false;
    }

    $rawPayload = file_get_contents('php://input');
    if (!is_string($rawPayload) || trim($rawPayload) === '') {
        return false;
    }

    $payload = json_decode($rawPayload, true);
    if (!is_array($payload)) {
        return false;
    }

    return strtolower(trim((string)($payload['action'] ?? ''))) === 'save_system_configuration';
}

function monitoring_rate_limit_should_skip_passive_request(string $endpoint): bool
{
    $method = strtoupper(trim((string)($_SERVER['REQUEST_METHOD'] ?? 'GET')));
    if (!in_array($method, ['GET', 'HEAD', 'OPTIONS'], true)) {
        return false;
    }

    $endpointName = strtolower(basename(trim($endpoint)));
    if (in_array($endpointName, ['login.php', 'logout.php'], true)) {
        return false;
    }

    if (!monitoring_rate_limit_limit_read_requests()) {
        return true;
    }

    if (!monitoring_rate_limit_skip_passive_requests()) {
        return false;
    }

    if (monitoring_rate_limit_request_activity_mode() !== 'passive') {
        return false;
    }

    if (!monitoring_rate_limit_has_auth_cookie()) {
        return false;
    }

    return true;
}

function monitoring_rate_limit_settings_for_endpoint(array $config, string $endpoint): array
{
    $default = is_array($config['default'] ?? null) ? $config['default'] : [];
    $endpoints = is_array($config['endpoints'] ?? null) ? $config['endpoints'] : [];
    $endpointBaseName = pathinfo($endpoint, PATHINFO_FILENAME);
    $override = $endpoints[$endpoint] ?? $endpoints[$endpointBaseName] ?? [];
    $override = is_array($override) ? $override : [];

    return [
        'max_requests' => max(1, (int)($override['max_requests'] ?? $default['max_requests'] ?? 100)),
        'window_seconds' => max(1, (int)($override['window_seconds'] ?? $default['window_seconds'] ?? 60)),
        'message' => trim((string)($override['message'] ?? $default['message'] ?? 'Too many requests.')),
    ];
}

function monitoring_rate_limit_redis_client(array $config)
{
    static $client = null;

    if (is_object($client)) {
        return $client;
    }

    $autoloadPath = __DIR__ . '/../vendor/autoload.php';
    if (!is_file($autoloadPath)) {
        throw new RuntimeException('Composer autoload file was not found for Predis.');
    }

    require_once $autoloadPath;

    if (!class_exists(\Predis\Client::class)) {
        throw new RuntimeException('Predis client class is not available.');
    }

    $redisConfig = is_array($config['redis'] ?? null) ? $config['redis'] : [];
    $client = new \Predis\Client($redisConfig);
    $client->ping();

    return $client;
}

function monitoring_rate_limit_redis_increment(array $config, string $key, int $windowSeconds): array
{
    $redis = monitoring_rate_limit_redis_client($config);
    $currentCount = (int)$redis->incr($key);

    if ($currentCount === 1) {
        $redis->expire($key, $windowSeconds);
    }

    $ttl = (int)$redis->ttl($key);
    if ($ttl < 0) {
        $redis->expire($key, $windowSeconds);
        $ttl = $windowSeconds;
    }

    return [
        'count' => $currentCount,
        'ttl' => max(1, $ttl),
        'storage' => 'redis',
    ];
}

function monitoring_rate_limit_file_directory(array $config): string
{
    $fileConfig = is_array($config['file'] ?? null) ? $config['file'] : [];
    $directory = trim((string)($fileConfig['directory'] ?? ''));
    return $directory !== '' ? $directory : __DIR__ . '/data/rate_limit';
}

function monitoring_rate_limit_file_directories(array $config): array
{
    return array_values(array_unique([
        monitoring_rate_limit_file_directory($config),
        rtrim(sys_get_temp_dir(), "\\/") . DIRECTORY_SEPARATOR . 'monitoring_rate_limit',
    ]));
}

function monitoring_rate_limit_ensure_file_directory(string $directory): string
{
    if (!is_dir($directory) && !@mkdir($directory, 0775, true) && !is_dir($directory)) {
        throw new RuntimeException('Rate limiter file directory could not be created: ' . $directory);
    }

    if (!is_writable($directory)) {
        throw new RuntimeException('Rate limiter file directory is not writable: ' . $directory);
    }

    return $directory;
}

function monitoring_rate_limit_file_path(array $config, string $key): string
{
    $directories = monitoring_rate_limit_file_directories($config);
    $errors = [];

    foreach (array_unique($directories) as $directory) {
        try {
            $directory = monitoring_rate_limit_ensure_file_directory($directory);
            return rtrim($directory, "\\/") . DIRECTORY_SEPARATOR . hash('sha256', $key) . '.json';
        } catch (Throwable $e) {
            $errors[] = $e->getMessage();
        }
    }

    throw new RuntimeException('Rate limiter file directory is unavailable: ' . implode('; ', $errors));
}

function monitoring_rate_limit_file_increment(array $config, string $key, int $windowSeconds): array
{
    $path = monitoring_rate_limit_file_path($config, $key);
    $handle = @fopen($path, 'c+');
    if ($handle === false) {
        throw new RuntimeException('Rate limiter file could not be opened.');
    }

    $locked = false;
    try {
        if (!flock($handle, LOCK_EX)) {
            throw new RuntimeException('Rate limiter file could not be locked.');
        }

        $locked = true;
        rewind($handle);
        $raw = stream_get_contents($handle);
        $state = json_decode((string)$raw, true);
        if (!is_array($state)) {
            $state = [];
        }

        $now = time();
        $expiresAt = monitoring_rate_limit_positive_int($state['expires_at'] ?? 0, 0, 0);
        $currentCount = monitoring_rate_limit_positive_int($state['count'] ?? 0, 0, 0);
        if ($expiresAt <= $now) {
            $expiresAt = $now + $windowSeconds;
            $currentCount = 0;
        }

        $currentCount++;
        $payload = json_encode([
            'count' => $currentCount,
            'expires_at' => $expiresAt,
        ]);
        if ($payload === false) {
            throw new RuntimeException('Rate limiter file state could not be encoded.');
        }

        rewind($handle);
        if (!ftruncate($handle, 0)) {
            throw new RuntimeException('Rate limiter file could not be truncated.');
        }
        if (fwrite($handle, $payload) === false) {
            throw new RuntimeException('Rate limiter file could not be written.');
        }
        fflush($handle);

        return [
            'count' => $currentCount,
            'ttl' => max(1, $expiresAt - $now),
            'storage' => 'file',
        ];
    } finally {
        if ($locked) {
            flock($handle, LOCK_UN);
        }
        fclose($handle);
    }
}

function monitoring_rate_limit_clear_file_storage(array $config): int
{
    $deleted = 0;

    foreach (monitoring_rate_limit_file_directories($config) as $directory) {
        $directory = rtrim((string)$directory, "\\/");
        if ($directory === '' || !is_dir($directory)) {
            continue;
        }

        $realDirectory = realpath($directory);
        if ($realDirectory === false) {
            continue;
        }

        $files = glob($directory . DIRECTORY_SEPARATOR . '*.json');
        if (!is_array($files)) {
            continue;
        }

        foreach ($files as $file) {
            $realFile = realpath((string)$file);
            if ($realFile === false || !is_file($realFile)) {
                continue;
            }

            $directoryPrefix = rtrim($realDirectory, "\\/") . DIRECTORY_SEPARATOR;
            if (stripos($realFile, $directoryPrefix) !== 0) {
                continue;
            }

            if (@unlink($realFile)) {
                $deleted++;
            }
        }
    }

    return $deleted;
}

function monitoring_rate_limit_clear_redis_storage(array $config): int
{
    $redis = monitoring_rate_limit_redis_client($config);
    $keys = $redis->keys('monitoring:rate_limit:*');
    if (empty($keys)) {
        return 0;
    }

    return (int)$redis->del($keys);
}

function monitoring_rate_limit_clear_storage(): array
{
    $config = monitoring_rate_limit_config();
    $storageDriver = strtolower(trim((string)($config['storage'] ?? 'file')));
    $result = [
        'file' => 0,
        'redis' => 0,
    ];

    if (in_array($storageDriver, ['file', 'auto'], true)) {
        try {
            $result['file'] = monitoring_rate_limit_clear_file_storage($config);
        } catch (Throwable $fileError) {
            error_log('Rate limiter file counters were not cleared: ' . $fileError->getMessage());
        }
    }

    if (in_array($storageDriver, ['redis', 'auto'], true)) {
        try {
            $result['redis'] = monitoring_rate_limit_clear_redis_storage($config);
        } catch (Throwable $redisError) {
            error_log('Rate limiter Redis counters were not cleared: ' . $redisError->getMessage());
        }
    }

    return $result;
}

function monitoring_rate_limit_key(string $endpoint, string $ip): string
{
    $safeEndpoint = preg_replace('/[^A-Za-z0-9_.-]/', '_', $endpoint);
    $endpointPart = $safeEndpoint !== '' ? $safeEndpoint : 'unknown';

    return 'monitoring:rate_limit:' . $endpointPart . ':' . hash('sha256', $ip);
}

function monitoring_rate_limit_origin_allowed(string $origin): bool
{
    $origin = trim($origin);
    if ($origin === '') {
        return false;
    }

    $allowedOrigins = getenv('ALLOWED_ORIGINS') ?: '';
    if ($allowedOrigins !== '') {
        $whitelist = array_map('trim', explode(',', $allowedOrigins));
        return in_array($origin, $whitelist, true);
    }

    $parts = parse_url($origin);
    if (!is_array($parts)) {
        return false;
    }

    $scheme = strtolower((string)($parts['scheme'] ?? ''));
    $host = strtolower((string)($parts['host'] ?? ''));
    if (($scheme === 'http' || $scheme === 'https') && in_array($host, ['localhost', '127.0.0.1'], true)) {
        return true;
    }

    $currentHost = strtolower((string)($_SERVER['HTTP_HOST'] ?? ''));
    $currentHost = explode(':', $currentHost)[0] ?? '';

    return $currentHost !== '' && $host === $currentHost;
}

function monitoring_rate_limit_send_cors_headers(): void
{
    $origin = trim((string)($_SERVER['HTTP_ORIGIN'] ?? ''));
    if ($origin !== '' && monitoring_rate_limit_origin_allowed($origin)) {
        header('Access-Control-Allow-Origin: ' . $origin);
        header('Access-Control-Allow-Credentials: true');
        header('Vary: Origin');
    } elseif ($origin !== '') {
        header('Vary: Origin');
    }

    $requestedHeaders = trim((string)($_SERVER['HTTP_ACCESS_CONTROL_REQUEST_HEADERS'] ?? ''));
    header('Access-Control-Allow-Headers: ' . ($requestedHeaders !== '' ? $requestedHeaders : 'Content-Type, Authorization, Accept, X-Requested-With'));
    header('Access-Control-Expose-Headers: Retry-After, X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset');
}

function monitoring_rate_limit_json_response(int $statusCode, array $payload): void
{
    monitoring_rate_limit_send_cors_headers();
    http_response_code($statusCode);
    header('Content-Type: application/json');
    echo json_encode($payload);
    exit;
}

function monitoring_enforce_rate_limit(?string $endpoint = null): void
{
    static $checked = false;

    if ($checked || PHP_SAPI === 'cli') {
        return;
    }

    $checked = true;

    if (strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'GET')) === 'OPTIONS') {
        return;
    }

    $config = monitoring_rate_limit_config();
    if (empty($config['enabled'])) {
        return;
    }

    $currentEndpoint = trim((string)($endpoint ?: monitoring_rate_limit_current_endpoint()));
    if (monitoring_rate_limit_is_settings_update($currentEndpoint)) {
        return;
    }

    if (monitoring_rate_limit_should_skip_passive_request($currentEndpoint)) {
        return;
    }

    $settings = monitoring_rate_limit_settings_for_endpoint($config, $currentEndpoint);
    $maxRequests = $settings['max_requests'];
    $windowSeconds = $settings['window_seconds'];
    $message = $settings['message'] !== '' ? $settings['message'] : 'Too many requests.';
    $clientIp = monitoring_rate_limit_client_ip();
    $key = monitoring_rate_limit_key($currentEndpoint, $clientIp);
    $storageDriver = strtolower(trim((string)($config['storage'] ?? 'file')));

    if ($storageDriver === 'file') {
        try {
            $rateLimitResult = monitoring_rate_limit_file_increment($config, $key, $windowSeconds);
        } catch (Throwable $fileError) {
            error_log('Rate limiter file store unavailable, trying Redis: ' . $fileError->getMessage());

            try {
                $rateLimitResult = monitoring_rate_limit_redis_increment($config, $key, $windowSeconds);
            } catch (Throwable $redisError) {
                error_log(
                    'Rate limiter skipped: file store unavailable (' . $fileError->getMessage()
                    . ') and Redis unavailable (' . $redisError->getMessage() . ')'
                );

                if (!empty($config['fail_open'])) {
                    return;
                }

                monitoring_rate_limit_json_response(503, [
                    'success' => false,
                    'message' => 'Rate limiter is unavailable. Please try again later.',
                ]);
            }
        }
    } else {
        try {
            $rateLimitResult = monitoring_rate_limit_redis_increment($config, $key, $windowSeconds);
        } catch (Throwable $redisError) {
            error_log('Rate limiter Redis unavailable, using file store: ' . $redisError->getMessage());

            try {
                $rateLimitResult = monitoring_rate_limit_file_increment($config, $key, $windowSeconds);
            } catch (Throwable $fileError) {
                error_log(
                    'Rate limiter skipped: Redis unavailable (' . $redisError->getMessage()
                    . ') and file store unavailable (' . $fileError->getMessage() . ')'
                );

                if (!empty($config['fail_open'])) {
                    return;
                }

                monitoring_rate_limit_json_response(503, [
                    'success' => false,
                    'message' => 'Rate limiter is unavailable. Please try again later.',
                ]);
            }
        }
    }

    $currentCount = max(1, (int)($rateLimitResult['count'] ?? 1));
    $ttl = max(1, (int)($rateLimitResult['ttl'] ?? $windowSeconds));
    $remaining = max(0, $maxRequests - $currentCount);
    header('X-RateLimit-Limit: ' . $maxRequests);
    header('X-RateLimit-Remaining: ' . $remaining);
    header('X-RateLimit-Reset: ' . (time() + $ttl));

    if ($currentCount <= $maxRequests) {
        return;
    }

    header('Retry-After: ' . $ttl);
    monitoring_rate_limit_json_response(429, [
        'success' => false,
        'rate_limited' => true,
        'message' => $message,
        'limit' => $maxRequests,
        'window_seconds' => $windowSeconds,
        'retry_after' => $ttl,
    ]);
}
