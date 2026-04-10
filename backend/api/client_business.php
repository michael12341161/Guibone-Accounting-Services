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
    $clientId = null;
    if (isset($_GET['client_id'])) {
        $clientId = (int)$_GET['client_id'];
    } elseif (isset($_GET['id'])) {
        $clientId = (int)$_GET['id'];
    }

    if (!$clientId) {
        respond(400, ['success' => false, 'message' => 'client_id is required.']);
    }

    monitoring_require_client_access((int)$clientId, [MONITORING_ROLE_ADMIN, MONITORING_ROLE_SECRETARY]);
    $conn->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $tradeColumn = getBusinessTradeColumn($conn);
    $hasBusinessStatusColumn = columnExists($conn, 'business', 'Status_id');
    $hasStatusTable = tableExists($conn, 'status');
    $businessStatusSelect = 'NULL AS business_status_id,
                              NULL AS business_status_name,';
    $businessStatusJoin = '';

    if ($hasBusinessStatusColumn) {
        if ($hasStatusTable) {
            $businessStatusSelect = 'b.Status_id AS business_status_id,
                              bs.Status_name AS business_status_name,';
            $businessStatusJoin = 'LEFT JOIN status bs ON bs.Status_id = b.Status_id';
        } else {
            $businessStatusSelect = 'b.Status_id AS business_status_id,
                              NULL AS business_status_name,';
        }
    }

    $qb = $conn->prepare("SELECT 
                              b.Business_id AS business_id,
                              b.Client_ID AS client_id,
                              b.{$tradeColumn} AS business_trade_name,
                              b.{$tradeColumn} AS business_brand,
                              b.Business_type_ID AS business_type_id,
                              bt.Business_name AS business_type,
                              {$businessStatusSelect}
                              TRIM(CONCAT_WS(', ', b.Street_address, b.Barangay, b.Municipality, b.Province, b.Postal_code)) AS business_address,
                              b.Province AS business_province,
                              b.Municipality AS business_municipality,
                              b.Postal_code AS business_postal_code,
                              b.Barangay AS business_barangay,
                              b.Street_address AS business_street_address,
                              b.Email_address AS business_email,
                              b.TIN_number AS business_tin,
                              b.Contact_number AS business_contact,
                              b.Date_added AS business_date_added
                           FROM business b
                           LEFT JOIN business_type bt ON bt.Business_type_ID = b.Business_type_ID
                           {$businessStatusJoin}
                           WHERE b.Client_ID = :cid
                           ORDER BY b.Business_id DESC
                           LIMIT 1");
    $qb->execute([':cid' => $clientId]);
    $biz = $qb->fetch(PDO::FETCH_ASSOC) ?: null;

    if ($biz !== null) {
        $permitState = monitoring_document_client_business_permit_state($conn, $clientId);
        $hasBusinessPermit = !empty($permitState['has_business_permit']);
        $hasActiveBusinessPermit = !empty($permitState['has_active_business_permit']);
        $hasExpiredBusinessPermit = !empty($permitState['has_expired_business_permit']);
        $statusName = isset($biz['business_status_name']) ? (string)$biz['business_status_name'] : null;
        $statusId = $biz['business_status_id'] ?? null;
        $businessStatus = monitoring_business_status_label($statusName, $statusId, 'Pending');
        if ($hasExpiredBusinessPermit) {
            $businessStatus = 'Expired';
        } elseif ($hasActiveBusinessPermit) {
            $businessStatus = 'Registered';
        }

        $biz['business_status_name'] = $businessStatus;
        $biz['business_status'] = $businessStatus;
        $biz['document_status'] = $businessStatus === 'Registered'
            ? 'Registered'
            : ($businessStatus === 'Expired' ? 'Expired' : 'Pending');
        $biz['has_business_permit'] = $hasBusinessPermit;
        $biz['has_expired_business_permit'] = $hasExpiredBusinessPermit;
        $biz['business_permit_expiration_date'] = $permitState['expiration_date'] ?? null;
    }

    respond(200, ['success' => true, 'business' => $biz]);
} catch (Throwable $e) {
    respond(500, ['success' => false, 'message' => 'Server error', 'error' => $e->getMessage()]);
}
