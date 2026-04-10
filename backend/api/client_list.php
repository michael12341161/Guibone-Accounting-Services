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

function isTruthyQueryParam(string $key): bool {
    if (!isset($_GET[$key])) {
        return false;
    }

    $value = strtolower(trim((string)$_GET[$key]));
    return in_array($value, ['1', 'true', 'yes', 'on'], true);
}

function userDisplayNameSql(string $alias): string {
    return "NULLIF(TRIM(CONCAT_WS(' ', NULLIF(TRIM({$alias}.first_name), ''), NULLIF(TRIM({$alias}.middle_name), ''), NULLIF(TRIM({$alias}.last_name), ''))), '')";
}

function resolveApprovalStatus($statusId, ?string $statusName = null, string $fallback = 'Pending'): string {
    return monitoring_client_approval_status($statusName, $statusId, $fallback);
}

function resolveBusinessStatus(?string $statusName, $statusId, bool $hasActiveBusinessPermit, bool $hasExpiredBusinessPermit, bool $hasBusinessRecord): string {
    if ($hasExpiredBusinessPermit) {
        return 'Expired';
    }
    if ($hasActiveBusinessPermit) {
        return 'Registered';
    }
    $hasExplicitBusinessStatus = trim((string)($statusName ?? '')) !== '' || (int)($statusId ?? 0) > 0;
    if ($hasExplicitBusinessStatus) {
        return monitoring_business_status_label($statusName, $statusId, $hasBusinessRecord ? 'Pending' : 'Unregistered');
    }
    return $hasBusinessRecord ? 'Pending' : 'Unregistered';
}

function getBusinessTradeColumn(PDO $conn): string {
    static $column = null;
    if ($column !== null) {
        return $column;
    }

    try {
        $check = $conn->query("SHOW COLUMNS FROM business LIKE 'Trade_name'");
        if ($check && $check->fetch(PDO::FETCH_ASSOC)) {
            $column = 'Trade_name';
            return $column;
        }
    } catch (Throwable $__) {}

    $column = 'Brand_name';
    return $column;
}

