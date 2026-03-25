<?php
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/connection-pdo.php';
require_once __DIR__ . '/document_helpers.php';
require_once __DIR__ . '/employee_specialization.php';
require_once __DIR__ . '/status_helpers.php';
require_once __DIR__ . '/../../PHPMailer-master/src/Exception.php';
require_once __DIR__ . '/../../PHPMailer-master/src/PHPMailer.php';
require_once __DIR__ . '/../../PHPMailer-master/src/SMTP.php';

monitoring_bootstrap_api(['POST', 'OPTIONS']);

function respond($code, $payload) {
    http_response_code($code);
    echo json_encode($payload);
    exit;
}

function quoteIdentifier(string $name): string {
    return '`' . str_replace('`', '``', $name) . '`';
}

function tableExists(PDO $conn, string $table): bool {
    try {
        $stmt = $conn->prepare('SHOW TABLES LIKE :table');
        $stmt->execute([':table' => $table]);
        return (bool)$stmt->fetchColumn();
    } catch (Throwable $__) {
        return false;
    }
}

function columnExists(PDO $conn, string $table, string $column): bool {
    try {
        $sql = 'SHOW COLUMNS FROM ' . quoteIdentifier($table) . ' LIKE :column';
        $stmt = $conn->prepare($sql);
        $stmt->execute([':column' => $column]);
        return (bool)$stmt->fetch(PDO::FETCH_ASSOC);
    } catch (Throwable $__) {
        return false;
    }
}

function civilStatusTableExists(PDO $conn): bool {
    static $exists = null;
    if ($exists !== null) {
        return $exists;
    }

    $exists = tableExists($conn, 'civil_status_type');
    return $exists;
}

function clientHasCivilStatusColumn(PDO $conn): bool {
    static $exists = null;
    if ($exists !== null) {
        return $exists;
    }

    $exists = columnExists($conn, 'client', 'civil_status_type_ID');
    return $exists;
}

function businessHasStatusColumn(PDO $conn): bool {
    static $exists = null;
    if ($exists !== null) {
        return $exists;
    }

    $exists = columnExists($conn, 'business', 'Status_id');
    return $exists;
}

function clientHasRejectionReasonColumn(PDO $conn, bool $refresh = false): bool {
    static $exists = null;
    if (!$refresh && $exists !== null) {
        return $exists;
    }

    $exists = columnExists($conn, 'client', 'Rejection_reason');
    return $exists;
}

function ensureClientRejectionReasonColumn(PDO $conn): bool {
    if (clientHasRejectionReasonColumn($conn)) {
        return true;
    }

    $conn->exec(
        'ALTER TABLE `client`
         ADD COLUMN `Rejection_reason` TEXT NULL AFTER `Status_id`'
    );

    return clientHasRejectionReasonColumn($conn, true);
}

function clientHasActionByColumn(PDO $conn, bool $refresh = false): bool {
    static $exists = null;
    if (!$refresh && $exists !== null) {
        return $exists;
    }

    $exists = columnExists($conn, 'client', 'action_by');
    return $exists;
}

function ensureClientActionByColumn(PDO $conn): bool {
    if (clientHasActionByColumn($conn)) {
        return true;
    }

    $conn->exec(
        'ALTER TABLE `client`
         ADD COLUMN `action_by` INT(11) NULL AFTER `Status_id`'
    );

    return clientHasActionByColumn($conn, true);
}

function userDisplayNameSql(string $alias): string {
    return "NULLIF(TRIM(CONCAT_WS(' ', NULLIF(TRIM({$alias}.first_name), ''), NULLIF(TRIM({$alias}.middle_name), ''), NULLIF(TRIM({$alias}.last_name), ''))), '')";
}


function normalizeRegistrationSource($value): string {
    $raw = strtolower(trim((string)$value));

    if (in_array($raw, ['self_signup', 'self-signup', 'signup', 'sign_up', 'client_signup', 'client-signup'], true)) {
        return 'self_signup';
    }

    return 'admin';
}

function normalizeApprovalStatus($value, string $fallback = 'Approved'): string {
    $raw = strtolower(trim((string)$value));

    if ($raw === 'pending') {
        return 'Pending';
    }
    if ($raw === 'approved') {
        return 'Approved';
    }
    if ($raw === 'rejected') {
        return 'Rejected';
    }

    return $fallback;
}

function normalizeRejectionReason($value): string {
    $normalized = str_replace(["\r\n", "\r"], "\n", trim((string)($value ?? '')));
    if ($normalized === '') {
        return '';
    }

    if (function_exists('mb_substr')) {
        return trim((string)mb_substr($normalized, 0, 2000));
    }

    return trim(substr($normalized, 0, 2000));
}

function buildPersonName($first, $middle, $last): string {
    $parts = [];
    foreach ([$first, $middle, $last] as $part) {
        $value = trim((string)($part ?? ''));
        if ($value !== '') {
            $parts[] = $value;
        }
    }
    return trim(implode(' ', $parts));
}

function resolveAdminRoleId(PDO $conn): int {
    $roleId = MONITORING_ROLE_ADMIN;
    try {
        $stmt = $conn->prepare(
            "SELECT Role_id FROM role WHERE LOWER(Role_name) IN ('admin', 'administrator') LIMIT 1"
        );
        $stmt->execute();
        $rid = $stmt->fetchColumn();
        if ($rid) {
            $roleId = (int)$rid;
        }
    } catch (Throwable $__) {
        // Fall back to the configured role constant.
    }

    return $roleId;
}

function fetchAdminUserIds(PDO $conn): array {
    $roleId = resolveAdminRoleId($conn);
    if ($roleId <= 0) {
        return [];
    }

    $stmt = $conn->prepare('SELECT User_id FROM user WHERE Role_id = :rid');
    $stmt->execute([':rid' => $roleId]);
    $rows = $stmt->fetchAll(PDO::FETCH_COLUMN) ?: [];

    $ids = [];
    foreach ($rows as $row) {
        $id = (int)$row;
        if ($id > 0) {
            $ids[$id] = true;
        }
    }

    return array_keys($ids);
}

function insertNotification(PDO $conn, int $userId, ?int $senderId, string $type, string $message): void {
    if ($userId <= 0 || trim($message) === '') {
        return;
    }

    $stmt = $conn->prepare(
        'INSERT INTO notifications (user_id, sender_id, type, message, is_read)
         VALUES (:uid, :sid, :type, :message, 0)'
    );
    $stmt->execute([
        ':uid' => $userId,
        ':sid' => ($senderId && $senderId > 0) ? $senderId : null,
        ':type' => $type,
        ':message' => $message,
    ]);
}

function buildClientSignupLabel(array $client, ?array $business): string {
    $name = buildPersonName($client['first_name'] ?? '', $client['middle_name'] ?? '', $client['last_name'] ?? '');
    $email = trim((string)($client['email'] ?? ''));
    $trade = '';
    if (is_array($business)) {
        $trade = trim((string)($business['business_trade_name'] ?? $business['business_brand'] ?? ''));
    }

    $parts = [];
    if ($name !== '') {
        $parts[] = $name;
    }
    if ($trade !== '') {
        $parts[] = $trade;
    }
    if ($email !== '') {
        $parts[] = $email;
    }

    return implode(' | ', $parts);
}

function notifyAdminsOfClientSignup(PDO $conn, array $client, ?array $business, ?int $senderId = null): void {
    $adminIds = fetchAdminUserIds($conn);
    if (!$adminIds) {
        return;
    }

    $clientName = buildPersonName($client['first_name'] ?? '', $client['middle_name'] ?? '', $client['last_name'] ?? '');
    if ($clientName === '') {
        $clientName = trim((string)($client['email'] ?? ''));
    }
    if ($clientName === '') {
        $clientName = 'Client';
    }

    $message = "New Client Registration\n"
        . $clientName
        . " has submitted a registration request. Please review and approve or reject the application.";

    foreach ($adminIds as $adminId) {
        if ($senderId && (int)$adminId === (int)$senderId) {
            continue;
        }
        insertNotification($conn, (int)$adminId, $senderId, 'client_signup', $message);
    }
}

function backendBaseDirectory(): string {
    $real = realpath(__DIR__ . '/..');
    return $real !== false ? $real : dirname(__DIR__);
}

function normalizeStoredUploadPath(string $path): string {
    return ltrim(str_replace('\\', '/', trim($path)), '/');
}

function deleteClientProfileImageFile(string $path): void {
    $relativePath = normalizeStoredUploadPath($path);
    if ($relativePath === '' || strpos($relativePath, 'uploads/profile_images/') !== 0) {
        return;
    }

    $fullPath = backendBaseDirectory() . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $relativePath);
    if (is_file($fullPath)) {
        @unlink($fullPath);
    }
}

