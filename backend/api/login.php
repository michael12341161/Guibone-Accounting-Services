<?php
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/connection-pdo.php';
require_once __DIR__ . '/employee_specialization.php';
require_once __DIR__ . '/status_helpers.php';
require_once __DIR__ . '/audit_logs_helper.php';

monitoring_bootstrap_api(['POST', 'OPTIONS']);

try {
    $raw = file_get_contents('php://input');
    $data = json_decode($raw, true);

    if (!is_array($data)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Invalid JSON payload']);
        exit;
    }

    $auditContext = monitoring_prepare_audit_log_context($data['audit_context'] ?? null);

    $username = isset($data['username']) ? trim($data['username']) : '';
    $password = isset($data['password']) ? (string)$data['password'] : '';

    if ($username === '' || $password === '') {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Username and password are required']);
        exit;
    }

    monitoring_ensure_user_security_columns($conn);
    $securitySettings = monitoring_get_security_settings($conn);
    $lockoutAttempts = max(1, (int)$securitySettings['lockoutAttempts']);
    $lockoutDurationMinutes = max(1, (int)$securitySettings['lockoutDurationMinutes']);
    $passwordExpiryDays = max(0, (int)$securitySettings['passwordExpiryDays']);

    $profileImageSelect = "CASE
                WHEN u.Role_id = 4 THEN c.Profile_Image
                ELSE u.Profile_Image
            END AS Profile_Image";

    $stmt = $conn->prepare(
        'SELECT u.User_id AS User_ID,
                u.Username,
                u.Password,
                u.Password_changed_at AS Password_changed_at,
                u.Failed_login_attempts AS Failed_login_attempts,
                u.Locked_until AS Locked_until,
                u.Role_id AS Role_ID,
                c.Client_ID AS Client_ID,
                c.Status_id AS Client_Status_ID,
                s.Status_name AS Client_Status_Name,
                u.Email,
                u.Created_at AS Created_at,
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
         LEFT JOIN status s ON s.Status_id = c.Status_id
         WHERE u.Username = :u
         LIMIT 1'
    );
    $stmt->execute([':u' => $username]);
    $user = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$user) {
        monitoring_write_audit_log($conn, null, 'Failed login attempt', $auditContext);
        echo json_encode(['success' => false, 'message' => 'Incorrect email or password']);
        exit;
    }

    $userId = (int)$user['User_ID'];
    $lockedUntilRaw = trim((string)($user['Locked_until'] ?? ''));
    if ($lockedUntilRaw !== '') {
        $lockedUntilTimestamp = strtotime($lockedUntilRaw);
        if ($lockedUntilTimestamp !== false && $lockedUntilTimestamp > time()) {
            monitoring_write_audit_log($conn, $userId, 'Blocked login attempt on locked account', $auditContext);
            echo json_encode([
                'success' => false,
                'message' => 'Account locked due to too many failed login attempts. Try again later.',
                'locked_until' => $lockedUntilRaw,
            ]);
            exit;
        }

        $unlockStmt = $conn->prepare(
            'UPDATE user
             SET Failed_login_attempts = 0,
                 Locked_until = NULL
             WHERE User_id = :id'
        );
        $unlockStmt->execute([':id' => $userId]);
        $user['Failed_login_attempts'] = 0;
        $user['Locked_until'] = null;
    }

    $stored = (string)$user['Password'];
    $enteredHash = hash('sha256', (string)$password);
    $isValid = hash_equals($stored, $enteredHash);

    if (!$isValid) {
        $failedAttempts = isset($user['Failed_login_attempts']) ? (int)$user['Failed_login_attempts'] : 0;
        $nextFailedAttempts = $failedAttempts + 1;

        if ($nextFailedAttempts >= $lockoutAttempts) {
            $lockedUntilValue = date('Y-m-d H:i:s', time() + ($lockoutDurationMinutes * 60));
            $lockStmt = $conn->prepare(
                'UPDATE user
                 SET Failed_login_attempts = :attempts,
                     Locked_until = :locked_until
                 WHERE User_id = :id'
            );
            $lockStmt->execute([
                ':attempts' => $nextFailedAttempts,
                ':locked_until' => $lockedUntilValue,
                ':id' => $userId,
            ]);
            monitoring_write_audit_log($conn, $userId, 'Account locked after failed login attempts', $auditContext);

            echo json_encode([
                'success' => false,
                'message' => 'Account locked due to too many failed login attempts. Try again later.',
                'locked_until' => $lockedUntilValue,
            ]);
            exit;
        }

        $failedStmt = $conn->prepare(
            'UPDATE user
             SET Failed_login_attempts = :attempts,
                 Locked_until = NULL
             WHERE User_id = :id'
        );
        $failedStmt->execute([
            ':attempts' => $nextFailedAttempts,
            ':id' => $userId,
        ]);
        monitoring_write_audit_log($conn, $userId, 'Failed login attempt', $auditContext);

        echo json_encode(['success' => false, 'message' => 'Incorrect email or password']);
        exit;
    }

    $resetFailedLoginStmt = $conn->prepare(
        'UPDATE user
         SET Failed_login_attempts = 0,
             Locked_until = NULL
         WHERE User_id = :id'
    );
    $resetFailedLoginStmt->execute([':id' => $userId]);

    $roleId = isset($user['Role_ID']) ? (int)$user['Role_ID'] : 0;
    $approvalStatus = null;
    if ($roleId === MONITORING_ROLE_CLIENT) {
        $clientStatusId = isset($user['Client_Status_ID']) && $user['Client_Status_ID'] !== null
            ? (int)$user['Client_Status_ID']
            : 0;
        $clientStatusName = isset($user['Client_Status_Name']) ? (string)$user['Client_Status_Name'] : null;
        $approvalStatus = monitoring_client_approval_status($clientStatusName, $clientStatusId, 'Pending');

        if (strcasecmp($approvalStatus, 'Approved') !== 0) {
            monitoring_write_audit_log($conn, $userId, 'Blocked login due to client approval status', $auditContext);
            echo json_encode([
                'success' => false,
                'message' => $approvalStatus === 'Rejected'
                    ? 'Your registration was rejected. Please check your email for the reason and submit a new application after completing the requirements.'
                    : 'Your account is still pending approval. Please wait for approval before logging in.',
                'approval_status' => $approvalStatus,
            ]);
            exit;
        }
    }

    $passwordExpiryInfo = monitoring_resolve_password_expiry_info(
        $securitySettings,
        $user['Password_changed_at'] ?? null,
        $user['Created_at'] ?? null
    );

    if ($passwordExpiryDays > 0 && !empty($passwordExpiryInfo['password_expired'])) {
        monitoring_write_audit_log($conn, $userId, 'Blocked login due to expired password', $auditContext);
        echo json_encode([
            'success' => false,
            'message' => 'Your password has expired. Reset it to continue.',
            'password_expired' => true,
            'password_expiry_days' => $passwordExpiryDays,
            'email' => $user['Email'] ?? null,
        ]);
        exit;
    }

    $sessionUser = [
        'id' => $userId,
        'username' => $user['Username'],
        'role_id' => $roleId,
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

    monitoring_store_session_user($sessionUser);
    monitoring_store_audit_context($auditContext);
    monitoring_write_audit_log($conn, $userId, 'Login successful', $auditContext);

    echo json_encode([
        'success' => true,
        'user' => $sessionUser,
        'message' => 'Login successful',
    ]);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Server error', 'error' => $e->getMessage()]);
}
