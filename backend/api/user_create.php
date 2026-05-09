<?php
require_once __DIR__ . '/../rate_limit.php';
monitoring_enforce_rate_limit();
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/connection-pdo.php';
require_once __DIR__ . '/employee_specialization.php';
require_once __DIR__ . '/account_status_helpers.php';
require_once __DIR__ . '/management_catalog_settings_helper.php';
require_once __DIR__ . '/disposable_email_helpers.php';
require_once __DIR__ . '/../../PHPMailer-master/src/Exception.php';
require_once __DIR__ . '/../../PHPMailer-master/src/PHPMailer.php';
require_once __DIR__ . '/../../PHPMailer-master/src/SMTP.php';

use PHPMailer\PHPMailer\PHPMailer;

monitoring_bootstrap_api(['POST', 'OPTIONS']);

function respond($code, $payload) {
    http_response_code($code);
    echo json_encode($payload);
    exit;
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

    $fallback = [
        'admin' => 1,
        'secretary' => 2,
        'accountant' => 3,
        'client' => 4,
    ];
    $key = strtolower($roleRaw);
    if (isset($fallback[$key])) {
        $stmt = $conn->prepare('SELECT Role_id, Role_name FROM role WHERE Role_id = :id LIMIT 1');
        $stmt->execute([':id' => $fallback[$key]]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if ($row) {
            return [(int)$row['Role_id'], (string)$row['Role_name']];
        }
    }

    return [0, ''];
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

function sendUserAccountCreatedEmail(PDO $conn, string $recipientEmail, array $options = []): array {
    $email = trim($recipientEmail);
    if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
        return [
            'attempted' => false,
            'sent' => false,
            'message' => 'No valid employee email was found, so no account email was sent.',
        ];
    }

    $smtp = monitoring_get_system_smtp_settings($conn);
    $smtpUser = trim((string)($smtp['user'] ?? ''));
    $smtpPass = trim((string)($smtp['pass'] ?? ''));
    if ($smtpUser === '' || $smtpPass === '') {
        return [
            'attempted' => false,
            'sent' => false,
            'message' => 'The user was created, but the email service is not configured.',
        ];
    }

    $smtpHost = trim((string)($smtp['host'] ?? 'smtp.gmail.com'));
    $smtpPort = (int)($smtp['port'] ?? 587);
    $companyName = monitoring_get_system_company_name($conn);
    $supportEmail = monitoring_get_system_support_email($conn);
    $loginUrl = monitoring_build_login_url($conn);
    $recipientName = trim((string)($options['name'] ?? ''));
    $loginEmail = trim((string)($options['login_email'] ?? $email));
    $temporaryPassword = (string)($options['temporary_password'] ?? '');

    $safeCompanyName = htmlspecialchars($companyName, ENT_QUOTES, 'UTF-8');
    $safeLoginUrl = htmlspecialchars($loginUrl, ENT_QUOTES, 'UTF-8');
    $safeRecipientName = htmlspecialchars($recipientName !== '' ? $recipientName : 'there', ENT_QUOTES, 'UTF-8');
    $safeLoginEmail = htmlspecialchars($loginEmail, ENT_QUOTES, 'UTF-8');
    $safeTemporaryPassword = htmlspecialchars($temporaryPassword, ENT_QUOTES, 'UTF-8');

    $mail = new PHPMailer(true);

    try {
        $mail->isSMTP();
        $mail->Host = $smtpHost;
        $mail->SMTPAuth = true;
        $mail->Username = $smtpUser;
        $mail->Password = $smtpPass;
        $mail->SMTPSecure = PHPMailer::ENCRYPTION_STARTTLS;
        $mail->Port = $smtpPort;

        $mail->setFrom($smtpUser, $companyName);
        if ($supportEmail !== '') {
            $mail->addReplyTo($supportEmail, $companyName . ' Support');
        }
        $mail->addAddress($email);
        $mail->Subject = $companyName . ' Account Created';
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
            . '              <div style="margin-top:6px;font-size:22px;line-height:1.2;font-weight:700;">Account Created</div>'
            . '            </td>'
            . '          </tr>'
            . '          <tr>'
            . '            <td style="padding:24px 20px;color:#0f172a;font-size:14px;line-height:1.7;">'
            . '              <p style="margin:0 0 14px;">Hello ' . $safeRecipientName . ',</p>'
            . '              <p style="margin:0 0 14px;">Your account has been created.</p>'
            . '              <div style="margin:0 0 18px;padding:16px;border:1px solid #99f6e4;border-radius:12px;background:#f0fdfa;">'
            . '                <div style="margin:0 0 10px;font-size:13px;font-weight:700;color:#0f766e;">Your Login Credentials</div>'
            . '                <p style="margin:0 0 8px;"><strong>Email:</strong> ' . $safeLoginEmail . '</p>'
            . '                <p style="margin:0;"><strong>Temporary password:</strong> ' . $safeTemporaryPassword . '</p>'
            . '              </div>'
            . '              <p style="margin:0 0 14px;">For security, reset your password before opening your dashboard.</p>'
            . '              <p style="margin:0 0 10px;">Login here:</p>'
            . '              <p style="margin:0 0 18px;"><a href="' . $safeLoginUrl . '" style="display:inline-block;padding:12px 18px;border-radius:10px;background:#0f766e;color:#ffffff;text-decoration:none;font-weight:700;">Open Login Page</a></p>'
            . '              <p style="margin:0;">Thank you,<br />' . $safeCompanyName . '</p>'
            . '            </td>'
            . '          </tr>'
            . '        </table>'
            . '      </td>'
            . '    </tr>'
            . '  </table>'
            . '</body></html>';

        $mail->AltBody = "Hello " . ($recipientName !== '' ? $recipientName : 'there') . ",\n\n"
            . "Your account has been created.\n\n"
            . "Your login credentials:\n"
            . "Email: {$loginEmail}\n"
            . "Temporary password: {$temporaryPassword}\n\n"
            . "For security, reset your password before opening your dashboard.\n\n"
            . "Login here:\n{$loginUrl}\n\n"
            . "Thank you,\n{$companyName}";

        $mail->send();

        return [
            'attempted' => true,
            'sent' => true,
            'message' => 'Account email sent to ' . $email . '.',
        ];
    } catch (Throwable $__) {
        return [
            'attempted' => true,
            'sent' => false,
            'message' => 'The user was created, but the account email could not be sent.',
        ];
    }
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    respond(405, ['success' => false, 'message' => 'Method not allowed']);
}

try {
    monitoring_require_roles([MONITORING_ROLE_ADMIN]);
    $conn->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    monitoring_ensure_user_security_columns($conn);

    $raw = file_get_contents('php://input');
    $data = json_decode($raw, true);
    if (!is_array($data)) {
        respond(400, ['success' => false, 'message' => 'Invalid JSON payload']);
    }

    $username = isset($data['username']) ? trim((string)$data['username']) : '';
    $email = isset($data['email']) ? trim((string)$data['email']) : '';
    $roleInput = isset($data['role']) ? trim((string)$data['role']) : '';
    $employeeDetails = (isset($data['employee_details']) && is_array($data['employee_details'])) ? $data['employee_details'] : [];
    $clientId = isset($data['client_id']) ? (int)$data['client_id'] : 0;

    if ($username === '' || $email === '' || $roleInput === '') {
        respond(422, ['success' => false, 'message' => 'username, email, and role are required']);
    }

    if (monitoring_email_is_disposable_for_registration($email)) {
        respond(422, ['success' => false, 'message' => monitoring_disposable_email_registration_message()]);
    }

    [$roleId, $roleName] = resolveRole($conn, $roleInput);
    if ($roleId <= 0) {
        respond(422, ['success' => false, 'message' => 'Invalid role']);
    }

    $checkUsername = $conn->prepare('SELECT 1 FROM user WHERE Username = :u LIMIT 1');
    $checkUsername->execute([':u' => $username]);
    if ($checkUsername->fetchColumn()) {
        respond(409, ['success' => false, 'message' => 'Username already exists']);
    }

    $checkEmail = $conn->prepare('SELECT 1 FROM user WHERE Email = :e LIMIT 1');
    $checkEmail->execute([':e' => $email]);
    if ($checkEmail->fetchColumn()) {
        respond(409, ['success' => false, 'message' => 'Email already exists']);
    }

    if ($clientId > 0) {
        $checkClient = $conn->prepare('SELECT Client_ID FROM client WHERE Client_ID = :id LIMIT 1');
        $checkClient->execute([':id' => $clientId]);
        if (!$checkClient->fetchColumn()) {
            respond(422, ['success' => false, 'message' => 'Invalid client_id']);
        }
    } else {
        $clientId = null;
    }

    $specializationRaw = $employeeDetails['specialization_type_id'] ?? ($employeeDetails['specialization_type_ID'] ?? null);
    $profileSpecializationId = employeeSpecializationPayloadId($employeeDetails);
    $profileSpecializationIds = employeeSpecializationPayloadIds($employeeDetails);
    if ($profileSpecializationId === null && trim((string)($specializationRaw ?? '')) !== '') {
        respond(422, ['success' => false, 'message' => 'Invalid specialization_type_id']);
    }
    $specializationNames = [];
    foreach ($profileSpecializationIds as $specializationId) {
        $specializationRow = findSpecializationTypeById($conn, $specializationId);
        if ($specializationRow === null) {
            respond(422, ['success' => false, 'message' => 'Invalid specialization_type_id']);
        }
        $specializationNames[] = (string)($specializationRow['name'] ?? '');
    }
    $specializationType = $profileSpecializationId !== null
        ? findSpecializationTypeById($conn, $profileSpecializationId)
        : null;
    $specializationServiceIds = employeeSpecializationResolveServiceIds($conn, $profileSpecializationIds);
    $specializationServiceNames = employeeSpecializationResolveServiceNames($conn, $profileSpecializationIds);
    if ($profileSpecializationId !== null && $specializationType === null) {
        respond(422, ['success' => false, 'message' => 'Invalid specialization_type_id']);
    }
    if (!monitoring_role_allows_specialization_ids($conn, $roleId, $roleName, $profileSpecializationIds)) {
        respond(422, ['success' => false, 'message' => 'Selected specializations are not allowed for this role.']);
    }

    $conn->beginTransaction();

    $employmentStatusId = null;
    $temporaryPassword = $username;

    $ins = $conn->prepare(
        'INSERT INTO user (Username, Password, Role_id, Employment_status_id, Email, Force_password_reset)
         VALUES (:u, :p, :r, :employment_status_id, :e, 1)'
    );
    $ins->execute([
        ':u' => $username,
        ':p' => password_hash($temporaryPassword, PASSWORD_DEFAULT),
        ':r' => $roleId,
        ':employment_status_id' => $employmentStatusId,
        ':e' => $email,
    ]);

    $newId = (int)$conn->lastInsertId();

    if ($clientId !== null && $newId > 0) {
        $link = $conn->prepare('UPDATE client SET User_id = :uid WHERE Client_ID = :cid');
        $link->execute([':uid' => $newId, ':cid' => $clientId]);
    }

    $first = isset($employeeDetails['first_name']) ? trim((string)$employeeDetails['first_name']) : '';
    $middle = isset($employeeDetails['middle_name']) ? trim((string)$employeeDetails['middle_name']) : '';
    $last = isset($employeeDetails['last_name']) ? trim((string)$employeeDetails['last_name']) : '';
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

    $governmentAccounts = extractGovernmentAccountNumbers($employeeDetails);
    $sssAccount = $governmentAccounts[1] ?? null;
    $pagibigAccount = $governmentAccounts[2] ?? null;
    $philhealthAccount = $governmentAccounts[3] ?? null;
    $profileDateOfBirth = normalizeOptionalDate($employeeDetails['date_of_birth'] ?? null);
    $profilePhone = normalizeOptionalString($employeeDetails['phone_number'] ?? null);
    $updUser = $conn->prepare(
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
    $updUser->execute([
        ':first_name' => $first,
        ':middle_name' => $middle !== '' ? $middle : null,
        ':last_name' => $last,
        ':date_of_birth' => $profileDateOfBirth,
        ':phone_number' => $profilePhone,
        ':specialization_type_id' => $profileSpecializationId,
        ':sss_account_number' => $sssAccount,
        ':pagibig_account_number' => $pagibigAccount,
        ':philhealth_account_number' => $philhealthAccount,
        ':user_id' => $newId,
    ]);
    employeeSpecializationSetUserAssignments($conn, $newId, $profileSpecializationIds);

    $financialDetails = buildGovernmentFinancialDetails($governmentAccounts);
    $financialText = implode(', ', array_values(array_map(function ($row) {
        return (string)$row['label'];
    }, $financialDetails)));
    $firstFinancial = !empty($financialDetails) ? $financialDetails[0] : null;
    $financialIds = array_values(array_map(function ($row) {
        return (int)($row['id'] ?? 0);
    }, $financialDetails));

    $userPayload = [
        'id' => $newId,
        'username' => $username,
        'email' => $email,
        'role_id' => $roleId,
        'role' => $roleName,
        'client_id' => $clientId,

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
        'employee_status_id' => $employmentStatusId,
        'employee_status' => $employmentStatusId !== null ? 'Active' : null,
        'employee_position' => $roleName,
        'employee_specialization_type_id' => $profileSpecializationId,
        'employee_specialization_type_name' => $specializationType['name'] ?? null,
        'employee_specialization_type_ids' => $profileSpecializationIds,
        'employee_specialization_type_names' => array_values(array_filter($specializationNames, 'strlen')),
        'employee_specialization_service_ids' => $specializationServiceIds,
        'employee_specialization_service_names' => $specializationServiceNames,
        'employee_financial_details' => $financialDetails,
        'employee_financial_details_ids' => $financialIds,
        'employee_financial_details_text' => $financialText,
        'employee_financial_details_id' => $firstFinancial ? (int)$firstFinancial['id'] : null,
        'employee_financial_name' => $firstFinancial ? $firstFinancial['name'] : null,
        'employee_financial_amount' => null,
        'employee_financial_rate' => null,
        'employee_financial_effective_from' => null,
        'employee_financial_effective_to' => null,

        'first_name' => $first,
        'middle_name' => $middle,
        'last_name' => $last,
    ];

    $conn->commit();

    $emailNotification = sendUserAccountCreatedEmail($conn, $email, [
        'name' => trim($first . ' ' . $last),
        'login_email' => $email,
        'temporary_password' => $temporaryPassword,
    ]);
    $message = 'User created successfully.';
    if ($emailNotification['message'] !== '') {
        $message .= ' ' . $emailNotification['message'];
    }

    respond(201, [
        'success' => true,
        'id' => $newId,
        'user' => $userPayload,
        'message' => $message,
        'email_notification' => $emailNotification,
    ]);
} catch (Throwable $e) {
    if (isset($conn) && $conn instanceof PDO && $conn->inTransaction()) {
        $conn->rollBack();
    }
    error_log('user_create error: ' . $e->getMessage());
    respond(500, ['success' => false, 'message' => 'Server error']);
}
