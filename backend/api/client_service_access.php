<?php
require_once __DIR__ . '/document_helpers.php';
require_once __DIR__ . '/status_helpers.php';

function monitoring_client_business_is_registered(PDO $conn, int $clientId): bool
{
    if ($clientId <= 0) {
        return false;
    }

    $hasBusinessPermit = monitoring_document_client_has_business_permit($conn, $clientId);
    if ($hasBusinessPermit) {
        return true;
    }

    if (
        !monitoring_document_table_exists($conn, 'business')
        || !monitoring_document_column_exists($conn, 'business', 'Client_ID')
    ) {
        return $hasBusinessPermit;
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
            return $hasBusinessPermit;
        }
    } catch (Throwable $__) {
        return $hasBusinessPermit;
    }

    $statusName = isset($row['business_status_name']) ? (string)$row['business_status_name'] : null;
    $statusId = $row['business_status_id'] ?? null;
    $hasExplicitBusinessStatus = trim((string)($statusName ?? '')) !== '' || (int)($statusId ?? 0) > 0;

    if ($hasExplicitBusinessStatus) {
        if (monitoring_business_status_label($statusName, $statusId, 'Pending') === 'Registered') {
            return true;
        }

        if (trim((string)($statusName ?? '')) === '' && (int)($statusId ?? 0) > 0 && $hasStatusTable) {
            $registeredStatusId = monitoring_resolve_business_status_id($conn, 'Registered');
            if ($registeredStatusId !== null && (int)$statusId === (int)$registeredStatusId) {
                return true;
            }
        }

        return false;
    }

    return false;
}

function monitoring_service_name_is_processing(?string $serviceName): bool
{
    return strtolower(trim((string)$serviceName)) === 'processing';
}
