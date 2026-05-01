<?php
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/connection-pdo.php';
require_once __DIR__ . '/client_service_access.php';
require_once __DIR__ . '/client_service_steps_schema.php';
require_once __DIR__ . '/service_type_helpers.php';
require_once __DIR__ . '/task_workload_settings_helper.php';
require_once __DIR__ . '/task_deadline_monitor.php';
require_once __DIR__ . '/employee_specialization.php';

monitoring_bootstrap_api(['POST', 'OPTIONS']);

function respond($code, $payload) {
    http_response_code($code);
    echo json_encode($payload);
    exit;
}

function quoteIdentifier(string $name): string {
    return '`' . str_replace('`', '``', $name) . '`';
}

function resolveTaskCreatedByColumn(PDO $conn): ?string {
    static $cached = null;
    if ($cached !== null) {
        return $cached !== '' ? $cached : null;
    }

    try {
        $stmt = $conn->prepare('SHOW COLUMNS FROM `client_services` LIKE :column');
        $stmt->execute([':column' => 'created_by']);
        if ($stmt->fetch(PDO::FETCH_ASSOC)) {
            $cached = 'created_by';
            return $cached;
        }
    } catch (Throwable $__) {
        // Fall through and return null.
    }

    $cached = '';
    return null;
}

function resolveTaskCreatedAtColumn(PDO $conn): ?string {
    static $cached = null;
    if ($cached !== null) {
        return $cached !== '' ? $cached : null;
    }

    foreach (['created_at', 'Created_at', 'date_created', 'created_on', 'timestamp'] as $column) {
        try {
            $stmt = $conn->prepare('SHOW COLUMNS FROM `client_services` LIKE :column');
            $stmt->execute([':column' => $column]);
            if ($stmt->fetch(PDO::FETCH_ASSOC)) {
                $cached = $column;
                return $cached;
            }
        } catch (Throwable $__) {
            // Try the next possible column name.
        }
    }

    $cached = '';
    return null;
}

function upsertDescriptionMetaLine(string $source, string $key, string $value, bool $prepend = false): string {
    $pattern = '/^\s*\[' . preg_quote($key, '/') . '\]\s*[^\r\n]*\s*$/i';
    $lines = preg_split('/\R/', (string)$source);
    $next = [];
    $written = false;

    foreach ($lines as $line) {
        if (preg_match($pattern, (string)$line)) {
            if (!$written) {
                $next[] = '[' . $key . '] ' . $value;
                $written = true;
            }
            continue;
        }
        $next[] = $line;
    }

    if (!$written) {
        if ($prepend) {
            array_unshift($next, '[' . $key . '] ' . $value);
        } else {
            while (!empty($next) && trim((string)end($next)) === '') {
                array_pop($next);
            }
            $next[] = '[' . $key . '] ' . $value;
        }
    }

    return trim(implode("\n", $next));
}

