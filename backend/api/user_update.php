<?php
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/connection-pdo.php';
require_once __DIR__ . '/employee_specialization.php';
require_once __DIR__ . '/audit_logs_helper.php';

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

function normalizeFinancialDetailsIds($value): array {
    if ($value === null) {
        return [];
    }

    $items = [];
    if (is_array($value)) {
        $items = $value;
    } elseif (is_string($value)) {
        $trimmed = trim($value);
        $items = $trimmed === '' ? [] : (preg_split('/\s*,\s*/', $trimmed) ?: []);
    } else {
        $items = [$value];
    }

    $seen = [];
    foreach ($items as $item) {
        $raw = trim((string)$item);
        if ($raw === '' || !ctype_digit($raw)) {
            continue;
        }
        $id = (int)$raw;
        if ($id > 0) {
            $seen[$id] = $id;
        }
    }

    return array_values($seen);
}

function hasFinancialDetailsPayload(array $employeeDetails): bool {
    return array_key_exists('financial_details_ids', $employeeDetails)
        || array_key_exists('financial_details_id', $employeeDetails);
}

function extractFinancialDetailsIds(array $employeeDetails): array {
    if (array_key_exists('financial_details_ids', $employeeDetails)) {
        return normalizeFinancialDetailsIds($employeeDetails['financial_details_ids']);
    }
    if (array_key_exists('financial_details_id', $employeeDetails)) {
        return normalizeFinancialDetailsIds([$employeeDetails['financial_details_id']]);
    }
    return [];
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

function tableExists(PDO $conn, string $tableName): bool {
    static $cache = [];

    $normalized = strtolower(trim($tableName));
    if ($normalized === '') {
        return false;
    }
    if (array_key_exists($normalized, $cache)) {
        return $cache[$normalized];
    }

    $stmt = $conn->prepare(
        'SELECT 1
         FROM information_schema.TABLES
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = :table_name
         LIMIT 1'
    );
    $stmt->execute([':table_name' => $tableName]);
    $exists = $stmt->fetchColumn() !== false;
    $cache[$normalized] = $exists;
    return $exists;
}

function fallbackAccountTypeName(int $id): string {
    $defaults = [
        1 => 'SSS',
        2 => 'Pag-IBIG',
        3 => 'PhilHealth',
    ];

    return $defaults[$id] ?? ('Account Type #' . $id);
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

function loadAccountTypeMap(PDO $conn, array $ids): array {
    if (empty($ids)) {
        return [];
    }

    $map = [];
    foreach ($ids as $id) {
        $id = (int)$id;
        if ($id <= 0) {
            continue;
        }
        $map[$id] = fallbackAccountTypeName($id);
    }

    if (!tableExists($conn, 'account_type')) {
        return $map;
    }

    $placeholders = implode(',', array_fill(0, count($ids), '?'));
    $stmt = $conn->prepare("SELECT account_type_id, account_type_name FROM account_type WHERE account_type_id IN ({$placeholders})");
    foreach ($ids as $i => $id) {
        $stmt->bindValue($i + 1, (int)$id, PDO::PARAM_INT);
    }
    $stmt->execute();
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];

    foreach ($rows as $row) {
        $id = isset($row['account_type_id']) ? (int)$row['account_type_id'] : 0;
        if ($id <= 0) {
            continue;
        }
        $name = trim((string)($row['account_type_name'] ?? ''));
        $map[$id] = $name !== '' ? $name : fallbackAccountTypeName($id);
    }
    return $map;
}

function buildProfileImageSelect(PDO $conn, string $alias = 'profile_image'): string {
    $hasClientProfileImage = columnExists($conn, 'client', 'Profile_Image');
    $hasUserProfileImage = columnExists($conn, 'user', 'Profile_Image');

    $clientExpr = $hasClientProfileImage ? 'c.Profile_Image' : 'NULL';
    $userExpr = $hasUserProfileImage ? 'u.Profile_Image' : 'NULL';

    return "COALESCE({$userExpr}, {$clientExpr}) AS {$alias},";
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

function syncFinancialAccountsForClient(PDO $conn, int $clientId, array $financialIds, array $accountNumbersByType = []): void {
    if ($clientId <= 0) {
        return;
    }
    if (!tableExists($conn, 'financial_account')) {
        return;
    }

    $normalizedAccountNumbers = [];
    foreach ($accountNumbersByType as $typeId => $accountNumber) {
        $typeId = (int)$typeId;
        $accountNumber = normalizeAccountNumber($accountNumber);
        if ($typeId > 0 && $accountNumber !== null) {
            $normalizedAccountNumbers[$typeId] = $accountNumber;
        }
    }
    $accountNumbersByType = $normalizedAccountNumbers;

    $financialIds = array_values(array_unique(array_filter(array_map('intval', $financialIds), function ($value) {
        return $value > 0;
    })));

    $conn->prepare('DELETE FROM financial_account WHERE Client_ID = :cid')->execute([':cid' => $clientId]);
    if (empty($financialIds)) {
        return;
    }

    $nameMap = loadAccountTypeMap($conn, $financialIds);
    $ins = $conn->prepare('INSERT INTO financial_account (Client_ID, account_type_id, name) VALUES (:cid, :atype, :name)');
    foreach ($financialIds as $accountTypeId) {
        if (!isset($nameMap[$accountTypeId])) {
            continue;
        }
        $storedName = $accountNumbersByType[$accountTypeId] ?? $nameMap[$accountTypeId];
        $ins->execute([
            ':cid' => $clientId,
            ':atype' => $accountTypeId,
            ':name' => $storedName,
        ]);
    }
}

function fetchUserRow(PDO $conn, int $id): ?array {
    $profileImageSelect = buildProfileImageSelect($conn);
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
         WHERE u.User_id = :id
         LIMIT 1'
    );
    $stmt->execute([':id' => $id]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    return $row ?: null;
}

function loadFinancialDetailsForClient(PDO $conn, int $clientId): array {
    if ($clientId <= 0) {
        return [];
    }
    if (!tableExists($conn, 'financial_account')) {
        return [];
    }

    $hasAccountTypeTable = tableExists($conn, 'account_type');
    $stmt = $conn->prepare(
        $hasAccountTypeTable
            ? 'SELECT fa.account_type_id,
                    fa.name AS account_name,
                    at.account_type_name
               FROM financial_account fa
               LEFT JOIN account_type at ON at.account_type_id = fa.account_type_id
               WHERE fa.Client_ID = :cid
               ORDER BY fa.financial_account_id ASC'
            : 'SELECT fa.account_type_id,
                    fa.name AS account_name,
                    NULL AS account_type_name
               FROM financial_account fa
               WHERE fa.Client_ID = :cid
               ORDER BY fa.financial_account_id ASC'
    );
    $stmt->execute([':cid' => $clientId]);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];

    $details = [];
    foreach ($rows as $row) {
        $accountTypeId = isset($row['account_type_id']) ? (int)$row['account_type_id'] : 0;
        if ($accountTypeId <= 0) {
            continue;
        }
        $typeName = trim((string)($row['account_type_name'] ?? ''));
        if ($typeName === '') {
            $typeName = fallbackAccountTypeName($accountTypeId);
        }
        $accountName = trim((string)($row['account_name'] ?? ''));
        $label = $typeName;
        if ($accountName !== '' && strcasecmp($accountName, $typeName) !== 0) {
            $label = $typeName . ': ' . $accountName;
        }
        $details[] = [
            'id' => $accountTypeId,
            'name' => $typeName,
            'account_name' => $accountName !== '' ? $accountName : null,
            'amount' => null,
            'rate' => null,
            'effective_from' => null,
            'effective_to' => null,
            'label' => $label,
        ];
    }

    return $details;
}

function extractAccountNumberByType(array $details, int $accountTypeId): ?string {
    foreach ($details as $detail) {
        $id = isset($detail['id']) ? (int)$detail['id'] : 0;
        if ($id !== $accountTypeId) {
            continue;
        }

        $accountName = normalizeAccountNumber($detail['account_name'] ?? null);
        if ($accountName !== null) {
            return $accountName;
        }

        $label = trim((string)($detail['label'] ?? ''));
        $separator = strpos($label, ':');
        if ($separator !== false) {
            $parsed = normalizeAccountNumber(substr($label, $separator + 1));
            if ($parsed !== null) {
                return $parsed;
            }
        }
    }

    return null;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    respond(405, ['success' => false, 'message' => 'Method not allowed']);
}

try {
    $conn->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    monitoring_ensure_user_security_columns($conn);
    ensureEmployeeSpecializationSchema($conn);

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

        monitoring_update_session_timeout((int)($result['settings']['sessionTimeoutMinutes'] ?? 30));
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
    if ($specializationPayloadProvided) {
        $specializationRaw = $employeeDetails['specialization_type_id'] ?? ($employeeDetails['specialization_type_ID'] ?? null);
        $validatedSpecializationValue = employeeSpecializationPayloadId($employeeDetails);
        if ($validatedSpecializationValue === null && trim((string)($specializationRaw ?? '')) !== '') {
            respond(422, ['success' => false, 'message' => 'Invalid specialization_type_id']);
        }
        if ($validatedSpecializationValue !== null) {
            $validatedSpecializationType = findSpecializationTypeById($conn, $validatedSpecializationValue);
            if ($validatedSpecializationType === null) {
                respond(422, ['success' => false, 'message' => 'Invalid specialization_type_id']);
            }
        }
    }

    $conn->beginTransaction();

    if ($password !== '') {
        $upd = $conn->prepare(
            'UPDATE user
             SET Username = :u,
                 Email = :e,
                 Role_id = :r,
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
            ':p' => hash('sha256', $password),
            ':id' => $id,
        ]);
    } else {
        $upd = $conn->prepare(
            'UPDATE user
             SET Username = :u,
                 Email = :e,
                 Role_id = :r
             WHERE User_id = :id'
        );
        $upd->execute([
            ':u' => $username,
            ':e' => $email,
            ':r' => $roleId,
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

    if ($clientId !== null && hasGovernmentAccountNumbersPayload($employeeDetails)) {
        $governmentAccounts = extractGovernmentAccountNumbers($employeeDetails);
        syncFinancialAccountsForClient($conn, (int)$clientId, array_keys($governmentAccounts), $governmentAccounts);
    } elseif ($clientId !== null && hasFinancialDetailsPayload($employeeDetails)) {
        syncFinancialAccountsForClient($conn, (int)$clientId, extractFinancialDetailsIds($employeeDetails));
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

    $profileGovernmentAccounts = [
        1 => normalizeAccountNumber($fresh['profile_sss_account_number'] ?? null),
        2 => normalizeAccountNumber($fresh['profile_pagibig_account_number'] ?? null),
        3 => normalizeAccountNumber($fresh['profile_philhealth_account_number'] ?? null),
    ];

    $hasGovernmentPayload = hasGovernmentAccountNumbersPayload($employeeDetails);
    $governmentAccounts = $hasGovernmentPayload ? extractGovernmentAccountNumbers($employeeDetails) : [];
    $fallbackGovernmentAccounts = [];
    foreach ($governmentAccounts as $typeId => $accountNumber) {
        if ($accountNumber !== null) {
            $fallbackGovernmentAccounts[(int)$typeId] = $accountNumber;
        }
    }
    if (empty($fallbackGovernmentAccounts)) {
        foreach ($profileGovernmentAccounts as $typeId => $accountNumber) {
            if ($accountNumber !== null) {
                $fallbackGovernmentAccounts[(int)$typeId] = $accountNumber;
            }
        }
    }

    $details = loadFinancialDetailsForClient($conn, isset($fresh['client_id']) ? (int)$fresh['client_id'] : 0);
    if (empty($details) && (!empty($fallbackGovernmentAccounts) || hasFinancialDetailsPayload($employeeDetails))) {
        $ids = !empty($fallbackGovernmentAccounts)
            ? array_values(array_map('intval', array_keys($fallbackGovernmentAccounts)))
            : extractFinancialDetailsIds($employeeDetails);
        $nameMap = loadAccountTypeMap($conn, $ids);
        $details = array_values(array_map(function ($id) use ($nameMap, $fallbackGovernmentAccounts) {
            $typeName = isset($nameMap[$id]) ? $nameMap[$id] : ('Account Type #' . $id);
            $accountNumber = $fallbackGovernmentAccounts[$id] ?? null;
            $label = $accountNumber !== null ? ($typeName . ': ' . $accountNumber) : $typeName;
            return [
                'id' => $id,
                'name' => $typeName,
                'account_name' => $accountNumber,
                'amount' => null,
                'rate' => null,
                'effective_from' => null,
                'effective_to' => null,
                'label' => $label,
            ];
        }, $ids));
    }

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
    $sssAccount = extractAccountNumberByType($details, 1);
    $pagibigAccount = extractAccountNumberByType($details, 2);
    $philhealthAccount = extractAccountNumberByType($details, 3);

    if ($sssAccount === null) {
        $sssAccount = $profileGovernmentAccounts[1] ?? null;
    }
    if ($pagibigAccount === null) {
        $pagibigAccount = $profileGovernmentAccounts[2] ?? null;
    }
    if ($philhealthAccount === null) {
        $philhealthAccount = $profileGovernmentAccounts[3] ?? null;
    }

    if ($hasGovernmentPayload) {
        if ($sssAccount === null && array_key_exists('sss_account_number', $employeeDetails)) {
            $sssAccount = normalizeAccountNumber($employeeDetails['sss_account_number']);
        }
        if ($pagibigAccount === null && array_key_exists('pagibig_account_number', $employeeDetails)) {
            $pagibigAccount = normalizeAccountNumber($employeeDetails['pagibig_account_number']);
        }
        if ($philhealthAccount === null && array_key_exists('philhealth_account_number', $employeeDetails)) {
            $philhealthAccount = normalizeAccountNumber($employeeDetails['philhealth_account_number']);
        }
    }

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
        'employee_status_id' => isset($fresh['client_status_id']) ? (int)$fresh['client_status_id'] : null,
        'employee_status' => $fresh['client_status_name'] ?? null,
        'employee_position' => $fresh['role'] ?? $roleName,
        'employee_specialization_type_id' => $profileSpecializationId,
        'employee_specialization_type_name' => $profileSpecializationName,
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
    respond(500, ['success' => false, 'message' => 'Server error', 'error' => $e->getMessage()]);
}
