<?php
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/status_helpers.php';

const MONITORING_TASK_DEADLINE_SOON_DAYS = 1;
const MONITORING_TASK_DEADLINE_TIMEZONE = 'Asia/Manila';
const MONITORING_TASK_ARCHIVED_TAG_RE = '/^\s*\[(?:Archived|SecretaryArchived)\]\s*(?:1|true|yes)?\s*$/im';
const MONITORING_TASK_DONE_TAG_RE = '/^\s*\[Done\]\s*$/im';
const MONITORING_TASK_DECLINED_RE = '/^\s*\[Declined reason\]\s*/im';
const MONITORING_TASK_PROGRESS_RE = '/^\s*\[Progress\]\s*(\d{1,3})\s*$/im';

function monitoring_task_deadline_timezone(): DateTimeZone
{
    static $timezone = null;
    if ($timezone instanceof DateTimeZone) {
        return $timezone;
    }

    try {
        $timezone = new DateTimeZone(MONITORING_TASK_DEADLINE_TIMEZONE);
    } catch (Throwable $__) {
        $timezone = new DateTimeZone('UTC');
    }

    return $timezone;
}

function monitoring_task_deadline_today(): DateTimeImmutable
{
    return (new DateTimeImmutable('now', monitoring_task_deadline_timezone()))->setTime(0, 0, 0);
}

function monitoring_task_deadline_read_meta_line(string $source, string $key): string
{
    $pattern = '/^\s*\[' . preg_quote($key, '/') . '\]\s*([^\r\n]*)\s*$/im';
    if (preg_match($pattern, $source, $matches)) {
        return trim((string)($matches[1] ?? ''));
    }

    return '';
}

function monitoring_task_deadline_is_archived(string $description): bool
{
    return preg_match(MONITORING_TASK_ARCHIVED_TAG_RE, $description) === 1;
}

function monitoring_task_deadline_extract_progress(string $description): int
{
    if (preg_match(MONITORING_TASK_PROGRESS_RE, $description, $matches)) {
        $value = (int)($matches[1] ?? 0);
        return max(0, min(100, $value));
    }

    return 0;
}

function monitoring_task_deadline_is_closed(string $statusName, string $description): bool
{
    if (preg_match(MONITORING_TASK_DONE_TAG_RE, $description) === 1) {
        return true;
    }
    if (preg_match(MONITORING_TASK_DECLINED_RE, $description) === 1) {
        return true;
    }

    return monitoring_status_matches($statusName, ['Completed', 'Done', 'Declined', 'Cancelled', 'Canceled']);
}

function monitoring_task_deadline_is_overdue_status(string $statusName): bool
{
    return monitoring_status_matches($statusName, ['Overdue']);
}

function monitoring_task_deadline_baseline_status(string $statusName, string $description): string
{
    if (preg_match(MONITORING_TASK_DONE_TAG_RE, $description) === 1) {
        return 'Completed';
    }
    if (preg_match(MONITORING_TASK_DECLINED_RE, $description) === 1) {
        return 'Declined';
    }

    if (monitoring_status_matches($statusName, ['Completed', 'Done'])) {
        return 'Completed';
    }
    if (monitoring_status_matches($statusName, ['Declined', 'Cancelled', 'Canceled'])) {
        return 'Declined';
    }
    if (monitoring_status_matches($statusName, ['Incomplete'])) {
        return 'Incomplete';
    }
    if (monitoring_status_matches($statusName, ['In Progress', 'Started'])) {
        return 'In Progress';
    }
    if (monitoring_status_matches($statusName, ['Not Started', 'Pending'])) {
        return 'Not Started';
    }

    $progress = monitoring_task_deadline_extract_progress($description);
    if ($progress >= 100) {
        return 'Incomplete';
    }
    if ($progress > 0) {
        return 'In Progress';
    }

    return 'Not Started';
}

function monitoring_task_deadline_due_raw(array $row): string
{
    $dueDate = trim((string)($row['due_date'] ?? ''));
    if ($dueDate !== '') {
        return $dueDate;
    }

    return monitoring_task_deadline_read_meta_line((string)($row['description'] ?? ''), 'Deadline');
}