function storeClientProfileImage(array $file, int $clientId): string {
    if ($clientId <= 0) {
        throw new InvalidArgumentException('client_id is required');
    }

    if (!isset($file['tmp_name']) || !is_uploaded_file((string)$file['tmp_name'])) {
        throw new InvalidArgumentException('No profile image was uploaded.');
    }

    $uploadError = isset($file['error']) ? (int)$file['error'] : UPLOAD_ERR_NO_FILE;
    if ($uploadError !== UPLOAD_ERR_OK) {
        throw new InvalidArgumentException('Profile image upload failed.');
    }

    $maxBytes = 5 * 1024 * 1024;
    if ((int)($file['size'] ?? 0) > $maxBytes) {
        throw new InvalidArgumentException('Profile image must be 5MB or smaller.');
    }

    $originalName = (string)($file['name'] ?? '');
    $extension = strtolower(pathinfo($originalName, PATHINFO_EXTENSION));
    $allowedExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp'];
    if (!in_array($extension, $allowedExtensions, true)) {
        throw new InvalidArgumentException('Invalid image type. Allowed: jpg, jpeg, png, gif, webp.');
    }

    $safeBase = preg_replace('/[^a-zA-Z0-9_-]+/', '_', pathinfo($originalName, PATHINFO_FILENAME));
    $safeBase = trim((string)$safeBase, '_');
    if ($safeBase === '') {
        $safeBase = 'profile_image';
    }

    $uploadDir = backendBaseDirectory() . DIRECTORY_SEPARATOR . 'uploads' . DIRECTORY_SEPARATOR . 'profile_images';
    if (!is_dir($uploadDir) && !mkdir($uploadDir, 0755, true)) {
        throw new RuntimeException('Failed to create profile image directory.');
    }

    $storedName = 'client_' . $clientId . '_profile_' . bin2hex(random_bytes(8)) . '_' . $safeBase . '.' . $extension;
    $destination = $uploadDir . DIRECTORY_SEPARATOR . $storedName;

    if (!move_uploaded_file((string)$file['tmp_name'], $destination)) {
        throw new RuntimeException('Failed to save uploaded profile image.');
    }

    return 'uploads/profile_images/' . $storedName;
}

function loadLocalApiConfig(): array {
    static $config = null;
    if ($config !== null) {
        return $config;
    }

    $config = [];
    $configPath = __DIR__ . '/smtp_config.php';
    if (file_exists($configPath)) {
        $loaded = require $configPath;
        if (is_array($loaded)) {
            $config = $loaded;
        }
    }

    return $config;
}

function readApiConfigValue(string $key, $default = null) {
    $envValue = getenv($key);
    if ($envValue !== false && $envValue !== null && $envValue !== '') {
        return $envValue;
    }

    if (isset($_SERVER[$key]) && $_SERVER[$key] !== '') {
        return $_SERVER[$key];
    }

    $localConfig = loadLocalApiConfig();
    if (array_key_exists($key, $localConfig) && $localConfig[$key] !== '') {
        return $localConfig[$key];
    }

    return $default;
}

function smtpConfig(): array {
    global $conn;
    return monitoring_get_system_smtp_settings($conn);
}

function parseHostAndPort(string $value): array {
    $normalized = trim($value);
    if ($normalized === '') {
        return ['host' => '', 'port' => null];
    }

    $parts = parse_url(strpos($normalized, '://') !== false ? $normalized : 'http://' . $normalized);
    return [
        'host' => strtolower((string)($parts['host'] ?? '')),
        'port' => isset($parts['port']) ? (int)$parts['port'] : null,
    ];
}

function applicationBasePath(): string {
    $scriptName = str_replace('\\', '/', (string)($_SERVER['SCRIPT_NAME'] ?? ''));
    if ($scriptName === '') {
        return '';
    }

    $marker = '/backend/api/';
    $position = stripos($scriptName, $marker);
    if ($position === false) {
        return '';
    }

    return rtrim(substr($scriptName, 0, $position), '/');
}

function resolveFrontendBaseUrl(): string {
    global $conn;
    return monitoring_resolve_frontend_base_url($conn);
}

function buildLoginUrl(): string {
    global $conn;
    return monitoring_build_login_url($conn);
}

function sendApprovalEmail(string $recipientEmail, array $options = []): array {
    global $conn;

    $email = trim($recipientEmail);
    if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
        return [
            'attempted' => false,
            'sent' => false,
            'message' => 'No valid client email was found, so no approval email was sent.',
        ];
    }

    if (!monitoring_send_client_status_emails_enabled($conn)) {
        return [
            'attempted' => false,
            'sent' => false,
            'message' => 'The client was approved, but client status emails are disabled in System Configuration.',
        ];
    }

    $smtp = smtpConfig();
    $companyName = monitoring_get_system_company_name($conn);
    $safeCompanyName = htmlspecialchars($companyName, ENT_QUOTES, 'UTF-8');
    if ($smtp['user'] === '' || $smtp['pass'] === '') {
        return [
            'attempted' => false,
            'sent' => false,
            'message' => 'The client was approved, but the email service is not configured.',
        ];
    }

    $loginUrl = buildLoginUrl();
    $safeLoginUrl = htmlspecialchars($loginUrl, ENT_QUOTES, 'UTF-8');
    $loginUsername = trim((string)($options['login_username'] ?? ''));
    $loginPassword = (string)($options['login_password'] ?? '');
    $safeLoginUsername = htmlspecialchars($loginUsername, ENT_QUOTES, 'UTF-8');
    $safeLoginPassword = htmlspecialchars($loginPassword, ENT_QUOTES, 'UTF-8');

    $credentialsHtml = '';
    $credentialsText = '';
    if ($loginUsername !== '' || $loginPassword !== '') {
        $credentialsHtml = '<div style="margin:0 0 18px;padding:16px;border:1px solid #99f6e4;border-radius:12px;background:#f0fdfa;">'
            . '  <div style="margin:0 0 10px;font-size:13px;font-weight:700;color:#0f766e;">Your Login Credentials</div>';
        if ($loginUsername !== '') {
            $credentialsHtml .= '<p style="margin:0 0 8px;"><strong>Username:</strong> ' . $safeLoginUsername . '</p>';
            $credentialsText .= "Username: {$loginUsername}\n";
        }
        if ($loginPassword !== '') {
            $credentialsHtml .= '<p style="margin:0;"><strong>Password:</strong> ' . $safeLoginPassword . '</p>';
            $credentialsText .= "Password: {$loginPassword}\n";
        }
        $credentialsHtml .= '</div>';
        $credentialsText = "Your login credentials:\n" . $credentialsText . "\n";
    }

    $mail = new \PHPMailer\PHPMailer\PHPMailer(true);

    try {
        $mail->isSMTP();
        $mail->Host = $smtp['host'];
        $mail->SMTPAuth = true;
        $mail->Username = $smtp['user'];
        $mail->Password = $smtp['pass'];
        $mail->SMTPSecure = \PHPMailer\PHPMailer\PHPMailer::ENCRYPTION_STARTTLS;
        $mail->Port = $smtp['port'];

        $mail->setFrom($smtp['user'], $companyName);
        $mail->addAddress($email);
        $mail->Subject = $companyName . ' Account Approved';
        $mail->isHTML(true);

        $mail->Body = '<!doctype html>'
            . '<html><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /></head>'
            . '<body style="margin:0;padding:0;background:#f8fafc;">'
            . '  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#f8fafc;padding:24px 12px;font-family:Arial,Helvetica,sans-serif;">'
            . '    <tr>'
            . '      <td align="center">'
            . '        <table role="presentation" cellpadding="0" cellspacing="0" width="600" style="max-width:600px;width:100%;background:#ffffff;border:1px solid #dbeafe;border-radius:16px;overflow:hidden;">'
            . '          <tr>'
            . '            <td style="padding:18px 20px;background:#0f766e;color:#ffffff;">'
            . '              <div style="font-size:14px;opacity:0.9;">' . $safeCompanyName . '</div>'
            . '              <div style="margin-top:6px;font-size:22px;line-height:1.2;font-weight:700;">Account Approved</div>'
            . '            </td>'
            . '          </tr>'
            . '          <tr>'
            . '            <td style="padding:24px 20px;color:#0f172a;font-size:14px;line-height:1.7;">'
            . '              <p style="margin:0 0 14px;">Hello,</p>'
            . '              <p style="margin:0 0 14px;">Good news! Your account has been <strong>approved</strong>.</p>'
            . '              <p style="margin:0 0 14px;">You can now log in to your dashboard and start using the system.</p>'
            . ($credentialsHtml !== ''
                ? '              <p style="margin:0 0 14px;">Use the credentials below to access your account.</p>' . $credentialsHtml
                : '              <p style="margin:0 0 14px;">Please use your registered email and password to access your account.</p>')
            . '              <p style="margin:0 0 10px;">Login here:</p>'
            . '              <p style="margin:0 0 18px;"><a href="' . $safeLoginUrl . '" style="display:inline-block;padding:12px 18px;border-radius:10px;background:#0f766e;color:#ffffff;text-decoration:none;font-weight:700;">Open Login Page</a></p>'
            . '              <p style="margin:0 0 14px;">If you have any questions or need assistance, feel free to contact us.</p>'
            . '              <p style="margin:0;">Thank you,<br />' . $safeCompanyName . '</p>'
            . '            </td>'
            . '          </tr>'
            . '          <tr>'
            . '            <td style="padding:14px 20px;background:#f8fafc;border-top:1px solid #e2e8f0;font-size:12px;line-height:1.5;color:#64748b;">'
            . '              If the button does not work, copy and paste this link into your browser:<br /><a href="' . $safeLoginUrl . '" style="color:#0f766e;">' . $safeLoginUrl . '</a>'
            . '            </td>'
            . '          </tr>'
            . '        </table>'
            . '      </td>'
            . '    </tr>'
            . '  </table>'
            . '</body></html>';

        $mail->AltBody = "Hello,\n\n"
            . "Good news! Your account has been approved.\n\n"
            . "You can now log in to your dashboard and start using the system.\n\n"
            . ($credentialsText !== ''
                ? $credentialsText
                : "Please use your registered email and password to access your account.\n\n")
            . "Login here:\n"
            . $loginUrl . "\n\n"
            . "If you have any questions or need assistance, feel free to contact us.\n\n"
            . "Thank you,\n"
            . $companyName;

        $mail->send();

        return [
            'attempted' => true,
            'sent' => true,
            'message' => 'Approval email sent to ' . $email . '.',
        ];
    } catch (Throwable $__) {
        return [
            'attempted' => true,
            'sent' => false,
            'message' => 'The client was approved, but the approval email could not be sent.',
        ];
    }
}

