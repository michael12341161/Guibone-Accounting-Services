<?php

require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/connection-pdo.php';
require_once __DIR__ . '/certificate_helpers.php';

monitoring_bootstrap_api(['GET', 'POST', 'OPTIONS']);

function certificate_templates_respond(int $code, array $payload): void
{
    http_response_code($code);
    echo json_encode($payload);
    exit;
}

try {
    $sessionUser = monitoring_require_roles([MONITORING_ROLE_ADMIN, MONITORING_ROLE_SECRETARY]);
    $conn->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    monitoring_ensure_certificate_storage($conn);

    $method = strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'GET'));
    if ($method === 'GET') {
        certificate_templates_respond(200, [
            'success' => true,
            'state' => monitoring_certificate_build_state($conn),
        ]);
    }

    $raw = file_get_contents('php://input');
    $data = json_decode($raw ?: '{}', true);
    if (!is_array($data)) {
        certificate_templates_respond(400, ['success' => false, 'message' => 'Invalid JSON payload.']);
    }

    $action = trim((string)($data['action'] ?? ''));
    if ($action === '') {
        certificate_templates_respond(422, ['success' => false, 'message' => 'action is required.']);
    }

    if ($action === 'save_template') {
        $result = monitoring_certificate_upsert_template($conn, $data, $sessionUser);
        certificate_templates_respond(200, [
            'success' => true,
            'message' => 'Certificate template saved.',
            'template_id' => $result['templateId'],
            'state' => $result['state'],
            'sync' => $result['sync'] ?? null,
        ]);
    }

    if ($action === 'save_selected_templates') {
        $selectedTemplateIds = $data['selected_template_ids'] ?? $data['selectedTemplateIds'] ?? [];
        if (!is_array($selectedTemplateIds)) {
            certificate_templates_respond(422, ['success' => false, 'message' => 'selected_template_ids must be an array.']);
        }

        $state = monitoring_certificate_set_selected_templates($conn, $selectedTemplateIds, $sessionUser);
        certificate_templates_respond(200, [
            'success' => true,
            'message' => 'Selected certificate templates updated.',
            'state' => $state,
        ]);
    }

    if ($action === 'delete_template') {
        $templateId = trim((string)($data['template_id'] ?? $data['templateId'] ?? ''));
        $state = monitoring_certificate_delete_template($conn, $templateId, $sessionUser);
        certificate_templates_respond(200, [
            'success' => true,
            'message' => 'Certificate template removed.',
            'state' => $state,
        ]);
    }

    certificate_templates_respond(422, ['success' => false, 'message' => 'Unsupported action.']);
} catch (RuntimeException $e) {
    certificate_templates_respond(422, ['success' => false, 'message' => $e->getMessage()]);
} catch (Throwable $e) {
    certificate_templates_respond(500, [
        'success' => false,
        'message' => 'Server error',
        'error' => $e->getMessage(),
    ]);
}
