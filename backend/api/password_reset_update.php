<?php
require_once __DIR__ . '/auth.php';
monitoring_bootstrap_api(['POST', 'OPTIONS']);

require_once __DIR__ . '/connection-pdo.php';
require_once __DIR__ . '/employee_specialization.php';

function respond($code, $payload) {
  http_response_code($code);
  echo json_encode($payload);
  exit;
}

$raw = file_get_contents('php://input');
$data = json_decode($raw, true);
if (!is_array($data)) $data = $_POST;

$email = isset($data['email']) ? trim((string)$data['email']) : '';
$token = isset($data['reset_token']) ? trim((string)$data['reset_token']) : '';
$newPassword = isset($data['new_password']) ? (string)$data['new_password'] : '';

if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
  respond(400, ['success' => false, 'message' => 'Valid email is required.']);
}
if ($token === '' || strlen($token) < 16) {
  respond(400, ['success' => false, 'message' => 'Invalid reset token.']);
}
if ($newPassword === '') {
  respond(400, ['success' => false, 'message' => 'Password is required.']);
}

try {
  monitoring_ensure_user_security_columns($conn);
  $securitySettings = monitoring_get_security_settings($conn);
  $maxPasswordLength = (int)$securitySettings['maxPasswordLength'];
  $passwordValidationMessage = monitoring_validate_password_value($newPassword, $maxPasswordLength);

  if ($passwordValidationMessage !== null) {
    respond(400, ['success' => false, 'message' => $passwordValidationMessage]);
  }

  $sess = isset($_SESSION['pw_reset']) && is_array($_SESSION['pw_reset']) ? $_SESSION['pw_reset'] : null;
  if (!$sess || empty($sess['verified']) || empty($sess['reset_token_hash']) || empty($sess['reset_token_expires_at'])) {
    respond(400, ['success' => false, 'message' => 'Invalid or expired reset token.']);
  }
  if (!hash_equals((string)$sess['email'], $email)) {
    respond(400, ['success' => false, 'message' => 'Invalid or expired reset token.']);
  }
  if (time() > (int)$sess['reset_token_expires_at']) {
    unset($_SESSION['pw_reset']);
    respond(400, ['success' => false, 'message' => 'Invalid or expired reset token.']);
  }

  $tokenHash = hash('sha256', $token);
  if (!hash_equals((string)$sess['reset_token_hash'], $tokenHash)) {
    respond(400, ['success' => false, 'message' => 'Invalid or expired reset token.']);
  }

  $hash = hash('sha256', (string)$newPassword);

  // Update user password
  $updUser = $conn->prepare(
    'UPDATE user
     SET Password = :p,
         Password_changed_at = NOW(),
         Failed_login_attempts = 0,
         Locked_until = NULL
     WHERE Email = :e'
  );
  $updUser->execute([':p' => $hash, ':e' => $email]);

  // Clear session token
  unset($_SESSION['pw_reset']);

  $sessionUser = monitoring_read_session_user(false);
  $sessionEmail = trim((string)($sessionUser['email'] ?? ''));
  if ($sessionEmail !== '' && strcasecmp($sessionEmail, $email) === 0) {
    $passwordExpiryInfo = monitoring_resolve_password_expiry_info(
      $securitySettings,
      date('Y-m-d H:i:s'),
      null
    );

    monitoring_store_session_user(array_merge($sessionUser, [
      'password_changed_at' => $passwordExpiryInfo['password_changed_at'],
      'password_expires_at' => $passwordExpiryInfo['password_expires_at'],
      'password_days_until_expiry' => $passwordExpiryInfo['password_days_until_expiry'],
    ]));
  }

  respond(200, ['success' => true, 'message' => 'Password updated successfully.']);
} catch (Throwable $e) {
  respond(500, ['success' => false, 'message' => 'Server error.']);
}
