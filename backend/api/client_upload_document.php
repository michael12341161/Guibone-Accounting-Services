<?php
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/connection-pdo.php';
require_once __DIR__ . '/document_helpers.php';
require_once __DIR__ . '/status_helpers.php';

monitoring_bootstrap_api(['POST', 'OPTIONS']);

function respond($code, $payload) {
    http_response_code($code);
    echo json_encode($payload);
    exit;
}

function quoteIdentifier(string $name): string {
    return '`' . str_replace('`', '``', $name) . '`';
}

function tableExists(PDO $conn, string $table): bool {
    try {
        $stmt = $conn->prepare('SHOW TABLES LIKE :table');
        $stmt->execute([':table' => $table]);
        return (bool)$stmt->fetchColumn();
    } catch (Throwable $__) {
        return false;
    }
}

function getColumnInfo(PDO $conn, string $table, string $column): ?array {
    try {
        $sql = 'SHOW COLUMNS FROM ' . quoteIdentifier($table) . ' LIKE :column';
        $stmt = $conn->prepare($sql);
        $stmt->execute([':column' => $column]);
        return $stmt->fetch(PDO::FETCH_ASSOC) ?: null;
    } catch (Throwable $__) {
        return null;
    }
}

function isNullableOrHasDefault(?array $column): bool {
    if ($column === null) {
        return true;
    }

    return strtoupper((string)($column['Null'] ?? 'NO')) === 'YES' || (($column['Default'] ?? null) !== null);
}

function syncLatestBusinessStatusFromDocument(PDO $conn, int $clientId, int $documentTypeId): void {
    if ($clientId <= 0 || $documentTypeId <= 0) {
        return;
    }
    if (!in_array($documentTypeId, monitoring_document_business_permit_type_ids($conn), true)) {
        return;
    }
    if (!tableExists($conn, 'business')) {
        return;
    }

    $businessStatusColumn = getColumnInfo($conn, 'business', 'Status_id');
    if ($businessStatusColumn === null) {
        return;
    }

    $registeredStatusId = monitoring_resolve_business_status_id($conn, 'Registered');
    if ($registeredStatusId === null) {
        return;
    }

    $businessIdStmt = $conn->prepare(
        'SELECT Business_id
         FROM business
         WHERE Client_ID = :client_id
         ORDER BY Business_id DESC
         LIMIT 1'
    );
    $businessIdStmt->execute([':client_id' => $clientId]);
    $businessId = (int)($businessIdStmt->fetchColumn() ?: 0);
    if ($businessId <= 0) {
        return;
    }

    $update = $conn->prepare(
        'UPDATE business
         SET Status_id = :status_id
         WHERE Business_id = :business_id'
    );
    $update->execute([
        ':status_id' => $registeredStatusId,
        ':business_id' => $businessId,
    ]);
}

