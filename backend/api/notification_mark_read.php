<?php
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/connection-pdo.php';

monitoring_bootstrap_api(['POST', 'OPTIONS']);

function respond($code, $payload) {
    http_response_code($code);
    echo json_encode($payload);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    respond(405, ['success' => false, 'message' => 'Method not allowed']);
}

try {
    $sessionUser = monitoring_require_auth();
    $conn->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

    $raw = file_get_contents('php://input');
    $data = json_decode($raw, true);
    if (!is_array($data)) {
        respond(400, ['success' => false, 'message' => 'Invalid JSON payload']);
    }

    $notificationId = (int)($data['notification_id'] ?? $data['notifications_ID'] ?? $data['id'] ?? 0);
    if ($notificationId <= 0) {
        respond(422, ['success' => false, 'message' => 'notification_id is required']);
    }

    $userId = isset($sessionUser['id']) ? (int)$sessionUser['id'] : 0;
    if ($userId <= 0) {
        respond(401, ['success' => false, 'message' => 'Authentication is required.']);
    }

    $stmt = $conn->prepare(
        'UPDATE notifications
         SET is_read = 1
         WHERE notifications_ID = :nid
           AND user_id = :uid'
    );
    $stmt->execute([
        ':nid' => $notificationId,
        ':uid' => $userId,
    ]);

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
        'updated' => $stmt->rowCount() > 0,
        'unread_count' => $unreadCount,
    ]);
} catch (Throwable $e) {
    respond(500, ['success' => false, 'message' => 'Server error', 'error' => $e->getMessage()]);
}
