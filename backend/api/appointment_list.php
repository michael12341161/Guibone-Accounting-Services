<?php
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/connection-pdo.php';

monitoring_bootstrap_api(['GET', 'OPTIONS']);

function respond($code, $payload) {
    http_response_code($code);
    echo json_encode($payload);
    exit;
}

function quoteIdentifier(string $name): string {
    return '`' . str_replace('`', '``', $name) . '`';
}

function statusLabel(string $statusName): string {
    $name = strtolower(trim($statusName));
    if ($name === 'started' || $name === 'in progress' || $name === 'approved' || $name === 'active') {
        return 'Approved';
    }
    if ($name === 'reject' || $name === 'rejected' || $name === 'cancelled' || $name === 'declined' || $name === 'canceled') {
        return 'Declined';
    }
    if ($name === 'completed' || $name === 'done') {
        return 'Completed';
    }
    if ($name === '' || $name === 'not started' || $name === 'pending') {
        return 'Pending';
    }
    return ucfirst($statusName);
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

function documentsHasAppointmentColumn(PDO $conn): bool {
    static $cached = null;
    if ($cached !== null) {
        return $cached;
    }

    try {
        $check = $conn->query("SHOW COLUMNS FROM documents LIKE 'appointment_id'");
        $cached = (bool)($check && $check->fetch(PDO::FETCH_ASSOC));
    } catch (Throwable $e) {
        $cached = false;
    }

    return $cached;
}

function resolveAppointmentActionColumn(PDO $conn): ?string {
    static $cached = null;
    if ($cached !== null) {
        return $cached !== '' ? $cached : null;
    }

    foreach (['action_by', 'User_ID'] as $column) {
        try {
            $stmt = $conn->prepare('SHOW COLUMNS FROM `appointment` LIKE :column');
            $stmt->execute([':column' => $column]);
            if ($stmt->fetch(PDO::FETCH_ASSOC)) {
                $cached = $column;
                return $cached;
            }
        } catch (Throwable $__) {
            // Try the next candidate.
        }
    }

    $cached = '';
    return null;
}

function resolveOptionalServiceAmountColumn(PDO $conn): ?string {
    static $cached = null;
    if ($cached !== null) {
        return $cached !== '' ? $cached : null;
    }

    $preferredColumns = [
        'price',
        'amount',
        'fee',
        'cost',
        'service_price',
        'service_amount',
    ];

    try {
        $stmt = $conn->query('SHOW COLUMNS FROM `services_type`');
        $rows = $stmt ? ($stmt->fetchAll(PDO::FETCH_ASSOC) ?: []) : [];
        $available = [];

        foreach ($rows as $row) {
            $field = trim((string)($row['Field'] ?? ''));
            if ($field === '') {
                continue;
            }

            $available[strtolower($field)] = $field;
        }

        foreach ($preferredColumns as $candidate) {
            if (isset($available[$candidate])) {
                $cached = $available[$candidate];
                return $cached;
            }
        }
    } catch (Throwable $__) {
        // Pricing columns are optional, so fall through silently.
    }

    $cached = '';
    return null;
}

function normalizeMoneyValue($value): ?float {
    if ($value === null) {
        return null;
    }

    if (is_int($value) || is_float($value)) {
        $numericValue = (float)$value;
        return is_finite($numericValue) ? round($numericValue, 2) : null;
    }

    $raw = trim((string)$value);
    if ($raw === '') {
        return null;
    }

    $normalized = str_replace([',', ' '], '', $raw);
    if (!preg_match('/^-?\d+(?:\.\d+)?$/', $normalized)) {
        return null;
    }

    $numericValue = (float)$normalized;
    return is_finite($numericValue) ? round($numericValue, 2) : null;
}

function resolveDefaultPaymentStatus(PDO $conn): array {
    static $cached = null;
    if (is_array($cached)) {
        return $cached;
    }

    $cached = [
        'id' => null,
        'name' => '',
    ];

    try {
        $stmt = $conn->query(
            "SELECT Status_id, Status_name
             FROM status
             WHERE Status_group = 'PAYMENT'
               AND LOWER(Status_name) = 'pending'
             ORDER BY Status_id ASC
             LIMIT 1"
        );
        $row = $stmt ? ($stmt->fetch(PDO::FETCH_ASSOC) ?: null) : null;

        if ($row === null) {
            $fallbackStmt = $conn->query(
                "SELECT Status_id, Status_name
                 FROM status
                 WHERE Status_group = 'PAYMENT'
                 ORDER BY Status_id ASC
                 LIMIT 1"
            );
            $row = $fallbackStmt ? ($fallbackStmt->fetch(PDO::FETCH_ASSOC) ?: null) : null;
        }

        if (is_array($row)) {
            $cached = [
                'id' => isset($row['Status_id']) ? (int)$row['Status_id'] : null,
                'name' => trim((string)($row['Status_name'] ?? '')),
            ];
        }
    } catch (Throwable $__) {
        // Payment status metadata is optional here; empty fallback is fine.
    }

    return $cached;
}

function fetchLatestPaymentsByAppointment(PDO $conn, array $appointmentIds): array {
    $ids = array_values(array_unique(array_filter(array_map(static function ($value) {
        $id = (int)$value;
        return $id > 0 ? $id : null;
    }, $appointmentIds))));

    if (empty($ids)) {
        return [];
    }

    $placeholders = implode(',', array_fill(0, count($ids), '?'));
    $sql = "
        SELECT p.payment_ID,
               p.appointment_ID,
               p.payment_type_ID,
               p.screenshot,
               p.Status_ID,
               p.Date,
               pt.type_name AS payment_method_name,
               st.Status_name AS payment_status_name
        FROM payment p
        INNER JOIN (
            SELECT appointment_ID, MAX(payment_ID) AS latest_payment_id
            FROM payment
            WHERE appointment_ID IN ({$placeholders})
            GROUP BY appointment_ID
        ) latest ON latest.latest_payment_id = p.payment_ID
        LEFT JOIN payment_type pt ON pt.payment_type_ID = p.payment_type_ID
        LEFT JOIN status st ON st.Status_id = p.Status_ID
    ";

    try {
        $stmt = $conn->prepare($sql);
        $stmt->execute($ids);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];
    } catch (Throwable $__) {
        return [];
    }

    $paymentsByAppointment = [];
    foreach ($rows as $row) {
        $appointmentId = isset($row['appointment_ID']) ? (int)$row['appointment_ID'] : 0;
        if ($appointmentId <= 0) {
            continue;
        }

        $paymentsByAppointment[$appointmentId] = [
            'id' => isset($row['payment_ID']) ? (int)$row['payment_ID'] : null,
            'appointment_id' => $appointmentId,
            'payment_type_id' => isset($row['payment_type_ID']) ? (int)$row['payment_type_ID'] : null,
            'payment_method_name' => trim((string)($row['payment_method_name'] ?? '')) ?: null,
            'screenshot' => trim((string)($row['screenshot'] ?? '')) ?: null,
            'status_id' => isset($row['Status_ID']) ? (int)$row['Status_ID'] : null,
            'status_name' => trim((string)($row['payment_status_name'] ?? '')) ?: null,
            'date' => trim((string)($row['Date'] ?? '')) ?: null,
        ];
    }

    return $paymentsByAppointment;
}