function monitoring_task_deadline_parse_date(?string $value): ?DateTimeImmutable
{
    $text = trim((string)$value);
    if ($text === '' || $text === '-') {
        return null;
    }

    $timezone = monitoring_task_deadline_timezone();
    $formats = ['!Y-m-d', '!Y/m/d', '!d/m/Y', '!d-m-Y', '!m/d/Y', '!m-d-Y'];
    foreach ($formats as $format) {
        $parsed = DateTimeImmutable::createFromFormat($format, $text, $timezone);
        if ($parsed instanceof DateTimeImmutable) {
            return $parsed->setTime(0, 0, 0);
        }
    }

    try {
        return (new DateTimeImmutable($text, $timezone))->setTime(0, 0, 0);
    } catch (Throwable $__) {
        return null;
    }
}

function monitoring_task_deadline_days_until(DateTimeImmutable $dueDate, DateTimeImmutable $today): int
{
    return (int)$today->diff($dueDate)->format('%r%a');
}

function monitoring_task_deadline_recipient_ids(PDO $conn, array $row): array
{
    static $staffIds = null;

    if (!is_array($staffIds)) {
        $staffIds = [];
        $stmt = $conn->prepare(
            'SELECT User_id, Role_id
             FROM user
             WHERE Role_id IN (:admin_role, :secretary_role)'
        );
        $stmt->bindValue(':admin_role', MONITORING_ROLE_ADMIN, PDO::PARAM_INT);
        $stmt->bindValue(':secretary_role', MONITORING_ROLE_SECRETARY, PDO::PARAM_INT);
        $stmt->execute();
        foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) ?: [] as $staffRow) {
            $userId = (int)($staffRow['User_id'] ?? 0);
            if ($userId <= 0) {
                continue;
            }
            $staffIds[] = $userId;
        }
    }

    $recipientIds = $staffIds;
    $assigneeId = (int)($row['assignee_id'] ?? 0);
    if ($assigneeId > 0) {
        $recipientIds[] = $assigneeId;
    }

    $partnerId = (int)monitoring_task_deadline_read_meta_line((string)($row['description'] ?? ''), 'PartnerId');
    if ($partnerId > 0) {
        $recipientIds[] = $partnerId;
    }

    return array_values(array_unique(array_filter($recipientIds, static fn($id) => (int)$id > 0)));
}

function monitoring_task_deadline_notification_exists(PDO $conn, int $userId, string $type): bool
{
    static $cache = [];

    $cacheKey = $userId . '|' . $type;
    if (array_key_exists($cacheKey, $cache)) {
        return $cache[$cacheKey];
    }

    $stmt = $conn->prepare(
        'SELECT 1
         FROM notifications
         WHERE user_id = :uid
           AND type = :type
         LIMIT 1'
    );
    $stmt->execute([
        ':uid' => $userId,
        ':type' => $type,
    ]);

    $exists = $stmt->fetchColumn() !== false;
    $cache[$cacheKey] = $exists;
    return $exists;
}

function monitoring_task_deadline_insert_notification(PDO $conn, int $userId, string $type, string $message): bool
{
    if ($userId <= 0 || trim($message) === '' || trim($type) === '') {
        return false;
    }
    if (monitoring_task_deadline_notification_exists($conn, $userId, $type)) {
        return false;
    }

    $stmt = $conn->prepare(
        'INSERT INTO notifications (user_id, sender_id, type, message, is_read)
         VALUES (:uid, NULL, :type, :message, 0)'
    );
    $stmt->execute([
        ':uid' => $userId,
        ':type' => $type,
        ':message' => $message,
    ]);

    return true;
}

function monitoring_task_deadline_format_label(?DateTimeImmutable $dueDate, string $dueRaw): string
{
    if ($dueDate instanceof DateTimeImmutable) {
        return $dueDate->format('F j, Y');
    }

    return trim($dueRaw) !== '' ? trim($dueRaw) : '-';
}

