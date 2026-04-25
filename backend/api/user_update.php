<?php
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/connection-pdo.php';
require_once __DIR__ . '/employee_specialization.php';
require_once __DIR__ . '/account_status_helpers.php';
require_once __DIR__ . '/audit_logs_helper.php';
require_once __DIR__ . '/management_catalog_settings_helper.php';
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

function columnExists(PDO $conn, string $tableName, string $columnName): bool {
    try {
        $sql = 'SHOW COLUMNS FROM ' . quoteIdentifier($tableName) . ' LIKE :column_name';
        $stmt = $conn->prepare($sql);
        $stmt->execute([':column_name' => $columnName]);
        return (bool)$stmt->fetch(PDO::FETCH_ASSOC);
    } catch (Throwable $__) {
        return false;
    }
}

function sendSystemTestEmail(array $settings, string $recipientEmail): array {
    $recipient = trim($recipientEmail);
    $errors = [];

    if ($recipient === '' || !filter_var($recipient, FILTER_VALIDATE_EMAIL)) {
        $errors['recipientEmail'] = 'Enter a valid recipient email address.';
    }

    $smtpUser = trim((string)($settings['smtpUsername'] ?? ''));
    $smtpPass = trim((string)($settings['smtpPassword'] ?? ''));
    $smtpHost = trim((string)($settings['smtpHost'] ?? ''));
    $smtpPort = (int)($settings['smtpPort'] ?? 0);
    $companyName = trim((string)($settings['companyName'] ?? ''));
    $supportEmail = trim((string)($settings['supportEmail'] ?? ''));
    $systemNotice = trim((string)($settings['systemNotice'] ?? ''));

    if ($smtpUser === '') {
        $errors['smtpUsername'] = 'SMTP username is required to send a test email.';
    }
    if ($smtpPass === '') {
        $errors['smtpPassword'] = 'SMTP password is required to send a test email.';
    }
    if ($smtpHost === '') {
        $errors['smtpHost'] = 'SMTP host is required to send a test email.';
    }
    if ($smtpPort <= 0 || $smtpPort > 65535) {
        $errors['smtpPort'] = 'SMTP port must be between 1 and 65535.';
    }
    if ($supportEmail !== '' && !filter_var($supportEmail, FILTER_VALIDATE_EMAIL)) {
        $errors['supportEmail'] = 'Support email must be a valid email address.';
    }

    if (!empty($errors)) {
        return [
            'success' => false,
            'errors' => $errors,
        ];
    }

    $senderName = $companyName !== '' ? $companyName : 'Monitoring System';
    $safeSenderName = htmlspecialchars($senderName, ENT_QUOTES, 'UTF-8');
    $safeNotice = htmlspecialchars($systemNotice, ENT_QUOTES, 'UTF-8');
    $safeRecipient = htmlspecialchars($recipient, ENT_QUOTES, 'UTF-8');

    $mail = new \PHPMailer\PHPMailer\PHPMailer(true);

    try {
        $mail->isSMTP();
        $mail->Host = $smtpHost;
        $mail->SMTPAuth = true;
        $mail->Username = $smtpUser;
        $mail->Password = $smtpPass;
        $mail->SMTPSecure = \PHPMailer\PHPMailer\PHPMailer::ENCRYPTION_STARTTLS;
        $mail->Port = $smtpPort;

        $mail->setFrom($smtpUser, $senderName);
        if ($supportEmail !== '') {
            $mail->addReplyTo($supportEmail, $senderName . ' Support');
        }
        $mail->addAddress($recipient);
        $mail->Subject = $senderName . ' SMTP Test Email';
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
            . '              <div style="font-size:14px;opacity:0.9;">' . $safeSenderName . '</div>'
            . '              <div style="margin-top:6px;font-size:22px;line-height:1.2;font-weight:700;">SMTP Test Email</div>'
            . '            </td>'
            . '          </tr>'
            . '          <tr>'
            . '            <td style="padding:24px 20px;color:#0f172a;font-size:14px;line-height:1.7;">'
            . '              <p style="margin:0 0 14px;">Hello,</p>'
            . '              <p style="margin:0 0 14px;">This is a confirmation that your System Configuration email settings can deliver messages successfully.</p>'
            . '              <p style="margin:0 0 14px;">The message was sent to <strong>' . $safeRecipient . '</strong> using the current SMTP host, port, username, and sender name.</p>'
            . ($safeNotice !== ''
                ? '              <div style="margin:0 0 18px;padding:14px 16px;border:1px solid #bfdbfe;border-radius:12px;background:#eff6ff;">'
                    . '<div style="margin:0 0 6px;font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#1d4ed8;">Current Portal Notice</div>'
                    . '<div style="margin:0;white-space:pre-wrap;color:#1e3a8a;">' . $safeNotice . '</div>'
                    . '</div>'
                : '')
            . '              <p style="margin:0 0 14px;">If you received this email, your SMTP settings are working.</p>'
            . '              <p style="margin:0;">Regards,<br />' . $safeSenderName . '</p>'
            . '            </td>'
            . '          </tr>'
            . '        </table>'
            . '      </td>'
            . '    </tr>'
            . '  </table>'
            . '</body></html>';

        $mail->AltBody = "Hello,\n\n"
            . "This is a confirmation that your System Configuration email settings can deliver messages successfully.\n\n"
            . "The message was sent to {$recipient} using the current SMTP host, port, username, and sender name.\n\n"
            . ($systemNotice !== '' ? "Current portal notice:\n{$systemNotice}\n\n" : '')
            . "If you received this email, your SMTP settings are working.\n\n"
            . "Regards,\n"
            . $senderName;

        $mail->send();

        return [
            'success' => true,
            'message' => 'Test email sent to ' . $recipient . '.',
        ];
    } catch (Throwable $__) {
        return [
            'success' => false,
            'message' => 'Unable to send the test email. Check the SMTP host, port, username, and password.',
        ];
    }
}