function sendRejectionEmail(string $recipientEmail, array $options = []): array {
    global $conn;

    $email = trim($recipientEmail);
    if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
        return [
            'attempted' => false,
            'sent' => false,
            'message' => 'No valid client email was found, so no rejection email was sent.',
        ];
    }

    if (!monitoring_send_client_status_emails_enabled($conn)) {
        return [
            'attempted' => false,
            'sent' => false,
            'message' => 'The client was rejected, but client status emails are disabled in System Configuration.',
        ];
    }

    $smtp = smtpConfig();
    $companyName = monitoring_get_system_company_name($conn);
    $safeCompanyName = htmlspecialchars($companyName, ENT_QUOTES, 'UTF-8');
    if ($smtp['user'] === '' || $smtp['pass'] === '') {
        return [
            'attempted' => false,
            'sent' => false,
            'message' => 'The client was rejected, but the email service is not configured.',
        ];
    }

    $clientName = trim((string)($options['client_name'] ?? ''));
    $rejectionReason = normalizeRejectionReason($options['rejection_reason'] ?? '');
    $safeClientName = htmlspecialchars($clientName !== '' ? $clientName : 'Client', ENT_QUOTES, 'UTF-8');
    $safeReason = htmlspecialchars($rejectionReason, ENT_QUOTES, 'UTF-8');
    $reasonHtml = '';
    $reasonText = '';

    if ($rejectionReason !== '') {
        $reasonHtml = '<div style="margin:0 0 18px;padding:16px;border:1px solid #fecdd3;border-radius:12px;background:#fff1f2;">'
            . '  <div style="margin:0 0 8px;font-size:13px;font-weight:700;color:#9f1239;">Reason / missing requirements</div>'
            . '  <div style="margin:0;white-space:pre-wrap;color:#881337;">' . $safeReason . '</div>'
            . '</div>';
        $reasonText = "Reason / missing requirements:\n{$rejectionReason}\n\n";
    }

    $mail = new \PHPMailer\PHPMailer\PHPMailer(true);

    try {
        $mail->isSMTP();
        $mail->Host = $smtp['host'];
        $mail->SMTPAuth = true;
        $mail->Username = $smtp['user'];
        $mail->Password = $smtp['pass'];
        $mail->SMTPSecure = \PHPMailer\PHPMailer\PHPMailer::ENCRYPTION_STARTTLS;
        $mail->Port = $smtp['port'];

        $mail->setFrom($smtp['user'], $companyName);
        $mail->addAddress($email);
        $mail->Subject = $companyName . ' Application Update';
        $mail->isHTML(true);

        $mail->Body = '<!doctype html>'
            . '<html><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /></head>'
            . '<body style="margin:0;padding:0;background:#f8fafc;">'
            . '  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#f8fafc;padding:24px 12px;font-family:Arial,Helvetica,sans-serif;">'
            . '    <tr>'
            . '      <td align="center">'
            . '        <table role="presentation" cellpadding="0" cellspacing="0" width="600" style="max-width:600px;width:100%;background:#ffffff;border:1px solid #fecdd3;border-radius:16px;overflow:hidden;">'
            . '          <tr>'
            . '            <td style="padding:18px 20px;background:#be123c;color:#ffffff;">'
            . '              <div style="font-size:14px;opacity:0.9;">' . $safeCompanyName . '</div>'
            . '              <div style="margin-top:6px;font-size:22px;line-height:1.2;font-weight:700;">Application Update</div>'
            . '            </td>'
            . '          </tr>'
            . '          <tr>'
            . '            <td style="padding:24px 20px;color:#0f172a;font-size:14px;line-height:1.7;">'
            . '              <p style="margin:0 0 14px;">Hello ' . $safeClientName . ',</p>'
            . '              <p style="margin:0 0 14px;">Thank you for registering with <strong>' . $safeCompanyName . '</strong>.</p>'
            . '              <p style="margin:0 0 14px;">After reviewing your application, we found some details that still need to be corrected or completed before your account can be approved.</p>'
            . ($reasonHtml !== ''
                ? '              <p style="margin:0 0 14px;">Please review the notes below and submit the missing requirements.</p>' . $reasonHtml
                : '              <p style="margin:0 0 14px;">Please review your submitted information and provide any missing requirements before registering again.</p>')
            . '              <p style="margin:0 0 14px;">Once these items are complete, you may submit a new application using the correct information and documents.</p>'
            . '              <p style="margin:0 0 14px;">If you believe this was a mistake or need help understanding the requirements, please contact our office.</p>'
            . '              <p style="margin:0 0 14px;">Thank you for your understanding.</p>'
            . '              <p style="margin:0;">Best regards,<br />' . $safeCompanyName . '</p>'
            . '            </td>'
            . '          </tr>'
            . '        </table>'
            . '      </td>'
            . '    </tr>'
            . '  </table>'
            . '</body></html>';

        $mail->AltBody = "Hello " . ($clientName !== '' ? $clientName : 'Client') . ",\n\n"
            . "Thank you for registering with {$companyName}.\n\n"
            . "After reviewing your application, we found some details that still need to be corrected or completed before your account can be approved.\n\n"
            . ($reasonText !== ''
                ? "Please review the notes below and submit the missing requirements.\n\n" . $reasonText
                : "Please review your submitted information and provide any missing requirements before registering again.\n\n")
            . "Once these items are complete, you may submit a new application using the correct information and documents.\n\n"
            . "If you believe this was a mistake or need help understanding the requirements, please contact our office.\n\n"
            . "Thank you for your understanding.\n\n"
            . "Best regards,\n"
            . $companyName;

        $mail->send();

        return [
            'attempted' => true,
            'sent' => true,
            'message' => 'Rejection email sent to ' . $email . '.',
        ];
    } catch (Throwable $__) {
        return [
            'attempted' => true,
            'sent' => false,
            'message' => 'The client was rejected, but the rejection email could not be sent.',
        ];
    }
}

function approvalStatusToClientStatusId(PDO $conn, string $approvalStatus): ?int {
    $normalized = normalizeApprovalStatus($approvalStatus, 'Pending');
    return monitoring_resolve_client_status_id($conn, $normalized);
}

function clientStatusIdToApprovalStatus($statusId, ?string $statusName = null, string $fallback = 'Pending'): string {
    return monitoring_client_approval_status($statusName, $statusId, $fallback);
}

function duplicateEmailMessage(): string {
    return 'This email already has an account. Please use a different email or login instead.';
}

function findExistingAccountByEmail(PDO $conn, string $email): ?array {
    $normalizedEmail = strtolower(trim($email));
    if ($normalizedEmail === '') {
        return null;
    }

    $clientStmt = $conn->prepare(
        'SELECT Client_ID AS id
         FROM client
         WHERE Email = :email
         LIMIT 1'
    );
    $clientStmt->execute([':email' => $normalizedEmail]);
    $clientId = $clientStmt->fetchColumn();
    if ($clientId !== false) {
        return [
            'source' => 'client',
            'id' => (int)$clientId,
        ];
    }

    $userStmt = $conn->prepare(
        'SELECT User_id AS id
         FROM user
         WHERE Email = :email OR Username = :email
         LIMIT 1'
    );
    $userStmt->execute([':email' => $normalizedEmail]);
    $userId = $userStmt->fetchColumn();
    if ($userId !== false) {
        return [
            'source' => 'user',
            'id' => (int)$userId,
        ];
    }

    return null;
}

