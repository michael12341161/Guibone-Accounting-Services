<?php
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/connection-pdo.php';

monitoring_bootstrap_api(['POST', 'OPTIONS']);

function respond($code, $payload) {
    http_response_code($code);
    echo json_encode($payload);
    exit;
}

function backendBaseDirectory(): string
{
    $real = realpath(__DIR__ . '/..');
    return $real !== false ? $real : dirname(__DIR__);
}

function paymentUploadErrorMessage(int $uploadError): string
{
    switch ($uploadError) {
        case UPLOAD_ERR_OK:
            return '';
        case UPLOAD_ERR_INI_SIZE:
        case UPLOAD_ERR_FORM_SIZE:
            return 'Payment receipt must be 5MB or smaller.';
        case UPLOAD_ERR_PARTIAL:
            return 'Payment receipt upload was interrupted. Please try again.';
        case UPLOAD_ERR_NO_FILE:
            return 'Please upload a payment receipt image.';
        case UPLOAD_ERR_NO_TMP_DIR:
            return 'The server upload temp folder is missing.';
        case UPLOAD_ERR_CANT_WRITE:
            return 'The server could not write the uploaded receipt.';
        case UPLOAD_ERR_EXTENSION:
            return 'A server extension blocked the uploaded receipt.';
        default:
            return 'Payment receipt upload failed.';
    }
}

function storePaymentReceiptImage(array $file, int $clientId): string
{
    if ($clientId <= 0) {
        throw new InvalidArgumentException('Client account could not be resolved.');
    }

    $uploadError = isset($file['error']) ? (int)$file['error'] : UPLOAD_ERR_NO_FILE;
    if ($uploadError !== UPLOAD_ERR_OK) {
        throw new InvalidArgumentException(paymentUploadErrorMessage($uploadError));
    }

    if (!isset($file['tmp_name']) || !is_uploaded_file((string)$file['tmp_name'])) {
        throw new InvalidArgumentException('Uploaded payment receipt could not be verified.');
    }

    $maxBytes = 5 * 1024 * 1024;
    if ((int)($file['size'] ?? 0) > $maxBytes) {
        throw new InvalidArgumentException('Payment receipt must be 5MB or smaller.');
    }

    $originalName = basename((string)($file['name'] ?? ''));
    $extension = strtolower(pathinfo($originalName, PATHINFO_EXTENSION));
    $allowedExtensions = ['jpg', 'jpeg', 'png'];
    if (!in_array($extension, $allowedExtensions, true)) {
        throw new InvalidArgumentException('Invalid image type. Allowed: jpg, jpeg, png.');
    }

    $finfo = finfo_open(FILEINFO_MIME_TYPE);
    $mimeType = $finfo ? finfo_file($finfo, (string)$file['tmp_name']) : '';
    if ($finfo) {
        finfo_close($finfo);
    }

    $allowedMimeTypes = ['image/jpeg', 'image/png'];
    if (!in_array($mimeType, $allowedMimeTypes, true)) {
        throw new InvalidArgumentException('Invalid or unsupported receipt image.');
    }

    $safeBase = preg_replace('/[^a-zA-Z0-9_-]+/', '_', pathinfo($originalName, PATHINFO_FILENAME));
    $safeBase = trim((string)$safeBase, '_');
    if ($safeBase === '') {
        $safeBase = 'receipt';
    }

    $uploadDir = backendBaseDirectory() . DIRECTORY_SEPARATOR . 'uploads' . DIRECTORY_SEPARATOR . 'payment_receipts';
    if (!is_dir($uploadDir) && !mkdir($uploadDir, 0755, true) && !is_dir($uploadDir)) {
        throw new RuntimeException('Payment receipt directory could not be created.');
    }
    if (!is_writable($uploadDir)) {
        throw new RuntimeException('Payment receipt directory is not writable.');
    }

    $storedName = 'payment_' . $clientId . '_' . bin2hex(random_bytes(8)) . '_' . $safeBase . '.' . $extension;
    $destination = $uploadDir . DIRECTORY_SEPARATOR . $storedName;

    if (!move_uploaded_file((string)$file['tmp_name'], $destination)) {
        throw new RuntimeException('Payment receipt could not be saved. Check the upload folder permissions.');
    }

    return 'uploads/payment_receipts/' . $storedName;
}

