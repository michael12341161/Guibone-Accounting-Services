<?php
$origin = isset($_SERVER['HTTP_ORIGIN']) ? $_SERVER['HTTP_ORIGIN'] : '';
$allowedOrigins = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost',
  'http://127.0.0.1',
];
if ($origin && in_array($origin, $allowedOrigins, true)) {
  header('Access-Control-Allow-Origin: ' . $origin);
  header('Access-Control-Allow-Credentials: true');
} else {
  header('Access-Control-Allow-Origin: *');
}
header('Access-Control-Allow-Headers: Content-Type');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
  http_response_code(200);
  exit;
}

require_once __DIR__ . '/connection-pdo.php';

if (session_status() !== PHP_SESSION_ACTIVE) {
  session_start();
}

function respond($code, $payload) {
  http_response_code($code);
  echo json_encode($payload);
  exit;
}

$raw = file_get_contents('php://input');
$data = json_decode($raw, true);
if (!is_array($data)) $data = $_POST;

$email = isset($data['email']) ? trim((string)$data['email']) : '';
$code  = isset($data['code']) ? trim((string)$data['code']) : '';

if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
  respond(400, ['success' => false, 'message' => 'Valid email is required.']);
}
if ($code === '' || !preg_match('/^\d{6}$/', $code)) {
  respond(400, ['success' => false, 'message' => 'Valid 6-digit code is required.']);
}

try {
  $sess = isset($_SESSION['pw_reset']) && is_array($_SESSION['pw_reset']) ? $_SESSION['pw_reset'] : null;
  if (!$sess || !isset($sess['email'], $sess['code_hash'], $sess['expires_at'])) {
    respond(400, ['success' => false, 'message' => 'Invalid or expired code.']);
  }
  if (!hash_equals((string)$sess['email'], $email)) {
    respond(400, ['success' => false, 'message' => 'Invalid or expired code.']);
  }
  if (time() > (int)$sess['expires_at']) {
    unset($_SESSION['pw_reset']);
    respond(400, ['success' => false, 'message' => 'Invalid or expired code.']);
  }
  if (!password_verify($code, (string)$sess['code_hash'])) {
    respond(400, ['success' => false, 'message' => 'Invalid or expired code.']);
  }

  // Create a short-lived reset token (returned to client) to authorize password change
  $token = bin2hex(random_bytes(16));
  $_SESSION['pw_reset']['verified'] = true;
  $_SESSION['pw_reset']['reset_token_hash'] = hash('sha256', $token);
  $_SESSION['pw_reset']['reset_token_expires_at'] = time() + (15 * 60);

  respond(200, ['success' => true, 'reset_token' => $token]);
} catch (Throwable $e) {
  respond(500, ['success' => false, 'message' => 'Server error.']);
}