try {
    $requestMethod = strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? ''));
    if ($requestMethod !== 'POST') {
        respond(405, ['success' => false, 'message' => 'Method not allowed']);
    }

    $clientIdRaw = isset($_POST['client_id']) ? trim((string)$_POST['client_id']) : '';
    if ($clientIdRaw === '' || !ctype_digit($clientIdRaw)) {
        respond(400, ['success' => false, 'message' => 'client_id is required']);
    }
    $clientId = (int)$clientIdRaw;

    $documentTypeIdRaw = isset($_POST['document_type_id']) ? trim((string)$_POST['document_type_id']) : '';
    if ($documentTypeIdRaw === '' || !ctype_digit($documentTypeIdRaw)) {
        respond(400, ['success' => false, 'message' => 'document_type_id is required']);
    }
    $documentTypeId = (int)$documentTypeIdRaw;

    $durationDaysInput = null;
    if (isset($_POST['duration_days'])) {
        $durationDaysRaw = trim((string)$_POST['duration_days']);
        if ($durationDaysRaw !== '') {
            if (!ctype_digit($durationDaysRaw) || (int)$durationDaysRaw <= 0) {
                respond(422, ['success' => false, 'message' => 'duration_days must be a positive integer']);
            }
            $durationDaysInput = (int)$durationDaysRaw;
        }
    }

    if (!isset($_FILES['file'])) {
        respond(400, ['success' => false, 'message' => 'No file uploaded']);
    }

    $conn->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

    $clientExists = $conn->prepare('SELECT Client_ID FROM client WHERE Client_ID = :id LIMIT 1');
    $clientExists->execute([':id' => $clientId]);
    if (!$clientExists->fetchColumn()) {
        respond(404, ['success' => false, 'message' => 'Client not found']);
    }

    $sessionUser = monitoring_read_session_user(true);
    $hasSignupUploadAccess = monitoring_guest_can_upload_signup_documents($clientId);
    if ($sessionUser === null) {
        if (!$hasSignupUploadAccess) {
            monitoring_auth_respond(401, ['success' => false, 'message' => 'Authentication is required.']);
        }
    } else {
        monitoring_require_roles([MONITORING_ROLE_ADMIN], $sessionUser);
    }

    if (!tableExists($conn, 'documents')) {
        respond(500, ['success' => false, 'message' => 'documents table is required for client document uploads']);
    }

    $clientColumn = getColumnInfo($conn, 'documents', 'Client_ID');
    if ($clientColumn === null) {
        respond(500, ['success' => false, 'message' => 'documents table must include Client_ID for client document uploads']);
    }

    $documentTypeColumn = getColumnInfo($conn, 'documents', 'Document_type_ID');
    if ($documentTypeColumn === null) {
        respond(500, ['success' => false, 'message' => 'documents table must include Document_type_ID for typed document uploads']);
    }

    $statusColumn = getColumnInfo($conn, 'documents', 'Status_id');
    $durationDaysColumn = getColumnInfo($conn, 'documents', 'duration_days');
    $expirationDateColumn = getColumnInfo($conn, 'documents', 'expiration_date');

    $appointmentColumn = getColumnInfo($conn, 'documents', 'appointment_id');
    if ($appointmentColumn !== null && !isNullableOrHasDefault($appointmentColumn)) {
        respond(500, ['success' => false, 'message' => 'documents.appointment_id must allow NULL for client document uploads']);
    }

    $ensuredType = null;
    if (tableExists($conn, 'document_type')) {
        $ensuredType = monitoring_document_find_type($conn, $documentTypeId);
        if ($ensuredType === null) {
            respond(404, ['success' => false, 'message' => 'Document type not found']);
        }
    }

    $documentTypeName = trim((string)($ensuredType['name'] ?? (monitoring_document_known_types()[$documentTypeId] ?? '')));
    $allowedDurationDays = monitoring_document_allowed_duration_days($documentTypeName);
    if ($durationDaysInput !== null && !empty($allowedDurationDays) && !in_array($durationDaysInput, $allowedDurationDays, true)) {
        respond(422, [
            'success' => false,
            'message' => 'Invalid duration_days for ' . ($documentTypeName !== '' ? $documentTypeName : 'this document') . '.',
        ]);
    }

    $file = $_FILES['file'];
    if (!empty($file['error'])) {
        respond(400, ['success' => false, 'message' => 'Upload error: ' . $file['error']]);
    }

    $maxBytes = 10 * 1024 * 1024;
    if ((int)$file['size'] > $maxBytes) {
        respond(400, ['success' => false, 'message' => 'File too large. Max 10MB']);
    }

    $originalName = basename((string)($file['name'] ?? ''));
    $ext = strtolower(pathinfo($originalName, PATHINFO_EXTENSION));
    $allowedExt = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'csv', 'jpg', 'jpeg', 'png', 'gif', 'webp'];
    if (!in_array($ext, $allowedExt, true)) {
        respond(400, ['success' => false, 'message' => 'Invalid file extension. Allowed: ' . implode(', ', $allowedExt)]);
    }

    // Verify true MIME type instead of just extension spoofing
    $finfo = finfo_open(FILEINFO_MIME_TYPE);
    $mimeType = finfo_file($finfo, $file['tmp_name']);
    finfo_close($finfo);

    $allowedMimes = [
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'text/csv',
        'image/jpeg',
        'image/png',
        'image/gif',
        'image/webp'
    ];
    if (!in_array($mimeType, $allowedMimes, true)) {
         respond(400, ['success' => false, 'message' => 'Invalid or spoofed file content type.']);
    }

    $safeBase = preg_replace('/[^a-zA-Z0-9_-]+/', '_', pathinfo($originalName, PATHINFO_FILENAME));
    $safeBase = trim((string)$safeBase, '_');
    if ($safeBase === '') {
        $safeBase = 'file';
    }

    $unique = bin2hex(random_bytes(8));
    $storedName = 'client_' . $clientId . '_doc_' . $documentTypeId . '_' . $unique . '_' . $safeBase . '.' . $ext;
    $baseDir = realpath(__DIR__ . '/..');
    $uploadDir = $baseDir . DIRECTORY_SEPARATOR . 'uploads' . DIRECTORY_SEPARATOR . 'client_files';
    if (!is_dir($uploadDir) && !mkdir($uploadDir, 0755, true)) {
        throw new Exception('Failed to create upload directory');
    }

    $destPath = $uploadDir . DIRECTORY_SEPARATOR . $storedName;
    if (!move_uploaded_file((string)($file['tmp_name'] ?? ''), $destPath)) {
        throw new Exception('Failed to save uploaded file');
    }

    $publicRelativePath = 'uploads/client_files/' . $storedName;
    $existingDocuments = [];
    $existingSql = 'SELECT Documents_ID AS id, filepath
                    FROM documents
                    WHERE Client_ID = :client_id
                      AND Document_type_ID = :document_type_id';
    if ($durationDaysColumn !== null) {
        $existingSql = 'SELECT Documents_ID AS id, filepath, duration_days
                        FROM documents
                        WHERE Client_ID = :client_id
                          AND Document_type_ID = :document_type_id';
    }
    if ($appointmentColumn !== null) {
        $existingSql .= ' AND appointment_id IS NULL';
    }
    $existingSql .= ' ORDER BY Documents_ID DESC';

    $conn->beginTransaction();

    $existingStmt = $conn->prepare($existingSql);
    $existingStmt->execute([
        ':client_id' => $clientId,
        ':document_type_id' => $documentTypeId,
    ]);
    $existingDocuments = $existingStmt->fetchAll(PDO::FETCH_ASSOC) ?: [];

    $latestExistingDocument = $existingDocuments[0] ?? null;
    $fallbackDurationDays = null;
    if (is_array($latestExistingDocument) && array_key_exists('duration_days', $latestExistingDocument)) {
        $existingDurationDays = (int)($latestExistingDocument['duration_days'] ?? 0);
        if ($existingDurationDays > 0) {
            $fallbackDurationDays = $existingDurationDays;
        }
    }

    $resolvedDurationDays = $durationDaysColumn !== null || $expirationDateColumn !== null
        ? monitoring_document_resolve_duration_days($documentTypeName, $durationDaysInput, $fallbackDurationDays)
        : null;
    $referenceDate = (new DateTimeImmutable('now', new DateTimeZone('Asia/Manila')))->format('Y-m-d');
    $expirationDate = $expirationDateColumn !== null
        ? monitoring_document_calculate_expiration_date($referenceDate, $resolvedDurationDays)
        : null;
    $resolvedStatusId = $statusColumn !== null && !empty($existingDocuments)
        ? monitoring_resolve_document_status_id($conn, 'Renewed')
        : null;

    $columns = [];
    $placeholders = [];
    $params = [];

    if ($appointmentColumn !== null) {
        $columns[] = 'appointment_id';
        $placeholders[] = ':appointment_id';
        $params[':appointment_id'] = null;
    }

    $columns[] = 'Client_ID';
    $placeholders[] = ':client_id';
    $params[':client_id'] = $clientId;

    $columns[] = 'Document_type_ID';
    $placeholders[] = ':document_type_id';
    $params[':document_type_id'] = $documentTypeId;

    if ($statusColumn !== null) {
        $columns[] = 'Status_id';
        $placeholders[] = ':status_id';
        $params[':status_id'] = $resolvedStatusId;
    }

    $columns[] = 'filename';
    $placeholders[] = ':filename';
    $params[':filename'] = $originalName;

    $columns[] = 'filepath';
    $placeholders[] = ':filepath';
    $params[':filepath'] = $publicRelativePath;

    if ($durationDaysColumn !== null) {
        $columns[] = 'duration_days';
        $placeholders[] = ':duration_days';
        $params[':duration_days'] = $resolvedDurationDays;
    }

    if ($expirationDateColumn !== null) {
        $columns[] = 'expiration_date';
        $placeholders[] = ':expiration_date';
        $params[':expiration_date'] = $expirationDate;
    }

    if (!empty($existingDocuments)) {
        $deleteParams = [];
        $deletePlaceholders = [];
        foreach ($existingDocuments as $index => $documentRow) {
            $paramName = ':existing_id_' . $index;
            $deletePlaceholders[] = $paramName;
            $deleteParams[$paramName] = (int)($documentRow['id'] ?? 0);
        }

        if (!empty($deletePlaceholders)) {
            $deleteSql = 'DELETE FROM documents WHERE Documents_ID IN (' . implode(', ', $deletePlaceholders) . ')';
            $deleteStmt = $conn->prepare($deleteSql);
            $deleteStmt->execute($deleteParams);
        }
    }

    $sql = 'INSERT INTO documents (' . implode(', ', array_map('quoteIdentifier', $columns)) . ')
            VALUES (' . implode(', ', $placeholders) . ')';
    $stmt = $conn->prepare($sql);
    $stmt->execute($params);
    $newDocumentId = (int)$conn->lastInsertId();

    syncLatestBusinessStatusFromDocument($conn, $clientId, $documentTypeId);

    $conn->commit();

    foreach ($existingDocuments as $documentRow) {
        $oldRelativePath = trim((string)($documentRow['filepath'] ?? ''));
        if ($oldRelativePath === '') {
            continue;
        }

        $oldFullPath = $baseDir . DIRECTORY_SEPARATOR . str_replace(['/', '\\'], DIRECTORY_SEPARATOR, $oldRelativePath);
        if (is_file($oldFullPath)) {
            @unlink($oldFullPath);
        }
    }

    respond(201, [
        'success' => true,
        'message' => empty($existingDocuments) ? 'Document uploaded successfully.' : 'Document replaced successfully.',
        'document_id' => $newDocumentId,
        'client_id' => $clientId,
        'document_type_id' => $documentTypeId,
        'original_name' => $originalName,
        'path' => $publicRelativePath,
        'replaced' => !empty($existingDocuments),
        'status_id' => $resolvedStatusId,
        'status' => !empty($existingDocuments) ? 'Renewed' : 'Uploaded',
        'duration_days' => $resolvedDurationDays,
        'expiration_date' => $expirationDate,
    ]);
} catch (Throwable $e) {
    if (isset($conn) && $conn instanceof PDO && $conn->inTransaction()) {
        $conn->rollBack();
    }
    if (isset($destPath) && is_string($destPath) && $destPath !== '' && file_exists($destPath)) {
        @unlink($destPath);
    }
    error_log('client_upload_document error: ' . $e->getMessage());
    respond(500, ['success' => false, 'message' => 'Server error']);
}