function monitoring_task_deadline_message(array $row, string $kind, string $deadlineLabel): string
{
    $taskLabel = trim((string)($row['task_name'] ?? ''));
    if ($taskLabel === '') {
        $taskLabel = 'Untitled task';
    }

    $clientLabel = trim((string)($row['client_name'] ?? ''));
    if ($clientLabel === '') {
        $clientLabel = 'Unknown client';
    }

    if ($kind === 'soon') {
        return "\xE2\x9A\xA0\xEF\xB8\x8F Task nearing deadline: {$taskLabel} (Client: {$clientLabel}) \xE2\x80\x94 Due {$deadlineLabel}";
    }

    $intro = 'Your task is close to the deadline.';
    if ($kind === 'today') {
        $intro = 'Your task deadline is today.';
    } elseif ($kind === 'overdue') {
        $intro = 'Your task is overdue.';
    }

    $assigneeLabel = trim((string)($row['assignee_name'] ?? ''));
    $lines = [
        $intro,
        'Task: ' . $taskLabel,
        'Client: ' . $clientLabel,
        'Deadline: ' . $deadlineLabel,
    ];

    if ($assigneeLabel !== '') {
        $lines[] = 'Assigned to: ' . $assigneeLabel;
    }

    return implode("\n", $lines);
}

function monitoring_task_deadline_notification_type(int $taskId, string $kind, string $dueDateKey): string
{
    return 'task_deadline_' . $kind . ':' . $taskId . ':' . $dueDateKey;
}

function monitoring_task_deadline_parse_notification_type(string $type): ?array
{
    $value = trim($type);
    if ($value === '') {
        return null;
    }

    if (!preg_match('/^task_deadline_(soon|today|overdue):(\d+):(.+)$/i', $value, $matches)) {
        return null;
    }

    $taskId = (int)($matches[2] ?? 0);
    if ($taskId <= 0) {
        return null;
    }

    return [
        'kind' => strtolower((string)($matches[1] ?? '')),
        'task_id' => $taskId,
        'due_date_key' => trim((string)($matches[3] ?? '')),
    ];
}

function monitoring_task_deadline_notification_expected_kind(DateTimeImmutable $dueDate, DateTimeImmutable $today, string $statusName = ''): ?string
{
    if (monitoring_task_deadline_is_overdue_status($statusName)) {
        return 'overdue';
    }

    $daysUntilDue = monitoring_task_deadline_days_until($dueDate, $today);
    if ($daysUntilDue < 0) {
        return 'overdue';
    }
    if ($daysUntilDue === 0) {
        return 'today';
    }
    if ($daysUntilDue > 0 && $daysUntilDue <= MONITORING_TASK_DEADLINE_SOON_DAYS) {
        return 'soon';
    }

    return null;
}

function monitoring_task_deadline_load_task_rows(PDO $conn, array $taskIds): array
{
    $normalizedIds = array_values(array_unique(array_filter(array_map('intval', $taskIds), static fn($id) => $id > 0)));
    if (!$normalizedIds) {
        return [];
    }

    $placeholders = [];
    $params = [];
    foreach ($normalizedIds as $index => $taskId) {
        $key = ':task_' . $index;
        $placeholders[] = $key;
        $params[$key] = $taskId;
    }

    $stmt = $conn->prepare(
        'SELECT cs.Client_services_ID AS task_id,
                COALESCE(cs.Steps, "") AS description,
                cs.Date AS due_date,
                st.Status_name AS status_name
         FROM client_services cs
         LEFT JOIN status st ON st.Status_id = cs.Status_ID
         WHERE cs.Client_services_ID IN (' . implode(', ', $placeholders) . ')'
    );
    foreach ($params as $key => $value) {
        $stmt->bindValue($key, $value, PDO::PARAM_INT);
    }
    $stmt->execute();

    $rowsByTaskId = [];
    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) ?: [] as $row) {
        $taskId = (int)($row['task_id'] ?? 0);
        if ($taskId <= 0) {
            continue;
        }
        $rowsByTaskId[$taskId] = $row;
    }

    return $rowsByTaskId;
}