function inferNamesFromUsername(string $username): array {
    $parts = preg_split('/[\s._-]+/', trim($username)) ?: [];
    $parts = array_values(array_filter(array_map('trim', $parts), function ($value) {
        return $value !== '';
    }));

    if (empty($parts)) {
        return ['', '', ''];
    }

    $first = ucfirst(strtolower($parts[0]));
    $middle = '';
    $last = ucfirst(strtolower($parts[count($parts) - 1]));

    if (count($parts) === 1) {
        $last = $first;
    } elseif (count($parts) > 2) {
        $middle = ucfirst(strtolower(implode(' ', array_slice($parts, 1, -1))));
    }

    return [$first, $middle, $last];
}

function normalizeAccountNumber($value): ?string {
    $raw = trim((string)($value ?? ''));
    return $raw !== '' ? $raw : null;
}

function hasGovernmentAccountNumbersPayload(array $employeeDetails): bool {
    return array_key_exists('sss_account_number', $employeeDetails)
        || array_key_exists('pagibig_account_number', $employeeDetails)
        || array_key_exists('philhealth_account_number', $employeeDetails);
}

function hasEmployeeProfilePayload(array $employeeDetails): bool {
    return array_key_exists('first_name', $employeeDetails)
        || array_key_exists('middle_name', $employeeDetails)
        || array_key_exists('last_name', $employeeDetails)
        || array_key_exists('date_of_birth', $employeeDetails)
        || array_key_exists('phone_number', $employeeDetails)
        || employeeSpecializationPayloadProvided($employeeDetails)
        || hasGovernmentAccountNumbersPayload($employeeDetails);
}

function syncOwnSessionUser(array $sessionUser, int $targetUserId, array $patch): void {
    $sessionUserId = isset($sessionUser['id']) ? (int)$sessionUser['id'] : 0;
    if ($sessionUserId <= 0 || $sessionUserId !== $targetUserId) {
        return;
    }

    $nextSessionUser = array_merge($sessionUser, $patch);
    $nextSessionUser['id'] = $sessionUserId;
    $nextSessionUser['role_id'] = isset($nextSessionUser['role_id']) ? (int)$nextSessionUser['role_id'] : (int)($sessionUser['role_id'] ?? 0);
    $nextSessionUser['client_id'] = array_key_exists('client_id', $nextSessionUser)
        ? ($nextSessionUser['client_id'] !== null ? (int)$nextSessionUser['client_id'] : null)
        : ($sessionUser['client_id'] ?? null);
    $nextSessionUser['security_settings'] = is_array($sessionUser['security_settings'] ?? null)
        ? $sessionUser['security_settings']
        : [];
    $nextSessionUser['registration_source'] = $sessionUser['registration_source'] ?? null;
    $nextSessionUser['approval_status'] = $sessionUser['approval_status'] ?? null;

    monitoring_store_session_user($nextSessionUser);
}

function extractGovernmentAccountNumbers(array $employeeDetails): array {
    $mapping = [
        1 => normalizeAccountNumber($employeeDetails['sss_account_number'] ?? null),
        2 => normalizeAccountNumber($employeeDetails['pagibig_account_number'] ?? null),
        3 => normalizeAccountNumber($employeeDetails['philhealth_account_number'] ?? null),
    ];

    $result = [];
    foreach ($mapping as $typeId => $accountNumber) {
        if ($accountNumber !== null) {
            $result[(int)$typeId] = $accountNumber;
        }
    }
    return $result;
}

function buildGovernmentFinancialDetails(array $accountsByType): array {
    $definitions = [
        1 => 'SSS',
        2 => 'Pag-IBIG',
        3 => 'PhilHealth',
    ];

    $details = [];
    foreach ($definitions as $id => $name) {
        $accountNumber = normalizeAccountNumber($accountsByType[$id] ?? null);
        if ($accountNumber === null) {
            continue;
        }

        $details[] = [
            'id' => $id,
            'name' => $name,
            'account_name' => $accountNumber,
            'amount' => null,
            'rate' => null,
            'effective_from' => null,
            'effective_to' => null,
            'label' => $name . ': ' . $accountNumber,
        ];
    }

    return $details;
}

function normalizeOptionalString($value): ?string {
    $raw = trim((string)($value ?? ''));
    return $raw !== '' ? $raw : null;
}

function normalizeOptionalDate($value): ?string {
    $raw = trim((string)($value ?? ''));
    if ($raw === '') {
        return null;
    }

    $ts = strtotime($raw);
    if ($ts === false) {
        return null;
    }

    return date('Y-m-d', $ts);
}

function backendBaseDirectory(): string {
    $real = realpath(__DIR__ . '/..');
    return $real !== false ? $real : dirname(__DIR__);
}

function normalizeStoredUploadPath(string $path): string {
    return ltrim(str_replace('\\', '/', trim($path)), '/');
}

