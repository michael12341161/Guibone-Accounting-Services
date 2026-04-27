<?php

function monitoring_normalize_status_key(?string $value): string
{
    $normalized = strtolower(trim((string)$value));
    if ($normalized === '') {
        return '';
    }

    $normalized = preg_replace('/[^a-z0-9]+/', ' ', $normalized);
    return trim((string)$normalized);
}

function monitoring_status_matches(?string $statusName, array $candidates): bool
{
    $needle = monitoring_normalize_status_key($statusName);
    if ($needle === '') {
        return false;
    }

    foreach ($candidates as $candidate) {
        if ($needle === monitoring_normalize_status_key((string)$candidate)) {
            return true;
        }
    }

    return false;
}

function monitoring_resolve_status_id(PDO $conn, string $group, $names, ?int $fallback = null): ?int
{
    $groupKey = monitoring_normalize_status_key($group);
    if ($groupKey === '') {
        return $fallback;
    }

    static $cache = [];
    $stmt = null;
    $candidates = is_array($names) ? $names : [$names];

    foreach ($candidates as $name) {
        $rawName = trim((string)$name);
        $nameKey = monitoring_normalize_status_key($rawName);
        if ($nameKey === '') {
            continue;
        }

        $cacheKey = $groupKey . '|' . $nameKey;
        if (array_key_exists($cacheKey, $cache)) {
            $cachedId = $cache[$cacheKey];
            if ($cachedId !== null) {
                return $cachedId;
            }
            continue;
        }

        try {
            if ($stmt === null) {
                $stmt = $conn->prepare(
                    'SELECT Status_id
                     FROM status
                     WHERE LOWER(Status_group) = LOWER(:grp)
                       AND LOWER(Status_name) = LOWER(:name)
                     LIMIT 1'
                );
            }
            $stmt->execute([
                ':grp' => $group,
                ':name' => $rawName,
            ]);
            $id = (int)($stmt->fetchColumn() ?: 0);
            $cache[$cacheKey] = $id > 0 ? $id : null;
            if ($id > 0) {
                return $id;
            }
        } catch (Throwable $__) {
            $cache[$cacheKey] = null;
        }
    }

    return $fallback;
}

function monitoring_validate_status_id(PDO $conn, string $group, int $statusId): ?int
{
    if ($statusId <= 0) {
        return null;
    }

    try {
        $stmt = $conn->prepare(
            'SELECT Status_id
             FROM status
             WHERE Status_id = :id
               AND LOWER(Status_group) = LOWER(:grp)
             LIMIT 1'
        );
        $stmt->execute([
            ':id' => $statusId,
            ':grp' => $group,
        ]);
        $resolved = (int)($stmt->fetchColumn() ?: 0);
        return $resolved > 0 ? $resolved : null;
    } catch (Throwable $__) {
        return null;
    }
}

function monitoring_client_approval_status(?string $statusName, $statusId, string $fallback = 'Pending'): string
{
    if (monitoring_status_matches($statusName, ['Approved', 'Active'])) {
        return 'Approved';
    }
    if (monitoring_status_matches($statusName, ['Rejected', 'Reject', 'Inactive', 'Declined', 'Cancelled', 'Canceled'])) {
        return 'Rejected';
    }

    $value = (int)($statusId ?? 0);
    if ($value === 1) {
        return 'Approved';
    }
    if ($value === 2) {
        return 'Rejected';
    }

    return $fallback;
}

function monitoring_resolve_client_status_id(PDO $conn, string $approvalStatus): ?int
{
    $normalized = monitoring_normalize_status_key($approvalStatus);
    if ($normalized === 'approved' || $normalized === 'active') {
        return monitoring_resolve_status_id($conn, 'CLIENT', ['Approved', 'Active'], 1);
    }
    if ($normalized === 'rejected' || $normalized === 'reject' || $normalized === 'inactive') {
        return monitoring_resolve_status_id($conn, 'CLIENT', ['Rejected', 'Reject', 'Inactive'], 2);
    }

    return null;
}

function monitoring_business_status_label(?string $statusName, $statusId, string $fallback = 'Pending'): string
{
    if (monitoring_status_matches($statusName, ['Registered', 'Resgistered', 'Approved', 'Active'])) {
        return 'Registered';
    }
    if (monitoring_status_matches($statusName, ['Unregistered', 'Unresgistered', 'Inactive'])) {
        return 'Unregistered';
    }
    if (monitoring_status_matches($statusName, ['Pending', 'Not Started'])) {
        return 'Pending';
    }

    return $fallback;
}

function monitoring_resolve_business_status_id(PDO $conn, string $label): ?int
{
    $normalized = monitoring_normalize_status_key($label);
    if ($normalized === 'registered') {
        return monitoring_resolve_status_id($conn, 'BUSINESS', ['Registered', 'Resgistered', 'Approved', 'Active']);
    }
    if ($normalized === 'unregistered' || $normalized === 'inactive') {
        return monitoring_resolve_status_id($conn, 'BUSINESS', ['Unregistered', 'Unresgistered', 'Inactive']);
    }
    if ($normalized === 'pending' || $normalized === 'not started') {
        return monitoring_resolve_status_id($conn, 'BUSINESS', ['Pending', 'Not Started']);
    }

    return null;
}

function monitoring_document_status_label(?string $statusName, string $fallback = 'Uploaded'): string
{
    if (monitoring_status_matches($statusName, ['Expired'])) {
        return 'Expired';
    }
    if (monitoring_status_matches($statusName, ['Renewed'])) {
        return 'Renewed';
    }

    return $fallback;
}

function monitoring_resolve_document_status_id(PDO $conn, string $label): ?int
{
    $normalized = monitoring_normalize_status_key($label);
    if ($normalized === '') {
        return null;
    }

    $groups = ['DOCUMENTS', 'DOCUMENT'];
    $candidates = [$label];

    if ($normalized === 'expired') {
        $candidates = ['Expired'];
    } elseif ($normalized === 'renewed') {
        $candidates = ['Renewed'];
    }

    foreach ($groups as $group) {
        $resolved = monitoring_resolve_status_id($conn, $group, $candidates);
        if ($resolved !== null) {
            return $resolved;
        }
    }

    return null;
}