function monitoring_filter_current_task_deadline_notifications(PDO $conn, array $notifications): array
{
    if (!$notifications) {
        return [];
    }

    $parsedTypes = [];
    $taskIds = [];
    foreach ($notifications as $index => $notification) {
        $parsed = monitoring_task_deadline_parse_notification_type((string)($notification['type'] ?? ''));
        $parsedTypes[$index] = $parsed;
        if ($parsed !== null) {
            $taskIds[] = (int)$parsed['task_id'];
        }
    }

    if (!$taskIds) {
        return $notifications;
    }

    $rowsByTaskId = monitoring_task_deadline_load_task_rows($conn, $taskIds);
    $today = monitoring_task_deadline_today();
    $filtered = [];

    foreach ($notifications as $index => $notification) {
        $parsed = $parsedTypes[$index] ?? null;
        if ($parsed === null) {
            $filtered[] = $notification;
            continue;
        }

        $taskId = (int)($parsed['task_id'] ?? 0);
        $taskRow = $rowsByTaskId[$taskId] ?? null;
        if (!is_array($taskRow)) {
            continue;
        }

        $description = (string)($taskRow['description'] ?? '');
        if (monitoring_task_deadline_is_archived($description)) {
            continue;
        }

        $statusName = (string)($taskRow['status_name'] ?? '');
        if (monitoring_task_deadline_is_closed($statusName, $description)) {
            continue;
        }

        $dueRaw = monitoring_task_deadline_due_raw($taskRow);
        $dueDate = monitoring_task_deadline_parse_date($dueRaw);
        if (!$dueDate instanceof DateTimeImmutable) {
            continue;
        }

        $expectedKind = monitoring_task_deadline_notification_expected_kind($dueDate, $today, $statusName);
        if ($expectedKind === null || $expectedKind !== (string)($parsed['kind'] ?? '')) {
            continue;
        }

        if ($dueDate->format('Y-m-d') !== (string)($parsed['due_date_key'] ?? '')) {
            continue;
        }

        $filtered[] = $notification;
    }

    return $filtered;
}

function monitoring_task_deadline_status_ids(PDO $conn): array
{
    static $cache = null;
    if (is_array($cache)) {
        return $cache;
    }

    $overdueId = (int)(monitoring_resolve_status_id($conn, 'TASK', ['Overdue']) ?: 0);

    $cache = [
        'Not Started' => (int)(monitoring_resolve_status_id($conn, 'TASK', ['Not Started', 'Pending']) ?: 0),
        'In Progress' => (int)(monitoring_resolve_status_id($conn, 'TASK', ['In Progress', 'Started']) ?: 0),
        'Incomplete' => (int)(monitoring_resolve_status_id($conn, 'TASK', ['Incomplete']) ?: 0),
        'Completed' => (int)(monitoring_resolve_status_id($conn, 'TASK', ['Completed', 'Done']) ?: 0),
        'Declined' => (int)(monitoring_resolve_status_id($conn, 'TASK', ['Declined', 'Cancelled', 'Canceled']) ?: 0),
        'Overdue' => (int)$overdueId,
    ];

    return $cache;
}

function monitoring_task_deadline_apply_status(PDO $conn, int $taskId, int $currentStatusId, int $targetStatusId): bool
{
    if ($taskId <= 0 || $targetStatusId <= 0 || $currentStatusId === $targetStatusId) {
        return false;
    }

    $stmt = $conn->prepare(
        'UPDATE client_services
         SET Status_ID = :sid
         WHERE Client_services_ID = :id'
    );
    $stmt->execute([
        ':sid' => $targetStatusId,
        ':id' => $taskId,
    ]);

    return true;
}

