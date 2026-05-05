<?php
require_once __DIR__ . '/../rate_limit.php';
monitoring_enforce_rate_limit();
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/connection-pdo.php';
require_once __DIR__ . '/management_catalog_settings_helper.php';

monitoring_bootstrap_api(['GET', 'OPTIONS']);

function respond($code, $payload) {
    http_response_code($code);
    echo json_encode($payload);
    exit;
}

function normalizePaymentMethodRow(array $row, bool $disabled = false): ?array
{
    $id = isset($row['id']) ? (int)$row['id'] : 0;
    $name = trim((string)($row['name'] ?? ''));
    $description = trim((string)($row['description'] ?? ''));

    if ($id <= 0 || $name === '') {
        return null;
    }

    return [
        'id' => $id,
        'name' => $name,
        'description' => $description !== '' ? $description : null,
        'created_at' => isset($row['created_at']) ? (string)$row['created_at'] : null,
        'disabled' => $disabled,
    ];
}

try {
    monitoring_require_auth();
    $sessionUser = monitoring_read_session_user(true);
    $conn->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $canManagePaymentMethods = is_array($sessionUser)
        && monitoring_user_has_role_or_any_module_access($conn, $sessionUser, [MONITORING_ROLE_ADMIN], ['payment-methods']);
    $includeDisabled = !empty($_GET['include_disabled']) && $canManagePaymentMethods;

    monitoring_require_schema_columns(
        $conn,
        'payment_type',
        ['payment_type_ID', 'type_name', 'description', 'created_at'],
        'payment methods'
    );

    $settings = monitoring_get_payment_method_management_settings($conn);
    $paymentMethodConfigMap = is_array($settings['payment_methods'] ?? null)
        ? $settings['payment_methods']
        : [];

    $stmt = $conn->query(
        "SELECT payment_type_ID AS id,
                type_name AS name,
                description,
                created_at
         FROM payment_type
         WHERE type_name IS NOT NULL
           AND TRIM(type_name) <> ''
         ORDER BY payment_type_ID ASC"
    );

    $rows = $stmt ? ($stmt->fetchAll(PDO::FETCH_ASSOC) ?: []) : [];
    $paymentMethods = [];

    foreach ($rows as $row) {
        $paymentMethodId = isset($row['id']) ? (int)$row['id'] : 0;
        $config = is_array($paymentMethodConfigMap[(string)$paymentMethodId] ?? null)
            ? $paymentMethodConfigMap[(string)$paymentMethodId]
            : [];
        $disabled = !empty($config['disabled']);
        if ($disabled && !$includeDisabled) {
            continue;
        }

        $normalized = normalizePaymentMethodRow($row, $disabled);
        if ($normalized !== null) {
            $paymentMethods[] = $normalized;
        }
    }

    respond(200, [
        'success' => true,
        'payment_methods' => $paymentMethods,
    ]);
} catch (Throwable $e) {
    error_log('payment_methods error: ' . $e->getMessage());
    respond(500, ['success' => false, 'message' => 'Server error']);
}