function mapConstraintMessage(Throwable $error): ?string {
    $message = $error->getMessage();
    if (stripos($message, 'SQLSTATE[23000]') === false) {
        return null;
    }

    if (stripos($message, 'uq_client_email') !== false) {
        return 'Client email already exists.';
    }
    if (stripos($message, 'uq_client_tin') !== false) {
        return 'Client TIN already exists.';
    }
    if (stripos($message, 'uq_business_tin') !== false) {
        return 'Business TIN already exists.';
    }
    if (stripos($message, 'uq_user_email') !== false) {
        return 'User email already exists.';
    }
    if (stripos($message, 'uq_user_username') !== false) {
        return 'Username already exists.';
    }
    if (stripos($message, 'Duplicate entry') !== false) {
        return 'Duplicate data found. Please use unique email/TIN values.';
    }

    return null;
}

function normalizeOptionalDate($value): ?string {
    if ($value === null) {
        return null;
    }

    $raw = trim((string)$value);
    if ($raw === '') {
        return null;
    }

    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $raw)) {
        return null;
    }

    [$year, $month, $day] = array_map('intval', explode('-', $raw));
    return checkdate($month, $day, $year) ? $raw : null;
}

function syncOwnClientSession(array $sessionUser, int $targetClientId, array $patch): void {
    $sessionUserId = isset($sessionUser['id']) ? (int)$sessionUser['id'] : 0;
    $sessionClientId = isset($sessionUser['client_id']) && $sessionUser['client_id'] !== null
        ? (int)$sessionUser['client_id']
        : 0;

    if ($sessionUserId <= 0 || $sessionClientId <= 0 || $sessionClientId !== $targetClientId) {
        return;
    }

    $nextSessionUser = array_merge($sessionUser, $patch);
    $nextSessionUser['id'] = $sessionUserId;
    $nextSessionUser['role_id'] = isset($sessionUser['role_id']) ? (int)$sessionUser['role_id'] : MONITORING_ROLE_CLIENT;
    $nextSessionUser['client_id'] = $sessionClientId;
    $nextSessionUser['security_settings'] = is_array($sessionUser['security_settings'] ?? null)
        ? $sessionUser['security_settings']
        : [];
    $nextSessionUser['registration_source'] = array_key_exists('registration_source', $patch)
        ? $patch['registration_source']
        : ($sessionUser['registration_source'] ?? null);
    $nextSessionUser['approval_status'] = array_key_exists('approval_status', $patch)
        ? $patch['approval_status']
        : ($sessionUser['approval_status'] ?? null);

    monitoring_store_session_user($nextSessionUser);
}

function normalizeOptionalId($value): ?int {
    if ($value === null) {
        return null;
    }

    if (is_int($value)) {
        return $value > 0 ? $value : null;
    }

    $raw = trim((string)$value);
    if ($raw === '' || !preg_match('/^\d+$/', $raw)) {
        return null;
    }

    $id = (int)$raw;
    return $id > 0 ? $id : null;
}

function lookupBusinessTypeId(PDO $conn, int $businessTypeId): ?int {
    if ($businessTypeId <= 0) {
        return null;
    }

    $stmt = $conn->prepare('SELECT Business_type_ID FROM business_type WHERE Business_type_ID = :id LIMIT 1');
    $stmt->execute([':id' => $businessTypeId]);
    $id = (int)($stmt->fetchColumn() ?: 0);
    return $id > 0 ? $id : null;
}

function lookupBusinessTypeName(PDO $conn, int $businessTypeId): ?string {
    if ($businessTypeId <= 0) {
        return null;
    }

    $stmt = $conn->prepare('SELECT Business_name FROM business_type WHERE Business_type_ID = :id LIMIT 1');
    $stmt->execute([':id' => $businessTypeId]);
    $name = trim((string)($stmt->fetchColumn() ?: ''));
    return $name !== '' ? $name : null;
}

function resolveBusinessTypeId(PDO $conn, $businessTypeId, string $name): ?int {
    $normalizedId = normalizeOptionalId($businessTypeId);
    if ($normalizedId !== null) {
        $resolvedId = lookupBusinessTypeId($conn, $normalizedId);
        if ($resolvedId !== null) {
            return $resolvedId;
        }
    }

    $name = trim($name);
    if ($name === '') {
        return null;
    }

    $sel = $conn->prepare('SELECT Business_type_ID FROM business_type WHERE LOWER(Business_name) = LOWER(:n) LIMIT 1');
    $sel->execute([':n' => $name]);
    $id = (int)($sel->fetchColumn() ?: 0);
    return $id > 0 ? $id : null;
}

function resolveCivilStatusTypeId(PDO $conn, $civilStatusTypeId, string $civilStatusName = ''): ?int {
    if (!civilStatusTableExists($conn)) {
        return null;
    }

    $normalizedId = normalizeOptionalId($civilStatusTypeId);
    if ($normalizedId !== null) {
        $stmt = $conn->prepare('SELECT civil_status_type_ID FROM civil_status_type WHERE civil_status_type_ID = :id LIMIT 1');
        $stmt->execute([':id' => $normalizedId]);
        $id = (int)($stmt->fetchColumn() ?: 0);
        if ($id > 0) {
            return $id;
        }
    }

    $civilStatusName = trim($civilStatusName);
    if ($civilStatusName === '') {
        return null;
    }

    $stmt = $conn->prepare('SELECT civil_status_type_ID FROM civil_status_type WHERE LOWER(civil_status_type_name) = LOWER(:name) LIMIT 1');
    $stmt->execute([':name' => $civilStatusName]);
    $id = (int)($stmt->fetchColumn() ?: 0);
    return $id > 0 ? $id : null;
}

function getBusinessTradeColumn(PDO $conn): string {
    static $column = null;
    if ($column !== null) {
        return $column;
    }

    try {
        $check = $conn->query("SHOW COLUMNS FROM business LIKE 'Trade_name'");
        if ($check && $check->fetch(PDO::FETCH_ASSOC)) {
            $column = 'Trade_name';
            return $column;
        }
    } catch (Throwable $__) {}

    $column = 'Brand_name';
    return $column;
}

function resolveBusinessStatusIdFromDetails(PDO $conn, int $clientId, array $businessDetails): ?int {
    if (!businessHasStatusColumn($conn)) {
        return null;
    }

    $statusIdInput = normalizeOptionalId($businessDetails['status_id'] ?? $businessDetails['Status_id'] ?? null);
    if ($statusIdInput !== null) {
        $validatedId = monitoring_validate_status_id($conn, 'BUSINESS', $statusIdInput);
        if ($validatedId !== null) {
            return $validatedId;
        }
    }

    $statusNameInput = '';
    foreach (['business_status', 'business_status_name', 'status', 'status_name'] as $key) {
        if (!array_key_exists($key, $businessDetails)) {
            continue;
        }

        $candidate = trim((string)$businessDetails[$key]);
        if ($candidate !== '') {
            $statusNameInput = $candidate;
            break;
        }
    }

    if ($statusNameInput !== '') {
        $resolvedId = monitoring_resolve_business_status_id($conn, $statusNameInput);
        if ($resolvedId !== null) {
            return $resolvedId;
        }
    }

    if (monitoring_document_client_has_business_permit($conn, $clientId)) {
        return monitoring_resolve_business_status_id($conn, 'Registered');
    }

    return monitoring_resolve_business_status_id($conn, 'Pending');
}