function monitoring_run_task_deadline_monitor(PDO $conn): array
{
    $summary = [
        'soon' => 0,
        'today' => 0,
        'overdue' => 0,
        'status_updates' => 0,
        'notifications' => 0,
    ];

    $statusIds = monitoring_task_deadline_status_ids($conn);
    $today = monitoring_task_deadline_today();

    $stmt = $conn->query(
        'SELECT cs.Client_services_ID AS task_id,
                cs.Name AS task_name,
                COALESCE(cs.Steps, "") AS description,
                cs.Date AS due_date,
                cs.Status_ID AS status_id,
                st.Status_name AS status_name,
                cs.Client_ID AS client_id,
                cs.User_ID AS assignee_id,
                NULLIF(TRIM(CONCAT_WS(" ", c.First_name, c.Middle_name, c.Last_name)), "") AS client_name,
                NULLIF(TRIM(CONCAT_WS(" ", u.first_name, u.middle_name, u.last_name)), "") AS assignee_full_name,
                u.Username AS assignee_username
         FROM client_services cs
         LEFT JOIN status st ON st.Status_id = cs.Status_ID
         LEFT JOIN client c ON c.Client_ID = cs.Client_ID
         LEFT JOIN user u ON u.User_id = cs.User_ID'
    );
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];

    foreach ($rows as $row) {
        $taskId = (int)($row['task_id'] ?? 0);
        if ($taskId <= 0) {
            continue;
        }

        $description = (string)($row['description'] ?? '');
        if (monitoring_task_deadline_is_archived($description)) {
            continue;
        }

        $dueRaw = monitoring_task_deadline_due_raw($row);
        $dueDate = monitoring_task_deadline_parse_date($dueRaw);
        if (!$dueDate instanceof DateTimeImmutable) {
            continue;
        }

        $statusName = (string)($row['status_name'] ?? '');
        $currentStatusId = (int)($row['status_id'] ?? 0);
        $currentStatusKey = monitoring_normalize_status_key($statusName);
        $baselineStatus = monitoring_task_deadline_baseline_status($statusName, $description);
        $isClosed = monitoring_task_deadline_is_closed($statusName, $description);
        $isMarkedOverdue = monitoring_task_deadline_is_overdue_status($statusName);
        $daysUntilDue = monitoring_task_deadline_days_until($dueDate, $today);

        $targetStatusLabel = null;
        if ($isClosed && $currentStatusKey === 'overdue') {
            $targetStatusLabel = $baselineStatus;
        } elseif (!$isClosed && $daysUntilDue < 0) {
            $targetStatusLabel = 'Overdue';
        } elseif (!$isClosed && $currentStatusKey === 'overdue' && $daysUntilDue > 0) {
            $targetStatusLabel = $baselineStatus;
        }

        if ($targetStatusLabel !== null) {
            $targetStatusId = (int)($statusIds[$targetStatusLabel] ?? 0);
            if ($targetStatusId > 0 && monitoring_task_deadline_apply_status($conn, $taskId, $currentStatusId, $targetStatusId)) {
                $summary['status_updates'] += 1;
                $currentStatusId = $targetStatusId;
                $currentStatusKey = monitoring_normalize_status_key($targetStatusLabel);
            }
        }

        if ($isClosed) {
            continue;
        }

        $notificationKind = null;
        if ($daysUntilDue < 0 || $isMarkedOverdue || $currentStatusKey === 'overdue') {
            $notificationKind = 'overdue';
            $summary['overdue'] += 1;
        } elseif ($daysUntilDue === 0) {
            $notificationKind = 'today';
            $summary['today'] += 1;
        } elseif ($daysUntilDue > 0 && $daysUntilDue <= MONITORING_TASK_DEADLINE_SOON_DAYS) {
            $notificationKind = 'soon';
            $summary['soon'] += 1;
        }

        if ($notificationKind === null) {
            continue;
        }

        $row['assignee_name'] = trim((string)($row['assignee_full_name'] ?? ''));
        if ($row['assignee_name'] === '') {
            $row['assignee_name'] = trim((string)($row['assignee_username'] ?? ''));
        }

        $deadlineLabel = monitoring_task_deadline_format_label($dueDate, $dueRaw);
        $notificationType = monitoring_task_deadline_notification_type($taskId, $notificationKind, $dueDate->format('Y-m-d'));
        $message = monitoring_task_deadline_message($row, $notificationKind, $deadlineLabel);

        foreach (monitoring_task_deadline_recipient_ids($conn, $row) as $recipientId) {
            if (monitoring_task_deadline_insert_notification($conn, $recipientId, $notificationType, $message)) {
                $summary['notifications'] += 1;
            }
        }
    }

    return $summary;
}
