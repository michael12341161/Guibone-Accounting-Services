<?php
require_once __DIR__ . '/document_helpers.php';

function monitoring_business_permit_expiry_notification_type(int $clientId, string $expirationDate): string
{
    return 'business_permit_expired:' . $clientId . ':' . trim($expirationDate);
}

function monitoring_business_permit_parse_notification_type(string $type): ?array
{
    $value = trim($type);
    if (!preg_match('/^business_permit_expired:(\d+):(\d{4}-\d{2}-\d{2})$/i', $value, $matches)) {
        return null;
    }

    $clientId = (int)$matches[1];
    $expirationDate = trim((string)$matches[2]);
    if ($clientId <= 0 || $expirationDate === '') {
        return null;
    }

    return [
        'client_id' => $clientId,
        'expiration_date' => $expirationDate,
    ];
}

function monitoring_business_permit_expiry_notification_exists(PDO $conn, int $userId, string $type): bool
{
    if ($userId <= 0 || trim($type) === '') {
        return false;
    }

    try {
        $stmt = $conn->prepare(
            'SELECT notifications_ID
             FROM notifications
             WHERE user_id = :user_id
               AND type = :type
             LIMIT 1'
        );
        $stmt->execute([
            ':user_id' => $userId,
            ':type' => trim($type),
        ]);

        return (bool)$stmt->fetchColumn();
    } catch (Throwable $__) {
        return false;
    }
}

function monitoring_business_permit_insert_notification(PDO $conn, int $userId, string $type, string $message, ?int $senderId = null): bool
{
    if ($userId <= 0 || trim($type) === '' || trim($message) === '') {
        return false;
    }
    if (monitoring_business_permit_expiry_notification_exists($conn, $userId, $type)) {
        return false;
    }

    $stmt = $conn->prepare(
        'INSERT INTO notifications (user_id, sender_id, type, message, is_read)
         VALUES (:user_id, :sender_id, :type, :message, 0)'
    );
    $stmt->execute([
        ':user_id' => $userId,
        ':sender_id' => ($senderId !== null && $senderId > 0) ? $senderId : null,
        ':type' => trim($type),
        ':message' => trim($message),
    ]);

    return true;
}

function monitoring_business_permit_role_user_ids(PDO $conn, int $roleId): array
{
    if ($roleId <= 0) {
        return [];
    }

    try {
        $stmt = $conn->prepare('SELECT User_id FROM user WHERE Role_id = :role_id');
        $stmt->execute([':role_id' => $roleId]);
        $rows = $stmt->fetchAll(PDO::FETCH_COLUMN) ?: [];
    } catch (Throwable $__) {
        return [];
    }

    $ids = [];
    foreach ($rows as $row) {
        $userId = (int)$row;
        if ($userId > 0) {
            $ids[$userId] = true;
        }
    }

    return array_values(array_map('intval', array_keys($ids)));
}

function monitoring_business_permit_office_user_ids(PDO $conn): array
{
    $adminRoleId = defined('MONITORING_ROLE_ADMIN') ? (int)MONITORING_ROLE_ADMIN : 1;
    $secretaryRoleId = defined('MONITORING_ROLE_SECRETARY') ? (int)MONITORING_ROLE_SECRETARY : 2;

    $ids = [];
    foreach ([$adminRoleId, $secretaryRoleId] as $roleId) {
        foreach (monitoring_business_permit_role_user_ids($conn, $roleId) as $userId) {
            $ids[(int)$userId] = true;
        }
    }

    return array_values(array_map('intval', array_keys($ids)));
}

function monitoring_business_permit_format_date(string $value): string
{
    try {
        return (new DateTimeImmutable($value, new DateTimeZone('Asia/Manila')))->format('F j, Y');
    } catch (Throwable $__) {
        return $value;
    }
}

function monitoring_business_permit_display_name(array $row): string
{
    $parts = [];
    foreach (['client_first_name', 'client_middle_name', 'client_last_name'] as $key) {
        $value = trim((string)($row[$key] ?? ''));
        if ($value !== '') {
            $parts[] = $value;
        }
    }

    return !empty($parts) ? implode(' ', $parts) : 'Client';
}

function monitoring_business_permit_business_name(array $row): string
{
    return trim((string)($row['business_trade_name'] ?? ''));
}

