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
    monitoring_require_roles([MONITORING_ROLE_ADMIN, MONITORING_ROLE_SECRETARY]);
    $conn->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

    $raw = file_get_contents('php://input');
    $data = json_decode($raw, true);
    if (!is_array($data)) {
        respond(400, ['success' => false, 'message' => 'Invalid JSON payload']);
    }

    $id = isset($data['id']) ? (int)$data['id'] : 0;
    $title = isset($data['title']) ? trim((string)$data['title']) : '';
    $description = isset($data['description']) ? trim((string)$data['description']) : '';
    $startDate = isset($data['start_date']) ? trim((string)$data['start_date']) : '';
    $endDate = isset($data['end_date']) ? trim((string)$data['end_date']) : '';

    if ($id <= 0 || $title === '' || $description === '') {
        respond(422, ['success' => false, 'message' => 'ID, title and description are required.']);
    }

    $startDate = $startDate !== '' ? $startDate : null;
    $endDate = $endDate !== '' ? $endDate : null;

    $stmt = $conn->prepare('UPDATE announcements SET title = :t, description = :d, start_date = :sd, end_date = :ed WHERE announcement_ID = :id');
    $stmt->execute([
        ':t' => $title,
        ':d' => $description,
        ':sd' => $startDate,
        ':ed' => $endDate,
        ':id' => $id,
    ]);

    respond(200, ['success' => true]);
} catch (Throwable $e) {
    respond(500, ['success' => false, 'message' => 'Server error', 'error' => $e->getMessage()]);
}
