<?php
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/connection-pdo.php';
require_once __DIR__ . '/document_helpers.php';
require_once __DIR__ . '/status_helpers.php';

monitoring_bootstrap_api(['GET', 'OPTIONS']);

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

function columnExists(PDO $conn, string $table, string $column): bool {
    try {
        $sql = 'SHOW COLUMNS FROM ' . quoteIdentifier($table) . ' LIKE :column';
        $stmt = $conn->prepare($sql);
        $stmt->execute([':column' => $column]);
        return (bool)$stmt->fetch(PDO::FETCH_ASSOC);
    } catch (Throwable $__) {
        return false;
    }
}

function enrichDocumentRow(array $row, ?int $expiredStatusId = null): array
{
    $documentTypeId = isset($row['document_type_id']) ? (int)$row['document_type_id'] : 0;
    $documentTypeName = trim((string)($row['document_type_name'] ?? ''));
    if ($documentTypeName === '' && $documentTypeId > 0) {
        $knownTypes = monitoring_document_known_types();
        $documentTypeName = (string)($knownTypes[$documentTypeId] ?? '');
    }

    $storedDurationDays = isset($row['duration_days']) ? (int)($row['duration_days'] ?? 0) : 0;
    $resolvedDurationDays = monitoring_document_resolve_duration_days(
        $documentTypeName,
        $storedDurationDays > 0 ? $storedDurationDays : null
    );
    $durationDays = $resolvedDurationDays !== null ? (int)$resolvedDurationDays : 0;

    $expirationDate = trim((string)($row['expiration_date'] ?? ''));
    $shouldRecalculateExpirationDate = $storedDurationDays > 0
        && $durationDays > 0
        && $storedDurationDays !== $durationDays;
    if (($expirationDate === '' || $shouldRecalculateExpirationDate) && $durationDays > 0) {
        $expirationDate = (string)(monitoring_document_calculate_expiration_date($row['uploaded_at'] ?? null, $durationDays) ?? '');
    }

    $isExpired = monitoring_document_is_expired($expirationDate);
    $storedStatusId = isset($row['document_status_id']) ? (int)($row['document_status_id'] ?? 0) : 0;
    $storedStatusName = trim((string)($row['document_status_name'] ?? ''));

    if ($isExpired) {
        $resolvedStatusId = $expiredStatusId !== null && $expiredStatusId > 0 ? $expiredStatusId : null;
        $resolvedStatusName = 'Expired';
    } elseif (!empty($row['filepath'])) {
        $resolvedStatusId = $storedStatusId > 0 ? $storedStatusId : null;
        $resolvedStatusName = $storedStatusName !== ''
            ? monitoring_document_status_label($storedStatusName, 'Uploaded')
            : 'Uploaded';
    } else {
        $resolvedStatusId = null;
        $resolvedStatusName = 'Pending';
    }

    $row['document_type_name'] = $documentTypeName !== '' ? $documentTypeName : null;
    $row['duration_days'] = $durationDays > 0 ? $durationDays : null;
    $row['expiration_date'] = $expirationDate !== '' ? $expirationDate : null;
    $row['is_expired'] = $isExpired;
    $row['status_id'] = $resolvedStatusId;
    $row['status_name'] = $resolvedStatusName;
    $row['document_status_id'] = $resolvedStatusId;
    $row['document_status_name'] = $resolvedStatusName;

    return $row;
}

try {
    $clientId = isset($_GET['client_id']) ? (int)$_GET['client_id'] : 0;
    if ($clientId <= 0) {
        respond(400, ['success' => false, 'message' => 'client_id is required.']);
    }

    monitoring_require_client_access($clientId, [MONITORING_ROLE_ADMIN, MONITORING_ROLE_SECRETARY]);

    $conn->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

    if (!tableExists($conn, 'documents') || !columnExists($conn, 'documents', 'Client_ID')) {
        respond(200, ['success' => true, 'documents' => []]);
    }

    $hasDocumentTypeTable = tableExists($conn, 'document_type');
    $hasDocumentTypeColumn = columnExists($conn, 'documents', 'Document_type_ID');
    $hasStatusColumn = columnExists($conn, 'documents', 'Status_id');
    $hasDurationDaysColumn = columnExists($conn, 'documents', 'duration_days');
    $hasExpirationDateColumn = columnExists($conn, 'documents', 'expiration_date');
    $hasStatusTable = tableExists($conn, 'status');

    $selectName = $hasDocumentTypeTable && $hasDocumentTypeColumn
        ? 'dt.Document_name AS document_type_name,'
        : 'NULL AS document_type_name,';
    $joinClause = $hasDocumentTypeTable && $hasDocumentTypeColumn
        ? 'LEFT JOIN document_type dt ON dt.Document_type_ID = d.Document_type_ID'
        : '';
    $selectStatus = $hasStatusColumn ? 'd.Status_id AS document_status_id,' : 'NULL AS document_status_id,';
    $selectStatusName = $hasStatusColumn && $hasStatusTable
        ? 'ds.Status_name AS document_status_name,'
        : 'NULL AS document_status_name,';
    $selectDurationDays = $hasDurationDaysColumn ? 'd.duration_days AS duration_days,' : 'NULL AS duration_days,';
    $selectExpirationDate = $hasExpirationDateColumn ? 'd.expiration_date AS expiration_date,' : 'NULL AS expiration_date,';
    $statusJoinClause = $hasStatusColumn && $hasStatusTable
        ? 'LEFT JOIN status ds ON ds.Status_id = d.Status_id'
        : '';

    $sql = "SELECT d.Documents_ID AS id,
                   d.Client_ID AS client_id,
                   d.Document_type_ID AS document_type_id,
                   {$selectName}
                   {$selectStatus}
                   {$selectStatusName}
                   {$selectDurationDays}
                   {$selectExpirationDate}
                   d.filename AS filename,
                   d.filepath AS filepath,
                   d.uploaded_at AS uploaded_at
            FROM documents d
            {$joinClause}
            {$statusJoinClause}
            WHERE d.Client_ID = :client_id
            ORDER BY d.Document_type_ID ASC, d.Documents_ID DESC";

    $stmt = $conn->prepare($sql);
    $stmt->execute([':client_id' => $clientId]);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];

    $expiredStatusId = monitoring_resolve_document_status_id($conn, 'Expired');
    foreach ($rows as &$row) {
        $row = enrichDocumentRow($row, $expiredStatusId);
    }
    unset($row);

    respond(200, ['success' => true, 'documents' => $rows]);
} catch (Throwable $e) {
    error_log('client_documents error: ' . $e->getMessage());
    respond(500, ['success' => false, 'message' => 'Server error']);
}
