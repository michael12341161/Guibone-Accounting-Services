<?php
require_once __DIR__ . '/../rate_limit.php';
monitoring_enforce_rate_limit();
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/connection-pdo.php';
require_once __DIR__ . '/client_service_steps_schema.php';

monitoring_bootstrap_api(['POST', 'OPTIONS']);

function respond($code, $payload) {
    http_response_code($code);
    echo json_encode($payload);
    exit;
}

function taskStepActivityBuildPersonName(array $user): string {
    $parts = [];
    foreach ([$user['first_name'] ?? '', $user['middle_name'] ?? '', $user['last_name'] ?? ''] as $part) {
        $value = trim((string)$part);
        if ($value !== '') {
            $parts[] = $value;
        }
    }
    $name = trim(implode(' ', $parts));
    return $name !== '' ? $name : trim((string)($user['username'] ?? 'User'));
}

function taskStepActivityRoleLabel(array $user): string {
    $roleName = trim((string)($user['role_name'] ?? $user['role'] ?? ''));
    if ($roleName !== '') {
        return $roleName;
    }
    $roleId = (int)($user['role_id'] ?? 0);
    if ($roleId === MONITORING_ROLE_ADMIN) return 'Admin';
    if ($roleId === MONITORING_ROLE_SECRETARY) return 'Secretary';
    if ($roleId === MONITORING_ROLE_ACCOUNTANT) return 'Accountant';
    if ($roleId === MONITORING_ROLE_CLIENT) return 'Client';
    return 'User';
}

function taskStepActivityNow(): string {
    return (new DateTimeImmutable('now'))->format(DateTimeInterface::ATOM);
}

function taskStepActivityNormalizeDateTime($value): string {
    $raw = trim((string)($value ?? ''));
    if ($raw === '') {
        return '';
    }

    try {
        return (new DateTimeImmutable($raw))->format(DateTimeInterface::ATOM);
    } catch (Throwable $__) {
        return '';
    }
}

