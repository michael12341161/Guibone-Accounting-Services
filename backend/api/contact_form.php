<?php
/**
 * Contact form handler - sends email via PHPMailer using smtp_config
 * POST JSON: {name: string, email: string, message: string}
 * No auth/DB - public form
 */

require_once __DIR__ . '/auth.php';
monitoring_bootstrap_api(['POST', 'OPTIONS'], ['send_json_header' => true]);
require_once __DIR__ . '/connection-pdo.php';
require_once __DIR__ . '/employee_specialization.php';

$input = json_decode(file_get_contents('php://input'), true);
if (!is_array($input)) {
    respond(400, ['success' => false, 'message' => 'Invalid JSON']);
    exit;
}

$name = trim($input['name'] ?? '');
$email = trim($input['email'] ?? '');
$message = trim($input['message'] ?? '');

if (empty($name) || empty($email) || empty($message)) {
    respond(422, ['success' => false, 'message' => 'Name, email, and message required']);
    exit;
}

if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    respond(422, ['success' => false, 'message' => 'Invalid email']);
    exit;
}

if (strlen($message) > 5000) {
    respond(422, ['success' => false, 'message' => 'Message too long (max 5000 chars)']);
    exit;
}

// Load SMTP config
$smtpConfig = require __DIR__ . '/smtp_config.php';
if (empty($smtpConfig['SMTP_HOST']) || empty($smtpConfig['SMTP_USER']) || empty($smtpConfig['SMTP_PASS'])) {
    respond(500, ['success' => false, 'message' => 'SMTP config missing']);
    exit;
}

$companyName = monitoring_get_system_company_name($conn);
$supportEmail = monitoring_get_system_support_email($conn);
$submittedAt = new DateTimeImmutable('now', new DateTimeZone('Asia/Manila'));
$submittedAtLabel = $submittedAt->format('F j, Y \a\t g:i A T');
$safeName = htmlspecialchars($name, ENT_QUOTES, 'UTF-8');
$safeEmail = htmlspecialchars($email, ENT_QUOTES, 'UTF-8');
$safeMessage = nl2br(htmlspecialchars($message, ENT_QUOTES, 'UTF-8'));
$safeTimestamp = htmlspecialchars($submittedAtLabel, ENT_QUOTES, 'UTF-8');
$safeCompanyName = htmlspecialchars($companyName !== '' ? $companyName : 'Guibone Accounting Website', ENT_QUOTES, 'UTF-8');

// PHPMailer
require_once __DIR__ . '/../../PHPMailer-master/src/PHPMailer.php';
require_once __DIR__ . '/../../PHPMailer-master/src/SMTP.php';
require_once __DIR__ . '/../../PHPMailer-master/src/Exception.php';

use PHPMailer\PHPMailer\PHPMailer;
use PHPMailer\PHPMailer\SMTP;
use PHPMailer\PHPMailer\Exception;

$mail = new PHPMailer(true);