function findPaymentType(PDO $conn, int $paymentTypeId): ?array
{
    $stmt = $conn->prepare(
        'SELECT payment_type_ID AS id, type_name AS name, description
         FROM payment_type
         WHERE payment_type_ID = :payment_type_id
         LIMIT 1'
    );
    $stmt->execute([':payment_type_id' => $paymentTypeId]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC) ?: null;

    return $row ?: null;
}

function resolvePaymentStatus(PDO $conn, array $preferredNames, array $fallbackNames = []): array
{
    monitoring_require_schema_columns($conn, 'status', ['Status_id', 'Status_group', 'Status_name'], 'payment submission');

    $resolvedId = monitoring_resolve_status_id($conn, 'PAYMENT', $preferredNames);
    $resolvedName = '';

    foreach ($preferredNames as $candidate) {
        $candidateName = trim((string)$candidate);
        if ($candidateName !== '') {
            $resolvedName = $candidateName;
            break;
        }
    }

    if ($resolvedId === null && !empty($fallbackNames)) {
        $resolvedId = monitoring_resolve_status_id($conn, 'PAYMENT', $fallbackNames);
        foreach ($fallbackNames as $candidate) {
            $candidateName = trim((string)$candidate);
            if ($candidateName !== '') {
                $resolvedName = $candidateName;
                break;
            }
        }
    }

    if ($resolvedId === null || $resolvedId <= 0 || $resolvedName === '') {
        throw new RuntimeException('Payment status configuration is incomplete.');
    }

    $stmt = $conn->prepare(
        'SELECT Status_name
         FROM status
         WHERE Status_id = :status_id
         LIMIT 1'
    );
    $stmt->execute([':status_id' => $resolvedId]);
    $dbStatusName = trim((string)($stmt->fetchColumn() ?: ''));

    return [
        'id' => $resolvedId,
        'name' => $dbStatusName !== '' ? $dbStatusName : $resolvedName,
    ];
}

function normalizePaymentStatusKey(?string $statusName): string
{
    return strtolower(trim((string)$statusName));
}

function findLatestPaymentForAppointment(PDO $conn, int $appointmentId, int $clientId): ?array
{
    if ($appointmentId <= 0 || $clientId <= 0) {
        return null;
    }

    $stmt = $conn->prepare(
        'SELECT p.payment_ID,
                p.Status_ID,
                st.Status_name
         FROM payment p
         LEFT JOIN status st ON st.Status_id = p.Status_ID
         WHERE p.appointment_ID = :appointment_id
           AND p.Client_ID = :client_id
         ORDER BY p.payment_ID DESC
         LIMIT 1'
    );
    $stmt->execute([
        ':appointment_id' => $appointmentId,
        ':client_id' => $clientId,
    ]);

    $row = $stmt->fetch(PDO::FETCH_ASSOC) ?: null;
    return $row ?: null;
}

function findOwnedAppointment(PDO $conn, int $appointmentId, int $clientId): ?array
{
    if ($appointmentId <= 0 || $clientId <= 0) {
        return null;
    }

    monitoring_require_schema_columns(
        $conn,
        'appointment',
        ['Appointment_ID', 'Client_ID'],
        'payment submission'
    );

    $stmt = $conn->prepare(
        'SELECT Appointment_ID, Client_ID
         FROM appointment
         WHERE Appointment_ID = :appointment_id
           AND Client_ID = :client_id
         LIMIT 1'
    );
    $stmt->execute([
        ':appointment_id' => $appointmentId,
        ':client_id' => $clientId,
    ]);

    $row = $stmt->fetch(PDO::FETCH_ASSOC) ?: null;
    return $row ?: null;
}

