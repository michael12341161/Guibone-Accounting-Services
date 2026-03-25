<?php

function monitoring_document_known_types(): array
{
    return [
        1 => 'valid_id',
        2 => 'birth_certificate',
        3 => 'marriage_contract',
        4 => 'business_permit',
    ];
}

function monitoring_document_normalize_key(?string $value): string
{
    $normalized = strtolower(trim((string)$value));
    if ($normalized === '') {
        return '';
    }

    $normalized = preg_replace('/[^a-z0-9]+/', '_', $normalized);
    $normalized = trim((string)$normalized, '_');

    if ($normalized === 'psa_birthcertificate') {
        return 'psa_birth_certificate';
    }

    return $normalized;
}

function monitoring_document_is_business_permit_name(?string $value): bool
{
    return monitoring_document_normalize_key($value) === 'business_permit';
}

function monitoring_document_merge_known_types(array $rows): array
{
    $knownTypes = monitoring_document_known_types();
    $merged = [];
    $seenIds = [];
    $seenKeys = [];

    foreach ($rows as $row) {
        $id = isset($row['id']) ? (int)$row['id'] : 0;
        $name = isset($row['name']) ? trim((string)$row['name']) : '';
        if ($id <= 0 || $name === '') {
            continue;
        }

        $seenIds[$id] = true;
        $seenKeys[monitoring_document_normalize_key($name)] = true;
        $merged[] = [
            'id' => $id,
            'name' => $name,
        ];
    }

    foreach ($knownTypes as $id => $name) {
        $key = monitoring_document_normalize_key($name);
        if (isset($seenIds[$id]) || isset($seenKeys[$key])) {
            continue;
        }

        $merged[] = [
            'id' => (int)$id,
            'name' => $name,
        ];
    }

    usort($merged, static function (array $left, array $right): int {
        $leftId = isset($left['id']) ? (int)$left['id'] : 0;
        $rightId = isset($right['id']) ? (int)$right['id'] : 0;

        if ($leftId !== $rightId) {
            return $leftId <=> $rightId;
        }

        return strcasecmp((string)($left['name'] ?? ''), (string)($right['name'] ?? ''));
    });

    return $merged;
}

function monitoring_document_business_permit_type_ids(?PDO $conn = null): array
{
    $ids = [];

    if ($conn !== null) {
        try {
            $stmt = $conn->query('SELECT Document_type_ID AS id, Document_name AS name FROM Document_type');
            $rows = $stmt ? ($stmt->fetchAll(PDO::FETCH_ASSOC) ?: []) : [];
            foreach ($rows as $row) {
                if (!monitoring_document_is_business_permit_name($row['name'] ?? null)) {
                    continue;
                }

                $id = isset($row['id']) ? (int)$row['id'] : 0;
                if ($id > 0) {
                    $ids[$id] = true;
                }
            }
        } catch (Throwable $__) {
        }
    }

    if (empty($ids)) {
        $ids[4] = true;
    }

    return array_map('intval', array_keys($ids));
}

function monitoring_document_ensure_type_exists(PDO $conn, int $documentTypeId): ?array
{
    if ($documentTypeId <= 0) {
        return null;
    }

    try {
        $select = $conn->prepare('SELECT Document_type_ID AS id, Document_name AS name FROM Document_type WHERE Document_type_ID = :id LIMIT 1');
        $select->execute([':id' => $documentTypeId]);
        $existing = $select->fetch(PDO::FETCH_ASSOC);
        if ($existing) {
            return [
                'id' => (int)$existing['id'],
                'name' => (string)$existing['name'],
            ];
        }
    } catch (Throwable $__) {
        return null;
    }

    $knownTypes = monitoring_document_known_types();
    $documentName = $knownTypes[$documentTypeId] ?? null;
    if ($documentName === null) {
        return null;
    }

    try {
        $insert = $conn->prepare('INSERT INTO Document_type (Document_type_ID, Document_name) VALUES (:id, :name)');
        $insert->execute([
            ':id' => $documentTypeId,
            ':name' => $documentName,
        ]);
    } catch (Throwable $__) {
        try {
            $select = $conn->prepare('SELECT Document_type_ID AS id, Document_name AS name FROM Document_type WHERE Document_type_ID = :id LIMIT 1');
            $select->execute([':id' => $documentTypeId]);
            $existing = $select->fetch(PDO::FETCH_ASSOC);
            if ($existing) {
                return [
                    'id' => (int)$existing['id'],
                    'name' => (string)$existing['name'],
                ];
            }
        } catch (Throwable $___) {
            return null;
        }
    }

    return [
        'id' => $documentTypeId,
        'name' => $documentName,
    ];
}

function monitoring_document_table_exists(PDO $conn, string $table): bool
{
    try {
        $stmt = $conn->prepare('SHOW TABLES LIKE :table');
        $stmt->execute([':table' => $table]);
        return (bool)$stmt->fetchColumn();
    } catch (Throwable $__) {
        return false;
    }
}

function monitoring_document_column_exists(PDO $conn, string $table, string $column): bool
{
    try {
        $stmt = $conn->prepare('SHOW COLUMNS FROM `' . str_replace('`', '``', $table) . '` LIKE :column');
        $stmt->execute([':column' => $column]);
        return (bool)$stmt->fetch(PDO::FETCH_ASSOC);
    } catch (Throwable $__) {
        return false;
    }
}

function monitoring_document_client_has_business_permit(PDO $conn, int $clientId): bool
{
    if ($clientId <= 0) {
        return false;
    }
    if (!monitoring_document_table_exists($conn, 'documents') || !monitoring_document_column_exists($conn, 'documents', 'Client_ID')) {
        return false;
    }

    $documentTypeIds = monitoring_document_business_permit_type_ids($conn);
    if (empty($documentTypeIds)) {
        return false;
    }

    $placeholders = [];
    $params = [':client_id' => $clientId];
    foreach (array_values($documentTypeIds) as $index => $typeId) {
        $placeholder = ':document_type_' . $index;
        $placeholders[] = $placeholder;
        $params[$placeholder] = (int)$typeId;
    }

    $sql = 'SELECT 1
            FROM documents
            WHERE Client_ID = :client_id
              AND Document_type_ID IN (' . implode(', ', $placeholders) . ')';
    if (monitoring_document_column_exists($conn, 'documents', 'appointment_id')) {
        $sql .= ' AND appointment_id IS NULL';
    }
    $sql .= ' LIMIT 1';

    try {
        $stmt = $conn->prepare($sql);
        $stmt->execute($params);
        return (bool)$stmt->fetchColumn();
    } catch (Throwable $__) {
        return false;
    }
}
