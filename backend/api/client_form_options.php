<?php
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/connection-pdo.php';
require_once __DIR__ . '/document_helpers.php';

monitoring_bootstrap_api(['GET', 'OPTIONS']);

function respond($code, $payload) {
    http_response_code($code);
    echo json_encode($payload);
    exit;
}

function fetchSchemaOptions(PDO $conn, string $tableName, array $columns, string $sql): array {
    monitoring_require_schema_columns($conn, $tableName, $columns, 'client form options');

    $stmt = $conn->query($sql);
    return $stmt ? ($stmt->fetchAll(PDO::FETCH_ASSOC) ?: []) : [];
}

try {
    $conn->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

    $businessTypes = fetchSchemaOptions(
        $conn,
        'business_type',
        ['Business_type_ID', 'Business_name'],
        'SELECT Business_type_ID AS id, Business_name AS name
         FROM business_type
         WHERE Business_name IS NOT NULL AND TRIM(Business_name) <> \'\'
         ORDER BY Business_type_ID ASC'
    );

    $civilStatusTypes = fetchSchemaOptions(
        $conn,
        'civil_status_type',
        ['civil_status_type_ID', 'civil_status_type_name'],
        'SELECT civil_status_type_ID AS id, civil_status_type_name AS name
         FROM civil_status_type
         WHERE civil_status_type_name IS NOT NULL AND TRIM(civil_status_type_name) <> \'\'
         ORDER BY civil_status_type_ID ASC'
    );

    $documentTypes = fetchSchemaOptions(
        $conn,
        'document_type',
        ['Document_type_ID', 'Document_name'],
        'SELECT Document_type_ID AS id, Document_name AS name
         FROM document_type
         WHERE Document_name IS NOT NULL AND TRIM(Document_name) <> \'\'
         ORDER BY Document_type_ID ASC'
    );

    respond(200, [
        'success' => true,
        'business_types' => $businessTypes,
        'civil_status_types' => $civilStatusTypes,
        'document_types' => $documentTypes,
    ]);
} catch (Throwable $e) {
    error_log('client_form_options error: ' . $e->getMessage());
    respond(500, ['success' => false, 'message' => 'Server error']);
}
