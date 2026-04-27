<?php
require_once __DIR__ . '/auth.php';
monitoring_bootstrap_api(['POST', 'OPTIONS']);

require_once __DIR__ . '/connection-pdo.php';
require_once __DIR__ . '/employee_specialization.php';
require_once __DIR__ . '/account_status_helpers.php';

// PHPMailer (bundled in project)
require_once __DIR__ . '/../../PHPMailer-master/src/Exception.php';
require_once __DIR__ . '/../../PHPMailer-master/src/PHPMailer.php';
require_once __DIR__ . '/../../PHPMailer-master/src/SMTP.php';

use PHPMailer\PHPMailer\PHPMailer;
use PHPMailer\PHPMailer\Exception;

function respond($code, $payload) {
  http_response_code($code);
  echo json_encode($payload);
  exit;
}

$raw = file_get_contents('php://input');
$data = json_decode($raw, true);
if (!is_array($data)) $data = $_POST;

$email = isset($data['email']) ? trim((string)$data['email']) : '';
if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
  respond(400, ['success' => false, 'message' => 'Valid email is required.']);
}

$codeExpiresInSeconds = 5 * 60;
$codeExpiresInMinutes = (int)max(1, ceil($codeExpiresInSeconds / 60));

$now = time();
$limitWindow = 15 * 60;
$maxAttempts = 3;

if (!isset($_SESSION['pw_reset_limit'])) {
  $_SESSION['pw_reset_limit'] = [];
}

foreach ($_SESSION['pw_reset_limit'] as $e => $attempts) {
  if (empty($attempts) || end($attempts) < $now - $limitWindow) {
    unset($_SESSION['pw_reset_limit'][$e]);
  } else {
    $_SESSION['pw_reset_limit'][$e] = array_filter($attempts, fn($time) => $time >= $now - $limitWindow);
  }
}

if (isset($_SESSION['pw_reset_limit'][$email])) {
  if (count($_SESSION['pw_reset_limit'][$email]) >= $maxAttempts) {
    respond(429, ['success' => false, 'message' => 'Too many password reset requests. Please try again later.']);
  }
}
$_SESSION['pw_reset_limit'][$email][] = $now;

// Check user exists
try {
  monitoring_ensure_user_employment_status_column($conn);
  $stmt = $conn->prepare('SELECT User_id, Email FROM user WHERE Email = :e LIMIT 1');
  $stmt->execute([':e' => $email]);
  $u = $stmt->fetch(PDO::FETCH_ASSOC);
  if (!$u) {
    // Do not reveal whether email exists.
    respond(200, [
      'success' => true,
      'message' => 'If the email is registered, a code has been sent.',
      'code_expires_in_minutes' => $codeExpiresInMinutes,
    ]);
  }

  $accountAccess = monitoring_fetch_account_access_status_by_email($conn, $email);
  if (!empty($accountAccess['is_inactive'])) {
    respond(403, [
      'success' => false,
      'message' => monitoring_get_inactive_account_message(),
      'inactive_account' => true,
    ]);
  }
} catch (Throwable $e) {
  respond(500, ['success' => false, 'message' => 'Server error.']);
}

// Generate a short-lived 6-digit code for the verification step.
$code = (string)random_int(100000, 999999);
$expiresAt = time() + $codeExpiresInSeconds;

// Store verification details in PHP session (no DB)
$_SESSION['pw_reset'] = [
  'email' => $email,
  'code_hash' => password_hash($code, PASSWORD_DEFAULT),
  'expires_at' => $expiresAt,
  'verified' => false,
  'reset_token_hash' => null,
  'reset_token_expires_at' => null,
];

$smtp = monitoring_get_system_smtp_settings($conn);
$smtpUser = trim((string)($smtp['user'] ?? ''));
$smtpPass = trim((string)($smtp['pass'] ?? ''));
$smtpHost = trim((string)($smtp['host'] ?? 'smtp.gmail.com'));
$smtpPort = (int)($smtp['port'] ?? 587);
$companyName = monitoring_get_system_company_name($conn);
$supportEmail = monitoring_get_system_support_email($conn);