function taskStepActivityFetchTask(PDO $conn, int $taskId): ?array {
    $stmt = $conn->prepare(
        'SELECT
            cs.Client_services_ID AS id,
            cs.Name AS name,
            COALESCE(cs.Steps, "") AS description,
            cs.Client_ID AS client_id,
            cs.User_ID AS accountant_id
         FROM client_services cs
         WHERE cs.Client_services_ID = :id
         LIMIT 1'
    );
    $stmt->execute([':id' => $taskId]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    return $row ?: null;
}

function taskStepActivityResolvePartnerId(string $description): int {
    if (preg_match('/^\s*\[PartnerId\]\s*(\d+)\s*$/mi', $description, $matches)) {
        return (int)($matches[1] ?? 0);
    }
    return 0;
}

function taskStepActivityCanStaffAccess(array $user, array $task): bool {
    if (monitoring_user_has_any_role($user, [MONITORING_ROLE_ADMIN, MONITORING_ROLE_SECRETARY])) {
        return true;
    }
    if (!monitoring_user_has_any_role($user, [MONITORING_ROLE_ACCOUNTANT])) {
        return false;
    }

    $userId = (int)($user['id'] ?? 0);
    $partnerId = taskStepActivityResolvePartnerId((string)($task['description'] ?? ''));
    return $userId > 0 && (
        (int)($task['accountant_id'] ?? 0) === $userId ||
        $partnerId === $userId
    );
}

function taskStepActivityCanClientAccess(array $user, array $task): bool {
    return monitoring_user_has_any_role($user, [MONITORING_ROLE_CLIENT])
        && (int)($user['client_id'] ?? 0) > 0
        && (int)($user['client_id'] ?? 0) === (int)($task['client_id'] ?? 0);
}

function taskStepActivityReadMeta(string $description, string $tag, int $stepNumber): string {
    if (preg_match('/^\s*\[' . preg_quote($tag, '/') . '\s+' . $stepNumber . '\]\s*([^\r\n]+)\s*$/mi', $description, $matches)) {
        return trim((string)($matches[1] ?? ''));
    }
    return '';
}

function taskStepActivityUpdateMeta(string $description, string $tag, int $stepNumber, string $value): string {
    $lines = preg_split('/\R/', $description);
    $next = [];
    $written = false;
    $matcher = '/^\s*\[' . preg_quote($tag, '/') . '\s+' . $stepNumber . '\]\s*.*$/i';

    foreach ($lines as $line) {
        if (preg_match($matcher, (string)$line)) {
            if (!$written && trim($value) !== '') {
                $next[] = '[' . $tag . ' ' . $stepNumber . '] ' . trim($value);
                $written = true;
            }
            continue;
        }
        $next[] = $line;
    }

    if (!$written && trim($value) !== '') {
        while (!empty($next) && trim((string)$next[count($next) - 1]) === '') {
            array_pop($next);
        }
        $next[] = '[' . $tag . ' ' . $stepNumber . '] ' . trim($value);
    }

    return trim(implode("\n", $next));
}

function taskStepActivityEncode(array $activity): string {
    $json = json_encode($activity, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    if (!is_string($json) || $json === '') {
        return '';
    }
    return rtrim(strtr(base64_encode($json), '+/', '-_'), '=');
}

function taskStepActivityAppend(string $description, int $stepNumber, array $activity): string {
    $payload = taskStepActivityEncode($activity);
    if ($payload === '') {
        return trim($description);
    }

    $description = trim($description);
    return $description !== ''
        ? $description . "\n[StepActivity " . $stepNumber . "] " . $payload
        : "[StepActivity " . $stepNumber . "] " . $payload;
}

function taskStepActivityStoreFile(array $file, int $taskId, int $stepNumber): array {
    $uploadError = (int)($file['error'] ?? UPLOAD_ERR_NO_FILE);
    if ($uploadError !== UPLOAD_ERR_OK) {
        throw new InvalidArgumentException('File upload failed.');
    }

    $maxBytes = 10 * 1024 * 1024;
    if ((int)($file['size'] ?? 0) > $maxBytes) {
        throw new InvalidArgumentException('File too large. Max 10MB.');
    }

    $originalName = basename((string)($file['name'] ?? ''));
    $extension = strtolower(pathinfo($originalName, PATHINFO_EXTENSION));
    $allowedExtensions = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'csv', 'jpg', 'jpeg', 'png', 'gif', 'webp', 'txt', 'zip'];
    if (!in_array($extension, $allowedExtensions, true)) {
        throw new InvalidArgumentException('Invalid file type. Allowed: ' . implode(', ', $allowedExtensions));
    }

    $safeBase = preg_replace('/[^a-zA-Z0-9_-]+/', '_', pathinfo($originalName, PATHINFO_FILENAME));
    $safeBase = trim((string)$safeBase, '_');
    if ($safeBase === '') {
        $safeBase = 'file';
    }

    $uploadDir = realpath(__DIR__ . '/..') . DIRECTORY_SEPARATOR . 'uploads' . DIRECTORY_SEPARATOR . 'task_step_files';
    if (!is_dir($uploadDir) && !mkdir($uploadDir, 0755, true)) {
        throw new RuntimeException('Failed to create upload directory.');
    }

    $storedName = 'task_' . $taskId . '_step_' . $stepNumber . '_' . bin2hex(random_bytes(8)) . '_' . $safeBase . '.' . $extension;
    $destination = $uploadDir . DIRECTORY_SEPARATOR . $storedName;
    if (!move_uploaded_file((string)($file['tmp_name'] ?? ''), $destination)) {
        throw new RuntimeException('Failed to save uploaded file.');
    }

    return [
        'name' => $originalName,
        'path' => 'uploads/task_step_files/' . $storedName,
        'size' => (int)($file['size'] ?? 0),
        'type' => (string)($file['type'] ?? ''),
    ];
}

try {
    $sessionUser = monitoring_require_auth();
    $conn->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    monitoring_ensure_client_service_steps_column_supports_long_text($conn);

    $contentType = strtolower((string)($_SERVER['CONTENT_TYPE'] ?? ''));
    $isMultipart = strpos($contentType, 'multipart/form-data') !== false;
    $data = $isMultipart ? $_POST : json_decode(file_get_contents('php://input'), true);
    if (!is_array($data)) {
        respond(400, ['success' => false, 'message' => 'Invalid payload']);
    }

    $taskId = (int)($data['task_id'] ?? 0);
    $stepNumber = (int)($data['step_number'] ?? 0);
    $action = strtolower(trim((string)($data['action'] ?? '')));
    if ($taskId <= 0 || $stepNumber <= 0) {
        respond(422, ['success' => false, 'message' => 'task_id and step_number are required']);
    }
    if (!in_array($action, ['mark_read', 'response', 'upload'], true)) {
        respond(422, ['success' => false, 'message' => 'Invalid action']);
    }

    $task = taskStepActivityFetchTask($conn, $taskId);
    if (!$task) {
        respond(404, ['success' => false, 'message' => 'Task not found']);
    }

    $isStaff = taskStepActivityCanStaffAccess($sessionUser, $task);
    $isClient = taskStepActivityCanClientAccess($sessionUser, $task);
    if (!$isStaff && !$isClient) {
        monitoring_auth_respond(403, ['success' => false, 'message' => 'Access denied.']);
    }
    if ($action === 'mark_read' && !$isStaff) {
        monitoring_auth_respond(403, ['success' => false, 'message' => 'Only staff can mark a step as read.']);
    }

    $description = (string)($task['description'] ?? '');
    $readAt = taskStepActivityReadMeta($description, 'StepReadAt', $stepNumber);
    if ($isClient && in_array($action, ['response', 'upload'], true) && $readAt === '') {
        monitoring_auth_respond(403, [
            'success' => false,
            'message' => 'You can respond after this step is marked as read.',
        ]);
    }

    $now = taskStepActivityNow();
    $actor = [
        'id' => (int)($sessionUser['id'] ?? 0),
        'name' => taskStepActivityBuildPersonName($sessionUser),
        'role' => taskStepActivityRoleLabel($sessionUser),
    ];

    if ($action === 'mark_read') {
        $continueAt = taskStepActivityNormalizeDateTime($data['continue_at'] ?? '');
        $description = taskStepActivityUpdateMeta($description, 'StepReadAt', $stepNumber, $now);
        $description = taskStepActivityUpdateMeta($description, 'StepContinueAt', $stepNumber, $continueAt);
        $description = taskStepActivityAppend($description, $stepNumber, [
            'type' => 'read',
            'created_at' => $now,
            'continue_at' => $continueAt,
            'actor' => $actor,
        ]);
    } elseif ($action === 'response') {
        $responseText = trim((string)($data['response'] ?? ''));
        if ($responseText === '') {
            respond(422, ['success' => false, 'message' => 'Response is required']);
        }
        $responseLength = function_exists('mb_strlen') ? mb_strlen($responseText) : strlen($responseText);
        if ($responseLength > 1000) {
            respond(422, ['success' => false, 'message' => 'Response must be 1000 characters or fewer']);
        }
        $description = taskStepActivityAppend($description, $stepNumber, [
            'type' => 'response',
            'text' => $responseText,
            'created_at' => $now,
            'actor' => $actor,
        ]);
    } else {
        if (!isset($_FILES['file'])) {
            respond(400, ['success' => false, 'message' => 'No file uploaded']);
        }
        $fileInfo = taskStepActivityStoreFile($_FILES['file'], $taskId, $stepNumber);
        $description = taskStepActivityAppend($description, $stepNumber, [
            'type' => 'file',
            'file' => $fileInfo,
            'created_at' => $now,
            'actor' => $actor,
        ]);
    }

    $update = $conn->prepare(
        'UPDATE client_services
         SET Steps = :steps
         WHERE Client_services_ID = :id'
    );
    $update->execute([
        ':steps' => $description,
        ':id' => $taskId,
    ]);

    $updated = taskStepActivityFetchTask($conn, $taskId);
    respond(200, [
        'success' => true,
        'message' => 'Step update saved.',
        'task' => [
            'id' => $taskId,
            'task_id' => $taskId,
            'title' => $updated['name'] ?? $task['name'] ?? null,
            'name' => $updated['name'] ?? $task['name'] ?? null,
            'description' => (string)($updated['description'] ?? $description),
            'client_id' => isset($updated['client_id']) ? (int)$updated['client_id'] : null,
            'accountant_id' => isset($updated['accountant_id']) ? (int)$updated['accountant_id'] : null,
        ],
    ]);
} catch (InvalidArgumentException $e) {
    respond(422, ['success' => false, 'message' => $e->getMessage()]);
} catch (Throwable $e) {
    error_log('task_step_activity error: ' . $e->getMessage());
    respond(500, ['success' => false, 'message' => 'Server error']);
}
