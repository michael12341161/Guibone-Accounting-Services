<?php

function monitoring_document_known_types(): array
{
    return [
        1 => 'valid_id',
        2 => 'birth_certificate',
        3 => 'marriage_contract',
        4 => 'business_permit',
        5 => 'dti',
        6 => 'sec',
        7 => 'bir',
        8 => 'sss',
        9 => 'philhealth',
        10 => 'pag_ibig',
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
            $stmt = $conn->query('SELECT Document_type_ID AS id, Document_name AS name FROM document_type');
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

    return array_map('intval', array_keys($ids));
}

function monitoring_document_expiration_profiles(): array
{
    return [
        'business_permit' => [
            'label' => '1 year',
            'default_duration_days' => 365,
            'allowed_duration_days' => [365],
        ],
        'dti' => [
            'label' => '5 years',
            'default_duration_days' => 1825,
            'allowed_duration_days' => [1825],
        ],
    ];
}

function monitoring_document_expiration_profile(?string $value): ?array
{
    $key = monitoring_document_normalize_key($value);
    if ($key === '') {
        return null;
    }

    $profiles = monitoring_document_expiration_profiles();
    if (!isset($profiles[$key])) {
        return null;
    }

    return ['key' => $key] + $profiles[$key];
}

function monitoring_document_allowed_duration_days(?string $value): array
{
    $profile = monitoring_document_expiration_profile($value);
    if ($profile === null) {
        return [];
    }

    return array_values(array_map('intval', (array)($profile['allowed_duration_days'] ?? [])));
}

function monitoring_document_resolve_duration_days(?string $documentName, ?int $requestedDurationDays = null, ?int $fallbackDurationDays = null): ?int
{
    $allowed = monitoring_document_allowed_duration_days($documentName);
    if (empty($allowed)) {
        return null;
    }

    if ($requestedDurationDays !== null && in_array($requestedDurationDays, $allowed, true)) {
        return $requestedDurationDays;
    }

    if ($fallbackDurationDays !== null && in_array($fallbackDurationDays, $allowed, true)) {
        return $fallbackDurationDays;
    }

    $profile = monitoring_document_expiration_profile($documentName);
    if ($profile === null) {
        return null;
    }

    $defaultDurationDays = isset($profile['default_duration_days']) ? (int)$profile['default_duration_days'] : 0;
    return $defaultDurationDays > 0 ? $defaultDurationDays : null;
}

function monitoring_document_calculate_expiration_date(?string $referenceDate, ?int $durationDays): ?string
{
    $duration = (int)($durationDays ?? 0);
    if ($duration <= 0) {
        return null;
    }

    $rawReference = trim((string)$referenceDate);
    if ($rawReference !== '' && preg_match('/^\d{4}-\d{2}-\d{2}/', $rawReference) === 1) {
        $baseDateText = substr($rawReference, 0, 10);
    } else {
        $baseDateText = (new DateTimeImmutable('now', new DateTimeZone('Asia/Manila')))->format('Y-m-d');
    }

    try {
        $baseDate = new DateTimeImmutable($baseDateText, new DateTimeZone('Asia/Manila'));
        return $baseDate->add(new DateInterval('P' . $duration . 'D'))->format('Y-m-d');
    } catch (Throwable $__) {
        return null;
    }
}

function monitoring_document_today_date(): string
{
    return (new DateTimeImmutable('now', new DateTimeZone('Asia/Manila')))->format('Y-m-d');
}

function monitoring_document_is_expired(?string $expirationDate, ?string $todayDate = null): bool
{
    $dateText = trim((string)$expirationDate);
    if ($dateText === '' || preg_match('/^\d{4}-\d{2}-\d{2}$/', $dateText) !== 1) {
        return false;
    }

    $today = trim((string)$todayDate);
    if ($today === '') {
        $today = (new DateTimeImmutable('now', new DateTimeZone('Asia/Manila')))->format('Y-m-d');
    }

    return strcmp($today, $dateText) > 0;
}

function monitoring_document_resolve_expiration_date(?string $documentName, ?string $uploadedAt, $durationDays, ?string $expirationDate): ?string
{
    $resolvedExpirationDate = trim((string)$expirationDate);
    if ($resolvedExpirationDate !== '') {
        return $resolvedExpirationDate;
    }

    $resolvedDurationDays = (int)($durationDays ?? 0);
    if ($resolvedDurationDays <= 0) {
        $resolvedDurationDays = (int)(monitoring_document_resolve_duration_days($documentName) ?? 0);
    }

    if ($resolvedDurationDays <= 0) {
        return null;
    }

    return monitoring_document_calculate_expiration_date($uploadedAt, $resolvedDurationDays);
}

function monitoring_document_find_type(PDO $conn, int $documentTypeId): ?array
{
    if ($documentTypeId <= 0) {
        return null;
    }

    try {
        $select = $conn->prepare('SELECT Document_type_ID AS id, Document_name AS name FROM document_type WHERE Document_type_ID = :id LIMIT 1');
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
    return null;
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

function monitoring_document_client_business_permit_states(PDO $conn, array $clientIds): array
{
    $states = [];
    $normalizedClientIds = [];

    foreach ($clientIds as $clientId) {
        $clientId = (int)$clientId;
        if ($clientId <= 0) {
            continue;
        }
        $normalizedClientIds[$clientId] = true;
        $states[$clientId] = [
            'client_id' => $clientId,
            'has_business_permit' => false,
            'has_active_business_permit' => false,
            'has_expired_business_permit' => false,
            'expiration_date' => null,
            'document_id' => null,
            'uploaded_at' => null,
        ];
    }

    if (
        empty($normalizedClientIds)
        || !monitoring_document_table_exists($conn, 'documents')
        || !monitoring_document_column_exists($conn, 'documents', 'Client_ID')
        || !monitoring_document_column_exists($conn, 'documents', 'Document_type_ID')
    ) {
        return $states;
    }

    $documentTypeIds = monitoring_document_business_permit_type_ids($conn);
    if (empty($documentTypeIds)) {
        return $states;
    }

    $hasAppointmentColumn = monitoring_document_column_exists($conn, 'documents', 'appointment_id');
    $hasDurationDaysColumn = monitoring_document_column_exists($conn, 'documents', 'duration_days');
    $hasExpirationDateColumn = monitoring_document_column_exists($conn, 'documents', 'expiration_date');

    $params = [];
    $clientPlaceholders = [];
    foreach (array_values(array_keys($normalizedClientIds)) as $index => $clientId) {
        $placeholder = ':client_id_' . $index;
        $clientPlaceholders[] = $placeholder;
        $params[$placeholder] = (int)$clientId;
    }

    $documentTypePlaceholders = [];
    foreach (array_values($documentTypeIds) as $index => $documentTypeId) {
        $placeholder = ':document_type_id_' . $index;
        $documentTypePlaceholders[] = $placeholder;
        $params[$placeholder] = (int)$documentTypeId;
    }

    $selectDurationDays = $hasDurationDaysColumn ? 'd.duration_days AS duration_days,' : 'NULL AS duration_days,';
    $selectExpirationDate = $hasExpirationDateColumn ? 'd.expiration_date AS expiration_date,' : 'NULL AS expiration_date,';

    $sql = 'SELECT d.Client_ID AS client_id,
                   d.Documents_ID AS document_id,
                   d.uploaded_at AS uploaded_at,
                   ' . $selectDurationDays . '
                   ' . $selectExpirationDate . '
                   d.filepath AS filepath
            FROM documents d
            INNER JOIN (
                SELECT Client_ID, MAX(Documents_ID) AS latest_id
                FROM documents
                WHERE Client_ID IN (' . implode(', ', $clientPlaceholders) . ')
                  AND Document_type_ID IN (' . implode(', ', $documentTypePlaceholders) . ')';
    if ($hasAppointmentColumn) {
        $sql .= ' AND appointment_id IS NULL';
    }
    $sql .= ' GROUP BY Client_ID
            ) latest_document
                ON latest_document.latest_id = d.Documents_ID';

    try {
        $stmt = $conn->prepare($sql);
        $stmt->execute($params);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];
    } catch (Throwable $__) {
        return $states;
    }

    foreach ($rows as $row) {
        $clientId = isset($row['client_id']) ? (int)$row['client_id'] : 0;
        if ($clientId <= 0 || !isset($states[$clientId])) {
            continue;
        }

        $expirationDate = monitoring_document_resolve_expiration_date(
            'business_permit',
            isset($row['uploaded_at']) ? (string)$row['uploaded_at'] : null,
            $row['duration_days'] ?? null,
            isset($row['expiration_date']) ? (string)$row['expiration_date'] : null
        );
        $isExpired = monitoring_document_is_expired($expirationDate);
        $hasBusinessPermit = (int)($row['document_id'] ?? 0) > 0 || trim((string)($row['filepath'] ?? '')) !== '';

        $states[$clientId] = [
            'client_id' => $clientId,
            'has_business_permit' => $hasBusinessPermit,
            'has_active_business_permit' => $hasBusinessPermit && !$isExpired,
            'has_expired_business_permit' => $hasBusinessPermit && $isExpired,
            'expiration_date' => $expirationDate !== null && $expirationDate !== '' ? $expirationDate : null,
            'document_id' => isset($row['document_id']) ? (int)$row['document_id'] : null,
            'uploaded_at' => isset($row['uploaded_at']) ? (string)$row['uploaded_at'] : null,
        ];
    }

    return $states;
}

function monitoring_document_client_business_permit_state(PDO $conn, int $clientId): array
{
    $states = monitoring_document_client_business_permit_states($conn, [$clientId]);
    $clientId = (int)$clientId;

    return $states[$clientId] ?? [
        'client_id' => $clientId,
        'has_business_permit' => false,
        'has_active_business_permit' => false,
        'has_expired_business_permit' => false,
        'expiration_date' => null,
        'document_id' => null,
        'uploaded_at' => null,
    ];
}

function monitoring_document_client_has_business_permit(PDO $conn, int $clientId): bool
{
    $state = monitoring_document_client_business_permit_state($conn, $clientId);
    return !empty($state['has_business_permit']);
}

function monitoring_document_client_has_active_business_permit(PDO $conn, int $clientId): bool
{
    $state = monitoring_document_client_business_permit_state($conn, $clientId);
    return !empty($state['has_active_business_permit']);
}

function monitoring_document_client_business_permit_is_expired(PDO $conn, int $clientId): bool
{
    $state = monitoring_document_client_business_permit_state($conn, $clientId);
    return !empty($state['has_expired_business_permit']);
}
