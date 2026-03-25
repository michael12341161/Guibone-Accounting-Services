<?php
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/connection-pdo.php';
require_once __DIR__ . '/client_service_access.php';

monitoring_bootstrap_api(['GET', 'OPTIONS']);

function respond($code, $payload) {
    http_response_code($code);
    echo json_encode($payload);
    exit;
}

try {
    $conn->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $sessionUser = monitoring_read_session_user(true);
    $roleId = is_array($sessionUser) ? (int)($sessionUser['role_id'] ?? 0) : 0;
    $requestedClientId = isset($_GET['client_id']) ? (int)$_GET['client_id'] : 0;
    if (session_status() === PHP_SESSION_ACTIVE) {
        session_write_close();
    }
    $serviceAccess = [
        'client_id' => null,
        'business_registered' => null,
        'restricted_to_processing' => false,
    ];

    // Pull service names from services_type exactly as configured in monitoring.sql.
    $sql = "SELECT Name AS name
            FROM services_type
            WHERE Name IS NOT NULL AND TRIM(Name) <> ''
            ORDER BY Services_type_Id ASC";

    $stmt = $conn->query($sql);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];

    // Normalize to a list of unique, trimmed names
    $names = array_values(array_filter(array_unique(array_map(function ($r) {
        return isset($r['name']) ? trim($r['name']) : '';
    }, $rows)), function($v) { return $v !== ''; }));

    $effectiveClientId = 0;
    if ($roleId === MONITORING_ROLE_CLIENT) {
        $effectiveClientId = (int)($sessionUser['client_id'] ?? 0);
        if ($effectiveClientId <= 0 && $requestedClientId > 0) {
            $effectiveClientId = $requestedClientId;
        }
    } elseif ($requestedClientId > 0) {
        $effectiveClientId = $requestedClientId;
    }

    if ($effectiveClientId > 0) {
        $businessRegistered = monitoring_client_business_is_registered($conn, $effectiveClientId);
        $serviceAccess = [
            'client_id' => $effectiveClientId,
            'business_registered' => $businessRegistered,
            'restricted_to_processing' => !$businessRegistered,
        ];

        if (!$businessRegistered) {
            $names = array_values(array_filter($names, 'monitoring_service_name_is_processing'));
            if (count($names) === 0) {
                $names = ['Processing'];
            }
        }
    }

    // Map to array of objects with `name` field as expected by frontend
    $services = array_map(function ($n) { return ['name' => $n]; }, $names);

    respond(200, [
        'success' => true,
        'services' => $services,
        'service_access' => $serviceAccess,
    ]);
} catch (Throwable $e) {
    respond(500, ['success' => false, 'message' => 'Server error', 'error' => $e->getMessage()]);
}
