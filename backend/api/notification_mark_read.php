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

    $rawNotificationIds = [];
    if (isset($data['notification_ids']) && is_array($data['notification_ids'])) {
        $rawNotificationIds = $data['notification_ids'];
    } elseif (isset($data['notificationIds']) && is_array($data['notificationIds'])) {
        $rawNotificationIds = $data['notificationIds'];
    } else {
        $rawNotificationIds = [
            $data['notification_id'] ?? $data['notifications_ID'] ?? $data['id'] ?? 0,
        ];
    }

    $notificationIds = [];
    foreach ($rawNotificationIds as $value) {
        $notificationId = (int)$value;
        if ($notificationId > 0) {
            $notificationIds[$notificationId] = true;
        }
    }
    $notificationIds = array_values(array_map('intval', array_keys($notificationIds)));

    if (empty($notificationIds)) {
        respond(422, ['success' => false, 'message' => 'notification_id is required']);
    }

    $userId = isset($sessionUser['id']) ? (int)$sessionUser['id'] : 0;
    if ($userId <= 0) {
        respond(401, ['success' => false, 'message' => 'Authentication is required.']);
    }

    $placeholders = [];
    $params = [':uid' => $userId];
    foreach ($notificationIds as $index => $notificationId) {
        $placeholder = ':nid_' . $index;
        $placeholders[] = $placeholder;
        $params[$placeholder] = $notificationId;
    }

    $stmt = $conn->prepare(
        'UPDATE notifications
         SET is_read = 1
         WHERE user_id = :uid
           AND notifications_ID IN (' . implode(', ', $placeholders) . ')'
    );
    $stmt->execute($params);

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
        'updated_ids' => $notificationIds,
        'unread_count' => $unreadCount,
    ]);
} catch (Throwable $e) {
    error_log('notification_mark_read error: ' . $e->getMessage());
    respond(500, ['success' => false, 'message' => 'Server error']);
}
