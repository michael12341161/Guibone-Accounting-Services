<?php
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/connection-pdo.php';
require_once __DIR__ . '/employee_specialization.php';
require_once __DIR__ . '/account_status_helpers.php';
require_once __DIR__ . '/management_catalog_settings_helper.php';

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
    $password = isset($data['password']) ? (string)$data['password'] : '';
    $roleInput = isset($data['role']) ? trim((string)$data['role']) : '';
    $employeeDetails = (isset($data['employee_details']) && is_array($data['employee_details'])) ? $data['employee_details'] : [];
    $clientId = isset($data['client_id']) ? (int)$data['client_id'] : 0;
    $securitySettings = monitoring_get_security_settings($conn);
    $maxPasswordLength = (int)$securitySettings['maxPasswordLength'];
    $passwordValidationMessage = monitoring_validate_password_value($password, $maxPasswordLength);

    if ($username === '' || $email === '' || $password === '' || $roleInput === '') {
        respond(422, ['success' => false, 'message' => 'username, email, password, and role are required']);
    }

    if ($passwordValidationMessage !== null) {
        respond(422, ['success' => false, 'message' => $passwordValidationMessage]);
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

    $ins = $conn->prepare(
        'INSERT INTO user (Username, Password, Role_id, Employment_status_id, Email)
         VALUES (:u, :p, :r, :employment_status_id, :e)'
    );
    $ins->execute([
        ':u' => $username,
        ':p' => password_hash($password, PASSWORD_DEFAULT),
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

    respond(201, [
        'success' => true,
        'id' => $newId,
        'user' => $userPayload,
        'message' => 'User created successfully',
    ]);
} catch (Throwable $e) {
    if (isset($conn) && $conn instanceof PDO && $conn->inTransaction()) {
        $conn->rollBack();
    }
    error_log('user_create error: ' . $e->getMessage());
    respond(500, ['success' => false, 'message' => 'Server error']);
}
