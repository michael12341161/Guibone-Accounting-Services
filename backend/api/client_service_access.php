<?php
require_once __DIR__ . '/document_helpers.php';
require_once __DIR__ . '/status_helpers.php';

function monitoring_client_service_access_state(PDO $conn, int $clientId): array
{
    $defaultState = [
        'client_id' => $clientId > 0 ? $clientId : null,
        'business_registered' => false,
        'business_permit_expired' => false,
        'restricted_to_processing' => true,
        'restriction_reason' => 'missing_permit',
        'allowed_services' => ['Processing'],
    ];

    if ($clientId <= 0) {
        return $defaultState;
    }

    $permitState = monitoring_document_client_business_permit_state($conn, $clientId);
    if (!empty($permitState['has_active_business_permit'])) {
        return [
            'client_id' => $clientId,
            'business_registered' => true,
            'business_permit_expired' => false,
            'restricted_to_processing' => false,
            'restriction_reason' => null,
            'allowed_services' => [],
        ];
    }
    if (!empty($permitState['has_expired_business_permit'])) {
        return [
            'client_id' => $clientId,
            'business_registered' => false,
            'business_permit_expired' => true,
            'restricted_to_processing' => true,
            'restriction_reason' => 'expired',
            'allowed_services' => ['Processing'],
        ];
    }

    if (
        !monitoring_document_table_exists($conn, 'business')
        || !monitoring_document_column_exists($conn, 'business', 'Client_ID')
    ) {
        return $defaultState;
    }

    $hasBusinessStatusColumn = monitoring_document_column_exists($conn, 'business', 'Status_id');
    $hasStatusTable = monitoring_document_table_exists($conn, 'status');
    $sql = 'SELECT b.Business_id AS business_id';
    if ($hasBusinessStatusColumn) {
        $sql .= ', b.Status_id AS business_status_id';
    } else {
        $sql .= ', NULL AS business_status_id';
    }
    if ($hasBusinessStatusColumn && $hasStatusTable) {
        $sql .= ', s.Status_name AS business_status_name';
    } else {
        $sql .= ', NULL AS business_status_name';
    }
    $sql .= ' FROM business b';
    if ($hasBusinessStatusColumn && $hasStatusTable) {
        $sql .= ' LEFT JOIN status s ON s.Status_id = b.Status_id';
    }
    $sql .= ' WHERE b.Client_ID = :client_id
              ORDER BY b.Business_id DESC
              LIMIT 1';

    try {
        $stmt = $conn->prepare($sql);
        $stmt->execute([':client_id' => $clientId]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC) ?: null;
        if (!$row) {
            return $defaultState;
        }
    } catch (Throwable $__) {
        return $defaultState;
    }

    $statusName = isset($row['business_status_name']) ? (string)$row['business_status_name'] : null;
    $statusId = $row['business_status_id'] ?? null;
    $hasExplicitBusinessStatus = trim((string)($statusName ?? '')) !== '' || (int)($statusId ?? 0) > 0;
    $businessRegistered = false;

    if ($hasExplicitBusinessStatus) {
        if (monitoring_business_status_label($statusName, $statusId, 'Pending') === 'Registered') {
            $businessRegistered = true;
        } elseif (trim((string)($statusName ?? '')) === '' && (int)($statusId ?? 0) > 0 && $hasStatusTable) {
            $registeredStatusId = monitoring_resolve_business_status_id($conn, 'Registered');
            if ($registeredStatusId !== null && (int)$statusId === (int)$registeredStatusId) {
                $businessRegistered = true;
            }
        }
    }

    return [
        'client_id' => $clientId,
        'business_registered' => $businessRegistered,
        'business_permit_expired' => false,
        'restricted_to_processing' => !$businessRegistered,
        'restriction_reason' => $businessRegistered ? null : 'missing_permit',
        'allowed_services' => $businessRegistered ? [] : ['Processing'],
    ];
}

function monitoring_client_business_is_registered(PDO $conn, int $clientId): bool
{
    $state = monitoring_client_service_access_state($conn, $clientId);
    return !empty($state['business_registered']);
}

function monitoring_client_service_restriction_message(bool $isClient, ?string $reason = null): string
{
    $normalizedReason = strtolower(trim((string)$reason));
    if ($normalizedReason === 'expired') {
        return $isClient
            ? 'Your Business Permit has expired. Tax Filing, Auditing, Bookkeeping, and Consultation are disabled until your permit is renewed. Only Processing is available for renewal.'
            : 'The client\'s Business Permit has expired. Tax Filing, Auditing, Bookkeeping, and Consultation are disabled until the permit is renewed. Only Processing is available for renewal.';
    }

    return $isClient
        ? 'Only Processing is available until your business permit is uploaded and your business is registered.'
        : 'Only Processing is available until the client business permit is uploaded and the business is registered.';
}

function monitoring_service_name_is_processing(?string $serviceName): bool
{
    return strtolower(trim((string)$serviceName)) === 'processing';
}
