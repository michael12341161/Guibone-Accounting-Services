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
    monitoring_require_auth();
    $conn->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

    $stmt = $conn->query('SELECT announcement_ID AS id, title, description, start_date, end_date, created_by, created_at FROM announcements ORDER BY created_at DESC, announcement_ID DESC');
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

    respond(200, ['success' => true, 'announcements' => $rows]);
} catch (Throwable $e) {
    respond(500, ['success' => false, 'message' => 'Server error', 'error' => $e->getMessage()]);
}
