<?php
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/disposable_email_helpers.php';

monitoring_bootstrap_api(['GET', 'POST', 'OPTIONS']);

function temp_mail_blocker_respond(int $code, array $payload): void {
    http_response_code($code);
    echo json_encode($payload);
    exit;
}

try {
    monitoring_require_roles([MONITORING_ROLE_ADMIN]);

    $method = strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'GET'));
    if ($method === 'GET') {
        temp_mail_blocker_respond(200, [
            'success' => true,
            'entries' => monitoring_temp_mail_read_entries(),
            'message' => monitoring_temp_mail_blocked_message(),
            'mailchecker_enabled' => true,
        ]);
    }

    if ($method !== 'POST') {
        temp_mail_blocker_respond(405, ['success' => false, 'message' => 'Method not allowed.']);
    }

    $raw = file_get_contents('php://input');
    $data = json_decode($raw, true);
    if (!is_array($data)) {
        temp_mail_blocker_respond(400, ['success' => false, 'message' => 'Invalid JSON payload.']);
    }

    $action = strtolower(trim((string)($data['action'] ?? '')));
    if ($action === 'add') {
        $result = monitoring_temp_mail_add_entry((string)($data['value'] ?? ''));
        if (empty($result['added'])) {
            temp_mail_blocker_respond(409, [
                'success' => false,
                'message' => 'This email or domain is already blocked.',
                'entry' => $result['entry'],
                'entries' => $result['entries'],
            ]);
        }

        temp_mail_blocker_respond(201, [
            'success' => true,
            'message' => 'Blocked entry added.',
            'entry' => $result['entry'],
            'entries' => $result['entries'],
        ]);
    }

    if ($action === 'remove') {
        $result = monitoring_temp_mail_remove_entry((string)($data['id'] ?? $data['value'] ?? ''));
        temp_mail_blocker_respond(200, [
            'success' => true,
            'message' => 'Blocked entry removed.',
            'entry' => $result['entry'],
            'entries' => $result['entries'],
        ]);
    }

    temp_mail_blocker_respond(422, ['success' => false, 'message' => 'Unsupported action.']);
} catch (InvalidArgumentException $e) {
    temp_mail_blocker_respond(422, ['success' => false, 'message' => $e->getMessage()]);
} catch (Throwable $e) {
    error_log('temp_mail_blocker error: ' . $e->getMessage());
    temp_mail_blocker_respond(500, ['success' => false, 'message' => 'Server error']);
}