function saveBusinessDetails(PDO $conn, int $clientId, array $businessDetails, ?int $userId = null): void {
    $typeName = isset($businessDetails['type_of_business']) ? trim((string)$businessDetails['type_of_business']) : '';
    if ($typeName === '' && isset($businessDetails['business_type'])) {
        $typeName = trim((string)$businessDetails['business_type']);
    }
    $businessTypeIdInput = $businessDetails['business_type_id'] ?? $businessDetails['Business_type_ID'] ?? null;
    $normalizedBusinessTypeId = normalizeOptionalId($businessTypeIdInput);

    $tradeName = isset($businessDetails['trade_name']) ? trim((string)$businessDetails['trade_name']) : '';
    if ($tradeName === '' && isset($businessDetails['brand_name'])) {
        $tradeName = trim((string)$businessDetails['brand_name']);
    }
    $businessProvince = isset($businessDetails['province']) ? trim((string)$businessDetails['province']) : '';
    $businessMunicipality = isset($businessDetails['municipality']) ? trim((string)$businessDetails['municipality']) : '';
    $businessPostalCode = isset($businessDetails['postal_code']) ? trim((string)$businessDetails['postal_code']) : '';
    $businessBarangay = isset($businessDetails['barangay']) ? trim((string)$businessDetails['barangay']) : '';
    $businessStreet = isset($businessDetails['street_address']) ? trim((string)$businessDetails['street_address']) : '';
    if ($businessStreet === '' && isset($businessDetails['business_address'])) {
        $businessStreet = trim((string)$businessDetails['business_address']);
    }
    if ($businessStreet === '' && isset($businessDetails['address'])) {
        $businessStreet = trim((string)$businessDetails['address']);
    }
    $email = isset($businessDetails['email_address']) ? trim((string)$businessDetails['email_address']) : null;
    $tin = isset($businessDetails['tin_number']) ? trim((string)$businessDetails['tin_number']) : null;
    $contact = isset($businessDetails['contact_number']) ? trim((string)$businessDetails['contact_number']) : null;

    if ($typeName === ''
        && $tradeName === ''
        && $businessProvince === ''
        && $businessMunicipality === ''
        && $businessPostalCode === ''
        && $businessBarangay === ''
        && $businessStreet === ''
        && !$email
        && !$tin
        && !$contact
        && $normalizedBusinessTypeId === null
    ) {
        return;
    }

    $businessTypeId = resolveBusinessTypeId($conn, $businessTypeIdInput, $typeName);
    if ($businessTypeId === null) {
        throw new InvalidArgumentException('Select a valid type of business.');
    }

    if ($typeName === '') {
        $typeName = lookupBusinessTypeName($conn, $businessTypeId) ?? '';
    }
    if ($typeName === '') {
        throw new InvalidArgumentException('Select a valid type of business.');
    }
    if ($tradeName === '') {
        $tradeName = $typeName;
    }

    $tradeColumn = getBusinessTradeColumn($conn);

    $insertColumns = ['Client_ID', $tradeColumn, 'Business_type_ID'];
    $insertValues = [':cid', ':trade', ':btid'];
    $insertParams = [
        ':cid' => $clientId,
        ':trade' => $tradeName,
        ':btid' => $businessTypeId,
    ];

    if (businessHasStatusColumn($conn)) {
        $insertColumns[] = 'Status_id';
        $insertValues[] = ':status_id';
        $insertParams[':status_id'] = resolveBusinessStatusIdFromDetails($conn, $clientId, $businessDetails);
    }

    $insertColumns = array_merge($insertColumns, [
        'Province',
        'Municipality',
        'Postal_code',
        'Barangay',
        'Street_address',
        'Email_address',
        'TIN_number',
        'Contact_number',
    ]);
    $insertValues = array_merge($insertValues, [
        ':prov',
        ':mun',
        ':postal',
        ':barangay',
        ':street',
        ':email',
        ':tin',
        ':contact',
    ]);
    $insertParams = array_merge($insertParams, [
        ':prov' => ($businessProvince !== '' ? $businessProvince : null),
        ':mun' => ($businessMunicipality !== '' ? $businessMunicipality : null),
        ':postal' => ($businessPostalCode !== '' ? $businessPostalCode : null),
        ':barangay' => ($businessBarangay !== '' ? $businessBarangay : null),
        ':street' => ($businessStreet !== '' ? $businessStreet : null),
        ':email' => ($email !== '' ? $email : null),
        ':tin' => ($tin !== '' ? $tin : null),
        ':contact' => ($contact !== '' ? $contact : null),
    ]);

    $stmtBiz = $conn->prepare(
        'INSERT INTO business (' . implode(', ', array_map('quoteIdentifier', $insertColumns)) . ')
         VALUES (' . implode(', ', $insertValues) . ')'
    );
    $stmtBiz->execute($insertParams);
}

function fetchClientRow(PDO $conn, int $clientId): ?array {
    $hasCivilStatusColumn = clientHasCivilStatusColumn($conn);
    $hasCivilStatusTable = civilStatusTableExists($conn);
    $hasRejectionReasonColumn = clientHasRejectionReasonColumn($conn);
    $hasActionByColumn = clientHasActionByColumn($conn);
    $civilStatusSelect = 'NULL AS civil_status_type_id,
                NULL AS civil_status_type,';
    $civilStatusJoin = '';
    $rejectionReasonSelect = 'NULL AS rejection_reason,';
    $actionBySelect = 'NULL AS Action_by,
                NULL AS action_by,
                NULL AS action_by_name,
                NULL AS action_by_username,';
    $actionByJoin = '';

    if ($hasCivilStatusColumn && $hasCivilStatusTable) {
        $civilStatusSelect = 'c.civil_status_type_ID AS civil_status_type_id,
                cst.civil_status_type_name AS civil_status_type,';
        $civilStatusJoin = ' LEFT JOIN civil_status_type cst ON cst.civil_status_type_ID = c.civil_status_type_ID';
    } elseif ($hasCivilStatusColumn) {
        $civilStatusSelect = 'c.civil_status_type_ID AS civil_status_type_id,
                NULL AS civil_status_type,';
    }

    if ($hasRejectionReasonColumn) {
        $rejectionReasonSelect = 'c.Rejection_reason AS rejection_reason,';
    }

    if ($hasActionByColumn) {
        $actionByNameExpr = userDisplayNameSql('au');
        $actionBySelect = "c.action_by AS Action_by,
                c.action_by AS action_by,
                COALESCE({$actionByNameExpr}, NULLIF(TRIM(au.Username), ''), CASE WHEN c.action_by IS NOT NULL THEN CONCAT('User #', c.action_by) ELSE NULL END) AS action_by_name,
                au.Username AS action_by_username,";
        $actionByJoin = ' LEFT JOIN user au ON au.User_id = c.action_by';
    }

    $q = $conn->prepare(
        "SELECT c.Client_ID AS id,
                c.First_name AS first_name,
                c.Middle_name AS middle_name,
                c.Last_name AS last_name,
                c.Email AS email,
                c.Profile_Image AS profile_image,
                c.Phone AS phone,
                c.Date_of_Birth AS date_of_birth,
                {$civilStatusSelect}
                TRIM(CONCAT_WS(', ', c.Street_address, c.Barangay, c.Municipality, c.Province, c.Postal_code)) AS address,
                c.Province AS province,
                c.Municipality AS municipality,
                c.Postal_code AS postal_code,
                c.Barangay AS barangay,
                c.Street_address AS street_address,
                c.Tin_no AS tin_no,
                c.Status_id AS status_id,
                {$rejectionReasonSelect}
                {$actionBySelect}
                s.Status_name AS status_name,
                s.Status_name AS status,
                c.Registered_at AS registered_at
         FROM client c
         {$civilStatusJoin}
         LEFT JOIN status s ON s.Status_id = c.Status_id
         {$actionByJoin}
         WHERE c.Client_ID = :id"
    );
    $q->execute([':id' => $clientId]);
    $row = $q->fetch(PDO::FETCH_ASSOC) ?: null;
    if (!$row) {
        return null;
    }
    $row['approval_status'] = clientStatusIdToApprovalStatus(
        $row['status_id'] ?? null,
        isset($row['status_name']) ? (string)$row['status_name'] : null,
        'Pending'
    );
    return $row;
}

function fetchLatestBusiness(PDO $conn, int $clientId): ?array {
    $tradeColumn = getBusinessTradeColumn($conn);
    $hasBusinessStatusColumn = businessHasStatusColumn($conn);
    $hasStatusTable = tableExists($conn, 'status');
    $businessStatusSelect = 'NULL AS business_status_id,
                NULL AS business_status_name,';
    $businessStatusJoin = '';

    if ($hasBusinessStatusColumn) {
        if ($hasStatusTable) {
            $businessStatusSelect = 'b.Status_id AS business_status_id,
                bs.Status_name AS business_status_name,';
            $businessStatusJoin = ' LEFT JOIN status bs ON bs.Status_id = b.Status_id';
        } else {
            $businessStatusSelect = 'b.Status_id AS business_status_id,
                NULL AS business_status_name,';
        }
    }

    $qb = $conn->prepare(
        "SELECT b.Business_id AS business_id,
                b.Client_ID AS client_id,
                b.{$tradeColumn} AS business_trade_name,
                b.{$tradeColumn} AS business_brand,
                b.Business_type_ID AS business_type_id,
                bt.Business_name AS business_type,
                {$businessStatusSelect}
                TRIM(CONCAT_WS(', ', b.Street_address, b.Barangay, b.Municipality, b.Province, b.Postal_code)) AS business_address,
                b.Province AS business_province,
                b.Municipality AS business_municipality,
                b.Postal_code AS business_postal_code,
                b.Barangay AS business_barangay,
                b.Street_address AS business_street_address,
                b.Email_address AS business_email,
                b.TIN_number AS business_tin,
                b.Contact_number AS business_contact,
                b.Date_added AS business_date_added
         FROM business b
         LEFT JOIN business_type bt ON bt.Business_type_ID = b.Business_type_ID
         {$businessStatusJoin}
         WHERE b.Client_ID = :cid
         ORDER BY b.Business_id DESC
         LIMIT 1"
    );
    $qb->execute([':cid' => $clientId]);
    $row = $qb->fetch(PDO::FETCH_ASSOC) ?: null;
    if (!$row) {
        return null;
    }

    $hasBusinessPermit = monitoring_document_client_has_business_permit($conn, $clientId);
    $statusName = isset($row['business_status_name']) ? (string)$row['business_status_name'] : null;
    $statusId = $row['business_status_id'] ?? null;
    $businessStatus = monitoring_business_status_label($statusName, $statusId, 'Pending');
    if ($hasBusinessPermit) {
        $businessStatus = 'Registered';
    }

    $row['business_status'] = $businessStatus;
    $row['document_status'] = $businessStatus === 'Registered' ? 'Registered' : 'Pending';
    $row['has_business_permit'] = $hasBusinessPermit;

    return $row;
}

