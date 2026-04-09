<?php
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/connection-pdo.php';
require_once __DIR__ . '/employee_specialization.php';

monitoring_bootstrap_api(['GET', 'OPTIONS']);

function respond($code, $payload) {
    http_response_code($code);
    echo json_encode($payload);
    exit;
}

function quoteIdentifier(string $name): string {
    return '`' . str_replace('`', '``', $name) . '`';
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

function normalizeOptionalString($value): ?string {
    $raw = trim((string)($value ?? ''));
    return $raw !== '' ? $raw : null;
}

function publicSecuritySettings(array $settings): array {
    $publicKeys = ['maxPasswordLength', 'passwordExpiryDays'];
    $publicSettings = [];

    foreach ($publicKeys as $key) {
        if (!array_key_exists($key, $settings)) {
            continue;
        }

        $publicSettings[$key] = (int)$settings[$key];
    }

    return $publicSettings;
}

function publicSystemConfiguration(array $settings): array {
    $publicKeys = [
        'companyName',
        'appBaseUrl',
        'allowClientSelfSignup',
        'allowClientAppointments',
        'allowClientConsultations',
        'supportEmail',
        'systemNotice',
        'taskReminderIntervalHours',
        'taskReminderIntervalMinutes',
    ];
    $booleanKeys = [
        'allowClientSelfSignup',
        'allowClientAppointments',
        'allowClientConsultations',
    ];
    $integerKeys = [
        'taskReminderIntervalHours',
        'taskReminderIntervalMinutes',
    ];
    $publicSettings = [];

    foreach ($publicKeys as $key) {
        if (!array_key_exists($key, $settings)) {
            continue;
        }

        if (in_array($key, $booleanKeys, true)) {
            $publicSettings[$key] = !empty($settings[$key]);
            continue;
        }

        if (in_array($key, $integerKeys, true)) {
            $publicSettings[$key] = (int)$settings[$key];
            continue;
        }

        $publicSettings[$key] = trim((string)$settings[$key]);
    }

    return $publicSettings;
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

function buildProfileImageSelect(PDO $conn, string $alias = 'profile_image'): string {
    $hasClientProfileImage = columnExists($conn, 'client', 'Profile_Image');
    $hasUserProfileImage = columnExists($conn, 'user', 'Profile_Image');

    $clientExpr = $hasClientProfileImage ? 'c.Profile_Image' : 'NULL';
    $userExpr = $hasUserProfileImage ? 'u.Profile_Image' : 'NULL';

    return "COALESCE({$userExpr}, {$clientExpr}) AS {$alias},";
}

function buildGovernmentFinancialDetails(array $accountsByType): array {
    $definitions = [
        1 => 'SSS',
        2 => 'Pag-IBIG',
        3 => 'PhilHealth',
    ];

    $details = [];
    foreach ($definitions as $id => $name) {
        $accountNumber = normalizeOptionalString($accountsByType[$id] ?? null);
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

function mapUserRow(array $row): array {
    $username = (string)($row['username'] ?? '');
    $clientId = isset($row['client_id']) ? (int)$row['client_id'] : 0;

    $first = trim((string)($row['profile_first_name'] ?? ''));
    $middle = trim((string)($row['profile_middle_name'] ?? ''));
    $last = trim((string)($row['profile_last_name'] ?? ''));

    if ($first === '') {
        $first = trim((string)($row['client_first_name'] ?? ''));
    }
    if ($middle === '') {
        $middle = trim((string)($row['client_middle_name'] ?? ''));
    }
    if ($last === '') {
        $last = trim((string)($row['client_last_name'] ?? ''));
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

    $profileSssAccount = normalizeOptionalString($row['profile_sss_account_number'] ?? null);
    $profilePagibigAccount = normalizeOptionalString($row['profile_pagibig_account_number'] ?? null);
    $profilePhilhealthAccount = normalizeOptionalString($row['profile_philhealth_account_number'] ?? null);
    $details = buildGovernmentFinancialDetails([
        1 => $profileSssAccount,
        2 => $profilePagibigAccount,
        3 => $profilePhilhealthAccount,
    ]);
    $detailIds = array_values(array_map(function ($detail) {
        return isset($detail['id']) ? (int)$detail['id'] : 0;
    }, $details));
    $firstDetail = !empty($details) ? $details[0] : null;
    $detailText = implode(', ', array_values(array_map(function ($detail) {
        return (string)($detail['label'] ?? '');
    }, $details)));
    $sssAccount = $profileSssAccount;
    $pagibigAccount = $profilePagibigAccount;
    $philhealthAccount = $profilePhilhealthAccount;

    $employeeDateOfBirth = normalizeOptionalString($row['profile_date_of_birth'] ?? null);
    if ($employeeDateOfBirth === null) {
        $employeeDateOfBirth = normalizeOptionalString($row['client_date_of_birth'] ?? null);
    }
    $employeePhoneNumber = normalizeOptionalString($row['profile_phone_number'] ?? null);
    if ($employeePhoneNumber === null) {
        $employeePhoneNumber = normalizeOptionalString($row['client_phone'] ?? null);
    }
    $employeePosition = $row['role'] ?? null;
    $employeeSpecializationId = employeeSpecializationNormalizeId($row['profile_specialization_type_id'] ?? null);
    $employeeSpecializationName = normalizeOptionalString($row['profile_specialization_type_name'] ?? null);

    return [
        'id' => isset($row['id']) ? (int)$row['id'] : 0,
        'username' => $username,
        'email' => $row['email'] ?? null,
        'profile_image' => $row['profile_image'] ?? null,
        'role_id' => isset($row['role_id']) ? (int)$row['role_id'] : null,
        'role' => $row['role'] ?? null,
        'client_id' => $clientId > 0 ? $clientId : null,

        // Backward-compatible employee payload expected by the frontend.
        'employee_id' => null,
        'employee_first_name' => $first,
        'employee_middle_name' => $middle !== '' ? $middle : null,
        'employee_last_name' => $last,
        'employee_date_of_birth' => $employeeDateOfBirth,
        'employee_phone_number' => $employeePhoneNumber,
        'employee_basic_salary' => null,
        'employee_salary_rate' => null,
        'employee_account_number' => $sssAccount ?? $pagibigAccount ?? $philhealthAccount,
        'employee_sss_account_number' => $sssAccount,
        'employee_pagibig_account_number' => $pagibigAccount,
        'employee_philhealth_account_number' => $philhealthAccount,
        'employee_status_id' => isset($row['client_status_id']) ? (int)$row['client_status_id'] : null,
        'employee_status' => $row['client_status_name'] ?? null,
        'employee_position' => $employeePosition,
        'employee_specialization_type_id' => $employeeSpecializationId,
        'employee_specialization_type_name' => $employeeSpecializationName,
        'employee_financial_details' => $details,
        'employee_financial_details_ids' => $detailIds,
        'employee_financial_details_text' => $detailText,
        'employee_financial_details_id' => $firstDetail ? (int)$firstDetail['id'] : null,
        'employee_financial_name' => $firstDetail ? ($firstDetail['name'] ?? null) : null,
        'employee_financial_amount' => null,
        'employee_financial_rate' => null,
        'employee_financial_effective_from' => null,
        'employee_financial_effective_to' => null,

        // Additional aliases used in other screens.
        'first_name' => $first,
        'middle_name' => $middle,
        'last_name' => $last,
    ];
}

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    respond(405, ['success' => false, 'message' => 'Method not allowed']);
}

$scope = isset($_GET['scope']) ? strtolower(trim((string)$_GET['scope'])) : '';

try {
    $conn->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $sessionUser = monitoring_read_session_user(true);

    if ($scope === 'security_settings') {
        $settings = monitoring_get_security_settings($conn);
        $canViewFullSettings = $sessionUser !== null
            && monitoring_user_has_any_role($sessionUser, [MONITORING_ROLE_ADMIN]);

        respond(200, [
            'success' => true,
            'settings' => $canViewFullSettings ? $settings : publicSecuritySettings($settings),
        ]);
    }

    if ($scope === 'system_configuration') {
        $settings = monitoring_get_system_configuration($conn);
        $canViewFullSettings = $sessionUser !== null
            && monitoring_user_has_any_role($sessionUser, [MONITORING_ROLE_ADMIN]);
        respond(200, [
            'success' => true,
            'settings' => $canViewFullSettings ? $settings : publicSystemConfiguration($settings),
        ]);
    }

    $sessionUser = $sessionUser ?? monitoring_require_auth();

    ensureEmployeeSpecializationSchema($conn);
    $profileImageSelect = buildProfileImageSelect($conn);
    $canViewAllUsers = monitoring_user_has_any_role($sessionUser, [MONITORING_ROLE_ADMIN, MONITORING_ROLE_SECRETARY]);
    $whereSql = '';
    $params = [];
    if (!$canViewAllUsers) {
        $whereSql = 'WHERE u.User_id = :current_user_id';
        $params[':current_user_id'] = (int)$sessionUser['id'];
    }

    $stmt = $conn->prepare(
        'SELECT u.User_id AS id,
                u.Username AS username,
                u.Email AS email,
                ' . $profileImageSelect . '
                u.Role_id AS role_id,
                r.Role_name AS role,
                c.Client_ID AS client_id,
                c.First_name AS client_first_name,
                c.Middle_name AS client_middle_name,
                c.Last_name AS client_last_name,
                c.Date_of_Birth AS client_date_of_birth,
                c.Phone AS client_phone,
                c.Status_id AS client_status_id,
                s.Status_name AS client_status_name,
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
         LEFT JOIN client c ON c.User_id = u.User_id
         LEFT JOIN status s ON s.Status_id = c.Status_id
         LEFT JOIN specialization_type st ON st.specialization_type_ID = u.specialization_type_ID
         ' . $whereSql . '
         ORDER BY u.User_id ASC'
    );
    $stmt->execute($params);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];
    $users = array_map(function ($row) {
        return mapUserRow($row);
    }, $rows);

    respond(200, ['success' => true, 'users' => $users]);
} catch (Throwable $e) {
    respond(500, ['success' => false, 'message' => 'Server error', 'error' => $e->getMessage()]);
}