try {
    $sessionUser = monitoring_require_auth();
    $conn->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

    $tradeColumn = getBusinessTradeColumn($conn);
    $hasCivilStatusTable = tableExists($conn, 'civil_status_type');
    $hasCivilStatusColumn = columnExists($conn, 'client', 'civil_status_type_ID');
    $hasRejectionReasonColumn = columnExists($conn, 'client', 'Rejection_reason');
    $hasActionByColumn = columnExists($conn, 'client', 'action_by');
    $hasBusinessStatusColumn = columnExists($conn, 'business', 'Status_id');
    $hasStatusTable = tableExists($conn, 'status');
    $civilStatusSelect = 'NULL AS civil_status_type_id,
                   NULL AS civil_status_type,';
    $civilStatusJoin = '';
    $rejectionReasonSelect = 'NULL AS rejection_reason,';
    $actionBySelect = 'NULL AS Action_by,
                   NULL AS action_by,
                   NULL AS action_by_name,
                   NULL AS action_by_username,';
    $actionByJoin = '';
    $businessStatusOuterSelect = 'NULL AS business_status_id,
                   NULL AS business_status_name,';
    $businessStatusInnerSelect = '';
    $businessStatusJoin = '';

    if ($hasCivilStatusColumn && $hasCivilStatusTable) {
        $civilStatusSelect = 'c.civil_status_type_ID AS civil_status_type_id,
                   cst.civil_status_type_name AS civil_status_type,';
        $civilStatusJoin = 'LEFT JOIN civil_status_type cst ON cst.civil_status_type_ID = c.civil_status_type_ID';
    } elseif ($hasCivilStatusColumn) {
        $civilStatusSelect = 'c.civil_status_type_ID AS civil_status_type_id,
                   NULL AS civil_status_type,';
    }

    if ($hasRejectionReasonColumn) {
        $rejectionReasonSelect = 'c.Rejection_reason AS rejection_reason,';
    }

    if ($hasActionByColumn) {
        $actionByNameExpr = userDisplayNameSql('au');
        $actionBySelect = "c.action_by AS Action_by,
                   c.action_by AS action_by,
                   COALESCE({$actionByNameExpr}, NULLIF(TRIM(au.Username), ''), CASE WHEN c.action_by IS NOT NULL THEN CONCAT('User #', c.action_by) ELSE NULL END) AS action_by_name,
                   au.Username AS action_by_username,";
        $actionByJoin = 'LEFT JOIN user au ON au.User_id = c.action_by';
    }

    if ($hasBusinessStatusColumn) {
        $businessStatusInnerSelect = 'b1.Status_id,';
        if ($hasStatusTable) {
            $businessStatusOuterSelect = 'b.Status_id AS business_status_id,
                   bs.Status_name AS business_status_name,';
            $businessStatusJoin = 'LEFT JOIN status bs ON bs.Status_id = b.Status_id';
        } else {
            $businessStatusOuterSelect = 'b.Status_id AS business_status_id,
                   NULL AS business_status_name,';
        }
    }

    $filters = [];
    $params = [];

    $roleId = (int)($sessionUser['role_id'] ?? 0);
    if ($roleId === MONITORING_ROLE_CLIENT) {
        $sessionClientId = (int)($sessionUser['client_id'] ?? 0);
        if ($sessionClientId <= 0) {
            monitoring_auth_respond(403, ['success' => false, 'message' => 'Access denied.']);
        }
        $filters[] = 'c.Client_ID = :client_id';
        $params[':client_id'] = $sessionClientId;
    } elseif (!in_array($roleId, [MONITORING_ROLE_ADMIN, MONITORING_ROLE_SECRETARY], true)) {
        monitoring_auth_respond(403, ['success' => false, 'message' => 'Access denied.']);
    } elseif (isset($_GET['client_id']) && trim((string)$_GET['client_id']) !== '') {
        $clientIdRaw = trim((string)$_GET['client_id']);
        if (!ctype_digit($clientIdRaw)) {
            respond(422, ['success' => false, 'message' => 'client_id must be a positive integer']);
        }
        if ((int)$clientIdRaw <= 0) {
            respond(422, ['success' => false, 'message' => 'client_id must be a positive integer']);
        }

        $filters[] = 'c.Client_ID = :client_id';
        $params[':client_id'] = (int)$clientIdRaw;
    }

    $registrationSource = strtolower(trim((string)($_GET['registration_source'] ?? '')));
    if ($registrationSource !== '') {
        if (in_array($registrationSource, ['self_signup', 'self-signup', 'signup', 'sign_up', 'client_signup', 'client-signup'], true)) {
            if ($hasRejectionReasonColumn) {
                $filters[] = "(c.Status_id IS NULL OR (c.Status_id = 2 AND c.Rejection_reason IS NOT NULL AND TRIM(c.Rejection_reason) <> ''))";
            } else {
                $filters[] = 'c.Status_id IS NULL';
            }
        }
    }

    if (isTruthyQueryParam('exclude_unapproved_self_signup')) {
        if ($hasRejectionReasonColumn) {
            $filters[] = "(c.Status_id IS NOT NULL AND NOT (c.Status_id = 2 AND c.Rejection_reason IS NOT NULL AND TRIM(c.Rejection_reason) <> ''))";
        } else {
            $filters[] = 'c.Status_id IS NOT NULL';
        }
    }

    $whereSql = empty($filters) ? '' : 'WHERE ' . implode(' AND ', $filters);

    $sql = "SELECT c.Client_ID AS id,
                   c.First_name AS first_name,
                   c.Middle_name AS middle_name,
                   c.Last_name AS last_name,
                   c.Email AS email,
                   c.Profile_Image AS profile_image,
                   c.Phone AS phone,
                   c.Date_of_Birth AS date_of_birth,
                   {$civilStatusSelect}
                   TRIM(CONCAT_WS(', ', c.Street_address, c.Barangay, c.Municipality, c.Province, c.Postal_code)) AS address,
                   c.Province AS province,
                   c.Municipality AS municipality,
                   c.Postal_code AS postal_code,
                   c.Barangay AS barangay,
                   c.Street_address AS street_address,
                   c.Tin_no AS tin_no,
                   c.Status_id AS status_id,
                   {$rejectionReasonSelect}
                   {$actionBySelect}
                   s.Status_name AS status,
                   c.Registered_at AS registered_at,
                   u.User_id AS user_id,
                   u.Username AS username,
                   u.Email AS user_email,
                   u.Role_id AS role_id,
                   r.Role_name AS role_name,
                   b.Business_id AS business_id,
                   b.trade_name_value AS business_trade_name,
                   b.trade_name_value AS business_brand,
                   b.Business_type_ID AS business_type_id,
                   bt.Business_name AS business_type,
                   {$businessStatusOuterSelect}
                   TRIM(CONCAT_WS(', ', b.Street_address, b.Barangay, b.Municipality, b.Province, b.Postal_code)) AS business_address,
                   b.Province AS business_province,
                   b.Municipality AS business_municipality,
                   b.Postal_code AS business_postal_code,
                   b.Barangay AS business_barangay,
                   b.Street_address AS business_street_address
            FROM client c
            {$civilStatusJoin}
            LEFT JOIN status s ON s.Status_id = c.Status_id
            LEFT JOIN user u ON u.User_id = c.User_id
            {$actionByJoin}
            LEFT JOIN role r ON r.Role_id = u.Role_id
            LEFT JOIN (
                SELECT b1.Client_ID,
                       b1.Business_id,
                       b1.`{$tradeColumn}` AS trade_name_value,
                       b1.Business_type_ID,
                       {$businessStatusInnerSelect}
                       b1.Province,
                       b1.Municipality,
                       b1.Postal_code,
                       b1.Barangay,
                       b1.Street_address
                FROM business b1
                INNER JOIN (
                    SELECT Client_ID, MAX(Business_id) AS max_id
                    FROM business
                    GROUP BY Client_ID
                ) bx ON bx.Client_ID = b1.Client_ID AND bx.max_id = b1.Business_id
            ) b ON b.Client_ID = c.Client_ID
            LEFT JOIN business_type bt ON bt.Business_type_ID = b.Business_type_ID
            {$businessStatusJoin}
            {$whereSql}
            ORDER BY c.Client_ID ASC";

    $stmt = $conn->prepare($sql);
    $stmt->execute($params);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];

    $documentMetaByClientId = [];
    $clientIds = [];
    foreach ($rows as $row) {
        $clientId = isset($row['id']) ? (int)$row['id'] : 0;
        if ($clientId > 0) {
            $clientIds[$clientId] = true;
        }
    }

    $businessPermitStatesByClientId = [];
    if (!empty($clientIds) && tableExists($conn, 'documents') && columnExists($conn, 'documents', 'Client_ID')) {
        $hasDocumentTypeColumn = columnExists($conn, 'documents', 'Document_type_ID');
        $hasAppointmentColumn = columnExists($conn, 'documents', 'appointment_id');
        $businessPermitTypeIds = $hasDocumentTypeColumn ? monitoring_document_business_permit_type_ids($conn) : [];

        $clientIdValues = array_values(array_map('intval', array_keys($clientIds)));
        $businessPermitStatesByClientId = monitoring_document_client_business_permit_states($conn, $clientIdValues);
        $clientPlaceholders = [];
        $documentParams = [];
        foreach ($clientIdValues as $index => $clientIdValue) {
            $placeholder = ':document_client_id_' . $index;
            $clientPlaceholders[] = $placeholder;
            $documentParams[$placeholder] = $clientIdValue;
        }

        $businessPermitCase = '0';
        if ($hasDocumentTypeColumn && !empty($businessPermitTypeIds)) {
            $businessPermitPlaceholders = [];
            foreach (array_values($businessPermitTypeIds) as $index => $typeId) {
                $placeholder = ':business_permit_type_' . $index;
                $businessPermitPlaceholders[] = $placeholder;
                $documentParams[$placeholder] = (int)$typeId;
            }

            $businessPermitCase = 'CASE WHEN d.Document_type_ID IN (' . implode(', ', $businessPermitPlaceholders) . ') THEN 1 ELSE 0 END';
        }

        $documentSql = 'SELECT d.Client_ID AS client_id,
                               COUNT(*) AS document_count,
                               MAX(' . $businessPermitCase . ') AS has_business_permit
                        FROM documents d
                        WHERE d.Client_ID IN (' . implode(', ', $clientPlaceholders) . ')';
        if ($hasAppointmentColumn) {
            $documentSql .= ' AND d.appointment_id IS NULL';
        }
        $documentSql .= ' GROUP BY d.Client_ID';

        try {
            $documentStmt = $conn->prepare($documentSql);
            $documentStmt->execute($documentParams);
            $documentRows = $documentStmt->fetchAll(PDO::FETCH_ASSOC) ?: [];
            foreach ($documentRows as $documentRow) {
                $clientId = isset($documentRow['client_id']) ? (int)$documentRow['client_id'] : 0;
                if ($clientId <= 0) {
                    continue;
                }

                $documentMetaByClientId[$clientId] = [
                    'document_count' => isset($documentRow['document_count']) ? (int)$documentRow['document_count'] : 0,
                    'has_business_permit' => !empty($documentRow['has_business_permit']),
                    'permit_state' => $businessPermitStatesByClientId[$clientId] ?? null,
                ];
            }
        } catch (Throwable $__) {
            $documentMetaByClientId = [];
        }
    }

    foreach ($rows as &$row) {
        $row['approval_status'] = resolveApprovalStatus(
            $row['status_id'] ?? null,
            isset($row['status']) ? (string)$row['status'] : null,
            'Pending'
        );
        $clientId = isset($row['id']) ? (int)$row['id'] : 0;
        $documentMeta = $documentMetaByClientId[$clientId] ?? null;
        $permitState = is_array($documentMeta) && is_array($documentMeta['permit_state'] ?? null)
            ? $documentMeta['permit_state']
            : ($businessPermitStatesByClientId[$clientId] ?? monitoring_document_client_business_permit_state($conn, $clientId));
        $hasBusinessPermit = !empty($permitState['has_active_business_permit']);
        $hasExpiredBusinessPermit = !empty($permitState['has_expired_business_permit']);
        $hasAnyBusinessPermit = !empty($permitState['has_business_permit']);
        $hasBusinessRecord = isset($row['business_id']) && (int)$row['business_id'] > 0;
        $businessStatus = resolveBusinessStatus(
            isset($row['business_status_name']) ? (string)$row['business_status_name'] : null,
            $row['business_status_id'] ?? null,
            $hasBusinessPermit,
            $hasExpiredBusinessPermit,
            $hasBusinessRecord
        );
        $row['document_count'] = is_array($documentMeta) && isset($documentMeta['document_count'])
            ? (int)$documentMeta['document_count']
            : 0;
        $row['has_business_permit'] = $hasAnyBusinessPermit;
        $row['has_expired_business_permit'] = $hasExpiredBusinessPermit;
        $row['business_permit_expiration_date'] = $permitState['expiration_date'] ?? null;
        $row['business_status_name'] = $businessStatus;
        $row['business_status'] = $businessStatus;
        $row['document_status'] = $businessStatus === 'Registered'
            ? 'Registered'
            : ($businessStatus === 'Expired' ? 'Expired' : 'Pending');
    }
    unset($row);

    respond(200, ['success' => true, 'clients' => $rows]);
} catch (Throwable $e) {
    respond(500, ['success' => false, 'message' => 'Server error', 'error' => $e->getMessage()]);
}
