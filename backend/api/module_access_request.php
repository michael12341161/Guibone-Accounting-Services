<?php

require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/connection-pdo.php';

monitoring_bootstrap_api(['POST', 'OPTIONS']);

function respond(int $code, array $payload): void
{
    http_response_code($code);
    echo json_encode($payload);
    exit;
}

function ensureNotificationsTable(PDO $conn): void
{
    monitoring_require_schema_columns(
        $conn,
        'notifications',
        ['notifications_ID', 'user_id', 'sender_id', 'type', 'message', 'is_read', 'created_at'],
        'module access requests'
    );
}

function buildDisplayName(array $user): string
{
    $parts = [];
    foreach (['first_name', 'middle_name', 'last_name'] as $key) {
        $value = trim((string)($user[$key] ?? ''));
        if ($value !== '') {
            $parts[] = $value;
        }
    }

    if (!empty($parts)) {
        return trim(implode(' ', $parts));
    }

    return trim((string)($user['username'] ?? ''));
}

function resolveRoleLabel(int $roleId): string
{
    if ($roleId === MONITORING_ROLE_ADMIN) {
        return 'Admin';
    }
    if ($roleId === MONITORING_ROLE_SECRETARY) {
        return 'Secretary';
    }
    if ($roleId === MONITORING_ROLE_ACCOUNTANT) {
        return 'Accountant';
    }
    if ($roleId === MONITORING_ROLE_CLIENT) {
        return 'Client';
    }

    return 'User';
}

function humanizeModuleLabel(string $moduleKey): string
{
    $normalized = trim($moduleKey);
    if ($normalized === '') {
        return 'this page';
    }

    $normalized = str_replace(['-', '_'], ' ', $normalized);
    return ucwords($normalized);
}

try {
    $sessionUser = monitoring_require_auth();

    if (strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'POST')) !== 'POST') {
        respond(405, [
            'success' => false,
            'message' => 'Method not allowed',
        ]);
    }

    $raw = file_get_contents('php://input');
    $data = json_decode($raw, true);
    if (!is_array($data)) {
        respond(400, [
            'success' => false,
            'message' => 'Invalid JSON payload',
        ]);
    }

    $moduleKey = trim((string)($data['module_key'] ?? ''));
    $moduleLabel = trim((string)($data['module_label'] ?? ''));
    if ($moduleKey === '') {
        respond(422, [
            'success' => false,
            'message' => 'module_key is required',
        ]);
    }

    $senderId = isset($sessionUser['id']) ? (int)$sessionUser['id'] : 0;
    if ($senderId <= 0) {
        respond(401, [
            'success' => false,
            'message' => 'Authentication is required.',
        ]);
    }

    $senderLabel = resolveRoleLabel((int)($sessionUser['role_id'] ?? 0));
    $senderName = buildDisplayName($sessionUser);
    if ($senderName === '') {
        $senderName = 'Unknown user';
    }

    if ($moduleLabel === '') {
        $moduleLabel = humanizeModuleLabel($moduleKey);
    }

    $message = sprintf('%s %s requested access to %s.', $senderLabel, $senderName, $moduleLabel);

    $conn->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    ensureNotificationsTable($conn);

    $adminStmt = $conn->prepare(
        'SELECT User_id
         FROM user
         WHERE Role_id = :role_id'
    );
    $adminStmt->execute([':role_id' => MONITORING_ROLE_ADMIN]);
    $adminIds = array_values(array_filter(array_map(static function ($value) {
        $id = (int)$value;
        return $id > 0 ? $id : null;
    }, $adminStmt->fetchAll(PDO::FETCH_COLUMN) ?: [])));

    if (empty($adminIds)) {
        respond(404, [
            'success' => false,
            'message' => 'No admin users are available to receive the request.',
        ]);
    }

    $insert = $conn->prepare(
        'INSERT INTO notifications (user_id, sender_id, type, message, is_read)
         VALUES (:user_id, :sender_id, :type, :message, 0)'
    );

    foreach ($adminIds as $adminId) {
        $insert->execute([
            ':user_id' => $adminId,
            ':sender_id' => $senderId,
            ':type' => 'access_request',
            ':message' => $message,
        ]);
    }

    respond(200, [
        'success' => true,
        'message' => 'Access request sent to Admin.',
        'notified_admins' => count($adminIds),
    ]);
} catch (Throwable $e) {
    respond(500, [
        'success' => false,
        'message' => 'Server error',
        'error' => $e->getMessage(),
    ]);
}
