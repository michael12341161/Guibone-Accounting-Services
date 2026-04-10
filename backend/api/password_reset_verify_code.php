<?php
require_once __DIR__ . '/auth.php';
monitoring_bootstrap_api(['POST', 'OPTIONS']);

require_once __DIR__ . '/connection-pdo.php';

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

  // Create a short-lived reset token (returned to client) to authorize password change.
  $token = bin2hex(random_bytes(16));
  $resetTokenExpiresInSeconds = 15 * 60;
  $resetTokenExpiresInMinutes = (int)max(1, ceil($resetTokenExpiresInSeconds / 60));
  $_SESSION['pw_reset']['verified'] = true;
  $_SESSION['pw_reset']['reset_token_hash'] = hash('sha256', $token);
  $_SESSION['pw_reset']['reset_token_expires_at'] = time() + $resetTokenExpiresInSeconds;

  respond(200, [
    'success' => true,
    'reset_token' => $token,
    'reset_token_expires_in_minutes' => $resetTokenExpiresInMinutes,
  ]);
} catch (Throwable $e) {
  respond(500, ['success' => false, 'message' => 'Server error.']);
}