try {
    $raw = file_get_contents('php://input');
    $data = json_decode($raw, true);
    if (!is_array($data) || empty($data)) {
        $data = $_POST;
    }

    $action = isset($data['action']) ? strtolower(trim((string)$data['action'])) : '';
    $sessionUser = monitoring_read_session_user(true);
    $conn->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    monitoring_ensure_user_security_columns($conn);

    if ($action === 'check_email') {
        $email = strtolower(trim((string)($data['email'] ?? '')));
        if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
            respond(422, ['success' => false, 'message' => 'Valid email is required.']);
        }

        $existingAccount = findExistingAccountByEmail($conn, $email);
        if ($existingAccount !== null) {
            respond(409, [
                'success' => false,
                'exists' => true,
                'message' => duplicateEmailMessage(),
            ]);
        }

        respond(200, [
            'success' => true,
            'exists' => false,
            'message' => 'Email is available.',
        ]);
    }

    if ($action === 'delete') {
        $clientId = isset($data['client_id']) ? (int)$data['client_id'] : 0;
        if ($clientId <= 0) {
            respond(422, ['success' => false, 'message' => 'client_id is required']);
        }

        monitoring_require_roles([MONITORING_ROLE_ADMIN, MONITORING_ROLE_SECRETARY], $sessionUser);

        $conn->beginTransaction();
        $db = $conn->prepare('DELETE FROM business WHERE Client_ID = :cid');
        $db->execute([':cid' => $clientId]);

        $dc = $conn->prepare('DELETE FROM client WHERE Client_ID = :cid');
        $dc->execute([':cid' => $clientId]);
        $conn->commit();

        respond(200, ['success' => true, 'message' => 'Client removed successfully.']);
    }

    if ($action === 'update_approval') {
        $clientId = isset($data['client_id']) ? (int)$data['client_id'] : 0;
        if ($clientId <= 0) {
            respond(422, ['success' => false, 'message' => 'client_id is required']);
        }

        monitoring_require_roles([MONITORING_ROLE_ADMIN, MONITORING_ROLE_SECRETARY], $sessionUser);

        $currentClient = fetchClientRow($conn, $clientId);
        if (!$currentClient) {
            respond(404, ['success' => false, 'message' => 'Client not found.']);
        }

        $previousApprovalStatus = clientStatusIdToApprovalStatus(
            $currentClient['status_id'] ?? null,
            isset($currentClient['status_name']) ? (string)$currentClient['status_name'] : null,
            'Pending'
        );
        $approvalStatus = normalizeApprovalStatus($data['approval_status'] ?? null, 'Pending');
        $statusId = approvalStatusToClientStatusId($conn, $approvalStatus);
        $rejectionReason = normalizeRejectionReason($data['rejection_reason'] ?? null);

        if (strcasecmp($approvalStatus, 'Rejected') === 0 && $rejectionReason === '') {
            respond(422, ['success' => false, 'message' => 'A rejection reason is required.']);
        }

        $storedRejectionReason = strcasecmp($approvalStatus, 'Rejected') === 0 ? $rejectionReason : null;
        $hasRejectionReasonColumn = clientHasRejectionReasonColumn($conn);
        if ($storedRejectionReason !== null && !$hasRejectionReasonColumn) {
            ensureClientRejectionReasonColumn($conn);
            $hasRejectionReasonColumn = clientHasRejectionReasonColumn($conn, true);
        }
        $hasActionByColumn = clientHasActionByColumn($conn);
        if (!$hasActionByColumn) {
            ensureClientActionByColumn($conn);
            $hasActionByColumn = clientHasActionByColumn($conn, true);
        }
        $actionByUserId = strcasecmp($approvalStatus, 'Pending') === 0
            ? null
            : ((int)($sessionUser['id'] ?? 0) > 0 ? (int)$sessionUser['id'] : null);

        $conn->beginTransaction();
        $setParts = ['Status_id = :status_id'];
        $updateParams = [
            ':status_id' => $statusId,
            ':client_id' => $clientId,
        ];
        if ($hasRejectionReasonColumn) {
            $setParts[] = 'Rejection_reason = :rejection_reason';
            $updateParams[':rejection_reason'] = $storedRejectionReason;
        }
        if ($hasActionByColumn) {
            $setParts[] = 'action_by = :action_by';
            $updateParams[':action_by'] = $actionByUserId;
        }
        $upd = $conn->prepare(
            'UPDATE client
             SET ' . implode(",
                     ", $setParts) . '
             WHERE Client_ID = :client_id'
        );
        $upd->execute($updateParams);

        $client = fetchClientRow($conn, $clientId);
        $business = fetchLatestBusiness($conn, $clientId);
        $conn->commit();

        $emailNotification = [
            'attempted' => false,
            'sent' => false,
            'message' => '',
        ];
        $statusMessage = 'Client approval status updated successfully.';

        if (strcasecmp($approvalStatus, 'Approved') === 0 && strcasecmp($previousApprovalStatus, 'Approved') !== 0) {
            $emailNotification = sendApprovalEmail((string)($client['email'] ?? ''));
            if ($emailNotification['message'] !== '') {
                $statusMessage = 'Client approved. ' . $emailNotification['message'];
            } else {
                $statusMessage = 'Client approved successfully.';
            }
        } elseif (strcasecmp($approvalStatus, 'Rejected') === 0 && strcasecmp($previousApprovalStatus, 'Rejected') !== 0) {
            $emailNotification = sendRejectionEmail((string)($client['email'] ?? ''), [
                'client_name' => buildPersonName(
                    $client['first_name'] ?? '',
                    $client['middle_name'] ?? '',
                    $client['last_name'] ?? ''
                ),
                'rejection_reason' => $client['rejection_reason'] ?? $rejectionReason,
            ]);
            if ($emailNotification['message'] !== '') {
                $statusMessage = 'Client rejected. ' . $emailNotification['message'];
            } else {
                $statusMessage = 'Client rejected successfully.';
            }
        } elseif (strcasecmp($approvalStatus, 'Rejected') === 0) {
            $statusMessage = 'Client rejected successfully.';
        } elseif (strcasecmp($approvalStatus, 'Pending') === 0) {
            $statusMessage = 'Client moved back to pending successfully.';
        }

        respond(200, [
            'success' => true,
            'message' => $statusMessage,
            'client' => $client,
            'business' => $business,
            'email_notification' => $emailNotification,
        ]);
    }

    if ($action === 'update_profile_image') {
        $clientId = isset($data['client_id']) ? (int)$data['client_id'] : 0;
        if ($clientId <= 0) {
            respond(422, ['success' => false, 'message' => 'client_id is required']);
        }

        $sessionUser = monitoring_require_client_access($clientId, [MONITORING_ROLE_ADMIN, MONITORING_ROLE_SECRETARY], $sessionUser);

        $currentClient = fetchClientRow($conn, $clientId);
        if (!$currentClient) {
            respond(404, ['success' => false, 'message' => 'Client not found.']);
        }

        if (!isset($_FILES['profile_image'])) {
            respond(400, ['success' => false, 'message' => 'profile_image is required']);
        }

        $oldProfileImage = trim((string)($currentClient['profile_image'] ?? ''));
        $newProfileImage = '';

        try {
            $conn->beginTransaction();
            $newProfileImage = storeClientProfileImage($_FILES['profile_image'], $clientId);

            $upd = $conn->prepare(
                'UPDATE client
                 SET Profile_Image = :profile_image
                 WHERE Client_ID = :client_id'
            );
            $upd->execute([
                ':profile_image' => $newProfileImage,
                ':client_id' => $clientId,
            ]);

            $client = fetchClientRow($conn, $clientId);
            $business = fetchLatestBusiness($conn, $clientId);
            $conn->commit();
        } catch (Throwable $e) {
            if ($conn->inTransaction()) {
                $conn->rollBack();
            }
            if ($newProfileImage !== '') {
                deleteClientProfileImageFile($newProfileImage);
            }
            throw $e;
        }

        if ($oldProfileImage !== '' && $oldProfileImage !== $newProfileImage) {
            deleteClientProfileImageFile($oldProfileImage);
        }

        syncOwnClientSession($sessionUser, $clientId, [
            'username' => $client['email'] ?? ($sessionUser['username'] ?? null),
            'email' => $client['email'] ?? ($sessionUser['email'] ?? null),
            'first_name' => $client['first_name'] ?? ($sessionUser['first_name'] ?? null),
            'middle_name' => $client['middle_name'] ?? ($sessionUser['middle_name'] ?? null),
            'last_name' => $client['last_name'] ?? ($sessionUser['last_name'] ?? null),
            'profile_image' => $client['profile_image'] ?? $newProfileImage,
            'approval_status' => $client['approval_status'] ?? ($sessionUser['approval_status'] ?? null),
        ]);

        respond(200, [
            'success' => true,
            'message' => 'Profile image updated successfully.',
            'client' => $client,
            'business' => $business,
        ]);
    }

    if ($action === 'update') {
        $supportsCivilStatusColumn = clientHasCivilStatusColumn($conn);
        $clientId = isset($data['client_id']) ? (int)$data['client_id'] : 0;
        if ($clientId <= 0) {
            respond(422, ['success' => false, 'message' => 'client_id is required']);
        }

        $currentClient = fetchClientRow($conn, $clientId);
        if (!$currentClient) {
            respond(404, ['success' => false, 'message' => 'Client not found.']);
        }

        $sessionUser = monitoring_require_client_access($clientId, [MONITORING_ROLE_ADMIN, MONITORING_ROLE_SECRETARY], $sessionUser);
        $staffCanManageClient = monitoring_user_has_any_role($sessionUser, [MONITORING_ROLE_ADMIN, MONITORING_ROLE_SECRETARY]);

        $first = isset($data['first_name']) ? trim((string)$data['first_name']) : '';
        $middle = isset($data['middle_name']) ? trim((string)$data['middle_name']) : null;
        $last = isset($data['last_name']) ? trim((string)$data['last_name']) : '';
        $email = isset($data['email']) ? trim((string)$data['email']) : null;
        $phone = isset($data['phone']) ? trim((string)$data['phone']) : null;
        $hasDateOfBirth = array_key_exists('date_of_birth', $data);
        $dateOfBirth = $hasDateOfBirth ? normalizeOptionalDate($data['date_of_birth']) : null;
        $hasCivilStatusType = array_key_exists('civil_status_type_id', $data)
            || array_key_exists('civil_status_type_ID', $data)
            || array_key_exists('civil_status_type', $data);
        $civilStatusTypeId = $hasCivilStatusType
            ? resolveCivilStatusTypeId(
                $conn,
                $data['civil_status_type_id'] ?? $data['civil_status_type_ID'] ?? null,
                isset($data['civil_status_type']) ? (string)$data['civil_status_type'] : ''
            )
            : null;
        $province = array_key_exists('province', $data)
            ? trim((string)$data['province'])
            : (isset($currentClient['province']) ? (string)$currentClient['province'] : null);
        $municipality = array_key_exists('municipality', $data)
            ? trim((string)$data['municipality'])
            : (isset($currentClient['municipality']) ? (string)$currentClient['municipality'] : null);
        $postalCode = array_key_exists('postal_code', $data)
            ? trim((string)$data['postal_code'])
            : (isset($currentClient['postal_code']) ? (string)$currentClient['postal_code'] : null);
        $barangay = array_key_exists('barangay', $data)
            ? trim((string)$data['barangay'])
            : (isset($currentClient['barangay']) ? (string)$currentClient['barangay'] : null);

        $streetAddress = null;
        if (array_key_exists('street_address', $data)) {
            $streetAddress = trim((string)$data['street_address']);
        } elseif (array_key_exists('address', $data)) {
            $streetAddress = trim((string)$data['address']);
        } elseif (isset($currentClient['street_address'])) {
            $streetAddress = (string)$currentClient['street_address'];
        }

        $province = $province !== '' ? $province : null;
        $municipality = $municipality !== '' ? $municipality : null;
        $postalCode = $postalCode !== '' ? $postalCode : null;
        $barangay = $barangay !== '' ? $barangay : null;
        $streetAddress = $streetAddress !== '' ? $streetAddress : null;
        $tin = isset($data['tin_no']) ? trim((string)$data['tin_no']) : null;
        $statusId = isset($data['status_id']) && ctype_digit((string)$data['status_id']) ? (int)$data['status_id'] : 1;

        if (!$staffCanManageClient) {
            $statusId = isset($currentClient['status_id']) && ctype_digit((string)$currentClient['status_id'])
                ? (int)$currentClient['status_id']
                : null;
        }

        if ($first === '' || $last === '') {
            respond(400, ['success' => false, 'message' => 'First name and last name are required.']);
        }

        $conn->beginTransaction();
        $updateSql = 'UPDATE client
             SET First_name = :fn,
                 Middle_name = :mn,
                 Last_name = :ln,
                 Email = :em,
                 Phone = :ph,
                 Province = :prov,
                 Municipality = :mun,
                 Postal_code = :postal,
                 Barangay = :barangay,
                 Street_address = :street,
                 Tin_no = :tin,
                 Status_id = :sid';
        if ($hasDateOfBirth) {
            $updateSql .= ',
                 Date_of_Birth = :dob';
        }
        if ($hasCivilStatusType && $supportsCivilStatusColumn) {
            $updateSql .= ',
                 civil_status_type_ID = :cstid';
        }
        $updateSql .= '
             WHERE Client_ID = :cid';

        $upd = $conn->prepare($updateSql);
        $params = [
            ':fn' => $first,
            ':mn' => ($middle !== '' ? $middle : null),
            ':ln' => $last,
            ':em' => ($email !== '' ? $email : null),
            ':ph' => ($phone !== '' ? $phone : null),
            ':prov' => ($province !== '' ? $province : null),
            ':mun' => ($municipality !== '' ? $municipality : null),
            ':postal' => ($postalCode !== '' ? $postalCode : null),
            ':barangay' => ($barangay !== '' ? $barangay : null),
            ':street' => ($streetAddress !== '' ? $streetAddress : null),
            ':tin' => ($tin !== '' ? $tin : null),
            ':sid' => $statusId,
            ':cid' => $clientId,
        ];
        if ($hasDateOfBirth) {
            $params[':dob'] = $dateOfBirth;
        }
        if ($hasCivilStatusType && $supportsCivilStatusColumn) {
            $params[':cstid'] = $civilStatusTypeId;
        }
        $upd->execute($params);

        if ($email !== null && $email !== '') {
            $syncUser = $conn->prepare(
                'UPDATE user u
                 INNER JOIN client c ON c.User_id = u.User_id
                 SET u.Username = :username,
                     u.Email = :email
                 WHERE c.Client_ID = :client_id'
            );
            $syncUser->execute([
                ':username' => $email,
                ':email' => $email,
                ':client_id' => $clientId,
            ]);
        }

        $bd = isset($data['business_details']) && is_array($data['business_details']) ? $data['business_details'] : [];
        saveBusinessDetails($conn, $clientId, $bd, null);

        $client = fetchClientRow($conn, $clientId);
        $business = fetchLatestBusiness($conn, $clientId);
        $conn->commit();

        syncOwnClientSession($sessionUser, $clientId, [
            'username' => $client['email'] ?? ($sessionUser['username'] ?? null),
            'email' => $client['email'] ?? ($sessionUser['email'] ?? null),
            'first_name' => $client['first_name'] ?? ($sessionUser['first_name'] ?? null),
            'middle_name' => $client['middle_name'] ?? ($sessionUser['middle_name'] ?? null),
            'last_name' => $client['last_name'] ?? ($sessionUser['last_name'] ?? null),
            'profile_image' => $client['profile_image'] ?? ($sessionUser['profile_image'] ?? null),
            'approval_status' => $client['approval_status'] ?? ($sessionUser['approval_status'] ?? null),
        ]);

        respond(200, [
            'success' => true,
            'message' => 'Client updated successfully.',
            'client' => $client,
            'business' => $business,
        ]);
    }

    $first = isset($data['first_name']) ? trim((string)$data['first_name']) : '';
    $middle = isset($data['middle_name']) ? trim((string)$data['middle_name']) : null;
    $last = isset($data['last_name']) ? trim((string)$data['last_name']) : '';
    $email = isset($data['email']) ? trim((string)$data['email']) : null;
    $phone = isset($data['phone']) ? trim((string)$data['phone']) : null;
    $dateOfBirth = normalizeOptionalDate($data['date_of_birth'] ?? null);
    $province = isset($data['province']) ? trim((string)$data['province']) : null;
    $municipality = isset($data['municipality']) ? trim((string)$data['municipality']) : null;
    $postalCode = isset($data['postal_code']) ? trim((string)$data['postal_code']) : null;
    $barangay = isset($data['barangay']) ? trim((string)$data['barangay']) : null;
    $streetAddress = isset($data['street_address']) ? trim((string)$data['street_address']) : null;
    if (($streetAddress === null || $streetAddress === '') && isset($data['address'])) {
        $streetAddress = trim((string)$data['address']);
    }
    $civilStatusTypeId = resolveCivilStatusTypeId(
        $conn,
        $data['civil_status_type_id'] ?? $data['civil_status_type_ID'] ?? null,
        isset($data['civil_status_type']) ? (string)$data['civil_status_type'] : ''
    );
    $tin = isset($data['tin_no']) ? trim((string)$data['tin_no']) : null;
    $registrationSource = normalizeRegistrationSource($data['registration_source'] ?? null);
    $approvalStatus = normalizeApprovalStatus(
        $data['approval_status'] ?? null,
        $registrationSource === 'self_signup' ? 'Pending' : 'Approved'
    );
    $statusId = isset($data['status_id']) && ctype_digit((string)$data['status_id'])
        ? (int)$data['status_id']
        : approvalStatusToClientStatusId($conn, $approvalStatus);
    $userPassword = isset($data['user_password']) ? (string)$data['user_password'] : null;
    $securitySettings = monitoring_get_security_settings($conn);
    $maxPasswordLength = (int)$securitySettings['maxPasswordLength'];
    $trimmedEmail = trim((string)($email ?? ''));
    $rawUserPassword = (string)($userPassword ?? '');
    $creatingUserAccount = $trimmedEmail !== '' || $rawUserPassword !== '';

    if ($first === '' || $last === '') {
        respond(400, ['success' => false, 'message' => 'First name and last name are required.']);
    }

    if ($creatingUserAccount && $trimmedEmail === '') {
        respond(422, ['success' => false, 'message' => 'Email is required when setting an account password.']);
    }

    if ($creatingUserAccount && $rawUserPassword === '') {
        respond(422, ['success' => false, 'message' => 'Account password is required when email is provided.']);
    }

    if ($rawUserPassword !== '') {
        $passwordValidationMessage = monitoring_validate_password_value($rawUserPassword, $maxPasswordLength);
        if ($passwordValidationMessage !== null) {
            respond(422, ['success' => false, 'message' => $passwordValidationMessage]);
        }
    }

    if ($trimmedEmail !== '' && findExistingAccountByEmail($conn, $trimmedEmail) !== null) {
        respond(409, ['success' => false, 'message' => duplicateEmailMessage()]);
    }

    $staffCanCreateClient = $sessionUser !== null
        && monitoring_user_has_any_role($sessionUser, [MONITORING_ROLE_ADMIN, MONITORING_ROLE_SECRETARY]);

    if (!$staffCanCreateClient) {
        $registrationSource = 'self_signup';
        $approvalStatus = 'Pending';
        $statusId = approvalStatusToClientStatusId($conn, $approvalStatus);
    } elseif ($registrationSource !== 'self_signup') {
        monitoring_require_roles([MONITORING_ROLE_ADMIN, MONITORING_ROLE_SECRETARY], $sessionUser);
    }

    if (strcasecmp($approvalStatus, 'Pending') === 0) {
        $statusId = null;
    }

    $hasActionByColumn = clientHasActionByColumn($conn);
    $actionByUserId = null;
    if ($staffCanCreateClient && strcasecmp($approvalStatus, 'Pending') !== 0) {
        if (!$hasActionByColumn) {
            ensureClientActionByColumn($conn);
            $hasActionByColumn = clientHasActionByColumn($conn, true);
        }
        $actionByUserId = (int)($sessionUser['id'] ?? 0) > 0 ? (int)$sessionUser['id'] : null;
    }

    $conn->beginTransaction();

    $supportsCivilStatusColumn = clientHasCivilStatusColumn($conn);
    $insertColumns = [
        'First_name',
        'Middle_name',
        'Last_name',
        'Email',
        'Phone',
        'Date_of_Birth',
    ];
    $insertValues = [
        ':fn',
        ':mn',
        ':ln',
        ':em',
        ':ph',
        ':dob',
    ];
    $insertParams = [
        ':fn' => $first,
        ':mn' => ($middle !== '' ? $middle : null),
        ':ln' => $last,
        ':em' => ($email !== '' ? $email : null),
        ':ph' => ($phone !== '' ? $phone : null),
        ':dob' => $dateOfBirth,
    ];

    if ($supportsCivilStatusColumn) {
        $insertColumns[] = 'civil_status_type_ID';
        $insertValues[] = ':cstid';
        $insertParams[':cstid'] = $civilStatusTypeId;
    }

    $insertColumns = array_merge($insertColumns, [
        'Province',
        'Municipality',
        'Postal_code',
        'Barangay',
        'Street_address',
        'Tin_no',
        'Status_id',
    ]);
    $insertValues = array_merge($insertValues, [
        ':prov',
        ':mun',
        ':postal',
        ':barangay',
        ':street',
        ':tin',
        ':sid',
    ]);
    $insertParams[':prov'] = ($province !== '' ? $province : null);
    $insertParams[':mun'] = ($municipality !== '' ? $municipality : null);
    $insertParams[':postal'] = ($postalCode !== '' ? $postalCode : null);
    $insertParams[':barangay'] = ($barangay !== '' ? $barangay : null);
    $insertParams[':street'] = ($streetAddress !== '' ? $streetAddress : null);
    $insertParams[':tin'] = ($tin !== '' ? $tin : null);
    $insertParams[':sid'] = $statusId;

    if ($hasActionByColumn) {
        $insertColumns[] = 'action_by';
        $insertValues[] = ':action_by';
        $insertParams[':action_by'] = $actionByUserId;
    }

    $stmt = $conn->prepare(
        'INSERT INTO client (
            ' . implode(",
            ", $insertColumns) . '
        ) VALUES (
            ' . implode(",
            ", $insertValues) . '
        )'
    );
    $stmt->execute($insertParams);
    $newId = (int)$conn->lastInsertId();

    $bd = isset($data['business_details']) && is_array($data['business_details']) ? $data['business_details'] : [];
    saveBusinessDetails($conn, $newId, $bd, null);

    $loginUsernameForEmail = '';
    $loginPasswordForEmail = '';

    if ($trimmedEmail !== '') {
        $roleId = 4;
        $stmtRole = $conn->prepare('SELECT Role_id FROM role WHERE LOWER(Role_name) = "client" LIMIT 1');
        $stmtRole->execute();
        $rid = $stmtRole->fetchColumn();
        if ($rid) {
            $roleId = (int)$rid;
        }

        $plain = $rawUserPassword;
        $passwordHash = hash('sha256', (string)$plain);
        $loginUsernameForEmail = $trimmedEmail;
        $loginPasswordForEmail = $plain;

        $insU = $conn->prepare('INSERT INTO user (Username, Password, Role_id, Email) VALUES (:u, :p, :r, :e)');
        $insU->execute([':u' => $trimmedEmail, ':p' => $passwordHash, ':r' => $roleId, ':e' => $trimmedEmail]);
        $newUserId = (int)$conn->lastInsertId();
        if ($newUserId > 0) {
            $link = $conn->prepare('UPDATE client SET User_id = :uid WHERE Client_ID = :cid');
            $link->execute([':uid' => $newUserId, ':cid' => $newId]);
        }
    }

    $client = fetchClientRow($conn, $newId);
    $business = fetchLatestBusiness($conn, $newId);
    $conn->commit();

    if ($registrationSource === 'self_signup') {
        monitoring_allow_signup_client_document_upload($newId);
        try {
            $senderId = isset($sessionUser['id']) ? (int)$sessionUser['id'] : null;
            notifyAdminsOfClientSignup($conn, is_array($client) ? $client : [], is_array($business) ? $business : null, $senderId);
        } catch (Throwable $__) {
            // Do not block signup if notifications fail.
        }
    }

    $emailNotification = [
        'attempted' => false,
        'sent' => false,
        'message' => '',
    ];
    $statusMessage = 'Client created successfully.';

    if (strcasecmp($approvalStatus, 'Approved') === 0) {
        $emailNotification = sendApprovalEmail((string)($client['email'] ?? ''), [
            'login_username' => $loginUsernameForEmail,
            'login_password' => $loginPasswordForEmail,
        ]);
        if ($emailNotification['message'] !== '') {
            $statusMessage .= ' ' . $emailNotification['message'];
        }
    }

    respond(201, [
        'success' => true,
        'message' => $statusMessage,
        'client' => $client,
        'business' => $business,
        'email_notification' => $emailNotification,
    ]);
} catch (Throwable $e) {
    if (isset($conn) && $conn instanceof PDO && $conn->inTransaction()) {
        try {
            $conn->rollBack();
        } catch (Throwable $__) {}
    }
    if ($e instanceof InvalidArgumentException) {
        respond(422, ['success' => false, 'message' => $e->getMessage()]);
    }
    $constraintMessage = mapConstraintMessage($e);
    if ($constraintMessage !== null) {
        respond(409, ['success' => false, 'message' => $constraintMessage]);
    }
    respond(500, ['success' => false, 'message' => 'Server error', 'error' => $e->getMessage()]);
}
