<?php
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/connection-pdo.php';

monitoring_bootstrap_api(['GET', 'OPTIONS']);

function respond($code, $payload) {
    http_response_code($code);
    echo json_encode($payload);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    respond(405, ['success' => false, 'message' => 'Method not allowed']);
}

try {
    $sessionUser = monitoring_require_auth();
    $conn->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    if (session_status() === PHP_SESSION_ACTIVE) {
        session_write_close();
    }

    $userId = isset($sessionUser['id']) ? (int)$sessionUser['id'] : 0;
    if ($userId <= 0) {
        respond(401, ['success' => false, 'message' => 'Authentication is required.']);
    }

    $stmt = $conn->prepare(
        'SELECT notifications_ID,
                user_id,
                sender_id,
                type,
                message,
                is_read,
                created_at
         FROM notifications
         WHERE user_id = :uid
         ORDER BY created_at DESC, notifications_ID DESC'
    );
    $stmt->execute([':uid' => $userId]);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];

    $countStmt = $conn->prepare(
        'SELECT COUNT(*)
         FROM notifications
         WHERE user_id = :uid
           AND is_read = 0'
    );
    $countStmt->execute([':uid' => $userId]);
    $unreadCount = (int)($countStmt->fetchColumn() ?: 0);

    respond(200, [
        'success' => true,
        'notifications' => $rows,
        'unread_count' => $unreadCount,
    ]);
} catch (Throwable $e) {
    respond(500, ['success' => false, 'message' => 'Server error', 'error' => $e->getMessage()]);
}
