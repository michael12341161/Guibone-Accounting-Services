<?php
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/connection-pdo.php';

monitoring_bootstrap_api(['POST', 'OPTIONS']);

function respond($code, $payload) {
    http_response_code($code);
    echo json_encode($payload);
    exit;
}

function quoteIdentifier(string $name): string {
    return '`' . str_replace('`', '``', $name) . '`';
}

function appointmentHasDescriptionColumn(PDO $conn): bool {
    static $cached = null;
    if ($cached !== null) {
        return $cached;
    }

    try {
        $check = $conn->query("SHOW COLUMNS FROM appointment LIKE 'Description'");
        $cached = (bool)($check && $check->fetch(PDO::FETCH_ASSOC));
    } catch (Throwable $e) {
        $cached = false;
    }

    return $cached;
}

function normalizeAppointmentStatus(string $statusInput): string {
    $value = strtolower(trim($statusInput));
    $aliases = [
        'approve' => 'approved',
        'active' => 'approved',
        'started' => 'approved',
        'in progress' => 'approved',
        'complete' => 'approved',
        'completed' => 'approved',
        'done' => 'approved',
        'reject' => 'rejected',
        'rejected' => 'rejected',
        'decline' => 'rejected',
        'declined' => 'rejected',
        'cancelled' => 'rejected',
        'canceled' => 'rejected',
        'not started' => 'pending',
    ];
    return isset($aliases[$value]) ? $aliases[$value] : $value;
}

function resolveAppointmentPendingStatusIds(PDO $conn): array {
    static $cached = null;
    if ($cached !== null) {
        return $cached;
    }

    $ids = [];
    try {
        $stmt = $conn->query(
            'SELECT Status_id
             FROM status
             WHERE Status_group = "APPOINTMENT"
               AND LOWER(Status_name) IN ("pending", "not started")'
        );
        while (($value = $stmt->fetchColumn()) !== false) {
            $id = (int)$value;
            if ($id > 0) {
                $ids[] = $id;
            }
        }
    } catch (Throwable $__) {
        // Fall back to defaults below.
    }

    if (!$ids) {
        $ids[] = 6;
    }

    $cached = array_values(array_unique($ids));
    return $cached;
}

function resolveRejectedAppointmentStatusId(PDO $conn): int {
    try {
        $stmt = $conn->prepare(
            'SELECT Status_id
             FROM status
             WHERE Status_group = "APPOINTMENT"
               AND LOWER(Status_name) IN ("reject", "rejected", "declined", "cancelled")
             LIMIT 1'
        );
        $stmt->execute();
        $id = (int)($stmt->fetchColumn() ?: 0);
        if ($id > 0) {
            return $id;
        }
    } catch (Throwable $__) {
        // Fall back below.
    }

    return 8;
}

