<?php
require_once __DIR__ . '/../rate_limit.php';
monitoring_enforce_rate_limit();
require_once __DIR__ . '/auth.php';
monitoring_bootstrap_api(['POST', 'OPTIONS']);

require_once __DIR__ . '/connection-pdo.php';
require_once __DIR__ . '/employee_specialization.php';
require_once __DIR__ . '/account_status_helpers.php';

function respond($code, $payload) {
  http_response_code($code);
  echo json_encode($payload);
  exit;
}

function buildPasswordResetSessionUser(PDO $conn, string $email, array $securitySettings): ?array {
  $profileImageSelect = "CASE
              WHEN u.Role_id = 4 THEN c.Profile_Image
              ELSE u.Profile_Image
          END AS Profile_Image";

  $stmt = $conn->prepare(
    'SELECT u.User_id AS User_ID,
            u.Username,
            u.Password_changed_at AS Password_changed_at,
            u.Role_id AS Role_ID,
            c.Client_ID AS Client_ID,
            c.Status_id AS Client_Status_ID,
            s.Status_name AS Client_Status_Name,
            u.Email,
            u.Created_at AS Created_at,
            r.Role_name AS Role_name,
            CASE
                WHEN u.Role_id = 4 THEN c.First_name
                ELSE u.first_name
            END AS First_name,
            CASE
                WHEN u.Role_id = 4 THEN c.Middle_name
                ELSE u.middle_name
            END AS Middle_name,
            CASE
                WHEN u.Role_id = 4 THEN c.Last_name
                ELSE u.last_name
            END AS Last_name,
            ' . $profileImageSelect . '
     FROM user u
     LEFT JOIN client c ON c.User_id = u.User_id
     LEFT JOIN role r ON r.Role_id = u.Role_id
     LEFT JOIN status s ON s.Status_id = c.Status_id
     WHERE LOWER(u.Email) = LOWER(:email)
     LIMIT 1'
  );
  $stmt->execute([':email' => $email]);
  $user = $stmt->fetch(PDO::FETCH_ASSOC);
  if (!$user) {
    return null;
  }

  $roleId = isset($user['Role_ID']) ? (int)$user['Role_ID'] : 0;
  $approvalStatus = null;
  if ($roleId === MONITORING_ROLE_CLIENT) {
    $approvalStatus = monitoring_client_approval_status(
      isset($user['Client_Status_Name']) ? (string)$user['Client_Status_Name'] : null,
      isset($user['Client_Status_ID']) ? (int)$user['Client_Status_ID'] : null,
      'Pending'
    );
  }

  $passwordExpiryInfo = monitoring_resolve_password_expiry_info(
    $securitySettings,
    $user['Password_changed_at'] ?? null,
    $user['Created_at'] ?? null
  );

  return [
    'id' => (int)$user['User_ID'],
    'username' => $user['Username'],
    'role_id' => $roleId,
    'role' => $user['Role_name'] ?? null,
    'role_name' => $user['Role_name'] ?? null,
    'client_id' => isset($user['Client_ID']) ? (int)$user['Client_ID'] : null,
    'email' => $user['Email'] ?? null,
    'first_name' => $user['First_name'] ?? null,
    'middle_name' => $user['Middle_name'] ?? null,
    'last_name' => $user['Last_name'] ?? null,
    'profile_image' => $user['Profile_Image'] ?? null,
    'password_changed_at' => $passwordExpiryInfo['password_changed_at'],
    'password_expires_at' => $passwordExpiryInfo['password_expires_at'],
    'password_days_until_expiry' => $passwordExpiryInfo['password_days_until_expiry'],
    'registration_source' => null,
    'approval_status' => $approvalStatus,
    'security_settings' => $securitySettings,
  ];
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
  monitoring_ensure_user_employment_status_column($conn);
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

  $accountAccess = monitoring_fetch_account_access_status_by_email($conn, $email);
  if (!empty($accountAccess['blocked_message'])) {
    unset($_SESSION['pw_reset']);
    respond(403, [
      'success' => false,
      'message' => (string)$accountAccess['blocked_message'],
      'inactive_account' => !empty($accountAccess['is_inactive']),
    ]);
  }

  $hash = password_hash((string)$newPassword, PASSWORD_DEFAULT);

  // Update user password
  $updUser = $conn->prepare(
    'UPDATE user
     SET Password = :p,
         Password_changed_at = NOW(),
         Failed_login_attempts = 0,
         Locked_until = NULL,
         Force_password_reset = 0
     WHERE LOWER(Email) = LOWER(:e)'
  );
  $updUser->execute([':p' => $hash, ':e' => $email]);

  // Clear session token
  unset($_SESSION['pw_reset']);

  $sessionUser = buildPasswordResetSessionUser($conn, $email, $securitySettings);
  $authToken = null;
  if ($sessionUser !== null) {
    $authToken = monitoring_store_session_user($sessionUser);
  }

  respond(200, [
    'success' => true,
    'message' => 'Password updated successfully.',
    'user' => $sessionUser,
    'token' => $authToken,
  ]);
} catch (Throwable $e) {
  respond(500, ['success' => false, 'message' => 'Server error.']);
}
