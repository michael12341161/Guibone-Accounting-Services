<?php

require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/connection-pdo.php';
require_once __DIR__ . '/audit_logs_helper.php';

monitoring_bootstrap_api(['POST', 'OPTIONS']);

if (strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'GET')) !== 'POST') {
    monitoring_auth_respond(405, ['success' => false, 'message' => 'Method not allowed']);
}

$sessionUser = monitoring_read_session_user_from_session(false, false);
if (!is_array($sessionUser)) {
    $decodedJwt = monitoring_decode_jwt(monitoring_get_bearer_token());
    $sessionUser = is_array($decodedJwt['user'] ?? null) ? $decodedJwt['user'] : null;
}
if (is_array($sessionUser) && isset($sessionUser['id'])) {
    monitoring_write_audit_log($conn, (int)$sessionUser['id'], 'Logged out');
}

monitoring_destroy_session();

monitoring_auth_respond(200, [
    'success' => true,
    'message' => 'Logged out successfully.',
]);
