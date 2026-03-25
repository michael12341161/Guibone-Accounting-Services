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

    $hasDocumentTypeTable = tableExists($conn, 'Document_type');
    $hasDocumentTypeColumn = columnExists($conn, 'documents', 'Document_type_ID');

    $selectName = $hasDocumentTypeTable && $hasDocumentTypeColumn
        ? 'dt.Document_name AS document_type_name,'
        : 'NULL AS document_type_name,';
    $joinClause = $hasDocumentTypeTable && $hasDocumentTypeColumn
        ? 'LEFT JOIN Document_type dt ON dt.Document_type_ID = d.Document_type_ID'
        : '';

    $sql = "SELECT d.Documents_ID AS id,
                   d.Client_ID AS client_id,
                   d.Document_type_ID AS document_type_id,
                   {$selectName}
                   d.filename AS filename,
                   d.filepath AS filepath,
                   d.uploaded_at AS uploaded_at
            FROM documents d
            {$joinClause}
            WHERE d.Client_ID = :client_id
            ORDER BY d.Document_type_ID ASC, d.Documents_ID DESC";

    $stmt = $conn->prepare($sql);
    $stmt->execute([':client_id' => $clientId]);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];

    respond(200, ['success' => true, 'documents' => $rows]);
} catch (Throwable $e) {
    respond(500, ['success' => false, 'message' => 'Server error', 'error' => $e->getMessage()]);
}
