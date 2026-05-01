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

function enrichWatchlistDocumentRow(array $row, ?int $expiredStatusId = null): array
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
    monitoring_require_roles([MONITORING_ROLE_ADMIN, MONITORING_ROLE_SECRETARY]);

    $conn->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

    $documentTypes = [];
    if (monitoring_document_table_exists($conn, 'document_type')) {
        try {
            $stmt = $conn->query('SELECT Document_type_ID AS id, Document_name AS name FROM document_type');
            $documentTypes = $stmt ? ($stmt->fetchAll(PDO::FETCH_ASSOC) ?: []) : [];
        } catch (Throwable $__) {
            $documentTypes = [];
        }
    }

    $managedDocumentTypes = array_values(array_filter(
        monitoring_document_merge_known_types($documentTypes),
        static function (array $row): bool {
            $key = monitoring_document_normalize_key((string)($row['name'] ?? ''));
            return in_array($key, ['business_permit', 'dti', 'sec', 'bir', 'philhealth', 'pag_ibig', 'sss'], true);
        }
    ));

    $documentTypeIds = [];
    foreach ($managedDocumentTypes as $row) {
        $id = isset($row['id']) ? (int)$row['id'] : 0;
        if ($id > 0) {
            $documentTypeIds[$id] = true;
        }
    }

    if (
        empty($documentTypeIds)
        || !monitoring_document_table_exists($conn, 'documents')
        || !monitoring_document_column_exists($conn, 'documents', 'Client_ID')
        || !monitoring_document_column_exists($conn, 'documents', 'Document_type_ID')
    ) {
        respond(200, [
            'success' => true,
            'document_types' => $managedDocumentTypes,
            'documents_by_client' => new stdClass(),
        ]);
    }

    $hasDocumentTypeTable = monitoring_document_table_exists($conn, 'document_type');
    $hasStatusColumn = monitoring_document_column_exists($conn, 'documents', 'Status_id');
    $hasDurationDaysColumn = monitoring_document_column_exists($conn, 'documents', 'duration_days');
    $hasExpirationDateColumn = monitoring_document_column_exists($conn, 'documents', 'expiration_date');
    $hasStatusTable = monitoring_document_table_exists($conn, 'status');
    $hasAppointmentColumn = monitoring_document_column_exists($conn, 'documents', 'appointment_id');

    $params = [];
    $documentTypePlaceholders = [];
    foreach (array_values(array_keys($documentTypeIds)) as $index => $documentTypeId) {
        $placeholder = ':document_type_id_' . $index;
        $documentTypePlaceholders[] = $placeholder;
        $params[$placeholder] = (int)$documentTypeId;
    }

    $selectName = $hasDocumentTypeTable
        ? 'dt.Document_name AS document_type_name,'
        : 'NULL AS document_type_name,';
    $joinClause = $hasDocumentTypeTable
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

    $sql = 'SELECT d.Documents_ID AS id,
                   d.Client_ID AS client_id,
                   d.Document_type_ID AS document_type_id,
                   ' . $selectName . '
                   ' . $selectStatus . '
                   ' . $selectStatusName . '
                   ' . $selectDurationDays . '
                   ' . $selectExpirationDate . '
                   d.filename AS filename,
                   d.filepath AS filepath,
                   d.uploaded_at AS uploaded_at
            FROM documents d
            INNER JOIN (
                SELECT Client_ID, Document_type_ID, MAX(Documents_ID) AS latest_id
                FROM documents
                WHERE Document_type_ID IN (' . implode(', ', $documentTypePlaceholders) . ')';
    if ($hasAppointmentColumn) {
        $sql .= ' AND appointment_id IS NULL';
    }
    $sql .= ' GROUP BY Client_ID, Document_type_ID
            ) latest_document
                ON latest_document.latest_id = d.Documents_ID
            ' . $joinClause . '
            ' . $statusJoinClause . '
            ORDER BY d.Client_ID ASC, d.Document_type_ID ASC';

    $stmt = $conn->prepare($sql);
    $stmt->execute($params);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];

    $expiredStatusId = monitoring_resolve_document_status_id($conn, 'Expired');
    $documentsByClient = [];

    foreach ($rows as $row) {
        $row = enrichWatchlistDocumentRow($row, $expiredStatusId);
        $clientId = isset($row['client_id']) ? (int)$row['client_id'] : 0;
        if ($clientId <= 0) {
            continue;
        }

        $key = (string)$clientId;
        if (!isset($documentsByClient[$key])) {
            $documentsByClient[$key] = [];
        }
        $documentsByClient[$key][] = $row;
    }

    respond(200, [
        'success' => true,
        'document_types' => $managedDocumentTypes,
        'documents_by_client' => $documentsByClient,
    ]);
} catch (Throwable $e) {
    error_log('client_document_watchlist error: ' . $e->getMessage());
    respond(500, ['success' => false, 'message' => 'Server error']);
}
