<?php
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/connection-pdo.php';

monitoring_bootstrap_api(['GET', 'OPTIONS']);

function respond($code, $payload) {
    http_response_code($code);
    echo json_encode($payload);
    exit;
}

function normalizePaymentMethodRow(array $row): ?array
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
    ];
}

try {
    monitoring_require_auth();
    $conn->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

    monitoring_require_schema_columns(
        $conn,
        'payment_type',
        ['payment_type_ID', 'type_name', 'description'],
        'payment methods'
    );

    $stmt = $conn->query(
        "SELECT payment_type_ID AS id,
                type_name AS name,
                description
         FROM payment_type
         WHERE type_name IS NOT NULL
           AND TRIM(type_name) <> ''
         ORDER BY payment_type_ID ASC"
    );

    $rows = $stmt ? ($stmt->fetchAll(PDO::FETCH_ASSOC) ?: []) : [];
    $paymentMethods = [];

    foreach ($rows as $row) {
        $normalized = normalizePaymentMethodRow($row);
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