function processingDocumentCatalog(): array {
    return [
        'business_permit' => 'Business Permit',
        'dti' => 'DTI',
        'sec' => 'SEC',
        'lgu' => 'LGU',
    ];
}

function normalizeProcessingDocumentKey(string $value): string {
    $normalized = strtolower(trim($value));
    $normalized = preg_replace('/[^a-z0-9]+/', '_', $normalized);
    $normalized = trim((string)$normalized, '_');

    if ($normalized === 'businesspermit') {
        return 'business_permit';
    }

    return $normalized;
}

function readDescriptionMetaLines(string $text, string $key): array {
    $source = trim($text);
    if ($source === '') {
        return [];
    }

    $escapedKey = preg_quote($key, '/');
    if (!preg_match_all('/^\s*\[' . $escapedKey . '\]\s*([^\r\n]*)\s*$/im', $source, $matches)) {
        return [];
    }

    return array_values(array_filter(array_map(static function ($value) {
        return trim((string)$value);
    }, $matches[1]), static function ($value) {
        return $value !== '';
    }));
}

function readDescriptionMetaValue(string $text, string $key): ?string {
    $values = readDescriptionMetaLines($text, $key);
    if (empty($values)) {
        return null;
    }

    $lastValue = trim((string)$values[count($values) - 1]);
    return $lastValue !== '' ? $lastValue : null;
}