function removeDescriptionMetaLine(string $source, string $key): string {
    $pattern = '/^\s*\[' . preg_quote($key, '/') . '\]\s*.*$/i';
    $lines = preg_split('/\R/', (string)$source);
    $next = [];

    foreach ($lines as $line) {
        if (preg_match($pattern, (string)$line)) {
            continue;
        }
        $next[] = $line;
    }

    while (!empty($next) && trim((string)reset($next)) === '') {
        array_shift($next);
    }
    while (!empty($next) && trim((string)end($next)) === '') {
        array_pop($next);
    }

    return trim(implode("\n", $next));
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

function resolveUserDisplayName(PDO $conn, int $userId): string {
    if ($userId <= 0) {
        return '';
    }

    $stmt = $conn->prepare(
        'SELECT u.Username AS username,
                u.first_name AS first_name,
                u.middle_name AS middle_name,
                u.last_name AS last_name
         FROM user u
         WHERE u.User_id = :uid
         LIMIT 1'
    );
    $stmt->execute([':uid' => $userId]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$row) {
        return '';
    }

    $fullName = buildPersonName($row['first_name'] ?? '', $row['middle_name'] ?? '', $row['last_name'] ?? '');
    if ($fullName !== '') {
        return $fullName;
    }

    return trim((string)($row['username'] ?? ''));
}

function fetchTaskAssignableUser(PDO $conn, int $userId): ?array {
    if ($userId <= 0) {
        return null;
    }

    $stmt = $conn->prepare(
        'SELECT
            u.User_id AS id,
            u.Username AS username,
            u.first_name AS first_name,
            u.middle_name AS middle_name,
            u.last_name AS last_name,
            u.Role_id AS role_id,
            r.Role_name AS role_name
         FROM user u
         LEFT JOIN role r ON r.Role_id = u.Role_id
         WHERE u.User_id = :uid
         LIMIT 1'
    );
    $stmt->execute([':uid' => $userId]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    return $row ?: null;
}

function resolveTaskUserDisplayName(array $user): string {
    $fullName = buildPersonName($user['first_name'] ?? '', $user['middle_name'] ?? '', $user['last_name'] ?? '');
    if ($fullName !== '') {
        return $fullName;
    }

    return trim((string)($user['username'] ?? ''));
}

function resolveTaskRoleLabelById(int $roleId): string {
    if ($roleId === MONITORING_ROLE_ADMIN) {
        return 'Admin';
    }
    if ($roleId === MONITORING_ROLE_SECRETARY) {
        return 'Secretary';
    }
    if ($roleId === MONITORING_ROLE_ACCOUNTANT) {
        return 'Accountant';
    }
    if ($roleId === MONITORING_ROLE_CLIENT) {
        return 'Client';
    }
    return 'User';
}

function resolveTaskUserRoleLabel(array $user): string {
    $roleId = isset($user['role_id']) ? (int)$user['role_id'] : 0;
    $roleName = strtolower(trim((string)($user['role_name'] ?? '')));

    if ($roleName === 'admin') {
        return 'Admin';
    }
    if ($roleName === 'secretary') {
        return 'Secretary';
    }
    if ($roleName === 'accountant') {
        return 'Accountant';
    }
    if ($roleName === 'client') {
        return 'Client';
    }

    return resolveTaskRoleLabelById($roleId);
}

function isTaskSecretaryUser(array $user): bool {
    $roleId = isset($user['role_id']) ? (int)$user['role_id'] : 0;
    if ($roleId === MONITORING_ROLE_SECRETARY) {
        return true;
    }

    return strtolower(trim((string)($user['role_name'] ?? ''))) === 'secretary';
}

function isTaskAccountantUser(array $user): bool {
    $roleId = isset($user['role_id']) ? (int)$user['role_id'] : 0;
    if ($roleId === MONITORING_ROLE_ACCOUNTANT) {
        return true;
    }

    return strtolower(trim((string)($user['role_name'] ?? ''))) === 'accountant';
}

function taskUserAllowedForService(PDO $conn, array $user, int $serviceId): bool {
    if ($serviceId <= 0) {
        return true;
    }

    if (isTaskSecretaryUser($user)) {
        return true;
    }

    if (!isTaskAccountantUser($user)) {
        return false;
    }

    $userId = isset($user['id']) ? (int)$user['id'] : 0;
    if ($userId <= 0) {
        return false;
    }

    $specializationIds = employeeSpecializationGetUserAssignments($conn, $userId);
    $allowedServiceIds = employeeSpecializationResolveServiceIds($conn, $specializationIds);
    return in_array($serviceId, $allowedServiceIds, true);
}

function buildTaskUserLabel(array $user): string {
    $roleLabel = resolveTaskUserRoleLabel($user);
    $displayName = resolveTaskUserDisplayName($user);
    return trim($roleLabel . ($displayName !== '' ? ' ' . $displayName : ''));
}

function resolveClientUserId(PDO $conn, int $clientId): int {
    if ($clientId <= 0) {
        return 0;
    }

    $stmt = $conn->prepare('SELECT User_id FROM client WHERE Client_ID = :cid LIMIT 1');
    $stmt->execute([':cid' => $clientId]);
    return (int)($stmt->fetchColumn() ?: 0);
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

function normalizeWorkloadTaskStatus(string $statusName, string $description): string {
    $status = strtolower(trim($statusName));

    if (preg_match('/^\s*\[Declined reason\]\s*/mi', $description)) {
        return 'Declined';
    }
    if (preg_match('/^\s*\[Done\]\s*$/mi', $description)) {
        return 'Completed';
    }

    if ($status === 'cancelled' || $status === 'declined' || $status === 'canceled') {
        return 'Declined';
    }
    if ($status === 'completed' || $status === 'done') {
        return 'Completed';
    }
    if ($status === 'overdue') {
        return 'Overdue';
    }
    if ($status === 'incomplete') {
        return 'Incomplete';
    }
    if ($status === 'in progress' || $status === 'started') {
        return 'In Progress';
    }
    if ($status === 'not started' || $status === 'pending' || $status === '') {
        return 'Not Started';
    }

    return $statusName !== '' ? $statusName : 'Not Started';
}

function isTaskCountedTowardsWorkload(string $statusName, string $description): bool {
    $normalizedStatus = strtolower(normalizeWorkloadTaskStatus($statusName, $description));
    return $normalizedStatus !== 'completed' && $normalizedStatus !== 'declined' && $normalizedStatus !== 'cancelled';
}

function countActiveAssignedTasks(PDO $conn, int $userId): int {
    if ($userId <= 0) {
        return 0;
    }

    $stmt = $conn->prepare(
        'SELECT st.Status_name AS status_name,
                COALESCE(cs.Steps, "") AS description
         FROM client_services cs
         LEFT JOIN status st ON st.Status_id = cs.Status_ID
         WHERE cs.User_ID = :uid'
    );
    $stmt->execute([':uid' => $userId]);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];

    $count = 0;
    foreach ($rows as $row) {
        if (isTaskCountedTowardsWorkload((string)($row['status_name'] ?? ''), (string)($row['description'] ?? ''))) {
            $count += 1;
        }
    }

    return $count;
}

function createTaskNotifications(
    PDO $conn,
    int $creatorId,
    int $creatorRoleId,
    ?array $assigneeUser,
    ?array $partnerUser,
    int $clientId,
    string $clientName
): void {
    $creatorName = resolveUserDisplayName($conn, $creatorId);
    $creatorRoleLabel = resolveTaskRoleLabelById($creatorRoleId);
    $creatorLabel = trim($creatorRoleLabel . ($creatorName !== '' ? ' ' . $creatorName : ''));
    $assigneeLabel = $assigneeUser ? buildTaskUserLabel($assigneeUser) : 'Assigned staff';
    $partnerLabel = $partnerUser ? buildTaskUserLabel($partnerUser) : '';
    $clientLabel = trim($clientName) !== '' ? trim($clientName) : 'Client';

    $clientUserId = resolveClientUserId($conn, $clientId);
    if ($clientUserId > 0) {
        $clientMessage = $creatorLabel . ' created a task for you. ' . $assigneeLabel;
        if ($partnerLabel !== '') {
            $clientMessage .= ' will coordinate with ' . $partnerLabel . ' for the service.';
        } else {
            $clientMessage .= ' will handle the service.';
        }
        insertNotification($conn, $clientUserId, $creatorId, 'task', $clientMessage);
    }

    if ($assigneeUser && (int)($assigneeUser['id'] ?? 0) > 0) {
        $assigneeMessage = $creatorLabel . ' assigned you a task for client ' . $clientLabel . '.';
        if ($partnerLabel !== '' && isTaskSecretaryUser($assigneeUser)) {
            $assigneeMessage .= ' ' . $partnerLabel . ' is your accountant partner for the task steps.';
        }
        insertNotification($conn, (int)$assigneeUser['id'], $creatorId, 'task', $assigneeMessage);
    }

    if ($partnerUser && (int)($partnerUser['id'] ?? 0) > 0) {
        $partnerMessage = $creatorLabel . ' assigned you as the accountant partner for client ' . $clientLabel . '.';
        insertNotification($conn, (int)$partnerUser['id'], $creatorId, 'task', $partnerMessage);
    }
}

function resolveStatusId(PDO $conn, string $group, string $name, int $fallback): int {
    $stmt = $conn->prepare(
        'SELECT Status_id
         FROM status
         WHERE Status_group = :grp
           AND LOWER(Status_name) = LOWER(:name)
         LIMIT 1'
    );
    $stmt->execute([':grp' => $group, ':name' => $name]);
    return (int)($stmt->fetchColumn() ?: $fallback);
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    respond(405, ['success' => false, 'message' => 'Method not allowed']);
}

try {
    $sessionUser = monitoring_require_roles([MONITORING_ROLE_ADMIN, MONITORING_ROLE_SECRETARY]);
    $conn->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    monitoring_ensure_client_service_steps_column_supports_long_text($conn);

    $raw = file_get_contents('php://input');
    $data = json_decode($raw, true);
    if (!is_array($data)) {
        respond(400, ['success' => false, 'message' => 'Invalid JSON payload']);
    }

    $clientId = isset($data['client_id']) ? (int)$data['client_id'] : 0;
    $title = isset($data['title']) ? trim((string)$data['title']) : '';
    $description = isset($data['description']) ? trim((string)$data['description']) : '';
    $serviceNameInput = isset($data['status']) ? trim((string)$data['status']) : '';
    if ($serviceNameInput === '' && isset($data['service'])) {
        $serviceNameInput = trim((string)$data['service']);
    }
    if ($serviceNameInput === '' && isset($data['service_name'])) {
        $serviceNameInput = trim((string)$data['service_name']);
    }
    $serviceIdInput = isset($data['service_id']) ? (int)$data['service_id'] : 0;
    $accountantId = isset($data['accountant_id']) ? (int)$data['accountant_id'] : 0;
    $partnerId = isset($data['partner_id']) ? (int)$data['partner_id'] : 0;
    $deadlineInput = isset($data['deadline']) ? trim((string)$data['deadline']) : '';

    if ($clientId <= 0 || $title === '') {
        respond(422, ['success' => false, 'message' => 'Client and title are required']);
    }

    $checkClient = $conn->prepare(
        'SELECT Client_ID, CONCAT_WS(" ", First_name, Middle_name, Last_name) AS client_name
         FROM client
         WHERE Client_ID = :cid
         LIMIT 1'
    );
    $checkClient->execute([':cid' => $clientId]);
    $clientRow = $checkClient->fetch(PDO::FETCH_ASSOC);
    if (!$clientRow) {
        respond(404, ['success' => false, 'message' => 'Client not found']);
    }

    if ($description === '') {
        $description = '[Progress] 0';
    } elseif (!preg_match('/^\s*\[Progress\]\s*\d{1,3}\s*$/mi', $description)) {
        $description = "[Progress] 0\n" . $description;
    }

    if ($deadlineInput !== '') {
        $lines = preg_split('/\R/', $description);
        $next = [];
        $replaced = false;
        foreach ($lines as $line) {
            if (preg_match('/^\s*\[Deadline\]\s*/i', (string)$line)) {
                if (!$replaced) {
                    $next[] = '[Deadline] ' . $deadlineInput;
                    $replaced = true;
                }
                continue;
            }
            $next[] = $line;
        }
        if (!$replaced) {
            $next[] = '[Deadline] ' . $deadlineInput;
        }
        $description = implode("\n", $next);
    }

    $service = monitoring_find_service_type($conn, $serviceNameInput, $serviceIdInput, true);
    if ($service === null) {
        respond(500, ['success' => false, 'message' => 'No services configured']);
    }
    $serviceId = (int)$service['id'];
    $serviceName = (string)$service['name'];
    $serviceLabel = (string)$service['label'];
    $serviceDescription = $service['description'];

    $serviceAccessState = monitoring_client_service_access_state($conn, $clientId);
    if (empty($serviceAccessState['business_registered']) && !monitoring_service_name_is_processing($serviceName)) {
        respond(422, [
            'success' => false,
            'message' => monitoring_client_service_restriction_message(
                false,
                $serviceAccessState['restriction_reason'] ?? null
            ),
            'allowed_services' => ['Processing'],
        ]);
    }

    $assigneeUser = null;
    if ($accountantId > 0) {
        $assigneeUser = fetchTaskAssignableUser($conn, $accountantId);
        if ($assigneeUser === null) {
            respond(422, ['success' => false, 'message' => 'Invalid accountant_id']);
        }
    } else {
        $accountantId = 0;
    }

    $partnerUser = null;
    if ($partnerId > 0) {
        $partnerUser = fetchTaskAssignableUser($conn, $partnerId);
        if ($partnerUser === null) {
            respond(422, ['success' => false, 'message' => 'Invalid partner_id']);
        }
    } else {
        $partnerId = 0;
    }

    if ($assigneeUser !== null && isTaskSecretaryUser($assigneeUser)) {
        if ($partnerId <= 0) {
            respond(422, ['success' => false, 'message' => 'Please select an accountant partner when assigning the task to a secretary.']);
        }
        if ($partnerId === $accountantId) {
            respond(422, ['success' => false, 'message' => 'The partner accountant must be different from the main assignee.']);
        }
        if ($partnerUser === null || !isTaskAccountantUser($partnerUser)) {
            respond(422, ['success' => false, 'message' => 'Partner must be an accountant.']);
        }
    } elseif ($assigneeUser !== null && isTaskAccountantUser($assigneeUser) && !taskUserAllowedForService($conn, $assigneeUser, $serviceId)) {
        respond(422, ['success' => false, 'message' => 'The selected accountant does not have access to this service.']);
    } else {
        $partnerId = 0;
        $partnerUser = null;
    }

    $createdAtSeed = date('c');
    $description = upsertDescriptionMetaLine($description, 'CreatedAt', $createdAtSeed);
    if ($partnerUser !== null) {
        $description = upsertDescriptionMetaLine($description, 'PartnerId', (string)$partnerId);
        $description = upsertDescriptionMetaLine($description, 'PartnerName', resolveTaskUserDisplayName($partnerUser));
    } else {
        $description = removeDescriptionMetaLine($description, 'PartnerId');
        $description = removeDescriptionMetaLine($description, 'PartnerName');
    }

    $deadlineDate = null;
    if ($deadlineInput !== '' && preg_match('/^\d{4}-\d{2}-\d{2}$/', $deadlineInput)) {
        $deadlineDate = $deadlineInput;
    }

    $taskWorkloadSettings = monitoring_get_task_workload_settings($conn);
    $workloadLimit = (int)($taskWorkloadSettings['limit'] ?? MONITORING_TASK_WORKLOAD_DEFAULT_LIMIT);
    $activeTasksBeforeCreate = $accountantId > 0 ? countActiveAssignedTasks($conn, $accountantId) : 0;
    if ($accountantId > 0 && $activeTasksBeforeCreate >= $workloadLimit) {
        $staffLabel = resolveUserDisplayName($conn, $accountantId);
        if ($staffLabel === '') {
            $staffLabel = 'The selected staff member';
        }

        respond(422, [
            'success' => false,
            'message' => $staffLabel . ' already has ' . $activeTasksBeforeCreate . ' active tasks and has reached the workload limit of ' . $workloadLimit . '. Please choose another accountant or secretary.',
            'workload_limit_reached' => true,
            'staff_id' => $accountantId,
            'staff_name' => $staffLabel,
            'active_tasks' => $activeTasksBeforeCreate,
            'limit' => $workloadLimit,
        ]);
    }

    $notStartedId = resolveStatusId($conn, 'TASK', 'Not Started', 10);
    $createdById = isset($sessionUser['id']) ? (int)$sessionUser['id'] : 0;
    $createdByName = $createdById > 0 ? resolveUserDisplayName($conn, $createdById) : '';
    $createdAtColumn = resolveTaskCreatedAtColumn($conn);

    $conn->beginTransaction();

    $createdByColumn = resolveTaskCreatedByColumn($conn);
    $insertColumns = ['Client_ID', 'Services_type_Id', 'Name', 'User_ID', 'Steps', 'Date', 'Status_ID'];
    $insertValues = [':cid', ':service_id', ':name', ':uid', ':steps', ':task_date', ':status_id'];
    $insertParams = [
        ':cid' => $clientId,
        ':service_id' => $serviceId,
        ':name' => $title,
        ':uid' => ($accountantId > 0 ? $accountantId : null),
        ':steps' => $description,
        ':task_date' => $deadlineDate,
        ':status_id' => $notStartedId,
    ];
    if ($createdByColumn !== null) {
        $insertColumns[] = quoteIdentifier($createdByColumn);
        $insertValues[] = ':created_by';
        $insertParams[':created_by'] = $createdById > 0 ? $createdById : null;
    }

    $insTask = $conn->prepare(
        'INSERT INTO client_services (' . implode(', ', $insertColumns) . ')
         VALUES (' . implode(', ', $insertValues) . ')'
    );
    $insTask->execute($insertParams);
    $taskId = (int)$conn->lastInsertId();

    $createdAtValue = null;
    if ($createdAtColumn !== null) {
        $createdAtStmt = $conn->prepare(
            'SELECT ' . quoteIdentifier($createdAtColumn) . ' AS created_at
             FROM client_services
             WHERE Client_services_ID = :id
             LIMIT 1'
        );
        $createdAtStmt->execute([':id' => $taskId]);
        $createdAtValue = $createdAtStmt->fetchColumn() ?: null;
    }
    if ($createdAtValue === null) {
        $createdAtValue = $createdAtSeed;
    }

    $accountantName = $assigneeUser !== null ? trim((string)($assigneeUser['username'] ?? '')) : null;
    $partnerName = $partnerUser !== null ? resolveTaskUserDisplayName($partnerUser) : null;

    $conn->commit();

    try {
        $creatorId = isset($sessionUser['id']) ? (int)$sessionUser['id'] : 0;
        createTaskNotifications(
            $conn,
            $creatorId,
            (int)($sessionUser['role_id'] ?? 0),
            $assigneeUser,
            $partnerUser,
            $clientId,
            (string)($clientRow['client_name'] ?? '')
        );
    } catch (Throwable $__) {
        // Do not block task creation if notifications fail.
    }

    try {
        monitoring_run_task_deadline_monitor($conn);
    } catch (Throwable $__) {
        // Do not block task creation if deadline monitoring fails.
    }

    respond(201, [
        'success' => true,
        'id' => $taskId,
        'task' => [
            'id' => $taskId,
            'task_ref_id' => null,
            'title' => $title,
            'name' => $title,
            'description' => $description,
            'deadline' => $deadlineDate ?: ($deadlineInput !== '' ? $deadlineInput : null),
            'due_date' => $deadlineDate ?: ($deadlineInput !== '' ? $deadlineInput : null),
            'status' => 'Not Started',
            'service' => $serviceLabel,
            'service_name' => $serviceLabel,
            'service_label' => $serviceLabel,
            'raw_service_name' => $serviceName,
            'service_description' => $serviceDescription,
            'service_id' => $serviceId,
            'client_id' => $clientId,
            'client_name' => $clientRow['client_name'] ?? null,
            'created_at' => $createdAtValue,
            'createdAt' => $createdAtValue,
            'created_by' => $createdById > 0 ? $createdById : null,
            'created_by_name' => $createdByName !== '' ? $createdByName : null,
            'accountant_id' => ($accountantId > 0 ? $accountantId : null),
            'accountant_name' => $accountantName,
            'partner_id' => ($partnerId > 0 ? $partnerId : null),
            'partner_name' => $partnerName,
        ],
    ]);
} catch (Throwable $e) {
    if (isset($conn) && $conn instanceof PDO && $conn->inTransaction()) {
        $conn->rollBack();
    }
    error_log('task_create error: ' . $e->getMessage());
    respond(500, ['success' => false, 'message' => 'Server error']);
}
