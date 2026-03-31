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

function fetchOptionsOrFallback(PDO $conn, string $sql, array $fallback): array {
    try {
        $stmt = $conn->query($sql);
        $rows = $stmt ? ($stmt->fetchAll(PDO::FETCH_ASSOC) ?: []) : [];
        return count($rows) > 0 ? $rows : $fallback;
    } catch (Throwable $__) {
        return $fallback;
    }
}

try {
    $conn->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

    $businessTypes = fetchOptionsOrFallback(
        $conn,
        'SELECT Business_type_ID AS id, Business_name AS name
         FROM business_type
         WHERE Business_name IS NOT NULL AND TRIM(Business_name) <> \'\'
         ORDER BY Business_type_ID ASC',
        [
            ['id' => 1, 'name' => 'Sole Proprietor'],
            ['id' => 2, 'name' => 'Partnership'],
            ['id' => 3, 'name' => 'Corporation'],
        ]
    );

    $civilStatusTypes = fetchOptionsOrFallback(
        $conn,
        'SELECT civil_status_type_ID AS id, civil_status_type_name AS name
         FROM civil_status_type
         WHERE civil_status_type_name IS NOT NULL AND TRIM(civil_status_type_name) <> \'\'
         ORDER BY civil_status_type_ID ASC',
        [
            ['id' => 1, 'name' => 'Single'],
            ['id' => 2, 'name' => 'Married'],
            ['id' => 3, 'name' => 'Widowed'],
            ['id' => 4, 'name' => 'Separated'],
            ['id' => 5, 'name' => 'Divorced'],
            ['id' => 6, 'name' => 'Annulled'],
        ]
    );

    $documentTypes = fetchOptionsOrFallback(
        $conn,
        'SELECT Document_type_ID AS id, Document_name AS name
         FROM Document_type
         WHERE Document_name IS NOT NULL AND TRIM(Document_name) <> \'\'
         ORDER BY Document_type_ID ASC',
        [
            ['id' => 1, 'name' => 'valid_id'],
            ['id' => 2, 'name' => 'birth_certificate'],
            ['id' => 3, 'name' => 'marriage_contract'],
            ['id' => 4, 'name' => 'business_permit'],
            ['id' => 5, 'name' => 'dti'],
            ['id' => 6, 'name' => 'sec'],
            ['id' => 7, 'name' => 'lgu'],
        ]
    );
    $documentTypes = monitoring_document_merge_known_types($documentTypes);

    respond(200, [
        'success' => true,
        'business_types' => $businessTypes,
        'civil_status_types' => $civilStatusTypes,
        'document_types' => $documentTypes,
    ]);
} catch (Throwable $e) {
    respond(500, ['success' => false, 'message' => 'Server error', 'error' => $e->getMessage()]);
}
