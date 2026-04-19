<?php
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/connection-pdo.php';
require_once __DIR__ . '/business_permit_expiry_monitor.php';
require_once __DIR__ . '/task_deadline_monitor.php';

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

    try {
        monitoring_run_task_deadline_monitor($conn);
    } catch (Throwable $__) {
        // Do not block notification fetches if deadline monitoring encounters an issue.
    }
    try {
        monitoring_run_business_permit_expiry_monitor($conn);
    } catch (Throwable $__) {
        // Do not block notification fetches if business permit expiry monitoring encounters an issue.
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
    $rows = monitoring_filter_current_task_deadline_notifications($conn, $rows);
    $rows = monitoring_filter_current_business_permit_notifications($conn, $rows);
    $unreadCount = 0;
    foreach ($rows as $row) {
        if ((int)($row['is_read'] ?? 0) === 0) {
            $unreadCount++;
        }
    }

    respond(200, [
        'success' => true,
        'notifications' => $rows,
        'unread_count' => $unreadCount,
    ]);
} catch (Throwable $e) {
    error_log('notification_list error: ' . $e->getMessage());
    respond(500, ['success' => false, 'message' => 'Server error']);
}
