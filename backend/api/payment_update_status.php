<?php
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/connection-pdo.php';

monitoring_bootstrap_api(['POST', 'OPTIONS']);

function respond($code, $payload) {
    http_response_code($code);
    echo json_encode($payload);
    exit;
}

function normalizePaymentStatusInput(string $value): string
{
    $normalized = strtolower(trim($value));
    if ($normalized === 'approved' || $normalized === 'complete' || $normalized === 'completed') {
        return 'paid';
    }
    if ($normalized === 'rejected' || $normalized === 'declined' || $normalized === 'decline') {
        return 'reject';
    }

    return $normalized;
}

function resolvePaymentStatusRecord(PDO $conn, string $statusInput): ?array
{
    $normalized = normalizePaymentStatusInput($statusInput);
    $candidates = [];

    if ($normalized === 'pending') {
        $candidates = ['Pending'];
    } elseif ($normalized === 'processing') {
        $candidates = ['Processing'];
    } elseif ($normalized === 'paid') {
        $candidates = ['Paid'];
    } elseif ($normalized === 'reject') {
        $candidates = ['Reject', 'Rejected', 'Declined'];
    }

    if (empty($candidates)) {
        return null;
    }

    $statusId = monitoring_resolve_status_id($conn, 'PAYMENT', $candidates);
    if ($statusId === null || $statusId <= 0) {
        return null;
    }

    $stmt = $conn->prepare(
        'SELECT Status_name
         FROM status
         WHERE Status_id = :status_id
         LIMIT 1'
    );
    $stmt->execute([':status_id' => $statusId]);
    $statusName = trim((string)($stmt->fetchColumn() ?: ''));

    return [
        'id' => $statusId,
        'name' => $statusName !== '' ? $statusName : $candidates[0],
    ];
}

function fetchPaymentRecord(PDO $conn, int $paymentId): ?array
{
    if ($paymentId <= 0) {
        return null;
    }

    $stmt = $conn->prepare(
        'SELECT p.payment_ID,
                p.Client_ID,
                p.appointment_ID,
                p.payment_type_ID,
                p.screenshot,
                p.Status_ID,
                p.action_by,
                p.Date,
                pt.type_name AS payment_method_name,
                st.Status_name AS status_name
         FROM payment p
         LEFT JOIN payment_type pt ON pt.payment_type_ID = p.payment_type_ID
         LEFT JOIN status st ON st.Status_id = p.Status_ID
         WHERE p.payment_ID = :payment_id
         LIMIT 1'
    );
    $stmt->execute([':payment_id' => $paymentId]);

    $row = $stmt->fetch(PDO::FETCH_ASSOC) ?: null;
    return $row ?: null;
}

function formatPaymentRecord(array $row): array
{
    return [
        'id' => isset($row['payment_ID']) ? (int)$row['payment_ID'] : null,
        'client_id' => isset($row['Client_ID']) ? (int)$row['Client_ID'] : null,
        'appointment_id' => isset($row['appointment_ID']) && $row['appointment_ID'] !== null ? (int)$row['appointment_ID'] : null,
        'payment_type_id' => isset($row['payment_type_ID']) ? (int)$row['payment_type_ID'] : null,
        'payment_method_name' => trim((string)($row['payment_method_name'] ?? '')) ?: null,
        'screenshot' => trim((string)($row['screenshot'] ?? '')) ?: null,
        'status_id' => isset($row['Status_ID']) ? (int)$row['Status_ID'] : null,
        'status_name' => trim((string)($row['status_name'] ?? '')) ?: null,
        'action_by' => isset($row['action_by']) && $row['action_by'] !== null ? (int)$row['action_by'] : null,
        'date' => trim((string)($row['Date'] ?? '')) ?: null,
    ];
}

try {
    $requestMethod = strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? ''));
    if ($requestMethod !== 'POST') {
        respond(405, ['success' => false, 'message' => 'Method not allowed.']);
    }

    $sessionUser = monitoring_require_auth();
    $conn->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

    if (!monitoring_user_has_role_or_any_module_access(
        $conn,
        $sessionUser,
        [MONITORING_ROLE_ADMIN, MONITORING_ROLE_SECRETARY],
        ['appointments', 'reports', ['module' => 'tasks', 'action' => 'client-appointments']]
    )) {
        monitoring_auth_respond(403, ['success' => false, 'message' => 'Access denied.']);
    }

    $raw = file_get_contents('php://input');
    $data = json_decode($raw, true);
    if (!is_array($data)) {
        respond(400, ['success' => false, 'message' => 'Invalid JSON payload.']);
    }

    $paymentIdRaw = trim((string)($data['payment_id'] ?? ''));
    if ($paymentIdRaw === '' || !ctype_digit($paymentIdRaw)) {
        respond(422, ['success' => false, 'message' => 'payment_id is required.']);
    }

    $statusInput = trim((string)($data['status'] ?? $data['payment_status'] ?? ''));
    if ($statusInput === '') {
        respond(422, ['success' => false, 'message' => 'status is required.']);
    }

    monitoring_require_schema_columns(
        $conn,
        'payment',
        ['payment_ID', 'Client_ID', 'appointment_ID', 'payment_type_ID', 'screenshot', 'Status_ID', 'action_by', 'Date'],
        'payment status update'
    );
    monitoring_require_schema_columns(
        $conn,
        'status',
        ['Status_id', 'Status_group', 'Status_name'],
        'payment status update'
    );

    $paymentId = (int)$paymentIdRaw;
    $paymentRow = fetchPaymentRecord($conn, $paymentId);
    if ($paymentRow === null) {
        respond(404, ['success' => false, 'message' => 'Payment record not found.']);
    }

    $nextStatus = resolvePaymentStatusRecord($conn, $statusInput);
    if ($nextStatus === null) {
        respond(422, ['success' => false, 'message' => 'Unsupported payment status.']);
    }

    $update = $conn->prepare(
        'UPDATE payment
         SET Status_ID = :status_id,
             action_by = :action_by
         WHERE payment_ID = :payment_id
         LIMIT 1'
    );
    $update->execute([
        ':status_id' => $nextStatus['id'],
        ':action_by' => isset($sessionUser['id']) ? (int)$sessionUser['id'] : null,
        ':payment_id' => $paymentId,
    ]);

    $updatedRow = fetchPaymentRecord($conn, $paymentId);
    if ($updatedRow === null) {
        respond(404, ['success' => false, 'message' => 'Payment record not found after update.']);
    }

    $statusKey = normalizePaymentStatusInput($nextStatus['name']);
    $message = 'Payment status updated successfully.';
    if ($statusKey === 'paid') {
        $message = 'Payment marked as paid.';
    } elseif ($statusKey === 'reject') {
        $message = 'Payment rejected successfully.';
    } elseif ($statusKey === 'processing') {
        $message = 'Payment status updated to processing.';
    }

    respond(200, [
        'success' => true,
        'message' => $message,
        'payment' => formatPaymentRecord($updatedRow),
    ]);
} catch (Throwable $e) {
    error_log('payment_update_status error: ' . $e->getMessage());
    respond(500, ['success' => false, 'message' => 'Server error']);
}