function sanitizeAppointmentNotes($value): string {
    $normalized = trim((string)$value);
    if ($normalized === '') {
        return '';
    }

    return trim((string)preg_replace('/[\r\n]+/', ' ', $normalized));
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

function fetchLatestPaymentRecordByAppointment(PDO $conn, int $appointmentId): ?array
{
    if ($appointmentId <= 0) {
        return null;
    }

    $stmt = $conn->prepare(
        'SELECT payment_ID, appointment_ID, Status_ID, action_by
         FROM payment
         WHERE appointment_ID = :appointment_id
         ORDER BY payment_ID DESC
         LIMIT 1'
    );
    $stmt->execute([':appointment_id' => $appointmentId]);

    $row = $stmt->fetch(PDO::FETCH_ASSOC) ?: null;
    return $row ?: null;
}

function upsertDescriptionMetaLine(string $description, string $key, string $value): string {
    $normalizedDescription = str_replace(["\r\n", "\r"], "\n", (string)$description);
    $pattern = '/^\s*\[' . preg_quote($key, '/') . '\]\s*[^\n]*\n?/im';
    $withoutKey = preg_replace($pattern, '', $normalizedDescription);
    $withoutKey = trim((string)preg_replace("/\n{3,}/", "\n\n", (string)$withoutKey));
    $trimmedValue = trim($value);

    if ($trimmedValue === '') {
        return $withoutKey;
    }

    $nextLine = '[' . $key . '] ' . $trimmedValue;
    if ($withoutKey === '') {
        return $nextLine;
    }

    return $withoutKey . "\n" . $nextLine;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    respond(405, ['success' => false, 'message' => 'Method not allowed']);
}

try {
    $sessionUser = monitoring_require_auth();
    $conn->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

    $raw = file_get_contents('php://input');
    $data = json_decode($raw, true);
    if (!is_array($data)) {
        respond(400, ['success' => false, 'message' => 'Invalid JSON payload']);
    }

    $appointmentId = isset($data['appointment_id']) ? (int)$data['appointment_id'] : 0;
    $date = trim((string)($data['date'] ?? ''));
    $time = trim((string)($data['time'] ?? ''));
    $meetingType = trim((string)($data['meeting_type'] ?? ''));
    $notes = sanitizeAppointmentNotes($data['notes'] ?? '');
    $paymentStatusInput = trim((string)($data['payment_status'] ?? ''));

    if ($appointmentId <= 0) {
        respond(422, ['success' => false, 'message' => 'appointment_id is required']);
    }
    if ($date === '' || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) {
        respond(422, ['success' => false, 'message' => 'date must be YYYY-MM-DD']);
    }
    if ($time === '' || !preg_match('/^\d{2}:\d{2}(:\d{2})?$/', $time)) {
        respond(422, ['success' => false, 'message' => 'time must be HH:MM or HH:MM:SS']);
    }
    if (preg_match('/^\d{2}:\d{2}:\d{2}$/', $time)) {
        $time = substr($time, 0, 5);
    }
    if ($meetingType !== '' && !in_array($meetingType, ['Online', 'Onsite'], true)) {
        respond(422, ['success' => false, 'message' => 'meeting_type must be Online or Onsite']);
    }

    $descriptionColumnExists = appointmentHasDescriptionColumn($conn);
    $checkSql =
        'SELECT a.Appointment_ID,
                a.Client_ID,
                a.Services_type_Id,
                a.Status_ID,
                a.Date,' .
        ($descriptionColumnExists ? ' a.Description,' : ' NULL AS Description,') .
        ' s.Status_name AS current_status_name
         FROM appointment a
         LEFT JOIN status s
           ON s.Status_id = a.Status_ID
          AND s.Status_group = "APPOINTMENT"
         WHERE a.Appointment_ID = :id
         LIMIT 1';
    $check = $conn->prepare($checkSql);
    $check->execute([':id' => $appointmentId]);
    $appointmentRow = $check->fetch(PDO::FETCH_ASSOC);
    if (!$appointmentRow) {
        respond(404, ['success' => false, 'message' => 'Appointment not found']);
    }

    monitoring_require_client_access((int)($appointmentRow['Client_ID'] ?? 0), [MONITORING_ROLE_ADMIN, MONITORING_ROLE_SECRETARY]);

    $currentStatus = normalizeAppointmentStatus((string)($appointmentRow['current_status_name'] ?? ''));
    $isPendingAppointment =
        $currentStatus === 'pending' ||
        in_array((int)($appointmentRow['Status_ID'] ?? 0), resolveAppointmentPendingStatusIds($conn), true);
    if (!$isPendingAppointment) {
        respond(409, ['success' => false, 'message' => 'Only pending appointments can be edited.']);
    }

    $duplicate = $conn->prepare(
        'SELECT Appointment_ID
         FROM appointment
         WHERE Client_ID = :client_id
           AND Services_type_Id = :service_id
           AND Date = :date
           AND Appointment_ID <> :appointment_id
           AND Status_ID <> :rejected_status_id
         LIMIT 1'
    );
    $duplicate->execute([
        ':client_id' => (int)($appointmentRow['Client_ID'] ?? 0),
        ':service_id' => (int)($appointmentRow['Services_type_Id'] ?? 0),
        ':date' => $date,
        ':appointment_id' => $appointmentId,
        ':rejected_status_id' => resolveRejectedAppointmentStatusId($conn),
    ]);
    if ($duplicate->fetchColumn()) {
        respond(409, ['success' => false, 'message' => 'An appointment for this service and date already exists.']);
    }

    $nextPaymentStatus = null;
    $latestPaymentRow = null;
    if ($paymentStatusInput !== '') {
        $nextPaymentStatus = resolvePaymentStatusRecord($conn, $paymentStatusInput);
        if ($nextPaymentStatus === null) {
            respond(422, ['success' => false, 'message' => 'Unsupported payment status.']);
        }

        $latestPaymentRow = fetchLatestPaymentRecordByAppointment($conn, $appointmentId);
        if ($latestPaymentRow === null) {
            respond(409, ['success' => false, 'message' => 'No payment record exists for this appointment yet.']);
        }
    }

    $updateColumns = [quoteIdentifier('Date') . ' = :date'];
    $params = [
        ':date' => $date,
        ':appointment_id' => $appointmentId,
    ];

    if ($descriptionColumnExists) {
        $description = (string)($appointmentRow['Description'] ?? '');
        $description = upsertDescriptionMetaLine($description, 'Appointment_Type', $meetingType);
        $description = upsertDescriptionMetaLine($description, 'Time', $time);
        $description = upsertDescriptionMetaLine($description, 'Notes', $notes);
        $updateColumns[] = 'Description = :description';
        $params[':description'] = $description !== '' ? $description : null;
    }

    $conn->beginTransaction();

    $update = $conn->prepare(
        'UPDATE appointment
         SET ' . implode(', ', $updateColumns) . '
         WHERE Appointment_ID = :appointment_id'
    );
    $update->execute($params);

    if ($nextPaymentStatus !== null && $latestPaymentRow !== null) {
        $paymentUpdate = $conn->prepare(
            'UPDATE payment
             SET Status_ID = :status_id,
                 action_by = :action_by
             WHERE payment_ID = :payment_id
             LIMIT 1'
        );
        $paymentUpdate->execute([
            ':status_id' => $nextPaymentStatus['id'],
            ':action_by' => isset($sessionUser['id']) ? (int)$sessionUser['id'] : null,
            ':payment_id' => (int)$latestPaymentRow['payment_ID'],
        ]);
    }

    $conn->commit();

    respond(200, [
        'success' => true,
        'message' => $nextPaymentStatus !== null
            ? 'Appointment and payment status updated successfully.'
            : 'Appointment updated successfully.',
    ]);
} catch (Throwable $e) {
    if (isset($conn) && $conn instanceof PDO && $conn->inTransaction()) {
        $conn->rollBack();
    }
    error_log('appointment_update error: ' . $e->getMessage());
    respond(500, ['success' => false, 'message' => 'Server error']);
}
