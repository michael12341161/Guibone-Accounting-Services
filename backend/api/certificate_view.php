<?php

require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/connection-pdo.php';
require_once __DIR__ . '/certificate_helpers.php';

monitoring_bootstrap_api(['GET', 'OPTIONS']);

function certificate_view_respond(int $code, array $payload): void
{
    http_response_code($code);
    echo json_encode($payload);
    exit;
}

function certificate_view_normalize_template(array $template): array
{
    return monitoring_certificate_normalize_template_payload($template);
}

function certificate_view_merge_template_assets(array $template, array $assetTemplate): array
{
    $merged = certificate_view_normalize_template($template);
    $assetTemplate = certificate_view_normalize_template($assetTemplate);

    if (trim((string)($merged['logoSrc'] ?? '')) === '') {
        $merged['logoSrc'] = (string)($assetTemplate['logoSrc'] ?? '');
    }

    $signatureBlocks = [];
    $renderedBlocks = is_array($merged['signatureBlocks'] ?? null) ? $merged['signatureBlocks'] : [];
    $assetBlocks = is_array($assetTemplate['signatureBlocks'] ?? null) ? $assetTemplate['signatureBlocks'] : [];

    foreach ($renderedBlocks as $index => $block) {
        if (!is_array($block)) {
            continue;
        }

        if (
            trim((string)($block['signatureSrc'] ?? '')) === ''
            && isset($assetBlocks[$index])
            && is_array($assetBlocks[$index])
            && trim((string)($assetBlocks[$index]['signatureSrc'] ?? '')) !== ''
        ) {
            $block['signatureSrc'] = (string)$assetBlocks[$index]['signatureSrc'];
        }

        $signatureBlocks[] = $block;
    }

    if (!empty($signatureBlocks)) {
        $merged['signatureBlocks'] = $signatureBlocks;
    } elseif (!empty($assetBlocks)) {
        $merged['signatureBlocks'] = $assetBlocks;
    }

    return $merged;
}

function certificate_view_build_html(PDO $conn, array $row, array $tokens): string
{
    $storedHtml = trim((string)($row['certificate_html'] ?? ''));
    $template = [];
    $snapshotSource = trim((string)($row['template_snapshot'] ?? ''));
    if ($snapshotSource !== '') {
        $decoded = json_decode($snapshotSource, true);
        if (is_array($decoded)) {
            $template = certificate_view_normalize_template($decoded);
        }
    }

    $editCertificateId = isset($row['Edit_certificate_ID']) ? (int)$row['Edit_certificate_ID'] : 0;
    if ($editCertificateId > 0) {
        $templateRow = monitoring_certificate_fetch_template_row_by_id($conn, $editCertificateId);
        if ($templateRow) {
            $templateEntry = monitoring_certificate_row_to_entry($templateRow);
            $template = certificate_view_merge_template_assets($template, $templateEntry['template']);
        }
    }

    if (empty($template)) {
        return $storedHtml;
    }

    return monitoring_certificate_build_html(
        monitoring_certificate_render_template($template, $tokens)
    );
}

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    certificate_view_respond(405, ['success' => false, 'message' => 'Method not allowed.']);
}