try {
    $requestMethod = strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? ''));
    if ($requestMethod !== 'POST') {
        respond(405, ['success' => false, 'message' => 'Method not allowed.']);
    }

    $sessionUser = monitoring_require_roles([MONITORING_ROLE_CLIENT]);
    $clientId = (int)($sessionUser['client_id'] ?? 0);
    $userId = (int)($sessionUser['id'] ?? 0);

    if ($clientId <= 0) {
        respond(403, ['success' => false, 'message' => 'Client account could not be resolved.']);
    }

    $paymentTypeRaw = trim((string)($_POST['payment_type_id'] ?? ''));
    if ($paymentTypeRaw === '' || !ctype_digit($paymentTypeRaw)) {
        respond(400, ['success' => false, 'message' => 'payment_type_id is required.']);
    }
    $appointmentRaw = trim((string)($_POST['appointment_id'] ?? ''));
    if ($appointmentRaw !== '' && !ctype_digit($appointmentRaw)) {
        respond(400, ['success' => false, 'message' => 'appointment_id must be a valid appointment id.']);
    }

    if (!isset($_FILES['receipt'])) {
        respond(400, ['success' => false, 'message' => 'Please upload a payment receipt image.']);
    }

    $paymentTypeId = (int)$paymentTypeRaw;
    $appointmentId = $appointmentRaw !== '' ? (int)$appointmentRaw : null;

    $conn->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    monitoring_require_schema_columns(
        $conn,
        'payment',
        ['payment_ID', 'Client_ID', 'appointment_ID', 'payment_type_ID', 'screenshot', 'Status_ID', 'action_by', 'Date'],
        'payment submission'
    );
    monitoring_require_schema_columns(
        $conn,
        'payment_type',
        ['payment_type_ID', 'type_name', 'description'],
        'payment submission'
    );

    $paymentType = findPaymentType($conn, $paymentTypeId);
    if ($paymentType === null) {
        respond(404, ['success' => false, 'message' => 'Selected payment method was not found.']);
    }
    if ($appointmentId !== null && findOwnedAppointment($conn, $appointmentId, $clientId) === null) {
        respond(404, ['success' => false, 'message' => 'Selected appointment was not found.']);
    }

    if ($appointmentId !== null) {
        $latestPayment = findLatestPaymentForAppointment($conn, $appointmentId, $clientId);
        $latestStatusKey = normalizePaymentStatusKey($latestPayment['Status_name'] ?? '');

        if ($latestStatusKey === 'processing') {
            respond(409, ['success' => false, 'message' => 'This payment is already under review.']);
        }
        if ($latestStatusKey === 'paid') {
            respond(409, ['success' => false, 'message' => 'This appointment has already been marked as paid.']);
        }
    }

    $processingStatus = resolvePaymentStatus($conn, ['Processing']);
    $receiptPath = storePaymentReceiptImage($_FILES['receipt'], $clientId);
    $paymentDate = (new DateTimeImmutable('now', new DateTimeZone('Asia/Manila')))->format('Y-m-d');

    try {
        $conn->beginTransaction();

        $insert = $conn->prepare(
            'INSERT INTO payment (Client_ID, appointment_ID, payment_type_ID, screenshot, Status_ID, action_by, Date)
             VALUES (:client_id, :appointment_id, :payment_type_id, :screenshot, :status_id, :action_by, :payment_date)'
        );
        $insert->execute([
            ':client_id' => $clientId,
            ':appointment_id' => $appointmentId,
            ':payment_type_id' => $paymentTypeId,
            ':screenshot' => $receiptPath,
            ':status_id' => $processingStatus['id'],
            ':action_by' => $userId > 0 ? $userId : null,
            ':payment_date' => $paymentDate,
        ]);

        $paymentId = (int)$conn->lastInsertId();
        $conn->commit();
    } catch (Throwable $e) {
        if ($conn->inTransaction()) {
            $conn->rollBack();
        }

        $fullPath = backendBaseDirectory() . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $receiptPath);
        if (is_file($fullPath)) {
            @unlink($fullPath);
        }

        throw $e;
    }

    respond(200, [
        'success' => true,
        'message' => 'Payment receipt uploaded successfully. Status updated to Processing.',
        'payment' => [
            'id' => $paymentId,
            'client_id' => $clientId,
            'appointment_id' => $appointmentId,
            'payment_type_id' => $paymentTypeId,
            'payment_method_name' => (string)($paymentType['name'] ?? ''),
            'screenshot' => $receiptPath,
            'status_id' => $processingStatus['id'],
            'status_name' => $processingStatus['name'],
            'date' => $paymentDate,
        ],
    ]);
} catch (InvalidArgumentException $e) {
    respond(422, ['success' => false, 'message' => $e->getMessage()]);
} catch (RuntimeException $e) {
    respond(500, ['success' => false, 'message' => $e->getMessage()]);
} catch (Throwable $e) {
    error_log('payment_create error: ' . $e->getMessage());
    respond(500, ['success' => false, 'message' => 'Server error']);
}