function monitoring_business_permit_expired_rows(PDO $conn): array
{
    if (
        !monitoring_document_table_exists($conn, 'documents')
        || !monitoring_document_column_exists($conn, 'documents', 'Client_ID')
        || !monitoring_document_column_exists($conn, 'documents', 'Document_type_ID')
    ) {
        return [];
    }

    $documentTypeIds = monitoring_document_business_permit_type_ids($conn);
    if (empty($documentTypeIds)) {
        return [];
    }

    $hasAppointmentColumn = monitoring_document_column_exists($conn, 'documents', 'appointment_id');
    $hasDurationDaysColumn = monitoring_document_column_exists($conn, 'documents', 'duration_days');
    $hasExpirationDateColumn = monitoring_document_column_exists($conn, 'documents', 'expiration_date');
    $hasBusinessTable = monitoring_document_table_exists($conn, 'business');
    $businessTradeColumn = monitoring_document_column_exists($conn, 'business', 'Trade_name') ? 'Trade_name' : 'Brand_name';

    $params = [];
    $documentTypePlaceholders = [];
    foreach (array_values($documentTypeIds) as $index => $documentTypeId) {
        $placeholder = ':document_type_id_' . $index;
        $documentTypePlaceholders[] = $placeholder;
        $params[$placeholder] = (int)$documentTypeId;
    }

    $selectDurationDays = $hasDurationDaysColumn ? 'd.duration_days AS duration_days,' : 'NULL AS duration_days,';
    $selectExpirationDate = $hasExpirationDateColumn ? 'd.expiration_date AS expiration_date,' : 'NULL AS expiration_date,';
    $businessJoin = '';
    $businessSelect = 'NULL AS business_trade_name';

    if ($hasBusinessTable && monitoring_document_column_exists($conn, 'business', 'Client_ID')) {
        $businessJoin = '
            LEFT JOIN (
                SELECT b1.Client_ID, b1.' . $businessTradeColumn . ' AS business_trade_name
                FROM business b1
                INNER JOIN (
                    SELECT Client_ID, MAX(Business_id) AS latest_business_id
                    FROM business
                    GROUP BY Client_ID
                ) latest_business
                    ON latest_business.latest_business_id = b1.Business_id
            ) latest_business
                ON latest_business.Client_ID = d.Client_ID';
        $businessSelect = 'latest_business.business_trade_name AS business_trade_name';
    }

    $sql = 'SELECT d.Client_ID AS client_id,
                   d.Documents_ID AS document_id,
                   d.uploaded_at AS uploaded_at,
                   ' . $selectDurationDays . '
                   ' . $selectExpirationDate . '
                   c.User_id AS client_user_id,
                   c.First_name AS client_first_name,
                   c.Middle_name AS client_middle_name,
                   c.Last_name AS client_last_name,
                   ' . $businessSelect . '
            FROM documents d
            INNER JOIN (
                SELECT Client_ID, MAX(Documents_ID) AS latest_document_id
                FROM documents
                WHERE Document_type_ID IN (' . implode(', ', $documentTypePlaceholders) . ')';
    if ($hasAppointmentColumn) {
        $sql .= ' AND appointment_id IS NULL';
    }
    $sql .= ' GROUP BY Client_ID
            ) latest_document
                ON latest_document.latest_document_id = d.Documents_ID
            LEFT JOIN client c ON c.Client_ID = d.Client_ID'
            . $businessJoin;

    try {
        $stmt = $conn->prepare($sql);
        $stmt->execute($params);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];
    } catch (Throwable $__) {
        return [];
    }

    $expiredRows = [];
    foreach ($rows as $row) {
        $expirationDate = monitoring_document_resolve_expiration_date(
            'business_permit',
            isset($row['uploaded_at']) ? (string)$row['uploaded_at'] : null,
            $row['duration_days'] ?? null,
            isset($row['expiration_date']) ? (string)$row['expiration_date'] : null
        );
        if ($expirationDate === null || !monitoring_document_is_expired($expirationDate)) {
            continue;
        }

        $row['expiration_date'] = $expirationDate;
        $expiredRows[] = $row;
    }

    return $expiredRows;
}

function monitoring_run_business_permit_expiry_monitor(PDO $conn): array
{
    $summary = [
        'expired_clients' => 0,
        'notifications' => 0,
    ];

    $officeUserIds = monitoring_business_permit_office_user_ids($conn);
    $rows = monitoring_business_permit_expired_rows($conn);
    $summary['expired_clients'] = count($rows);

    foreach ($rows as $row) {
        $clientId = isset($row['client_id']) ? (int)$row['client_id'] : 0;
        $expirationDate = trim((string)($row['expiration_date'] ?? ''));
        if ($clientId <= 0 || $expirationDate === '') {
            continue;
        }

        $notificationType = monitoring_business_permit_expiry_notification_type($clientId, $expirationDate);
        $clientName = monitoring_business_permit_display_name($row);
        $businessName = monitoring_business_permit_business_name($row);
        $formattedDate = monitoring_business_permit_format_date($expirationDate);

        $clientMessage = "Business Permit Expired\n"
            . "Your Business Permit expired on {$formattedDate}. Tax Filing, Auditing, Bookkeeping, and Consultation are disabled until your permit is renewed. Only Processing is available for renewal.";
        if (monitoring_business_permit_insert_notification(
            $conn,
            (int)($row['client_user_id'] ?? 0),
            $notificationType,
            $clientMessage
        )) {
            $summary['notifications'] += 1;
        }

        $officeMessage = "Business Permit Expired\n"
            . "{$clientName}"
            . ($businessName !== '' ? " ({$businessName})" : '')
            . " has an expired Business Permit as of {$formattedDate}. Client services are locked until the permit is renewed.";
        foreach ($officeUserIds as $officeUserId) {
            if (monitoring_business_permit_insert_notification($conn, (int)$officeUserId, $notificationType, $officeMessage)) {
                $summary['notifications'] += 1;
            }
        }
    }

    return $summary;
}

function monitoring_filter_current_business_permit_notifications(PDO $conn, array $notifications): array
{
    if (empty($notifications)) {
        return [];
    }

    $clientIds = [];
    foreach ($notifications as $notification) {
        $parsed = monitoring_business_permit_parse_notification_type((string)($notification['type'] ?? ''));
        if ($parsed === null) {
            continue;
        }
        $clientIds[(int)$parsed['client_id']] = true;
    }

    if (empty($clientIds)) {
        return $notifications;
    }

    $states = monitoring_document_client_business_permit_states($conn, array_keys($clientIds));
    $filtered = [];

    foreach ($notifications as $notification) {
        $parsed = monitoring_business_permit_parse_notification_type((string)($notification['type'] ?? ''));
        if ($parsed === null) {
            $filtered[] = $notification;
            continue;
        }

        $clientId = (int)$parsed['client_id'];
        $state = $states[$clientId] ?? null;
        $currentExpirationDate = trim((string)($state['expiration_date'] ?? ''));
        if (empty($state['has_expired_business_permit']) || $currentExpirationDate === '') {
            continue;
        }
        if ($currentExpirationDate !== (string)$parsed['expiration_date']) {
            continue;
        }

        $filtered[] = $notification;
    }

    return $filtered;
}
