<?php
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/connection-pdo.php';
require_once __DIR__ . '/employee_specialization.php';
require_once __DIR__ . '/account_status_helpers.php';

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
    $publicKeys = ['maxPasswordLength', 'passwordExpiryDays', 'loginVerificationEnabled'];
    $booleanKeys = ['loginVerificationEnabled'];
    $publicSettings = [];

    foreach ($publicKeys as $key) {
        if (!array_key_exists($key, $settings)) {
            continue;
        }

        if (in_array($key, $booleanKeys, true)) {
            $publicSettings[$key] = !empty($settings[$key]);
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

    return "COALESCE({$userExpr}, {$clientExpr}) AS {$alias}";
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
    $employeeSpecializationIds = [];
    if (isset($row['_specialization_assignments']) && is_array($row['_specialization_assignments'])) {
        $employeeSpecializationIds = array_values($row['_specialization_assignments']);
    } elseif ($employeeSpecializationId !== null) {
        $employeeSpecializationIds = [$employeeSpecializationId];
    }
    $employeeSpecializationNames = [];
    if (isset($row['_specialization_names']) && is_array($row['_specialization_names'])) {
        $employeeSpecializationNames = array_values($row['_specialization_names']);
    } elseif ($employeeSpecializationName !== null) {
        $employeeSpecializationNames = [$employeeSpecializationName];
    }
    $employeeSpecializationServiceIds = [];
    if (isset($row['_specialization_service_ids']) && is_array($row['_specialization_service_ids'])) {
        $employeeSpecializationServiceIds = array_values($row['_specialization_service_ids']);
    }
    $employeeSpecializationServiceNames = [];
    if (isset($row['_specialization_service_names']) && is_array($row['_specialization_service_names'])) {
        $employeeSpecializationServiceNames = array_values($row['_specialization_service_names']);
    }

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
        'employee_status_id' => isset($row['employment_status_id']) && $row['employment_status_id'] !== null
            ? (int)$row['employment_status_id']
            : (isset($row['client_status_id']) ? (int)$row['client_status_id'] : null),
        'employee_status' => $row['employment_status_name'] ?? $row['client_status_name'] ?? null,
        'employee_position' => $employeePosition,
        'employee_specialization_type_id' => $employeeSpecializationId,
        'employee_specialization_type_name' => $employeeSpecializationName,
        'employee_specialization_type_ids' => $employeeSpecializationIds,
        'employee_specialization_type_names' => $employeeSpecializationNames,
        'employee_specialization_service_ids' => $employeeSpecializationServiceIds,
        'employee_specialization_service_names' => $employeeSpecializationServiceNames,
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

function fetchUserListRowById(PDO $conn, int $userId, string $profileImageSelect): ?array {
    if ($userId <= 0) {
        return null;
    }

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
         WHERE u.User_id = :user_id
         LIMIT 1'
    );
    $stmt->execute([':user_id' => $userId]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    return $row ?: null;
}

function attachUserListSpecializationDetails(PDO $conn, array $row): array {
    $userId = isset($row['id']) ? (int)$row['id'] : 0;
    $assignedIds = $userId > 0 ? employeeSpecializationGetUserAssignments($conn, $userId) : [];
    $specializationId = employeeSpecializationNormalizeId($row['profile_specialization_type_id'] ?? null);
    if (empty($assignedIds) && $specializationId !== null) {
        $assignedIds = [$specializationId];
    }

    $assignedNames = [];
    foreach ($assignedIds as $assignedId) {
        $specializationRow = findSpecializationTypeById($conn, $assignedId);
        if ($specializationRow !== null) {
            $assignedNames[] = trim((string)($specializationRow['name'] ?? ''));
        }
    }

    $row['_specialization_assignments'] = array_values($assignedIds);
    $row['_specialization_names'] = array_values(array_filter($assignedNames, 'strlen'));
    $row['_specialization_service_ids'] = employeeSpecializationResolveServiceIds($conn, $assignedIds);
    $row['_specialization_service_names'] = employeeSpecializationResolveServiceNames($conn, $assignedIds);

    return $row;
}

function normalizeUserListFilterValue($value): string {
    $normalized = preg_replace('/\s+/', ' ', trim((string)($value ?? '')));
    return strtolower((string)($normalized ?? ''));
}

function readUserListPositiveIntQueryParam(string $key, int $default, int $min = 1, int $max = 100): int {
    $raw = trim((string)($_GET[$key] ?? ''));
    if ($raw === '' || !ctype_digit($raw)) {
        return $default;
    }

    $value = (int)$raw;
    if ($value < $min) {
        return $min;
    }
    if ($value > $max) {
        return $max;
    }

    return $value;
}

function readUserListRequestedIdQueryParam(array $keys): int {
    foreach ($keys as $key) {
        $raw = trim((string)($_GET[$key] ?? ''));
        if ($raw === '') {
            continue;
        }

        if (!ctype_digit($raw)) {
            respond(422, ['success' => false, 'message' => $key . ' must be a positive integer']);
        }

        $value = (int)$raw;
        if ($value <= 0) {
            respond(422, ['success' => false, 'message' => $key . ' must be a positive integer']);
        }

        return $value;
    }

    return 0;
}

function buildUserListStatusSqlExpression(): string {
    return "CASE
        WHEN COALESCE(u.Employment_status_id, c.Status_id, 0) IN (1, 3) THEN 'active'
        WHEN COALESCE(u.Employment_status_id, c.Status_id, 0) IN (2, 4) THEN 'inactive'
        WHEN COALESCE(u.Employment_status_id, c.Status_id, 0) = 5 THEN 'resigned'
        WHEN NULLIF(TRIM(COALESCE(es.Status_name, s.Status_name, '')), '') IS NOT NULL
            THEN LOWER(TRIM(COALESCE(es.Status_name, s.Status_name, '')))
        WHEN u.User_id IS NOT NULL THEN 'active'
        ELSE '-'
    END";
}

function buildUserListSpecializationMetadata(PDO $conn): array {
    $specializationAssignments = employeeSpecializationReadAssignments($conn);
    $specializationTypes = loadSpecializationTypes($conn);
    $specializationNameMap = [];
    foreach ($specializationTypes as $specializationType) {
        $specializationId = employeeSpecializationNormalizeId($specializationType['id'] ?? null);
        $specializationName = normalizeOptionalString($specializationType['name'] ?? null);
        if ($specializationId !== null && $specializationName !== null) {
            $specializationNameMap[$specializationId] = $specializationName;
        }
    }

    $settings = monitoring_get_specialization_management_settings($conn);
    $configMap = is_array($settings['specializations'] ?? null) ? $settings['specializations'] : [];
    $serviceIdsBySpecialization = [];
    $allServiceIds = [];
    foreach ($configMap as $specializationId => $config) {
        $normalizedSpecializationId = employeeSpecializationNormalizeId($specializationId);
        if ($normalizedSpecializationId === null || !is_array($config)) {
            continue;
        }

        $serviceIds = [];
        foreach ((array)($config['service_ids'] ?? []) as $serviceId) {
            $normalizedServiceId = (int)$serviceId;
            if ($normalizedServiceId > 0) {
                $serviceIds[] = $normalizedServiceId;
            }
        }

        $serviceIds = array_values(array_unique($serviceIds));
        sort($serviceIds);
        $serviceIdsBySpecialization[(string)$normalizedSpecializationId] = $serviceIds;
        foreach ($serviceIds as $serviceId) {
            $allServiceIds[] = $serviceId;
        }
    }

    $serviceNameMap = [];
    $allServiceIds = array_values(array_unique($allServiceIds));
    if (!empty($allServiceIds)) {
        try {
            $placeholders = implode(',', array_fill(0, count($allServiceIds), '?'));
            $stmt = $conn->prepare(
                "SELECT Services_type_Id AS id, Name AS name
                 FROM services_type
                 WHERE Services_type_Id IN ($placeholders)"
            );
            $stmt->execute($allServiceIds);
            $rows = $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];
            foreach ($rows as $row) {
                $serviceId = (int)($row['id'] ?? 0);
                $serviceName = trim((string)($row['name'] ?? ''));
                if ($serviceId > 0 && $serviceName !== '') {
                    $serviceNameMap[$serviceId] = $serviceName;
                }
            }
        } catch (Throwable $__) {
            $serviceNameMap = [];
        }
    }

    $serviceNamesBySpecialization = [];
    foreach ($serviceIdsBySpecialization as $specializationId => $serviceIds) {
        $serviceNames = [];
        foreach ($serviceIds as $serviceId) {
            if (isset($serviceNameMap[$serviceId])) {
                $serviceNames[] = $serviceNameMap[$serviceId];
            }
        }
        $serviceNamesBySpecialization[$specializationId] = array_values(array_unique($serviceNames));
    }

    return [
        'assignments' => $specializationAssignments,
        'specialization_name_map' => $specializationNameMap,
        'service_ids_by_specialization' => $serviceIdsBySpecialization,
        'service_names_by_specialization' => $serviceNamesBySpecialization,
    ];
}

function buildUserListAssignedSpecializationDetails(array $assignedIds, array $metadata): array {
    $specializationNameMap = is_array($metadata['specialization_name_map'] ?? null)
        ? $metadata['specialization_name_map']
        : [];
    $serviceIdsBySpecialization = is_array($metadata['service_ids_by_specialization'] ?? null)
        ? $metadata['service_ids_by_specialization']
        : [];
    $serviceNamesBySpecialization = is_array($metadata['service_names_by_specialization'] ?? null)
        ? $metadata['service_names_by_specialization']
        : [];

    $assignedNames = [];
    $assignedServiceIds = [];
    $assignedServiceNames = [];
    foreach ($assignedIds as $assignedId) {
        $normalizedAssignedId = employeeSpecializationNormalizeId($assignedId);
        if ($normalizedAssignedId === null) {
            continue;
        }

        if (isset($specializationNameMap[$normalizedAssignedId])) {
            $assignedNames[] = $specializationNameMap[$normalizedAssignedId];
        }

        foreach ((array)($serviceIdsBySpecialization[(string)$normalizedAssignedId] ?? []) as $serviceId) {
            $normalizedServiceId = (int)$serviceId;
            if ($normalizedServiceId > 0) {
                $assignedServiceIds[] = $normalizedServiceId;
            }
        }

        foreach ((array)($serviceNamesBySpecialization[(string)$normalizedAssignedId] ?? []) as $serviceName) {
            $normalizedServiceName = trim((string)$serviceName);
            if ($normalizedServiceName !== '') {
                $assignedServiceNames[] = $normalizedServiceName;
            }
        }
    }

    $assignedServiceIds = array_values(array_unique($assignedServiceIds));
    sort($assignedServiceIds);

    return [
        'names' => array_values(array_unique($assignedNames)),
        'service_ids' => $assignedServiceIds,
        'service_names' => array_values(array_unique($assignedServiceNames)),
    ];
}

function buildUserListSpecializationSearchUserIds(string $search, array $metadata): array {
    $normalizedSearch = normalizeUserListFilterValue($search);
    if ($normalizedSearch === '') {
        return [];
    }

    $assignments = is_array($metadata['assignments'] ?? null) ? $metadata['assignments'] : [];
    $matchingUserIds = [];
    foreach ($assignments as $userId => $assignedIds) {
        if (!is_array($assignedIds) || empty($assignedIds)) {
            continue;
        }

        $details = buildUserListAssignedSpecializationDetails($assignedIds, $metadata);
        $searchableText = normalizeUserListFilterValue(implode(' ', $details['names']));
        if ($searchableText !== '' && strpos($searchableText, $normalizedSearch) !== false) {
            $normalizedUserId = (int)$userId;
            if ($normalizedUserId > 0) {
                $matchingUserIds[] = $normalizedUserId;
            }
        }
    }

    $matchingUserIds = array_values(array_unique($matchingUserIds));
    sort($matchingUserIds);
    return $matchingUserIds;
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
            && monitoring_user_has_role_or_any_module_access($conn, $sessionUser, [MONITORING_ROLE_ADMIN], ['settings']);

        respond(200, [
            'success' => true,
            'settings' => $canViewFullSettings ? $settings : publicSecuritySettings($settings),
        ]);
    }

    if ($scope === 'system_configuration') {
        $settings = monitoring_get_system_configuration($conn);
        $canViewFullSettings = $sessionUser !== null
            && monitoring_user_has_role_or_any_module_access($conn, $sessionUser, [MONITORING_ROLE_ADMIN], ['settings']);
        respond(200, [
            'success' => true,
            'settings' => $canViewFullSettings ? $settings : publicSystemConfiguration($settings),
        ]);
    }

    $sessionUser = $sessionUser ?? monitoring_require_auth();

    monitoring_ensure_user_employment_status_column($conn);
    $profileImageSelect = buildProfileImageSelect($conn);
    $canViewAllUsers = monitoring_user_has_role_or_any_module_access(
        $conn,
        $sessionUser,
        [MONITORING_ROLE_ADMIN, MONITORING_ROLE_SECRETARY],
        ['user-management']
    );
    $requestedUserId = readUserListRequestedIdQueryParam(['user_id']);
    if ($requestedUserId > 0) {
        $sessionUserId = isset($sessionUser['id']) ? (int)$sessionUser['id'] : 0;
        if (!$canViewAllUsers && $requestedUserId !== $sessionUserId) {
            monitoring_auth_respond(403, ['success' => false, 'message' => 'Access denied.']);
        }

        $row = fetchUserListRowById($conn, $requestedUserId, $profileImageSelect);
        if (!$row) {
            respond(404, ['success' => false, 'message' => 'User not found']);
        }

        $user = mapUserRow(attachUserListSpecializationDetails($conn, $row));
        respond(200, [
            'success' => true,
            'user' => $user,
            'users' => [$user],
            'meta' => [
                'total' => 1,
                'page' => 1,
                'page_size' => 1,
                'total_pages' => 1,
            ],
        ]);
    }

    $specializationMetadata = buildUserListSpecializationMetadata($conn);
    $statusSqlExpression = buildUserListStatusSqlExpression();
    $search = trim((string)($_GET['search'] ?? ''));
    $roleFilter = normalizeUserListFilterValue($_GET['role'] ?? '');
    $statusFilter = normalizeUserListFilterValue($_GET['status'] ?? '');
    $staffOnly = isset($_GET['staff_only']) && $_GET['staff_only'] !== '' && $_GET['staff_only'] !== '0';
    $page = readUserListPositiveIntQueryParam('page', 1, 1, 1000000);
    $pageSize = readUserListPositiveIntQueryParam('page_size', 10, 1, 100);
    if ($roleFilter === 'all') {
        $roleFilter = '';
    }
    if ($statusFilter === 'all') {
        $statusFilter = '';
    }

    $usePaginatedResponse = isset($_GET['page'])
        || isset($_GET['page_size'])
        || $search !== ''
        || $roleFilter !== ''
        || $statusFilter !== ''
        || $staffOnly;

    $whereClauses = [];
    $params = [];
    if (!$canViewAllUsers) {
        $whereClauses[] = 'u.User_id = :current_user_id';
        $params[':current_user_id'] = (int)$sessionUser['id'];
    }

    if ($staffOnly) {
        $whereClauses[] = "LOWER(TRIM(COALESCE(r.Role_name, ''))) NOT IN ('admin', 'administrator', 'client')";
    }

    if ($roleFilter !== '') {
        $whereClauses[] = "LOWER(TRIM(COALESCE(r.Role_name, ''))) = :role_filter";
        $params[':role_filter'] = $roleFilter;
    }

    if ($statusFilter !== '') {
        $whereClauses[] = $statusSqlExpression . ' = :status_filter';
        $params[':status_filter'] = $statusFilter;
    }

    if ($search !== '') {
        $searchValue = '%' . $search . '%';
        $searchClauses = [
            'u.Username LIKE :search_username',
            'u.Email LIKE :search_email',
            'COALESCE(r.Role_name, \'\') LIKE :search_role',
            'CONCAT_WS(\' \', u.first_name, u.middle_name, u.last_name, c.First_name, c.Middle_name, c.Last_name) LIKE :search_name',
            'COALESCE(st.Name, \'\') LIKE :search_specialization',
            $statusSqlExpression . ' LIKE :search_status',
        ];
        $params[':search_username'] = $searchValue;
        $params[':search_email'] = $searchValue;
        $params[':search_role'] = $searchValue;
        $params[':search_name'] = $searchValue;
        $params[':search_specialization'] = $searchValue;
        $params[':search_status'] = '%' . normalizeUserListFilterValue($search) . '%';

        $matchingSpecializationUserIds = buildUserListSpecializationSearchUserIds($search, $specializationMetadata);
        if (!empty($matchingSpecializationUserIds)) {
            $searchUserPlaceholders = [];
            foreach ($matchingSpecializationUserIds as $index => $matchingUserId) {
                $placeholder = ':search_specialization_user_' . $index;
                $searchUserPlaceholders[] = $placeholder;
                $params[$placeholder] = (int)$matchingUserId;
            }
            $searchClauses[] = 'u.User_id IN (' . implode(', ', $searchUserPlaceholders) . ')';
        }

        $whereClauses[] = '(' . implode(' OR ', $searchClauses) . ')';
    }

    $whereSql = !empty($whereClauses)
        ? 'WHERE ' . implode(' AND ', $whereClauses)
        : '';
    $selectSql = 'SELECT u.User_id AS id,
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
         LEFT JOIN specialization_type st ON st.specialization_type_ID = u.specialization_type_ID';

    $rows = [];
    $total = 0;
    $totalPages = 1;
    if ($usePaginatedResponse) {
        $countStatement = $conn->prepare('SELECT COUNT(*) ' . substr($selectSql, strpos($selectSql, 'FROM ')) . ' ' . $whereSql);
        foreach ($params as $key => $value) {
            $countStatement->bindValue($key, $value);
        }
        $countStatement->execute();
        $total = (int)$countStatement->fetchColumn();
        $totalPages = $total > 0 ? (int)ceil($total / $pageSize) : 1;
        if ($page > $totalPages) {
            $page = $totalPages;
        }
        $offset = ($page - 1) * $pageSize;

        $stmt = $conn->prepare(
            $selectSql
            . ' '
            . $whereSql
            . ' ORDER BY u.User_id ASC LIMIT :limit OFFSET :offset'
        );
        foreach ($params as $key => $value) {
            $stmt->bindValue($key, $value);
        }
        $stmt->bindValue(':limit', $pageSize, PDO::PARAM_INT);
        $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
        $stmt->execute();
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];
    } else {
        $stmt = $conn->prepare(
            $selectSql
            . ' '
            . $whereSql
            . ' ORDER BY u.User_id ASC'
        );
        $stmt->execute($params);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];
        $total = count($rows);
    }

    $specializationAssignments = is_array($specializationMetadata['assignments'] ?? null)
        ? $specializationMetadata['assignments']
        : [];
    foreach ($rows as &$row) {
        $userId = isset($row['id']) ? (int)$row['id'] : 0;
        $assignedIds = $userId > 0 && is_array($specializationAssignments[(string)$userId] ?? null)
            ? $specializationAssignments[(string)$userId]
            : [];
        $assignedDetails = buildUserListAssignedSpecializationDetails($assignedIds, $specializationMetadata);
        $row['_specialization_assignments'] = $assignedIds;
        $row['_specialization_names'] = $assignedDetails['names'];
        $row['_specialization_service_ids'] = $assignedDetails['service_ids'];
        $row['_specialization_service_names'] = $assignedDetails['service_names'];
    }
    unset($row);

    $users = array_map(function ($row) {
        return mapUserRow($row);
    }, $rows);

    respond(200, [
        'success' => true,
        'users' => $users,
        'meta' => [
            'total' => $total,
            'page' => $usePaginatedResponse ? $page : 1,
            'page_size' => $usePaginatedResponse ? $pageSize : max(1, count($users)),
            'total_pages' => $usePaginatedResponse ? $totalPages : 1,
        ],
    ]);
} catch (Throwable $e) {
    error_log('user_list error: ' . $e->getMessage());
    respond(500, ['success' => false, 'message' => 'Server error']);
}
