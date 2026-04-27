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

    $paymentMethodId = isset($data['payment_type_id']) ? (int)$data['payment_type_id'] : 0;
    if ($paymentMethodId <= 0) {
        respond(422, ['success' => false, 'message' => 'Payment method id is required.']);
    }

    $methodStmt = $conn->prepare(
        'SELECT payment_type_ID, type_name, description
         FROM payment_type
         WHERE payment_type_ID = :id
         LIMIT 1'
    );
    $methodStmt->execute([':id' => $paymentMethodId]);
    $existing = $methodStmt->fetch(PDO::FETCH_ASSOC);
    if (!$existing) {
        respond(404, ['success' => false, 'message' => 'Payment method not found.']);
    }

    $nextName = trim((string)($data['name'] ?? $data['payment_method_name'] ?? $existing['type_name'] ?? ''));
    $description = trim((string)($data['description'] ?? $existing['description'] ?? ''));
    $paymentMethodSettings = monitoring_get_payment_method_management_settings($conn);
    $existingConfig = is_array($paymentMethodSettings['payment_methods'][(string)$paymentMethodId] ?? null)
        ? $paymentMethodSettings['payment_methods'][(string)$paymentMethodId]
        : [];
    $disabled = array_key_exists('disabled', $data)
        ? !empty($data['disabled'])
        : !empty($existingConfig['disabled']);

    if ($nextName === '') {
        respond(422, ['success' => false, 'message' => 'Payment method name is required.']);
    }

    if (mb_strlen($nextName) > 50) {
        respond(422, ['success' => false, 'message' => 'Payment method name must be 50 characters or fewer.']);
    }

    if (mb_strlen($description) > 255) {
        respond(422, ['success' => false, 'message' => 'Description must be 255 characters or fewer.']);
    }

    $duplicateStmt = $conn->prepare(
        'SELECT payment_type_ID
         FROM payment_type
         WHERE LOWER(TRIM(type_name)) = LOWER(TRIM(:name))
           AND payment_type_ID <> :id
         LIMIT 1'
    );
    $duplicateStmt->execute([
        ':name' => $nextName,
        ':id' => $paymentMethodId,
    ]);
    if ($duplicateStmt->fetchColumn()) {
        respond(409, ['success' => false, 'message' => 'Another payment method already uses that name.']);
    }

    $updateStmt = $conn->prepare(
        'UPDATE payment_type
         SET type_name = :name,
             description = :description
         WHERE payment_type_ID = :id'
    );
    $updateStmt->execute([
        ':name' => $nextName,
        ':description' => $description !== '' ? $description : null,
        ':id' => $paymentMethodId,
    ]);

    monitoring_set_payment_method_management_config($conn, $paymentMethodId, [
        'disabled' => $disabled,
    ]);

    respond(200, [
        'success' => true,
        'message' => $disabled ? 'Payment method disabled successfully.' : 'Payment method updated successfully.',
        'payment_method' => [
            'id' => $paymentMethodId,
            'name' => $nextName,
            'description' => $description !== '' ? $description : null,
            'disabled' => $disabled,
        ],
    ]);
} catch (Throwable $e) {
    error_log('payment_method_update error: ' . $e->getMessage());
    respond(500, ['success' => false, 'message' => 'Server error']);
}
