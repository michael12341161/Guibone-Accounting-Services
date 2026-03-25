<?php
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/connection-pdo.php';
require_once __DIR__ . '/client_service_access.php';

monitoring_bootstrap_api(['POST', 'OPTIONS']);

function respond($code, $payload) {
    http_response_code($code);
    echo json_encode($payload);
    exit;
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

function upsertMetaLine(string $description, string $tag, string $value): string {
    $lines = preg_split('/\R/', $description);
    $next = [];
    $found = false;
    foreach ($lines as $line) {
        if (preg_match('/^\s*\[' . preg_quote($tag, '/') . '\]\s*/i', (string)$line)) {
            if (!$found) {
                $next[] = '[' . $tag . '] ' . $value;
                $found = true;
            }
            continue;
        }
        $next[] = $line;
    }
    if (!$found) {
        $next[] = '[' . $tag . '] ' . $value;
    }
    return implode("\n", $next);
}

function ensureProgressTag(string $description): string {
    if (preg_match('/^\s*\[Progress\]\s*\d{1,3}\s*$/mi', $description)) {
        return $description;
    }
    $description = trim($description);
    return $description !== '' ? ("[Progress] 0\n" . $description) : '[Progress] 0';
}

function extractProgress(string $description): int {
    if (preg_match('/^\s*\[Progress\]\s*(\d{1,3})\s*$/mi', $description, $m)) {
        $value = (int)$m[1];
        if ($value < 0) {
            return 0;
        }
        if ($value > 100) {
            return 100;
        }
        return $value;
    }
    return 0;
}

function setProgress(string $description, int $progress): string {
    $progress = max(0, min(100, $progress));
    $lines = preg_split('/\R/', $description);
    $next = [];
    $found = false;
    foreach ($lines as $line) {
        if (preg_match('/^\s*\[Progress\]\s*\d{1,3}\s*$/i', (string)$line)) {
            if (!$found) {
                $next[] = '[Progress] ' . $progress;
                $found = true;
            }
            continue;
        }
        $next[] = $line;
    }
    while (!empty($next) && trim((string)$next[0]) === '') {
        array_shift($next);
    }
    while (!empty($next) && trim((string)$next[count($next) - 1]) === '') {
        array_pop($next);
    }
    if (!$found) {
        array_unshift($next, '[Progress] ' . $progress);
    }
    return implode("\n", $next);
}

function fetchTask(PDO $conn, int $taskId): ?array {
    $stmt = $conn->prepare(
        'SELECT
            cs.Client_services_ID AS id,
            cs.Name AS name,
            COALESCE(cs.Steps, "") AS description,
            cs.Date AS due_date,
            cs.Status_ID AS status_id,
            st.Status_name AS status_name,
            cs.Client_ID AS client_id,
            cs.Services_type_Id AS service_id,
            s.Name AS service_name,
            cs.User_ID AS accountant_id,
            u.Username AS accountant_name,
            CONCAT_WS(" ", c.First_name, c.Middle_name, c.Last_name) AS client_name
         FROM client_services cs
         LEFT JOIN status st ON st.Status_id = cs.Status_ID
         LEFT JOIN services_type s ON s.Services_type_Id = cs.Services_type_Id
         LEFT JOIN user u ON u.User_id = cs.User_ID
         LEFT JOIN client c ON c.Client_ID = cs.Client_ID
         WHERE cs.Client_services_ID = :id
         LIMIT 1'
    );
    $stmt->execute([':id' => $taskId]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    return $row ?: null;
}

function normalizeTaskStatus(string $statusName, string $description): string {
    if (preg_match('/^\s*\[Declined reason\]\s*/mi', $description)) {
        return 'Declined';
    }
    if (preg_match('/^\s*\[Done\]\s*$/mi', $description)) {
        return 'Completed';
    }

    $status = strtolower(trim($statusName));
    if ($status === 'cancelled' || $status === 'declined' || $status === 'canceled') {
        return 'Declined';
    }
    if ($status === 'completed' || $status === 'done') {
        return 'Completed';
    }
    if ($status === 'in progress' || $status === 'started') {
        return 'In Progress';
    }
    if ($status === 'not started' || $status === 'pending' || $status === '') {
        return 'Not Started';
    }
    return $statusName !== '' ? $statusName : 'Not Started';
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    respond(405, ['success' => false, 'message' => 'Method not allowed']);
}

try {
    $sessionUser = monitoring_require_auth();
    $conn->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

    $raw = file_get_contents('php://input');
    $data = json_decode($raw, true);
    if (!is_array($data)) {
        respond(400, ['success' => false, 'message' => 'Invalid JSON payload']);
    }

    $taskId = isset($data['task_id']) ? (int)$data['task_id'] : 0;
    if ($taskId <= 0) {
        respond(422, ['success' => false, 'message' => 'task_id is required']);
    }

    $statusInput = isset($data['status']) ? trim((string)$data['status']) : '';
    if (strcasecmp($statusInput, 'Decline') === 0) {
        $statusInput = 'Declined';
    }

    $hasAccountant = array_key_exists('accountant_id', $data);
    $hasClient = array_key_exists('client_id', $data);
    $hasService = array_key_exists('service', $data) && trim((string)$data['service']) !== '';
    $hasDeadline = array_key_exists('deadline', $data);
    $hasDescription = array_key_exists('description', $data);
    $hasProgressAdd = array_key_exists('progress_add', $data);
    $hasStatus = $statusInput !== '';

    if (!$hasAccountant && !$hasClient && !$hasService && !$hasDeadline && !$hasDescription && !$hasProgressAdd && !$hasStatus) {
        respond(422, ['success' => false, 'message' => 'No update fields were provided']);
    }

    $task = fetchTask($conn, $taskId);
    if (!$task) {
        respond(404, ['success' => false, 'message' => 'Task not found']);
    }

    if (monitoring_user_has_any_role($sessionUser, [MONITORING_ROLE_ACCOUNTANT])) {
        if ((int)($task['accountant_id'] ?? 0) !== (int)$sessionUser['id']) {
            monitoring_auth_respond(403, ['success' => false, 'message' => 'Access denied.']);
        }
    } elseif (!monitoring_user_has_any_role($sessionUser, [MONITORING_ROLE_ADMIN, MONITORING_ROLE_SECRETARY])) {
        monitoring_auth_respond(403, ['success' => false, 'message' => 'Access denied.']);
    }

    $notStartedId = resolveStatusId($conn, 'TASK', 'Not Started', 10);
    $inProgressId = resolveStatusId($conn, 'TASK', 'In Progress', 11);
    $completedId = resolveStatusId($conn, 'TASK', 'Completed', 12);
    $cancelledId = resolveStatusId($conn, 'TASK', 'Cancelled', 13);

    $currentDescription = (string)$task['description'];
    $currentStatusId = isset($task['status_id']) ? (int)$task['status_id'] : $notStartedId;
    $currentClientId = isset($task['client_id']) ? (int)$task['client_id'] : 0;
    $currentServiceId = isset($task['service_id']) ? (int)$task['service_id'] : 0;
    $currentServiceName = isset($task['service_name']) ? trim((string)$task['service_name']) : '';

    $conn->beginTransaction();

    if ($hasAccountant) {
        $accountantId = (int)$data['accountant_id'];
        if ($accountantId > 0) {
            $checkUser = $conn->prepare('SELECT User_id FROM user WHERE User_id = :id LIMIT 1');
            $checkUser->execute([':id' => $accountantId]);
            if (!$checkUser->fetchColumn()) {
                $conn->rollBack();
                respond(422, ['success' => false, 'message' => 'Invalid accountant_id']);
            }
        }
        $updTaskUser = $conn->prepare('UPDATE client_services SET User_ID = :uid WHERE Client_services_ID = :id');
        $updTaskUser->execute([
            ':uid' => ($accountantId > 0 ? $accountantId : null),
            ':id' => $taskId,
        ]);
    }

    if ($hasClient) {
        $newClientId = (int)$data['client_id'];
        if ($newClientId <= 0) {
            $conn->rollBack();
            respond(422, ['success' => false, 'message' => 'Invalid client_id']);
        }
        $checkClient = $conn->prepare('SELECT Client_ID FROM client WHERE Client_ID = :id LIMIT 1');
        $checkClient->execute([':id' => $newClientId]);
        if (!$checkClient->fetchColumn()) {
            $conn->rollBack();
            respond(404, ['success' => false, 'message' => 'Client not found']);
        }
        $updClient = $conn->prepare('UPDATE client_services SET Client_ID = :cid WHERE Client_services_ID = :id');
        $updClient->execute([':cid' => $newClientId, ':id' => $taskId]);
        $currentClientId = $newClientId;
    }

    if ($hasService) {
        $serviceName = trim((string)$data['service']);
        $serviceLookup = $conn->prepare('SELECT Services_type_Id FROM services_type WHERE Name = :name LIMIT 1');
        $serviceLookup->execute([':name' => $serviceName]);
        $newServiceId = (int)($serviceLookup->fetchColumn() ?: 0);
        if ($newServiceId <= 0) {
            $conn->rollBack();
            respond(422, ['success' => false, 'message' => 'Invalid service. Select a service from the list.']);
        }

        $updTaskService = $conn->prepare('UPDATE client_services SET Services_type_Id = :sid WHERE Client_services_ID = :id');
        $updTaskService->execute([':sid' => $newServiceId, ':id' => $taskId]);
        $currentServiceId = $newServiceId;
        $currentServiceName = $serviceName;
    }

    if ($hasDeadline) {
        $deadline = trim((string)$data['deadline']);
        if ($deadline === '') {
            $updDate = $conn->prepare('UPDATE client_services SET Date = NULL WHERE Client_services_ID = :id');
            $updDate->execute([':id' => $taskId]);
        } elseif (preg_match('/^\d{4}-\d{2}-\d{2}$/', $deadline)) {
            $updDate = $conn->prepare('UPDATE client_services SET Date = :d WHERE Client_services_ID = :id');
            $updDate->execute([':d' => $deadline, ':id' => $taskId]);
            $currentDescription = upsertMetaLine($currentDescription, 'Deadline', $deadline);
        } else {
            $currentDescription = upsertMetaLine($currentDescription, 'Deadline', $deadline);
        }
    }

    if ($hasDescription) {
        $incomingDescription = trim((string)$data['description']);
        $currentDescription = ensureProgressTag($incomingDescription);
    } else {
        $currentDescription = ensureProgressTag($currentDescription);
    }

    if ($hasProgressAdd) {
        $progressAdd = (int)$data['progress_add'];
        $next = extractProgress($currentDescription) + $progressAdd;
        $next = max(0, min(100, $next));
        $currentDescription = setProgress($currentDescription, $next);
        if ($currentStatusId === $notStartedId && $next > 0) {
            $currentStatusId = $inProgressId;
        }
    }

    if ($hasStatus) {
        $normalizedStatus = strtolower($statusInput);
        $reason = isset($data['reason']) ? trim((string)$data['reason']) : '';

        if ($normalizedStatus === 'done' || $normalizedStatus === 'completed') {
            $currentStatusId = $completedId;
            if (!preg_match('/^\s*\[Done\]\s*$/mi', $currentDescription)) {
                $currentDescription = trim($currentDescription);
                $currentDescription = $currentDescription !== '' ? ($currentDescription . "\n[Done]") : '[Done]';
            }
        } elseif ($normalizedStatus === 'declined' || $normalizedStatus === 'cancelled' || $normalizedStatus === 'canceled') {
            $currentStatusId = $cancelledId;
            if (!preg_match('/^\s*\[Declined reason\]\s*/mi', $currentDescription)) {
                $declineText = $reason !== '' ? $reason : 'Declined';
                $currentDescription = trim($currentDescription);
                $currentDescription = $currentDescription !== ''
                    ? ($currentDescription . "\n[Declined reason] " . $declineText)
                    : ('[Declined reason] ' . $declineText);
            }
        } elseif ($normalizedStatus === 'in progress' || $normalizedStatus === 'started' || $normalizedStatus === 'start') {
            $currentStatusId = $inProgressId;
        } elseif ($normalizedStatus === 'not started' || $normalizedStatus === 'pending') {
            $currentStatusId = $notStartedId;
        } else {
            // Backward compatibility: allow service name via status field.
            $serviceLookup = $conn->prepare('SELECT Services_type_Id FROM services_type WHERE Name = :name LIMIT 1');
            $serviceLookup->execute([':name' => $statusInput]);
            $serviceIdFromStatus = (int)($serviceLookup->fetchColumn() ?: 0);
            if ($serviceIdFromStatus <= 0) {
                $conn->rollBack();
                respond(422, ['success' => false, 'message' => 'Invalid status']);
            }
            $updTaskService = $conn->prepare('UPDATE client_services SET Services_type_Id = :sid WHERE Client_services_ID = :id');
            $updTaskService->execute([':sid' => $serviceIdFromStatus, ':id' => $taskId]);
            $currentServiceId = $serviceIdFromStatus;
            $currentServiceName = $statusInput;
        }
    }

    if (
        $currentClientId > 0
        && $currentServiceName !== ''
        && !monitoring_client_business_is_registered($conn, $currentClientId)
        && !monitoring_service_name_is_processing($currentServiceName)
    ) {
        $conn->rollBack();
        respond(422, [
            'success' => false,
            'message' => 'Only Processing is available until the client business permit is uploaded and the business is registered.',
            'allowed_services' => ['Processing'],
        ]);
    }

    $updTask = $conn->prepare(
        'UPDATE client_services
         SET Steps = :steps,
             Status_ID = :sid
         WHERE Client_services_ID = :id'
    );
    $updTask->execute([
        ':steps' => $currentDescription,
        ':sid' => $currentStatusId,
        ':id' => $taskId,
    ]);

    $conn->commit();

    $updated = fetchTask($conn, $taskId);
    if (!$updated) {
        respond(404, ['success' => false, 'message' => 'Task not found after update']);
    }

    $descriptionOut = (string)$updated['description'];
    $deadline = '';
    if (preg_match('/^\s*\[Deadline\]\s*([^\r\n]+)\s*$/mi', $descriptionOut, $m)) {
        $deadline = trim((string)$m[1]);
    } elseif (!empty($updated['due_date'])) {
        $deadline = (string)$updated['due_date'];
    }

    $statusOut = normalizeTaskStatus((string)($updated['status_name'] ?? ''), $descriptionOut);

    respond(200, [
        'success' => true,
        'task' => [
            'id' => isset($updated['id']) ? (int)$updated['id'] : null,
            'task_id' => isset($updated['id']) ? (int)$updated['id'] : null,
            'task_ref_id' => null,
            'title' => $updated['name'] ?? null,
            'name' => $updated['name'] ?? null,
            'description' => $descriptionOut,
            'status' => $statusOut,
            'service' => $updated['service_name'] ?? null,
            'deadline' => $deadline !== '' ? $deadline : null,
            'due_date' => $deadline !== '' ? $deadline : ($updated['due_date'] ?? null),
            'client_id' => isset($updated['client_id']) ? (int)$updated['client_id'] : null,
            'client_name' => $updated['client_name'] ?? null,
            'accountant_id' => isset($updated['accountant_id']) ? (int)$updated['accountant_id'] : null,
            'accountant_name' => $updated['accountant_name'] ?? null,
        ],
    ]);
} catch (Throwable $e) {
    if (isset($conn) && $conn instanceof PDO && $conn->inTransaction()) {
        $conn->rollBack();
    }
    respond(500, ['success' => false, 'message' => 'Server error', 'error' => $e->getMessage()]);
}