function resolveRole(PDO $conn, string $roleRaw): array {
    $roleRaw = trim($roleRaw);
    if ($roleRaw === '') {
        return [0, ''];
    }

    if (ctype_digit($roleRaw)) {
        $id = (int)$roleRaw;
        $stmt = $conn->prepare('SELECT Role_id, Role_name FROM role WHERE Role_id = :id LIMIT 1');
        $stmt->execute([':id' => $id]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if ($row) {
            return [(int)$row['Role_id'], (string)$row['Role_name']];
        }
    }

    $stmt = $conn->prepare('SELECT Role_id, Role_name FROM role WHERE LOWER(Role_name) = LOWER(:name) LIMIT 1');
    $stmt->execute([':name' => $roleRaw]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    if ($row) {
        return [(int)$row['Role_id'], (string)$row['Role_name']];
    }

    return [0, ''];
}

function buildProfileImageSelect(PDO $conn, string $alias = 'profile_image'): string {
    $hasClientProfileImage = columnExists($conn, 'client', 'Profile_Image');
    $hasUserProfileImage = columnExists($conn, 'user', 'Profile_Image');

    $clientExpr = $hasClientProfileImage ? 'c.Profile_Image' : 'NULL';
    $userExpr = $hasUserProfileImage ? 'u.Profile_Image' : 'NULL';

    return "COALESCE({$userExpr}, {$clientExpr}) AS {$alias}";
}

function deleteUserProfileImageFile(string $path): void {
    $relativePath = normalizeStoredUploadPath($path);
    if ($relativePath === '' || strpos($relativePath, 'uploads/profile_images/') !== 0) {
        return;
    }

    $fullPath = backendBaseDirectory() . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $relativePath);
    if (is_file($fullPath)) {
        @unlink($fullPath);
    }
}

function storeUserProfileImage(array $file, int $userId): string {
    if ($userId <= 0) {
        throw new InvalidArgumentException('id is required');
    }

    if (!isset($file['tmp_name']) || !is_uploaded_file((string)$file['tmp_name'])) {
        throw new InvalidArgumentException('No profile image was uploaded.');
    }

    $uploadError = isset($file['error']) ? (int)$file['error'] : UPLOAD_ERR_NO_FILE;
    if ($uploadError !== UPLOAD_ERR_OK) {
        throw new InvalidArgumentException('Profile image upload failed.');
    }

    if ((int)($file['size'] ?? 0) > 5 * 1024 * 1024) {
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

    $storedName = 'user_' . $userId . '_profile_' . bin2hex(random_bytes(8)) . '_' . $safeBase . '.' . $extension;
    $destination = $uploadDir . DIRECTORY_SEPARATOR . $storedName;

    if (!move_uploaded_file((string)$file['tmp_name'], $destination)) {
        throw new RuntimeException('Failed to save uploaded profile image.');
    }

    return 'uploads/profile_images/' . $storedName;
}

function loadEmployeeProfile(PDO $conn, int $userId): ?array {
    if ($userId <= 0) {
        return null;
    }

    $stmt = $conn->prepare(
        'SELECT User_id AS user_id,
                first_name,
                middle_name,
                last_name,
                Profile_Image,
                date_of_birth,
                phone_number,
                specialization_type_ID,
                sss_account_number,
                pagibig_account_number,
                philhealth_account_number
         FROM user
         WHERE User_id = :uid
         LIMIT 1'
    );
    $stmt->execute([':uid' => $userId]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    return $row ?: null;
}

function upsertEmployeeProfile(PDO $conn, int $userId, array $profile): void {
    $stmt = $conn->prepare(
        'UPDATE user
         SET first_name = :first_name,
             middle_name = :middle_name,
             last_name = :last_name,
             date_of_birth = :date_of_birth,
             phone_number = :phone_number,
             specialization_type_ID = :specialization_type_id,
             sss_account_number = :sss_account_number,
             pagibig_account_number = :pagibig_account_number,
             philhealth_account_number = :philhealth_account_number
         WHERE User_id = :user_id'
    );

    $stmt->execute([
        ':user_id' => $userId,
        ':first_name' => $profile['first_name'],
        ':middle_name' => $profile['middle_name'],
        ':last_name' => $profile['last_name'],
        ':date_of_birth' => $profile['date_of_birth'],
        ':phone_number' => $profile['phone_number'],
        ':specialization_type_id' => $profile['specialization_type_id'],
        ':sss_account_number' => $profile['sss_account_number'],
        ':pagibig_account_number' => $profile['pagibig_account_number'],
        ':philhealth_account_number' => $profile['philhealth_account_number'],
    ]);
}

function fetchUserRow(PDO $conn, int $id): ?array {
    $profileImageSelect = buildProfileImageSelect($conn);
    $stmt = $conn->prepare(
        'SELECT u.User_id AS id,
                u.Username AS username,
                u.Email AS email,
                ' . $profileImageSelect . ',
                u.Role_id AS role_id,
                u.Employment_status_id AS employment_status_id,
                r.Role_name AS role,
                c.Client_ID AS client_id,
                c.First_name AS client_first_name,
                c.Middle_name AS client_middle_name,
                c.Last_name AS client_last_name,
                c.Date_of_Birth AS client_date_of_birth,
                c.Phone AS client_phone,
                c.Status_id AS client_status_id,
                s.Status_name AS client_status_name,
                es.Status_name AS employment_status_name,
                u.first_name AS profile_first_name,
                u.middle_name AS profile_middle_name,
                u.last_name AS profile_last_name,
                u.date_of_birth AS profile_date_of_birth,
                u.phone_number AS profile_phone_number,
                u.specialization_type_ID AS profile_specialization_type_id,
                st.Name AS profile_specialization_type_name,
                u.sss_account_number AS profile_sss_account_number,
                u.pagibig_account_number AS profile_pagibig_account_number,
                u.philhealth_account_number AS profile_philhealth_account_number
         FROM user u
         LEFT JOIN role r ON r.Role_id = u.Role_id
         LEFT JOIN status es ON es.Status_id = u.Employment_status_id
         LEFT JOIN client c ON c.User_id = u.User_id
         LEFT JOIN status s ON s.Status_id = c.Status_id
         LEFT JOIN specialization_type st ON st.specialization_type_ID = u.specialization_type_ID
         WHERE u.User_id = :id
         LIMIT 1'
    );
    $stmt->execute([':id' => $id]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    return $row ?: null;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    respond(405, ['success' => false, 'message' => 'Method not allowed']);
}

try {
    $conn->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    monitoring_ensure_user_security_columns($conn);

    $raw = file_get_contents('php://input');
    $data = json_decode($raw, true);
    if (!is_array($data) || empty($data)) {
        $data = $_POST;
    }
    if (!is_array($data) || empty($data)) {
        respond(400, ['success' => false, 'message' => 'Invalid JSON payload']);
    }

    $action = isset($data['action']) ? strtolower(trim((string)$data['action'])) : '';
    $sessionUser = monitoring_require_auth();
    $canManageAnyUser = monitoring_user_has_any_role($sessionUser, [MONITORING_ROLE_ADMIN]);

    if ($action === 'save_security_settings') {
        monitoring_require_roles([MONITORING_ROLE_ADMIN], $sessionUser);
        $settingsPayload = isset($data['settings']) && is_array($data['settings']) ? $data['settings'] : $data;
        $result = monitoring_upsert_security_settings($conn, $settingsPayload);

        if (!empty($result['errors'])) {
            respond(422, [
                'success' => false,
                'message' => 'Security settings validation failed.',
                'errors' => $result['errors'],
                'settings' => $result['settings'],
            ]);
        }

        monitoring_store_session_user(array_merge($sessionUser, [
            'security_settings' => $result['settings'],
        ]));
        monitoring_write_audit_log($conn, (int)($sessionUser['id'] ?? 0), 'Security settings updated');

        respond(200, [
            'success' => true,
            'message' => 'Security settings saved successfully.',
            'settings' => $result['settings'],
        ]);
    }

    if ($action === 'save_system_configuration') {
        monitoring_require_roles([MONITORING_ROLE_ADMIN], $sessionUser);
        $settingsPayload = isset($data['settings']) && is_array($data['settings']) ? $data['settings'] : $data;
        $result = monitoring_upsert_system_configuration($conn, $settingsPayload);

        if (!empty($result['errors'])) {
            respond(422, [
                'success' => false,
                'message' => 'System configuration validation failed.',
                'errors' => $result['errors'],
                'settings' => $result['settings'],
            ]);
        }

        monitoring_write_audit_log($conn, (int)($sessionUser['id'] ?? 0), 'System configuration updated');

        respond(200, [
            'success' => true,
            'message' => 'System configuration saved successfully.',
            'settings' => $result['settings'],
        ]);
    }

    if ($action === 'send_system_test_email') {
        monitoring_require_roles([MONITORING_ROLE_ADMIN], $sessionUser);
        $settingsPayload = isset($data['settings']) && is_array($data['settings']) ? $data['settings'] : $data;
        $validated = monitoring_validate_system_configuration($settingsPayload);
        $recipientEmail = trim((string)($data['recipient_email'] ?? $data['recipientEmail'] ?? ''));

        if (!empty($validated['errors'])) {
            respond(422, [
                'success' => false,
                'message' => 'System configuration validation failed.',
                'errors' => $validated['errors'],
                'settings' => $validated['settings'],
            ]);
        }

        $testResult = sendSystemTestEmail($validated['settings'], $recipientEmail);
        if (!empty($testResult['errors'])) {
            respond(422, [
                'success' => false,
                'message' => 'Fix the highlighted email settings before sending a test email.',
                'errors' => $testResult['errors'],
                'settings' => $validated['settings'],
            ]);
        }

        if (empty($testResult['success'])) {
            respond(500, [
                'success' => false,
                'message' => $testResult['message'] ?? 'Unable to send the test email.',
                'settings' => $validated['settings'],
            ]);
        }

        monitoring_write_audit_log(
            $conn,
            (int)($sessionUser['id'] ?? 0),
            'System test email sent to ' . $recipientEmail
        );

        respond(200, [
            'success' => true,
            'message' => $testResult['message'] ?? 'Test email sent successfully.',
            'settings' => $validated['settings'],
        ]);
    }

    if ($action === 'update_status') {
        require_once __DIR__ . '/module_permission_store.php';
        $id = isset($data['id']) ? (int)$data['id'] : 0;
        if ($id <= 0) {
            respond(422, ['success' => false, 'message' => 'id is required']);
        }

        $actorRoleId = (int)($sessionUser['role_id'] ?? 0);
        if (
            $actorRoleId !== MONITORING_ROLE_ADMIN
            && !monitoring_module_permissions_is_role_allowed($conn, 'user-management', 'account-status', $actorRoleId)
        ) {
            respond(403, [
                'success' => false,
                'message' => 'You do not have permission to change user account status.',
            ]);
        }

        $candidate = $conn->prepare(
            'SELECT u.User_id,
                    u.Role_id,
                    u.Employment_status_id
             FROM user u
             WHERE u.User_id = :id
             LIMIT 1'
        );
        $candidate->execute([':id' => $id]);
        $rowCurrent = $candidate->fetch(PDO::FETCH_ASSOC);
        if (!$rowCurrent) {
            respond(404, ['success' => false, 'message' => 'User not found']);
        }

        if ((int)$rowCurrent['Role_id'] === MONITORING_ROLE_CLIENT) {
            respond(422, ['success' => false, 'message' => 'Client accounts must be updated from Client Management.']);
        }

        $targetRoleId = (int)$rowCurrent['Role_id'];
        if ($targetRoleId === MONITORING_ROLE_ADMIN && $actorRoleId !== MONITORING_ROLE_ADMIN) {
            respond(403, [
                'success' => false,
                'message' => 'Only an administrator can change another administrator account status.',
            ]);
        }

        $requestedStatusId = isset($data['employment_status_id']) && preg_match('/^\d+$/', (string)$data['employment_status_id'])
            ? monitoring_validate_status_id($conn, 'EMPLOYMENT', (int)$data['employment_status_id'])
            : null;
        $requestedStatusLabel = trim((string)($data['employment_status'] ?? $data['status'] ?? ''));
        $nextEmploymentStatusId = $requestedStatusId ?? monitoring_resolve_employment_status_id($conn, $requestedStatusLabel);
        if ($nextEmploymentStatusId === null) {
            respond(422, ['success' => false, 'message' => 'A valid employment status is required.']);
        }

        $updateStatusStatement = $conn->prepare(
            'UPDATE user
             SET Employment_status_id = :employment_status_id
             WHERE User_id = :id'
        );
        $updateStatusStatement->execute([
            ':employment_status_id' => $nextEmploymentStatusId,
            ':id' => $id,
        ]);

        $updatedStatusRow = fetchUserRow($conn, $id);
        if (!$updatedStatusRow) {
            respond(404, ['success' => false, 'message' => 'User not found after status update.']);
        }

        $employmentStatusLabel = monitoring_employee_status_label(
            isset($updatedStatusRow['employment_status_name']) ? (string)$updatedStatusRow['employment_status_name'] : null,
            $updatedStatusRow['employment_status_id'] ?? null,
            'Active'
        );

        respond(200, [
            'success' => true,
            'message' => 'User status updated successfully.',
            'user' => [
                'id' => $id,
                'employee_status_id' => isset($updatedStatusRow['employment_status_id']) ? (int)$updatedStatusRow['employment_status_id'] : null,
                'employee_status' => $employmentStatusLabel,
            ],
        ]);
    }

    $id = isset($data['id']) ? (int)$data['id'] : 0;
    if ($id <= 0) {
        respond(422, ['success' => false, 'message' => 'id is required']);
    }

    monitoring_require_user_access($id, [MONITORING_ROLE_ADMIN], $sessionUser);

    $current = $conn->prepare(
        'SELECT u.User_id,
                u.Username,
                u.Email,
                u.Role_id,
                u.Employment_status_id,
                c.Client_ID AS Client_id,
                u.Profile_Image,
                c.Profile_Image AS Client_Profile_Image
         FROM user u
         LEFT JOIN client c ON c.User_id = u.User_id
         WHERE u.User_id = :id
         LIMIT 1'
    );
    $current->execute([':id' => $id]);
    $rowCurrent = $current->fetch(PDO::FETCH_ASSOC);
    if (!$rowCurrent) {
        respond(404, ['success' => false, 'message' => 'User not found']);
    }
    $currentProfile = loadEmployeeProfile($conn, $id);

    if ($action === 'update_profile_image') {
        if (!isset($_FILES['profile_image'])) {
            respond(400, ['success' => false, 'message' => 'profile_image is required']);
        }

        $isClientRole = (int)$rowCurrent['Role_id'] === MONITORING_ROLE_CLIENT;
        $oldUserProfileImage = trim((string)($rowCurrent['Profile_Image'] ?? ''));
        $oldClientProfileImage = trim((string)($rowCurrent['Client_Profile_Image'] ?? ''));
        $oldProfileImage = $isClientRole
            ? ($oldClientProfileImage !== '' ? $oldClientProfileImage : $oldUserProfileImage)
            : $oldUserProfileImage;
        $newProfileImage = '';

        try {
            $conn->beginTransaction();
            $newProfileImage = storeUserProfileImage($_FILES['profile_image'], $id);

            $updImage = $conn->prepare(
                'UPDATE user
                 SET Profile_Image = :profile_image
                 WHERE User_id = :id'
            );
            $updImage->execute([
                ':profile_image' => $newProfileImage,
                ':id' => $id,
            ]);

            if ($isClientRole) {
                $updClient = $conn->prepare(
                    'UPDATE client
                     SET Profile_Image = :profile_image
                     WHERE User_id = :id'
                );
                $updClient->execute([
                    ':profile_image' => $newProfileImage,
                    ':id' => $id,
                ]);
            }

            $conn->commit();
        } catch (Throwable $e) {
            if ($conn->inTransaction()) {
                $conn->rollBack();
            }
            if ($newProfileImage !== '') {
                deleteUserProfileImageFile($newProfileImage);
            }
            throw $e;
        }

        if ($oldProfileImage !== '' && $oldProfileImage !== $newProfileImage) {
            deleteUserProfileImageFile($oldProfileImage);
        }

        $freshImageRow = fetchUserRow($conn, $id);
        syncOwnSessionUser($sessionUser, $id, [
            'username' => $freshImageRow['username'] ?? ($sessionUser['username'] ?? null),
            'email' => $freshImageRow['email'] ?? ($sessionUser['email'] ?? null),
            'profile_image' => $freshImageRow['profile_image'] ?? $newProfileImage,
            'role_id' => isset($freshImageRow['role_id']) ? (int)$freshImageRow['role_id'] : ($sessionUser['role_id'] ?? null),
            'client_id' => isset($freshImageRow['client_id']) && (int)$freshImageRow['client_id'] > 0
                ? (int)$freshImageRow['client_id']
                : null,
        ]);
        respond(200, [
            'success' => true,
            'message' => 'Profile image updated successfully.',
            'user' => [
                'id' => $id,
                'profile_image' => $freshImageRow['profile_image'] ?? $newProfileImage,
            ],
        ]);
    }

    $username = array_key_exists('username', $data) ? trim((string)$data['username']) : (string)$rowCurrent['Username'];
    $email = array_key_exists('email', $data) ? trim((string)$data['email']) : (string)$rowCurrent['Email'];
    $password = array_key_exists('password', $data) ? (string)$data['password'] : '';
    $roleInput = $canManageAnyUser && array_key_exists('role', $data) ? trim((string)$data['role']) : '';
    $employeeDetails = (isset($data['employee_details']) && is_array($data['employee_details'])) ? $data['employee_details'] : [];
    $clientIdProvided = $canManageAnyUser && array_key_exists('client_id', $data);
    $clientId = $clientIdProvided
        ? (int)$data['client_id']
        : (int)$rowCurrent['Client_id'];
    $securitySettings = monitoring_get_security_settings($conn);
    $maxPasswordLength = (int)$securitySettings['maxPasswordLength'];
    $passwordValidationMessage = $password !== ''
        ? monitoring_validate_password_value($password, $maxPasswordLength)
        : null;

    if ($username === '' || $email === '') {
        respond(422, ['success' => false, 'message' => 'username and email are required']);
    }

    if ($passwordValidationMessage !== null) {
        respond(422, ['success' => false, 'message' => $passwordValidationMessage]);
    }

    $roleId = (int)$rowCurrent['Role_id'];
    $roleName = '';
    if ($roleInput !== '') {
        [$resolvedRoleId, $resolvedRoleName] = resolveRole($conn, $roleInput);
        if ($resolvedRoleId <= 0) {
            respond(422, ['success' => false, 'message' => 'Invalid role']);
        }
        $roleId = $resolvedRoleId;
        $roleName = $resolvedRoleName;
    }

    $checkRole = $conn->prepare('SELECT Role_name FROM role WHERE Role_id = :id LIMIT 1');
    $checkRole->execute([':id' => $roleId]);
    $roleFromDb = $checkRole->fetchColumn();
    if ($roleFromDb === false) {
        respond(422, ['success' => false, 'message' => 'Invalid role']);
    }
    if ($roleName === '') {
        $roleName = (string)$roleFromDb;
    }

    if ($clientId > 0) {
        $checkClient = $conn->prepare('SELECT Client_ID FROM client WHERE Client_ID = :id LIMIT 1');
        $checkClient->execute([':id' => $clientId]);
        if (!$checkClient->fetchColumn()) {
            respond(422, ['success' => false, 'message' => 'Invalid client_id']);
        }
    } elseif ($clientId <= 0) {
        $clientId = null;
    }

    $checkUsername = $conn->prepare('SELECT 1 FROM user WHERE Username = :u AND User_id <> :id LIMIT 1');
    $checkUsername->execute([':u' => $username, ':id' => $id]);
    if ($checkUsername->fetchColumn()) {
        respond(409, ['success' => false, 'message' => 'Username already exists']);
    }

    $checkEmail = $conn->prepare('SELECT 1 FROM user WHERE Email = :e AND User_id <> :id LIMIT 1');
    $checkEmail->execute([':e' => $email, ':id' => $id]);
    if ($checkEmail->fetchColumn()) {
        respond(409, ['success' => false, 'message' => 'Email already exists']);
    }

    $specializationPayloadProvided = employeeSpecializationPayloadProvided($employeeDetails);
    $validatedSpecializationType = null;
    $validatedSpecializationValue = null;
    $validatedSpecializationValues = [];
    if ($specializationPayloadProvided) {
        $specializationRaw = $employeeDetails['specialization_type_id'] ?? ($employeeDetails['specialization_type_ID'] ?? null);
        $validatedSpecializationValue = employeeSpecializationPayloadId($employeeDetails);
        $validatedSpecializationValues = employeeSpecializationPayloadIds($employeeDetails);
        if ($validatedSpecializationValue === null && trim((string)($specializationRaw ?? '')) !== '') {
            respond(422, ['success' => false, 'message' => 'Invalid specialization_type_id']);
        }
        foreach ($validatedSpecializationValues as $specializationId) {
            if (findSpecializationTypeById($conn, $specializationId) === null) {
                respond(422, ['success' => false, 'message' => 'Invalid specialization_type_id']);
            }
        }
        if ($validatedSpecializationValue !== null) {
            $validatedSpecializationType = findSpecializationTypeById($conn, $validatedSpecializationValue);
            if ($validatedSpecializationType === null) {
                respond(422, ['success' => false, 'message' => 'Invalid specialization_type_id']);
            }
        }
    }
    $specializationAssignments = $specializationPayloadProvided
        ? $validatedSpecializationValues
        : employeeSpecializationGetUserAssignments($conn, $id);
    if (!monitoring_role_allows_specialization_ids($conn, $roleId, $roleName, $specializationAssignments)) {
        respond(422, ['success' => false, 'message' => 'Selected specializations are not allowed for this role.']);
    }

    $nextEmploymentStatusId = $roleId === MONITORING_ROLE_CLIENT
        ? null
        : ((isset($rowCurrent['Employment_status_id']) && $rowCurrent['Employment_status_id'] !== null)
            ? (int)$rowCurrent['Employment_status_id']
            : null);

    $conn->beginTransaction();

    if ($password !== '') {
        $upd = $conn->prepare(
            'UPDATE user
             SET Username = :u,
                 Email = :e,
                 Role_id = :r,
                 Employment_status_id = :employment_status_id,
                 Password = :p,
                 Password_changed_at = NOW(),
                 Failed_login_attempts = 0,
                 Locked_until = NULL
             WHERE User_id = :id'
        );
        $upd->execute([
            ':u' => $username,
            ':e' => $email,
            ':r' => $roleId,
            ':employment_status_id' => $nextEmploymentStatusId,
            ':p' => password_hash($password, PASSWORD_DEFAULT),
            ':id' => $id,
        ]);
    } else {
        $upd = $conn->prepare(
            'UPDATE user
             SET Username = :u,
                 Email = :e,
                 Role_id = :r,
                 Employment_status_id = :employment_status_id
             WHERE User_id = :id'
        );
        $upd->execute([
            ':u' => $username,
            ':e' => $email,
            ':r' => $roleId,
            ':employment_status_id' => $nextEmploymentStatusId,
            ':id' => $id,
        ]);
    }

    if ($clientIdProvided) {
        $conn->prepare('UPDATE client SET User_id = NULL WHERE User_id = :uid')->execute([':uid' => $id]);
        if ($clientId !== null && $clientId > 0) {
            $conn->prepare('UPDATE client SET User_id = :uid WHERE Client_ID = :cid')->execute([
                ':uid' => $id,
                ':cid' => $clientId,
            ]);
        }
    }

    if (hasEmployeeProfilePayload($employeeDetails)) {
        [$guessFirst, $guessMiddle, $guessLast] = inferNamesFromUsername($username);

        $existingFirst = normalizeOptionalString($currentProfile['first_name'] ?? null);
        $existingMiddle = normalizeOptionalString($currentProfile['middle_name'] ?? null);
        $existingLast = normalizeOptionalString($currentProfile['last_name'] ?? null);
        $existingDate = normalizeOptionalDate($currentProfile['date_of_birth'] ?? null);
        $existingPhone = normalizeOptionalString($currentProfile['phone_number'] ?? null);
        $existingSpecializationId = employeeSpecializationNormalizeId($currentProfile['specialization_type_ID'] ?? null);
        $existingSss = normalizeAccountNumber($currentProfile['sss_account_number'] ?? null);
        $existingPagibig = normalizeAccountNumber($currentProfile['pagibig_account_number'] ?? null);
        $existingPhilhealth = normalizeAccountNumber($currentProfile['philhealth_account_number'] ?? null);

        $firstValue = normalizeOptionalString($employeeDetails['first_name'] ?? null);
        if ($firstValue === null) {
            $firstValue = $existingFirst ?? $guessFirst;
        }

        $lastValue = normalizeOptionalString($employeeDetails['last_name'] ?? null);
        if ($lastValue === null) {
            $lastValue = $existingLast ?? $guessLast;
        }

        $middleValue = array_key_exists('middle_name', $employeeDetails)
            ? normalizeOptionalString($employeeDetails['middle_name'])
            : ($existingMiddle ?? $guessMiddle);

        $dateValue = array_key_exists('date_of_birth', $employeeDetails)
            ? normalizeOptionalDate($employeeDetails['date_of_birth'])
            : $existingDate;

        $phoneValue = array_key_exists('phone_number', $employeeDetails)
            ? normalizeOptionalString($employeeDetails['phone_number'])
            : $existingPhone;

        $specializationValue = $specializationPayloadProvided
            ? $validatedSpecializationValue
            : $existingSpecializationId;

        $sssValue = array_key_exists('sss_account_number', $employeeDetails)
            ? normalizeAccountNumber($employeeDetails['sss_account_number'])
            : $existingSss;
        $pagibigValue = array_key_exists('pagibig_account_number', $employeeDetails)
            ? normalizeAccountNumber($employeeDetails['pagibig_account_number'])
            : $existingPagibig;
        $philhealthValue = array_key_exists('philhealth_account_number', $employeeDetails)
            ? normalizeAccountNumber($employeeDetails['philhealth_account_number'])
            : $existingPhilhealth;

        upsertEmployeeProfile($conn, $id, [
            'first_name' => $firstValue,
            'middle_name' => $middleValue,
            'last_name' => $lastValue,
            'date_of_birth' => $dateValue,
            'phone_number' => $phoneValue,
            'specialization_type_id' => $specializationValue,
            'sss_account_number' => $sssValue,
            'pagibig_account_number' => $pagibigValue,
            'philhealth_account_number' => $philhealthValue,
        ]);

        employeeSpecializationSetUserAssignments($conn, $id, $specializationAssignments);
    }

    $conn->commit();

    $fresh = fetchUserRow($conn, $id);
    if (!$fresh) {
        respond(404, ['success' => false, 'message' => 'User not found after update']);
    }

    $first = trim((string)($fresh['profile_first_name'] ?? ''));
    $middle = trim((string)($fresh['profile_middle_name'] ?? ''));
    $last = trim((string)($fresh['profile_last_name'] ?? ''));

    if ($first === '') {
        $first = trim((string)($fresh['client_first_name'] ?? ''));
    }
    if ($middle === '') {
        $middle = trim((string)($fresh['client_middle_name'] ?? ''));
    }
    if ($last === '') {
        $last = trim((string)($fresh['client_last_name'] ?? ''));
    }

    if ($first === '' && isset($employeeDetails['first_name'])) {
        $first = trim((string)$employeeDetails['first_name']);
    }
    if ($middle === '' && isset($employeeDetails['middle_name'])) {
        $middle = trim((string)$employeeDetails['middle_name']);
    }
    if ($last === '' && isset($employeeDetails['last_name'])) {
        $last = trim((string)$employeeDetails['last_name']);
    }
    if ($first === '' || $last === '') {
        [$guessFirst, $guessMiddle, $guessLast] = inferNamesFromUsername($username);
        if ($first === '') {
            $first = $guessFirst;
        }
        if ($middle === '') {
            $middle = $guessMiddle;
        }
        if ($last === '') {
            $last = $guessLast;
        }
    }

    $profileDateOfBirth = normalizeOptionalDate($fresh['profile_date_of_birth'] ?? null);
    if ($profileDateOfBirth === null) {
        $profileDateOfBirth = normalizeOptionalDate($fresh['client_date_of_birth'] ?? null);
    }
    if ($profileDateOfBirth === null && array_key_exists('date_of_birth', $employeeDetails)) {
        $profileDateOfBirth = normalizeOptionalDate($employeeDetails['date_of_birth']);
    }

    $profilePhone = normalizeOptionalString($fresh['profile_phone_number'] ?? null);
    if ($profilePhone === null) {
        $profilePhone = normalizeOptionalString($fresh['client_phone'] ?? null);
    }
    if ($profilePhone === null && array_key_exists('phone_number', $employeeDetails)) {
        $profilePhone = normalizeOptionalString($employeeDetails['phone_number']);
    }

    $profileSpecializationId = employeeSpecializationNormalizeId($fresh['profile_specialization_type_id'] ?? null);
    $profileSpecializationName = normalizeOptionalString($fresh['profile_specialization_type_name'] ?? null);
    $profileSpecializationIds = employeeSpecializationGetUserAssignments($conn, $id);
    if (empty($profileSpecializationIds) && $profileSpecializationId !== null) {
        $profileSpecializationIds = [$profileSpecializationId];
    }
    $profileSpecializationNames = [];
    foreach ($profileSpecializationIds as $specializationId) {
        $specializationRow = findSpecializationTypeById($conn, $specializationId);
        if ($specializationRow !== null) {
            $profileSpecializationNames[] = (string)($specializationRow['name'] ?? '');
        }
    }
    $profileSpecializationServiceIds = employeeSpecializationResolveServiceIds($conn, $profileSpecializationIds);
    $profileSpecializationServiceNames = employeeSpecializationResolveServiceNames($conn, $profileSpecializationIds);

    $profileGovernmentAccounts = [
        1 => normalizeAccountNumber($fresh['profile_sss_account_number'] ?? null),
        2 => normalizeAccountNumber($fresh['profile_pagibig_account_number'] ?? null),
        3 => normalizeAccountNumber($fresh['profile_philhealth_account_number'] ?? null),
    ];

    $details = buildGovernmentFinancialDetails($profileGovernmentAccounts);

    $detailIds = array_values(array_unique(array_map(function ($detail) {
        return isset($detail['id']) ? (int)$detail['id'] : 0;
    }, $details)));
    $detailIds = array_values(array_filter($detailIds, function ($value) {
        return $value > 0;
    }));
    $detailText = implode(', ', array_values(array_filter(array_map(function ($detail) {
        $label = isset($detail['label']) ? trim((string)$detail['label']) : '';
        return $label !== '' ? $label : null;
    }, $details))));
    $firstDetail = !empty($details) ? $details[0] : null;
    $sssAccount = $profileGovernmentAccounts[1] ?? null;
    $pagibigAccount = $profileGovernmentAccounts[2] ?? null;
    $philhealthAccount = $profileGovernmentAccounts[3] ?? null;

    $payload = [
        'id' => (int)$fresh['id'],
        'username' => $fresh['username'],
        'email' => $fresh['email'],
        'profile_image' => $fresh['profile_image'] ?? null,
        'role_id' => isset($fresh['role_id']) ? (int)$fresh['role_id'] : null,
        'role' => $fresh['role'] ?? $roleName,
        'client_id' => isset($fresh['client_id']) && (int)$fresh['client_id'] > 0 ? (int)$fresh['client_id'] : null,

        'employee_id' => null,
        'employee_first_name' => $first,
        'employee_middle_name' => $middle !== '' ? $middle : null,
        'employee_last_name' => $last,
        'employee_date_of_birth' => $profileDateOfBirth,
        'employee_phone_number' => $profilePhone,
        'employee_basic_salary' => $employeeDetails['basic_salary'] ?? null,
        'employee_salary_rate' => $employeeDetails['salary_rate'] ?? null,
        'employee_account_number' => $sssAccount ?? $pagibigAccount ?? $philhealthAccount,
        'employee_sss_account_number' => $sssAccount,
        'employee_pagibig_account_number' => $pagibigAccount,
        'employee_philhealth_account_number' => $philhealthAccount,
        'employee_status_id' => isset($fresh['employment_status_id']) && $fresh['employment_status_id'] !== null
            ? (int)$fresh['employment_status_id']
            : (isset($fresh['client_status_id']) ? (int)$fresh['client_status_id'] : null),
        'employee_status' => $fresh['employment_status_name'] ?? $fresh['client_status_name'] ?? null,
        'employee_position' => $fresh['role'] ?? $roleName,
        'employee_specialization_type_id' => $profileSpecializationId,
        'employee_specialization_type_name' => $profileSpecializationName,
        'employee_specialization_type_ids' => $profileSpecializationIds,
        'employee_specialization_type_names' => array_values(array_filter($profileSpecializationNames, 'strlen')),
        'employee_specialization_service_ids' => $profileSpecializationServiceIds,
        'employee_specialization_service_names' => $profileSpecializationServiceNames,
        'employee_financial_details' => $details,
        'employee_financial_details_ids' => $detailIds,
        'employee_financial_details_text' => $detailText,
        'employee_financial_details_id' => $firstDetail ? (int)$firstDetail['id'] : null,
        'employee_financial_name' => $firstDetail ? $firstDetail['name'] : null,
        'employee_financial_amount' => null,
        'employee_financial_rate' => null,
        'employee_financial_effective_from' => null,
        'employee_financial_effective_to' => null,

        'first_name' => $first,
        'middle_name' => $middle,
        'last_name' => $last,
    ];

    syncOwnSessionUser($sessionUser, $id, [
        'username' => $payload['username'],
        'email' => $payload['email'],
        'profile_image' => $payload['profile_image'],
        'role_id' => $payload['role_id'],
        'client_id' => $payload['client_id'],
        'first_name' => $payload['first_name'],
        'middle_name' => $payload['middle_name'],
        'last_name' => $payload['last_name'],
    ]);

    respond(200, [
        'success' => true,
        'user' => $payload,
        'message' => 'User updated successfully',
    ]);
} catch (Throwable $e) {
    if (isset($conn) && $conn instanceof PDO && $conn->inTransaction()) {
        $conn->rollBack();
    }
    if ($e instanceof InvalidArgumentException) {
        respond(422, ['success' => false, 'message' => $e->getMessage()]);
    }
    error_log('user_update error: ' . $e->getMessage());
    respond(500, ['success' => false, 'message' => 'Server error']);
}
