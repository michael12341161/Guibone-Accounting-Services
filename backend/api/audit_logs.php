<?php

require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/connection-pdo.php';
require_once __DIR__ . '/audit_logs_helper.php';

monitoring_bootstrap_api(['GET', 'OPTIONS']);

if (strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'GET')) !== 'GET') {
    monitoring_auth_respond(405, ['success' => false, 'message' => 'Method not allowed.']);
}

try {
    monitoring_require_roles([MONITORING_ROLE_ADMIN]);

    $range = isset($_GET['range']) ? (string)$_GET['range'] : '30d';
    $search = isset($_GET['search']) ? (string)$_GET['search'] : '';
    $page = isset($_GET['page']) ? (int)$_GET['page'] : 1;
    $perPage = isset($_GET['per_page']) ? (int)$_GET['per_page'] : (isset($_GET['limit']) ? (int)$_GET['limit'] : 25);

    $result = monitoring_fetch_audit_logs($conn, [
        'range' => $range,
        'search' => $search,
        'page' => $page,
        'per_page' => $perPage,
    ]);

    monitoring_auth_respond(200, [
        'success' => true,
        'logs' => $result['logs'],
        'meta' => [
            'range' => $range,
            'search' => $search,
            'count' => count($result['logs']),
            'total' => (int)($result['total'] ?? 0),
            'page' => (int)($result['page'] ?? 1),
            'per_page' => (int)($result['per_page'] ?? $perPage),
            'total_pages' => (int)($result['total_pages'] ?? 1),
        ],
    ]);
} catch (Throwable $e) {
    monitoring_auth_respond(500, [
        'success' => false,
        'message' => 'Unable to load audit logs.',
    ]);
}