try {
    // Server settings
    $mail->isSMTP();
    $mail->Host       = $smtpConfig['SMTP_HOST'];
    $mail->SMTPAuth   = true;
    $mail->Username   = $smtpConfig['SMTP_USER'];
    $mail->Password   = $smtpConfig['SMTP_PASS'];
    $mail->SMTPSecure = PHPMailer::ENCRYPTION_STARTTLS;
    $mail->Port       = $smtpConfig['SMTP_PORT'];
    $mail->CharSet    = 'UTF-8';

    // Recipients
    $senderEmail = trim((string)$smtpConfig['SMTP_USER']);
    $senderName = $companyName !== '' ? $companyName . ' Website' : 'Guibone Accounting Website';
    $recipientEmail = $supportEmail !== '' ? $supportEmail : $senderEmail;
    $recipientName = $companyName !== '' ? $companyName . ' Support' : 'Guibone Support';

    $mail->setFrom($senderEmail, $senderName);
    $mail->addAddress($recipientEmail, $recipientName);
    $mail->addReplyTo($email, $name);

    // Content
    $mail->isHTML(true);
    $mail->Subject = 'Website Contact Form: ' . $name;
    $mail->Body = '<!doctype html>'
        . '<html><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /></head>'
        . '<body style="margin:0;padding:0;background:#f1f5f9;">'
        . '  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#f1f5f9;padding:24px 12px;font-family:Arial,Helvetica,sans-serif;">'
        . '    <tr>'
        . '      <td align="center">'
        . '        <table role="presentation" cellpadding="0" cellspacing="0" width="640" style="max-width:640px;width:100%;background:#ffffff;border:1px solid #e2e8f0;border-radius:20px;overflow:hidden;box-shadow:0 16px 40px rgba(15,23,42,0.08);">'
        . '          <tr>'
        . '            <td style="padding:22px 24px;background:linear-gradient(135deg,#0f766e 0%,#115e59 100%);color:#ffffff;">'
        . '              <table role="presentation" cellpadding="0" cellspacing="0" width="100%">'
        . '                <tr>'
        . '                  <td style="font-size:12px;line-height:1.4;letter-spacing:0.08em;text-transform:uppercase;opacity:0.82;">' . $safeCompanyName . '</td>'
        . '                  <td align="right" style="font-size:12px;line-height:1.4;opacity:0.92;">' . $safeTimestamp . '</td>'
        . '                </tr>'
        . '                <tr>'
        . '                  <td colspan="2" style="padding-top:10px;font-size:24px;line-height:1.25;font-weight:700;">New Contact Form Submission</td>'
        . '                </tr>'
        . '              </table>'
        . '            </td>'
        . '          </tr>'
        . '          <tr>'
        . '            <td style="padding:24px;">'
        . '              <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:separate;border-spacing:0 14px;">'
        . '                <tr>'
        . '                  <td style="width:120px;padding:0 16px 0 0;font-size:12px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#64748b;vertical-align:top;">Name</td>'
        . '                  <td style="font-size:15px;line-height:1.6;color:#0f172a;font-weight:600;">' . $safeName . '</td>'
        . '                </tr>'
        . '                <tr>'
        . '                  <td style="width:120px;padding:0 16px 0 0;font-size:12px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#64748b;vertical-align:top;">Email</td>'
        . '                  <td style="font-size:15px;line-height:1.6;"><a href="mailto:' . $safeEmail . '" style="color:#0f766e;text-decoration:none;font-weight:600;">' . $safeEmail . '</a></td>'
        . '                </tr>'
        . '                <tr>'
        . '                  <td style="width:120px;padding:2px 16px 0 0;font-size:12px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#64748b;vertical-align:top;">Message</td>'
        . '                  <td>'
        . '                    <div style="padding:18px 18px;border:1px solid #cbd5e1;border-radius:16px;background:#f8fafc;font-size:14px;line-height:1.75;color:#1e293b;">' . $safeMessage . '</div>'
        . '                  </td>'
        . '                </tr>'
        . '              </table>'
        . '            </td>'
        . '          </tr>'
        . '          <tr>'
        . '            <td style="padding:16px 24px;background:#f8fafc;border-top:1px solid #e2e8f0;">'
        . '              <table role="presentation" cellpadding="0" cellspacing="0" width="100%">'
        . '                <tr>'
        . '                  <td style="font-size:12px;line-height:1.5;color:#64748b;">Source: <span style="display:inline-block;padding:4px 10px;border-radius:999px;background:#dcfce7;color:#166534;font-weight:700;">Landing Page Form</span></td>'
        . '                  <td align="right" style="font-size:12px;line-height:1.5;color:#94a3b8;">Admin notification</td>'
        . '                </tr>'
        . '              </table>'
        . '            </td>'
        . '          </tr>'
        . '        </table>'
        . '      </td>'
        . '    </tr>'
        . '  </table>'
        . '</body></html>';
    $mail->AltBody = "New Contact Form Submission\n"
        . "Timestamp: {$submittedAtLabel}\n"
        . "Name: {$name}\n"
        . "Email: {$email}\n\n"
        . "Message:\n{$message}\n\n"
        . "Source: Landing Page Form";

    $mail->send();
    respond(200, ['success' => true, 'message' => 'Message sent successfully']);

} catch (Exception $e) {
    error_log("Contact form mailer error: {$mail->ErrorInfo}");
    respond(500, ['success' => false, 'message' => 'Failed to send message']);
}

function respond(int $code, array $data): void {
    http_response_code($code);
    echo json_encode($data);
    exit;
}
?>

