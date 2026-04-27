<?php
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/connection-pdo.php';
require_once __DIR__ . '/management_catalog_settings_helper.php';

monitoring_bootstrap_api(['POST', 'OPTIONS']);

function respond($code, $payload) {
    http_response_code($code);
    echo json_encode($payload);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    respond(405, ['success' => false, 'message' => 'Method not allowed']);
}

try {
    monitoring_require_roles([MONITORING_ROLE_ADMIN]);
    $conn->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

    monitoring_require_schema_columns(
        $conn,
        'payment_type',
        ['payment_type_ID', 'type_name', 'description'],
        'payment methods'
    );

    $raw = file_get_contents('php://input');
    $data = json_decode($raw, true);
    if (!is_array($data)) {
        respond(400, ['success' => false, 'message' => 'Invalid JSON payload']);
    }

    $paymentMethodName = trim((string)($data['name'] ?? $data['payment_method_name'] ?? ''));
    $description = trim((string)($data['description'] ?? ''));

    if ($paymentMethodName === '') {
        respond(422, ['success' => false, 'message' => 'Payment method name is required.']);
    }

    if (mb_strlen($paymentMethodName) > 50) {
        respond(422, ['success' => false, 'message' => 'Payment method name must be 50 characters or fewer.']);
    }

    if (mb_strlen($description) > 255) {
        respond(422, ['success' => false, 'message' => 'Description must be 255 characters or fewer.']);
    }

    $checkStmt = $conn->prepare(
        'SELECT payment_type_ID, type_name
         FROM payment_type
         WHERE LOWER(TRIM(type_name)) = LOWER(TRIM(:name))
         LIMIT 1'
    );
    $checkStmt->execute([':name' => $paymentMethodName]);
    $existing = $checkStmt->fetch(PDO::FETCH_ASSOC);
    if ($existing) {
        respond(409, [
            'success' => false,
            'message' => 'Payment method already exists.',
            'payment_method' => [
                'id' => (int)$existing['payment_type_ID'],
                'name' => (string)$existing['type_name'],
            ],
        ]);
    }

    $insertStmt = $conn->prepare(
        'INSERT INTO payment_type (type_name, description)
         VALUES (:name, :description)'
    );
    $insertStmt->execute([
        ':name' => $paymentMethodName,
        ':description' => $description !== '' ? $description : null,
    ]);

    $paymentMethodId = (int)$conn->lastInsertId();
    monitoring_set_payment_method_management_config($conn, $paymentMethodId, [
        'disabled' => false,
    ]);

    respond(201, [
        'success' => true,
        'message' => 'Payment method added successfully.',
        'payment_method' => [
            'id' => $paymentMethodId,
            'name' => $paymentMethodName,
            'description' => $description !== '' ? $description : null,
            'disabled' => false,
        ],
    ]);
} catch (Throwable $e) {
    error_log('payment_method_create error: ' . $e->getMessage());
    respond(500, ['success' => false, 'message' => 'Server error']);
}