try {
    $sessionUser = monitoring_require_auth();
    $roleId = (int)($sessionUser['role_id'] ?? 0);
    if (!in_array($roleId, [MONITORING_ROLE_ADMIN, MONITORING_ROLE_SECRETARY, MONITORING_ROLE_CLIENT], true)) {
        monitoring_auth_respond(403, ['success' => false, 'message' => 'Access denied.']);
    }

    $conn->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    monitoring_ensure_certificate_storage($conn);

    $clientServiceId = isset($_GET['client_service_id']) ? (int)$_GET['client_service_id'] : 0;
    $certificateId = trim((string)($_GET['certificate_id'] ?? ''));

    if ($clientServiceId <= 0 && $certificateId === '') {
        certificate_view_respond(422, ['success' => false, 'message' => 'client_service_id or certificate_id is required.']);
    }

    $whereSql = '';
    $params = [];
    if ($clientServiceId > 0) {
        $whereSql = 'cert.Client_services_ID = :client_service_id';
        $params[':client_service_id'] = $clientServiceId;
    } else {
        $whereSql = 'cert.certificate_id = :certificate_id';
        $params[':certificate_id'] = $certificateId;
    }

    $stmt = $conn->prepare(
        'SELECT
            cert.certificates_ID,
            cert.certificate_id,
            cert.Client_ID AS certificate_client_id,
            cert.Client_services_ID,
            cert.Services_type_Id,
            cert.Edit_certificate_ID,
            cert.issue_date,
            cert.issued_by,
            cert.company_name,
            cert.template_snapshot,
            cert.certificate_html,
            cert.recipient_email,
            cert.delivery_status,
            cert.delivery_message,
            cert.delivered_at,
            cs.Client_ID AS task_client_id,
            COALESCE(cs.Steps, "") AS steps,
            COALESCE(st.Name, cs.Name) AS service_name,
            CONCAT_WS(" ", c.First_name, c.Middle_name, c.Last_name) AS client_name,
            c.First_name AS first_name,
            c.Middle_name AS middle_name,
            c.Last_name AS last_name,
            c.Email AS client_email,
            COALESCE(
                NULLIF(TRIM(CONCAT_WS(" ", NULLIF(TRIM(acc.first_name), ""), NULLIF(TRIM(acc.middle_name), ""), NULLIF(TRIM(acc.last_name), ""))), ""),
                NULLIF(TRIM(acc.Username), "")
            ) AS accountant_name_display
         FROM certificates cert
         LEFT JOIN client_services cs ON cs.Client_services_ID = cert.Client_services_ID
         LEFT JOIN services_type st ON st.Services_type_Id = cert.Services_type_Id
         LEFT JOIN client c ON c.Client_ID = COALESCE(cs.Client_ID, cert.Client_ID)
         LEFT JOIN user acc ON acc.User_id = cs.User_ID
         WHERE ' . $whereSql . '
         LIMIT 1'
    );
    $stmt->execute($params);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$row) {
        certificate_view_respond(404, ['success' => false, 'message' => 'Certificate not found.']);
    }

    $clientId = isset($row['task_client_id']) && $row['task_client_id'] !== null
        ? (int)$row['task_client_id']
        : (int)($row['certificate_client_id'] ?? 0);

    if ($roleId === MONITORING_ROLE_CLIENT && $clientId !== (int)($sessionUser['client_id'] ?? 0)) {
        monitoring_auth_respond(403, ['success' => false, 'message' => 'Access denied.']);
    }

    $tokens = monitoring_certificate_build_tokens(
        monitoring_certificate_build_render_context($conn, $row, [
            'service_label' => $row['service_name'] ?? '',
            'issue_date' => trim((string)($row['issue_date'] ?? '')),
            'end_date' => trim((string)($row['issue_date'] ?? '')),
            'certificate_id' => trim((string)($row['certificate_id'] ?? '')),
            'issued_by' => trim((string)($row['issued_by'] ?? '')),
            'client_email' => trim((string)($row['recipient_email'] ?? $row['client_email'] ?? '')),
            'accountant_name' => trim((string)($row['accountant_name_display'] ?? '')),
            'client_name' => trim((string)($row['client_name'] ?? '')),
            'issuer_user' => $roleId === MONITORING_ROLE_ADMIN ? $sessionUser : [],
        ])
    );

    $html = certificate_view_build_html($conn, $row, $tokens);
    if ($html === '') {
        certificate_view_respond(404, ['success' => false, 'message' => 'Certificate preview is not available.']);
    }

    certificate_view_respond(200, [
        'success' => true,
        'certificate' => [
            'id' => isset($row['certificates_ID']) ? (int)$row['certificates_ID'] : null,
            'certificate_id' => (string)($row['certificate_id'] ?? ''),
            'client_service_id' => isset($row['Client_services_ID']) ? (int)$row['Client_services_ID'] : null,
            'service_name' => $row['service_name'] ?? null,
            'client_name' => $row['client_name'] ?? null,
            'issue_date' => $row['issue_date'] ?? null,
            'issued_by' => $row['issued_by'] ?? null,
            'company_name' => $row['company_name'] ?? null,
            'delivery_status' => $row['delivery_status'] ?? null,
            'delivery_message' => $row['delivery_message'] ?? null,
            'delivered_at' => $row['delivered_at'] ?? null,
            'html' => $html,
        ],
    ]);
} catch (Throwable $e) {
    certificate_view_respond(500, [
        'success' => false,
        'message' => 'Server error',
    ]);
}
