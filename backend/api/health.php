<?php
require_once __DIR__ . '/auth.php';

monitoring_bootstrap_api(['GET', 'OPTIONS']);

$dbConfig = monitoring_db_config();
$databaseConnected = false;
$databaseMessage = 'Database is not connected.';

try {
    $healthConnection = new PDO(
        'mysql:host=' . $dbConfig['host']
            . ';port=' . $dbConfig['port']
            . ';dbname=' . $dbConfig['database']
            . ';charset=' . $dbConfig['charset'],
        $dbConfig['username'],
        $dbConfig['password'],
        [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_TIMEOUT => $dbConfig['timeout'],
        ]
    );
    $healthConnection->query('SELECT 1');
    $databaseConnected = true;
    $databaseMessage = 'Database connection is healthy.';
} catch (Throwable $error) {
    error_log('Health check database failure: ' . $error->getMessage());
}

$origin = trim((string)($_SERVER['HTTP_ORIGIN'] ?? ''));
http_response_code($databaseConnected ? 200 : 503);
echo json_encode([
    'success' => $databaseConnected,
    'api' => [
        'running' => true,
        'host' => $_SERVER['HTTP_HOST'] ?? null,
        'https' => monitoring_is_https(),
    ],
    'database' => [
        'connected' => $databaseConnected,
        'host' => $dbConfig['host'],
        'port' => $dbConfig['port'],
        'database' => $dbConfig['database'],
        'message' => $databaseMessage,
    ],
    'cors' => [
        'origin' => $origin !== '' ? $origin : null,
        'allowed' => $origin !== '' ? monitoring_is_allowed_origin($origin) : null,
        'configured_origins' => monitoring_configured_cors_origins(),
        'dev_tunnel_origins_allowed' => monitoring_config_allows_dev_tunnels(),
    ],
]);