function extractProcessingDocuments(string $description): array {
    $catalog = processingDocumentCatalog();
    $resolved = [];
    $rawValues = array_merge(
        readDescriptionMetaLines($description, 'Processing_Document'),
        readDescriptionMetaLines($description, 'Processing_Documents')
    );

    foreach ($rawValues as $rawValue) {
        $parts = preg_split('/\s*,\s*/', $rawValue) ?: [];
        foreach ($parts as $part) {
            $key = normalizeProcessingDocumentKey((string)$part);
            if ($key === '' || !isset($catalog[$key]) || isset($resolved[$key])) {
                continue;
            }

            $resolved[$key] = $catalog[$key];
        }
    }

    return $resolved;
}

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    respond(405, ['success' => false, 'message' => 'Method not allowed']);
}

try {
    $sessionUser = monitoring_require_auth();
    $conn->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $hasDescription = appointmentHasDescriptionColumn($conn);
    $descriptionSelect = $hasDescription
        ? 'a.Description AS Appointment_description,'
        : 'NULL AS Appointment_description,';
    $hasDocuments = documentsHasAppointmentColumn($conn);
    $documentSelect = $hasDocuments
        ? 'd.Documents_ID AS Document_ID, d.filename AS Document_filename, d.filepath AS Document_filepath,'
        : 'NULL AS Document_ID, NULL AS Document_filename, NULL AS Document_filepath,';
    $documentJoin = $hasDocuments
        ? "LEFT JOIN (
            SELECT d1.Documents_ID, d1.appointment_id, d1.filename, d1.filepath
            FROM documents d1
            INNER JOIN (
                SELECT appointment_id, MAX(Documents_ID) AS latest_id
                FROM documents
                GROUP BY appointment_id
            ) d2 ON d2.latest_id = d1.Documents_ID
        ) d ON d.appointment_id = a.Appointment_ID"
        : "";
    $actionColumn = resolveAppointmentActionColumn($conn);
    $actionSelect = 'NULL AS Action_by,
               NULL AS action_by,
               NULL AS User_ID,
               NULL AS action_by_name,
               NULL AS action_by_username,';
    $actionJoin = '';
    if ($actionColumn !== null) {
        $actionColumnExpr = 'a.' . quoteIdentifier($actionColumn);
        $actorNameExpr = "NULLIF(TRIM(CONCAT_WS(' ', NULLIF(TRIM(au.first_name), ''), NULLIF(TRIM(au.middle_name), ''), NULLIF(TRIM(au.last_name), ''))), '')";
        $actionSelect = "{$actionColumnExpr} AS Action_by,
               {$actionColumnExpr} AS action_by,
               {$actionColumnExpr} AS User_ID,
               COALESCE({$actorNameExpr}, NULLIF(TRIM(au.Username), ''), CASE WHEN {$actionColumnExpr} IS NOT NULL THEN CONCAT('User #', {$actionColumnExpr}) ELSE NULL END) AS action_by_name,
               au.Username AS action_by_username,";
        $actionJoin = "LEFT JOIN user au ON au.User_id = {$actionColumnExpr}";
    }
    $serviceAmountColumn = resolveOptionalServiceAmountColumn($conn);
    $serviceAmountSelect = $serviceAmountColumn !== null
        ? 's.' . quoteIdentifier($serviceAmountColumn) . ' AS Service_amount,'
        : 'NULL AS Service_amount,';
    $defaultPaymentStatus = resolveDefaultPaymentStatus($conn);

    $clientId = isset($_GET['client_id']) ? (int)$_GET['client_id'] : 0;
    $appointmentId = isset($_GET['appointment_id']) ? (int)$_GET['appointment_id'] : 0;
    $roleId = (int)($sessionUser['role_id'] ?? 0);
    if ($roleId === MONITORING_ROLE_CLIENT) {
        $clientId = (int)($sessionUser['client_id'] ?? 0);
        if ($clientId <= 0) {
            monitoring_auth_respond(403, ['success' => false, 'message' => 'Access denied.']);
        }
    } elseif (!monitoring_user_has_role_or_any_module_access(
        $conn,
        $sessionUser,
        [MONITORING_ROLE_ADMIN, MONITORING_ROLE_SECRETARY],
        ['appointments', 'reports', ['module' => 'tasks', 'action' => 'client-appointments']]
    )) {
        monitoring_auth_respond(403, ['success' => false, 'message' => 'Access denied.']);
    }
    if (session_status() === PHP_SESSION_ACTIVE) {
        session_write_close();
    }

    if ($roleId !== MONITORING_ROLE_CLIENT && $clientId <= 0 && isset($_GET['client_username'])) {
        $username = trim((string)$_GET['client_username']);
        if ($username !== '') {
            $lookup = $conn->prepare(
                'SELECT c.Client_ID
                 FROM client c
                 INNER JOIN user u ON u.User_id = c.User_id
                 WHERE u.Username = :u
                 LIMIT 1'
            );
            $lookup->execute([':u' => $username]);
            $resolved = (int)($lookup->fetchColumn() ?: 0);
            if ($resolved > 0) {
                $clientId = $resolved;
            }
        }
    }

    $params = [];
    $conditions = [];
    if ($clientId > 0) {
        $conditions[] = 'a.Client_ID = :cid';
        $params[':cid'] = $clientId;
    }
    if ($appointmentId > 0) {
        $conditions[] = 'a.Appointment_ID = :appointment_id';
        $params[':appointment_id'] = $appointmentId;
    }
    $where = !empty($conditions) ? 'WHERE ' . implode(' AND ', $conditions) : '';

    $sql = "
        SELECT a.Appointment_ID,
               a.Client_ID,
               a.Services_type_Id AS service_id,
               a.Status_ID,
               {$actionSelect}
               a.Date,
               {$descriptionSelect}
               {$documentSelect}
               s.Name AS Service_name,
               {$serviceAmountSelect}
               st.Status_name,
               CONCAT_WS(' ', c.First_name, c.Middle_name, c.Last_name) AS Client_name,
               u.Username AS client_username,
               u.Email AS client_email
        FROM appointment a
        LEFT JOIN services_type s ON s.Services_type_Id = a.Services_type_Id
        LEFT JOIN status st ON st.Status_id = a.Status_ID
        LEFT JOIN client c ON c.Client_ID = a.Client_ID
        LEFT JOIN user u ON u.User_id = c.User_id
        {$actionJoin}
        {$documentJoin}
        {$where}
        ORDER BY a.Date DESC, a.Appointment_ID DESC
    ";

    $stmt = $conn->prepare($sql);
    $stmt->execute($params);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];

    $appointmentIds = array_values(array_unique(array_filter(array_map(function ($row) {
        return isset($row['Appointment_ID']) ? (int)$row['Appointment_ID'] : 0;
    }, $rows))));
    $latestPaymentsByAppointment = fetchLatestPaymentsByAppointment($conn, $appointmentIds);
    $attachmentsByAppointment = [];
    if ($hasDocuments && !empty($appointmentIds)) {
        $docPlaceholders = implode(',', array_fill(0, count($appointmentIds), '?'));
        $docSql = "
            SELECT Documents_ID, appointment_id, filename, filepath
            FROM documents
            WHERE appointment_id IN ({$docPlaceholders})
            ORDER BY appointment_id ASC, Documents_ID ASC
        ";
        $docStmt = $conn->prepare($docSql);
        $docStmt->execute($appointmentIds);
        $docRows = $docStmt->fetchAll(PDO::FETCH_ASSOC) ?: [];

        foreach ($docRows as $docRow) {
            $aid = isset($docRow['appointment_id']) ? (int)$docRow['appointment_id'] : 0;
            if ($aid <= 0) {
                continue;
            }

            if (!isset($attachmentsByAppointment[$aid])) {
                $attachmentsByAppointment[$aid] = [];
            }

            $docPath = isset($docRow['filepath']) ? trim((string)$docRow['filepath']) : '';
            if ($docPath === '') {
                continue;
            }

            $docFilename = isset($docRow['filename']) ? trim((string)$docRow['filename']) : '';
            if ($docFilename === '') {
                $docFilename = basename($docPath);
            }

            $attachmentsByAppointment[$aid][] = [
                'document_id' => isset($docRow['Documents_ID']) ? (int)$docRow['Documents_ID'] : null,
                'filename' => $docFilename,
                'filepath' => $docPath,
                'path' => $docPath,
            ];
        }
    }

    $appointments = array_map(function ($row) use ($attachmentsByAppointment, $defaultPaymentStatus, $latestPaymentsByAppointment) {
        $appointmentId = isset($row['Appointment_ID']) ? (int)$row['Appointment_ID'] : null;
        $statusName = isset($row['Status_name']) ? (string)$row['Status_name'] : '';
        $normalized = statusLabel($statusName);
        $serviceName = isset($row['Service_name']) ? (string)$row['Service_name'] : 'Appointment';
        $serviceAmount = normalizeMoneyValue($row['Service_amount'] ?? null);
        $date = isset($row['Date']) ? (string)$row['Date'] : null;
        $description = isset($row['Appointment_description']) ? trim((string)$row['Appointment_description']) : '';
        $createdAt = readDescriptionMetaValue($description, 'CreatedAt');
        $documentId = isset($row['Document_ID']) && $row['Document_ID'] !== null ? (int)$row['Document_ID'] : null;
        $documentFilename = isset($row['Document_filename']) ? trim((string)$row['Document_filename']) : '';
        $attachmentPath = isset($row['Document_filepath']) ? trim((string)$row['Document_filepath']) : '';
        $attachmentList = ($appointmentId !== null && isset($attachmentsByAppointment[$appointmentId]))
            ? $attachmentsByAppointment[$appointmentId]
            : [];
        $paymentRecord = ($appointmentId !== null && isset($latestPaymentsByAppointment[$appointmentId]))
            ? $latestPaymentsByAppointment[$appointmentId]
            : null;
        $paymentExists = is_array($paymentRecord);
        $paymentStatusId = $paymentExists
            ? ($paymentRecord['status_id'] ?? null)
            : ($defaultPaymentStatus['id'] ?? null);
        $paymentStatusName = trim((string)($paymentRecord['status_name'] ?? ($defaultPaymentStatus['name'] ?? '')));
        if ($paymentStatusName === '') {
            $paymentStatusName = null;
        }
        $selectedServices = [[
            'id' => isset($row['service_id']) ? (int)$row['service_id'] : null,
            'name' => $serviceName,
            'price' => $serviceAmount,
        ]];

        if (empty($attachmentList) && $attachmentPath !== '') {
            $attachmentList[] = [
                'document_id' => $documentId,
                'filename' => $documentFilename !== '' ? $documentFilename : basename($attachmentPath),
                'filepath' => $attachmentPath,
                'path' => $attachmentPath,
            ];
        }

        if ($description === '') {
            $description = "[Service] {$serviceName}";
        }
        $processingDocuments = extractProcessingDocuments($description);
        foreach ($attachmentList as $attachmentItem) {
            $path = isset($attachmentItem['path']) ? trim((string)$attachmentItem['path']) : '';
            if ($path !== '' && strpos($description, "[Attachment] {$path}") === false) {
                $description .= "\n[Attachment] {$path}";
            }
        }

        return [
            'id' => $appointmentId,
            'Appointment_ID' => $appointmentId,
            'client_id' => isset($row['Client_ID']) ? (int)$row['Client_ID'] : null,
            'Client_ID' => isset($row['Client_ID']) ? (int)$row['Client_ID'] : null,
            'client_name' => $row['Client_name'] ?? null,
            'Client_name' => $row['Client_name'] ?? null,
            'client_username' => $row['client_username'] ?? null,
            'client_email' => $row['client_email'] ?? null,
            'user_id' => isset($row['User_ID']) ? (int)$row['User_ID'] : null,
            'action_by' => isset($row['action_by']) && $row['action_by'] !== null ? (int)$row['action_by'] : null,
            'Action_by' => isset($row['Action_by']) && $row['Action_by'] !== null ? (int)$row['Action_by'] : null,
            'action_by_name' => $row['action_by_name'] ?? null,
            'action_by_username' => $row['action_by_username'] ?? null,

            'service_id' => isset($row['service_id']) ? (int)$row['service_id'] : null,
            'service' => $serviceName,
            'service_name' => $serviceName,
            'Service_name' => $serviceName,
            'service_price' => $serviceAmount,
            'service_amount' => $serviceAmount,
            'selected_services' => $selectedServices,
            'total_amount' => $serviceAmount,
            'processing_documents' => array_keys($processingDocuments),
            'processing_document_labels' => array_values($processingDocuments),

            'date' => $date,
            'Date' => $date,
            'time' => null,
            'Time' => null,
            'created_at' => $createdAt,
            'createdAt' => $createdAt,

            'Status_ID' => isset($row['Status_ID']) ? (int)$row['Status_ID'] : null,
            'Status_name' => $statusName !== '' ? $statusName : 'Pending',
            'status' => $normalized,
            'Status' => $normalized,
            'appointment_status' => $normalized,
            'payment_status_id' => $paymentStatusId,
            'payment_status_name' => $paymentStatusName,
            'payment_status' => $paymentStatusName,
            'payment_exists' => $paymentExists,
            'payment_method_name' => $paymentRecord['payment_method_name'] ?? null,
            'payment_type_id' => $paymentRecord['payment_type_id'] ?? null,
            'payment_date' => $paymentRecord['date'] ?? null,
            'payment_screenshot' => $paymentRecord['screenshot'] ?? null,
            'payment' => [
                'exists' => $paymentExists,
                'id' => $paymentRecord['id'] ?? null,
                'appointment_id' => $appointmentId,
                'payment_type_id' => $paymentRecord['payment_type_id'] ?? null,
                'payment_method_name' => $paymentRecord['payment_method_name'] ?? null,
                'screenshot' => $paymentRecord['screenshot'] ?? null,
                'status_id' => $paymentStatusId,
                'status_name' => $paymentStatusName,
                'date' => $paymentRecord['date'] ?? null,
                'status_source' => $paymentExists ? 'record' : 'default',
            ],
            'document_id' => $documentId,
            'document_filename' => $documentFilename !== '' ? $documentFilename : null,
            'attachment_path' => $attachmentPath !== '' ? $attachmentPath : null,
            'attachment' => $attachmentPath !== '' ? $attachmentPath : null,
            'attachments' => $attachmentList,
            'document_files' => $attachmentList,

            // Compatibility keys consumed by older screens.
            'Name' => $serviceName,
            'description' => $description,
            'Description' => $description,
        ];
    }, $rows);

    respond(200, ['success' => true, 'appointments' => $appointments]);
} catch (Throwable $e) {
    error_log('appointment_list error: ' . $e->getMessage());
    respond(500, ['success' => false, 'message' => 'Server error']);
}
