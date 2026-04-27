<?php
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/connection-pdo.php';
require_once __DIR__ . '/employee_specialization.php';
require_once __DIR__ . '/management_catalog_settings_helper.php';

monitoring_bootstrap_api(['GET', 'OPTIONS']);

function respond($code, $payload) {
    http_response_code($code);
    echo json_encode($payload);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'GET') {
    respond(405, ['success' => false, 'message' => 'Method not allowed']);
}

try {
    $conn->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    monitoring_require_role_or_module_access($conn, [MONITORING_ROLE_ADMIN], 'user-management');
    monitoring_require_schema_columns($conn, 'services_type', ['Services_type_Id', 'Name'], 'service');
    $includeDisabled = !empty($_GET['include_disabled']);

    $specializationTypes = loadSpecializationTypes($conn);
    $serviceStmt = $conn->query(
        'SELECT Services_type_Id AS id, Name AS name
         FROM services_type
         WHERE Name IS NOT NULL AND TRIM(Name) <> ""
         ORDER BY Services_type_Id ASC'
    );
    $serviceRows = $serviceStmt->fetchAll(PDO::FETCH_ASSOC) ?: [];
    $services = [];
    $serviceNameMap = [];
    foreach ($serviceRows as $row) {
        $serviceId = (int)($row['id'] ?? 0);
        $serviceName = trim((string)($row['name'] ?? ''));
        if ($serviceId <= 0 || $serviceName === '') {
            continue;
        }
        $services[] = ['id' => $serviceId, 'name' => $serviceName];
        $serviceNameMap[$serviceId] = $serviceName;
    }

    $settings = monitoring_get_specialization_management_settings($conn);
    $configMap = is_array($settings['specializations'] ?? null) ? $settings['specializations'] : [];
    $specializations = [];
    foreach ($specializationTypes as $specializationType) {
        $specializationId = (int)($specializationType['id'] ?? 0);
        $specializationName = trim((string)($specializationType['name'] ?? ''));
        if ($specializationId <= 0 || $specializationName === '') {
            continue;
        }

        $config = is_array($configMap[(string)$specializationId] ?? null) ? $configMap[(string)$specializationId] : [];
        $disabled = !empty($config['disabled']);
        if ($disabled && !$includeDisabled) {
            continue;
        }

        $serviceIds = [];
        $serviceNames = [];
        foreach ((array)($config['service_ids'] ?? []) as $serviceId) {
            $normalizedServiceId = (int)$serviceId;
            if ($normalizedServiceId <= 0 || !isset($serviceNameMap[$normalizedServiceId])) {
                continue;
            }
            $serviceIds[] = $normalizedServiceId;
            $serviceNames[] = $serviceNameMap[$normalizedServiceId];
        }

        $specializations[] = [
            'id' => $specializationId,
            'name' => $specializationName,
            'disabled' => $disabled,
            'service_ids' => array_values(array_unique($serviceIds)),
            'service_names' => array_values(array_unique($serviceNames)),
        ];
    }

    respond(200, [
        'success' => true,
        'specialization_types' => $specializations,
        'services' => $services,
    ]);
} catch (Throwable $e) {
    error_log('specialization_type_list error: ' . $e->getMessage());
    respond(500, ['success' => false, 'message' => 'Server error']);
}
