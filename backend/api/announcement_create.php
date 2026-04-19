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
    $sessionUser = monitoring_require_roles([MONITORING_ROLE_ADMIN, MONITORING_ROLE_SECRETARY]);
    $conn->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

    $raw = file_get_contents('php://input');
    $data = json_decode($raw, true);
    if (!is_array($data)) {
        respond(400, ['success' => false, 'message' => 'Invalid JSON payload']);
    }

    $title = isset($data['title']) ? trim((string)$data['title']) : '';
    $description = isset($data['description']) ? trim((string)$data['description']) : '';
    $startDate = isset($data['start_date']) ? trim((string)$data['start_date']) : '';
    $endDate = isset($data['end_date']) ? trim((string)$data['end_date']) : '';
    $createdBy = (int)($sessionUser['id'] ?? 0);

    if ($title === '' || $description === '') {
        respond(422, ['success' => false, 'message' => 'Title and description are required.']);
    }

    // Normalize empty strings to NULL
    $startDate = $startDate !== '' ? $startDate : null;
    $endDate = $endDate !== '' ? $endDate : null;
    if ($createdBy === 0) {
        $createdBy = null;
    }

    $stmt = $conn->prepare('INSERT INTO announcements (title, description, start_date, end_date, created_by) VALUES (:t, :d, :sd, :ed, :cb)');
    $stmt->execute([
        ':t' => $title,
        ':d' => $description,
        ':sd' => $startDate,
        ':ed' => $endDate,
        ':cb' => $createdBy,
    ]);

    $id = (int)$conn->lastInsertId();

    respond(201, [
        'success' => true,
        'id' => $id,
        'announcement' => [
            'id' => $id,
            'title' => $title,
            'description' => $description,
            'start_date' => $startDate,
            'end_date' => $endDate,
            'created_by' => $createdBy,
        ],
    ]);
} catch (Throwable $e) {
    error_log('announcement_create error: ' . $e->getMessage());
    respond(500, ['success' => false, 'message' => 'Server error']);
}
