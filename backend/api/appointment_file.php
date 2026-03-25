<?php
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/connection-pdo.php';

monitoring_bootstrap_api(['GET', 'OPTIONS'], ['send_json_header' => false]);

function fail(int $code, string $message): void {
    http_response_code($code);
    header('Content-Type: application/json');
    echo json_encode([
        'success' => false,
        'message' => $message,
    ]);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    fail(405, 'Method not allowed');
}

$rawPath = isset($_GET['path']) ? trim((string)$_GET['path']) : '';
if ($rawPath === '') {
    fail(422, 'path is required');
}

if (preg_match('/[\x00-\x1F\x7F]/', $rawPath)) {
    fail(400, 'Invalid path');
}

$disposition = isset($_GET['disposition']) ? strtolower(trim((string)$_GET['disposition'])) : 'inline';
if ($disposition !== 'attachment') {
    $disposition = 'inline';
}

$requestedName = isset($_GET['name']) ? trim((string)$_GET['name']) : '';
if ($requestedName !== '') {
    $requestedName = preg_replace('/[^\w.\- ]+/u', '_', $requestedName);
}

$normalized = str_replace('\\', '/', $rawPath);
$normalized = ltrim($normalized, '/');
if (stripos($normalized, 'backend/') === 0) {
    $normalized = substr($normalized, strlen('backend/'));
}
$normalized = preg_replace('#/+#', '/', $normalized);

if ($normalized === '' || strpos($normalized, '..') !== false) {
    fail(400, 'Invalid path');
}

if (stripos($normalized, 'uploads/appointment_files/') !== 0) {
    fail(403, 'Access denied');
}

$backendRoot = realpath(__DIR__ . '/..');
$allowedRoot = realpath($backendRoot . DIRECTORY_SEPARATOR . 'uploads' . DIRECTORY_SEPARATOR . 'appointment_files');
if ($backendRoot === false || $allowedRoot === false) {
    fail(500, 'Upload directory is not available');
}

$fullPath = realpath($backendRoot . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $normalized));
if ($fullPath === false || strpos($fullPath, $allowedRoot) !== 0 || !is_file($fullPath)) {
    fail(404, 'File not found');
}

$sessionUser = monitoring_require_auth();
$conn->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
$documentLookup = $conn->prepare(
    'SELECT appointment_id, Client_ID
     FROM documents
     WHERE filepath = :path
     ORDER BY Documents_ID DESC
     LIMIT 1'
);
$documentLookup->execute([':path' => $normalized]);
$documentRow = $documentLookup->fetch(PDO::FETCH_ASSOC);
if (!$documentRow) {
    fail(404, 'File not found');
}

$ownerClientId = isset($documentRow['Client_ID']) && $documentRow['Client_ID'] !== null
    ? (int)$documentRow['Client_ID']
    : 0;
if ($ownerClientId <= 0 && isset($documentRow['appointment_id']) && (int)$documentRow['appointment_id'] > 0) {
    $ownerLookup = $conn->prepare('SELECT Client_ID FROM appointment WHERE Appointment_ID = :id LIMIT 1');
    $ownerLookup->execute([':id' => (int)$documentRow['appointment_id']]);
    $ownerClientId = (int)($ownerLookup->fetchColumn() ?: 0);
}
if ($ownerClientId <= 0) {
    monitoring_require_roles([MONITORING_ROLE_ADMIN, MONITORING_ROLE_SECRETARY], $sessionUser);
} else {
    monitoring_require_client_access($ownerClientId, [MONITORING_ROLE_ADMIN, MONITORING_ROLE_SECRETARY], $sessionUser);
}

$filename = $requestedName !== '' ? $requestedName : basename($fullPath);

$mimeType = 'application/octet-stream';
if (function_exists('finfo_open')) {
    $finfo = finfo_open(FILEINFO_MIME_TYPE);
    if ($finfo !== false) {
        $detected = finfo_file($finfo, $fullPath);
        if (is_string($detected) && trim($detected) !== '') {
            $mimeType = $detected;
        }
        finfo_close($finfo);
    }
} elseif (function_exists('mime_content_type')) {
    $detected = mime_content_type($fullPath);
    if (is_string($detected) && trim($detected) !== '') {
        $mimeType = $detected;
    }
}

// Fallback mapping for common file types when mime detection is unavailable
// or only returns a generic octet-stream.
$extension = strtolower(pathinfo($filename, PATHINFO_EXTENSION));
if ($extension === '') {
    $extension = strtolower(pathinfo($fullPath, PATHINFO_EXTENSION));
}
if ($mimeType === '' || $mimeType === 'application/octet-stream') {
    $fallbackMimeByExt = [
        'pdf' => 'application/pdf',
        'csv' => 'text/csv',
        'txt' => 'text/plain; charset=utf-8',
        'doc' => 'application/msword',
        'docx' => 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'xls' => 'application/vnd.ms-excel',
        'xlsx' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'jpg' => 'image/jpeg',
        'jpeg' => 'image/jpeg',
        'png' => 'image/png',
        'gif' => 'image/gif',
        'webp' => 'image/webp',
    ];
    if ($extension !== '' && isset($fallbackMimeByExt[$extension])) {
        $mimeType = $fallbackMimeByExt[$extension];
    }
}

$size = filesize($fullPath);
if ($size === false) {
    fail(500, 'Unable to read file');
}

$safeFilename = str_replace(['\\', '"'], ['\\\\', '\\"'], $filename);
header('Content-Type: ' . $mimeType);
header('Content-Length: ' . (string)$size);
header('X-Content-Type-Options: nosniff');
header('Cache-Control: private, max-age=0, must-revalidate');
if ($disposition === 'attachment') {
    header('Content-Disposition: attachment; filename="' . $safeFilename . '"');
} else {
    header('Content-Disposition: inline');
}

readfile($fullPath);
exit;
