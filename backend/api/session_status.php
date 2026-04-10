<?php

require_once __DIR__ . '/auth.php';

monitoring_bootstrap_api(['GET', 'OPTIONS']);

if (strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'GET')) !== 'GET') {
    monitoring_auth_respond(405, ['success' => false, 'message' => 'Method not allowed']);
}

$user = monitoring_read_session_user(true);
if ($user === null) {
    monitoring_auth_respond(200, [
        'success' => true,
        'authenticated' => false,
        'user' => null,
    ]);
}
if (session_status() === PHP_SESSION_ACTIVE) {
    session_write_close();
}

monitoring_auth_respond(200, [
    'success' => true,
    'authenticated' => true,
    'user' => [
        'id' => (int)$user['id'],
        'username' => $user['username'] ?? null,
        'role_id' => (int)$user['role_id'],
        'client_id' => array_key_exists('client_id', $user) && $user['client_id'] !== null ? (int)$user['client_id'] : null,
        'email' => $user['email'] ?? null,
        'first_name' => $user['first_name'] ?? null,
        'middle_name' => $user['middle_name'] ?? null,
        'last_name' => $user['last_name'] ?? null,
        'profile_image' => $user['profile_image'] ?? null,
        'password_changed_at' => $user['password_changed_at'] ?? null,
        'password_expires_at' => $user['password_expires_at'] ?? null,
        'password_days_until_expiry' => array_key_exists('password_days_until_expiry', $user)
            ? ($user['password_days_until_expiry'] !== null ? (int)$user['password_days_until_expiry'] : null)
            : null,
        'registration_source' => $user['registration_source'] ?? null,
        'approval_status' => $user['approval_status'] ?? null,
        'security_settings' => is_array($user['security_settings'] ?? null) ? $user['security_settings'] : [],
        'impersonation' => is_array($user['impersonation'] ?? null) ? $user['impersonation'] : null,
    ],
]);