if (!$smtpUser || !$smtpPass) {
  error_log('SMTP not configured: user=' . ($smtpUser ? 'set' : 'missing') . ' pass=' . ($smtpPass ? 'set' : 'missing') . ' host=' . $smtpHost . ' port=' . $smtpPort);
  respond(500, [
    'success' => false,
    'message' => 'Email service is not configured. Please contact the administrator.',
  ]);
}

// Send email
try {
  $mail = new PHPMailer(true);
  $mail->isSMTP();
  $mail->Host = $smtpHost;
  $mail->SMTPAuth = true;
  $mail->Username = $smtpUser;
  $mail->Password = $smtpPass;
  $mail->SMTPSecure = PHPMailer::ENCRYPTION_STARTTLS;
  $mail->Port = $smtpPort;

  $safeCode = htmlspecialchars($code, ENT_QUOTES, 'UTF-8');
  $safeCompanyName = htmlspecialchars($companyName, ENT_QUOTES, 'UTF-8');

  $mail->setFrom($smtpUser, $companyName);
  if ($supportEmail !== '') {
    $mail->addReplyTo($supportEmail, $companyName . ' Support');
  }
  $mail->addAddress($email);
  $mail->Subject = $companyName . ' Password Reset Verification Code';
  $mail->isHTML(true);

  $mail->Body = '<!doctype html>'
    . '<html><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /></head>'
    . '<body style="margin:0;padding:0;background:#f5f5f5;">'
    . '  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#f5f5f5;padding:24px 12px;font-family:Arial,Helvetica,sans-serif;">'
    . '    <tr>'
    . '      <td align="center">'
    . '        <table role="presentation" cellpadding="0" cellspacing="0" width="600" style="max-width:600px;width:100%;background:#ffffff;border:1px solid #d4d4d4;border-radius:12px;">'
    . '          <tr>'
    . '            <td style="padding:32px 28px;color:#171717;">'
    . '              <div style="font-size:16px;line-height:1.7;color:#171717;">'
    . '                <p style="margin:0 0 16px;">Hello,</p>'
    . '                <p style="margin:0 0 16px;">We received a request to reset your password for your <strong>' . $safeCompanyName . ' account</strong>.</p>'
    . '                <p style="margin:0 0 12px;">Your verification code is:</p>'
    . '                <p style="margin:0 0 20px;text-align:center;font-size:34px;line-height:1.1;font-weight:700;letter-spacing:6px;"><strong>' . $safeCode . '</strong></p>'
    . '                <p style="margin:0 0 16px;">Enter this code on the password reset page to continue.</p>'
    . '                <p style="margin:0 0 16px;">For security reasons, this code will expire in <strong>' . $codeExpiresInMinutes . ' minutes</strong>.</p>'
    . '                <p style="margin:0 0 16px;">If you did not request a password reset, please ignore this email.</p>'
    . '                <p style="margin:0;">Thank you,<br />' . $safeCompanyName . '</p>'
    . '              </div>'
    . '            </td>'
    . '          </tr>'
    . '        </table>'
    . '      </td>'
    . '    </tr>'
    . '  </table>'
    . '</body></html>';

  $mail->AltBody = "Hello,\n\n"
    . "We received a request to reset your password for your {$companyName} account.\n\n"
    . "Your verification code is:\n\n"
    . "{$code}\n\n"
    . "Enter this code on the password reset page to continue.\n\n"
    . "For security reasons, this code will expire in {$codeExpiresInMinutes} minutes.\n\n"
    . "If you did not request a password reset, please ignore this email.\n\n"
    . "Thank you,\n"
    . $companyName;

  $mail->send();
} catch (Throwable $e) {
  // Do not leak SMTP details
  respond(500, ['success' => false, 'message' => 'Failed to send email.']);
}

respond(200, [
  'success' => true,
  'message' => 'If the email is registered, a code has been sent.',
  'code_expires_in_minutes' => $codeExpiresInMinutes,
]);
