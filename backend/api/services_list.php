<?php
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/connection-pdo.php';
require_once __DIR__ . '/client_service_access.php';
require_once __DIR__ . '/service_bundle_settings_helper.php';

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
    $includeDisabled = !empty($_GET['include_disabled']);
    if (session_status() === PHP_SESSION_ACTIVE) {
        session_write_close();
    }
    $serviceAccess = [
        'client_id' => null,
        'business_registered' => null,
        'business_permit_expired' => false,
        'restricted_to_processing' => false,
        'restriction_reason' => null,
        'allowed_services' => [],
    ];

    // Pull service names from services_type exactly as configured in monitoring.sql.
    $bundleSettings = monitoring_get_service_bundle_settings($conn);
    $serviceConfigMap = isset($bundleSettings['services']) && is_array($bundleSettings['services'])
        ? $bundleSettings['services']
        : [];

    $sql = "SELECT Services_type_Id AS id, Name AS name
            FROM services_type
            WHERE Name IS NOT NULL AND TRIM(Name) <> ''
            ORDER BY Services_type_Id ASC";

    $stmt = $conn->query($sql);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];

    $services = [];
    foreach ($rows as $row) {
        $serviceId = isset($row['id']) ? (int)$row['id'] : 0;
        $serviceName = isset($row['name']) ? trim((string)$row['name']) : '';
        if ($serviceId <= 0 || $serviceName === '') {
            continue;
        }

        $serviceConfig = $serviceConfigMap[(string)$serviceId] ?? [];
        $disabled = !empty($serviceConfig['disabled']);
        if ($disabled && !$includeDisabled) {
            continue;
        }

        $services[] = [
            'id' => $serviceId,
            'name' => $serviceName,
            'disabled' => $disabled,
            'bundle_steps' => monitoring_normalize_service_bundle_steps($serviceConfig['bundle_steps'] ?? []),
        ];
    }

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
        $accessState = monitoring_client_service_access_state($conn, $effectiveClientId);
        $businessRegistered = !empty($accessState['business_registered']);
        $serviceAccess = [
            'client_id' => $effectiveClientId,
            'business_registered' => $businessRegistered,
            'business_permit_expired' => !empty($accessState['business_permit_expired']),
            'restricted_to_processing' => !empty($accessState['restricted_to_processing']),
            'restriction_reason' => isset($accessState['restriction_reason']) ? (string)$accessState['restriction_reason'] : null,
            'allowed_services' => isset($accessState['allowed_services']) && is_array($accessState['allowed_services'])
                ? array_values($accessState['allowed_services'])
                : [],
        ];

        if (!$businessRegistered) {
            $services = array_values(array_filter($services, function ($service) {
                return monitoring_service_name_is_processing(isset($service['name']) ? (string)$service['name'] : '');
            }));
            if (count($services) === 0) {
                $services = [[
                    'id' => null,
                    'name' => 'Processing',
                    'disabled' => false,
                    'bundle_steps' => [],
                ]];
            }
        }
    }

    respond(200, [
        'success' => true,
        'services' => $services,
        'service_access' => $serviceAccess,
    ]);
} catch (Throwable $e) {
    error_log('services_list error: ' . $e->getMessage());
    respond(500, ['success' => false, 'message' => 'Server error']);
}
