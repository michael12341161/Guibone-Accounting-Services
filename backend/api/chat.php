<?php

require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/connection-pdo.php';
require_once __DIR__ . '/module_permission_store.php';

monitoring_bootstrap_api(['GET', 'POST', 'OPTIONS']);

function respond(int $code, array $payload): void
{
    http_response_code($code);
    echo json_encode($payload);
    exit;
}

function quoteIdentifier(string $name): string
{
    return '`' . str_replace('`', '``', $name) . '`';
}

function columnExists(PDO $conn, string $tableName, string $columnName): bool
{
    static $cache = [];
    $cacheKey = strtolower($tableName . '.' . $columnName);
    if (array_key_exists($cacheKey, $cache)) {
        return $cache[$cacheKey];
    }

    try {
        $stmt = $conn->prepare('SHOW COLUMNS FROM ' . quoteIdentifier($tableName) . ' LIKE :column_name');
        $stmt->execute([':column_name' => $columnName]);
        $cache[$cacheKey] = (bool)$stmt->fetch(PDO::FETCH_ASSOC);
        return $cache[$cacheKey];
    } catch (Throwable $__) {
        $cache[$cacheKey] = false;
        return false;
    }
}

function indexExists(PDO $conn, string $tableName, string $indexName): bool
{
    $stmt = $conn->prepare(
        'SELECT 1
         FROM information_schema.STATISTICS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = :table_name
           AND INDEX_NAME = :index_name
         LIMIT 1'
    );
    $stmt->execute([
        ':table_name' => $tableName,
        ':index_name' => $indexName,
    ]);
    return $stmt->fetchColumn() !== false;
}

function ensureIndex(PDO $conn, string $tableName, string $indexName, string $columnListSql): void
{
    if (indexExists($conn, $tableName, $indexName)) {
        return;
    }

    try {
        $conn->exec(
            'CREATE INDEX '
            . quoteIdentifier($indexName)
            . ' ON '
            . quoteIdentifier($tableName)
            . ' '
            . $columnListSql
        );
    } catch (Throwable $error) {
        if (!indexExists($conn, $tableName, $indexName)) {
            throw $error;
        }
    }
}

function constraintExists(PDO $conn, string $tableName, string $constraintName): bool
{
    $stmt = $conn->prepare(
        'SELECT 1
         FROM information_schema.TABLE_CONSTRAINTS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = :table_name
           AND CONSTRAINT_NAME = :constraint_name
         LIMIT 1'
    );
    $stmt->execute([
        ':table_name' => $tableName,
        ':constraint_name' => $constraintName,
    ]);
    return $stmt->fetchColumn() !== false;
}

function foreignKeyExists(
    PDO $conn,
    string $tableName,
    string $columnName,
    string $referencedTable,
    string $referencedColumn
): bool {
    $stmt = $conn->prepare(
        'SELECT 1
         FROM information_schema.KEY_COLUMN_USAGE
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = :table_name
           AND COLUMN_NAME = :column_name
           AND REFERENCED_TABLE_NAME = :referenced_table
           AND REFERENCED_COLUMN_NAME = :referenced_column
         LIMIT 1'
    );
    $stmt->execute([
        ':table_name' => $tableName,
        ':column_name' => $columnName,
        ':referenced_table' => $referencedTable,
        ':referenced_column' => $referencedColumn,
    ]);
    return $stmt->fetchColumn() !== false;
}

function chatPresenceFilePath(): string
{
    return dirname(__DIR__) . '/data/chat_presence.json';
}

function readChatPresenceMap(): array
{
    $path = chatPresenceFilePath();
    if (!is_file($path)) {
        return [];
    }

    $contents = @file_get_contents($path);
    if ($contents === false || trim($contents) === '') {
        return [];
    }

    $decoded = json_decode($contents, true);
    return is_array($decoded) ? $decoded : [];
}

function writeChatPresenceMap(array $presenceMap): void
{
    $path = chatPresenceFilePath();
    $directory = dirname($path);

    if (!is_dir($directory)) {
        @mkdir($directory, 0777, true);
    }

    @file_put_contents(
        $path,
        json_encode($presenceMap, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES),
        LOCK_EX
    );
}

function pruneChatPresenceMap(array $presenceMap, int $maxAgeSeconds = 45): array
{
    $cutoff = time() - max(5, $maxAgeSeconds);
    $nextMap = [];

    foreach ($presenceMap as $userId => $timestamp) {
        $normalizedUserId = (int)$userId;
        $normalizedTimestamp = (int)$timestamp;

        if ($normalizedUserId <= 0 || $normalizedTimestamp < $cutoff) {
            continue;
        }

        $nextMap[(string)$normalizedUserId] = $normalizedTimestamp;
    }

    return $nextMap;
}

function touchChatPresence(int $userId): array
{
    if ($userId <= 0) {
        return [];
    }

    $presenceMap = pruneChatPresenceMap(readChatPresenceMap());
    $presenceMap[(string)$userId] = time();
    writeChatPresenceMap($presenceMap);

    return $presenceMap;
}

function getChatPresenceMap(): array
{
    $presenceMap = pruneChatPresenceMap(readChatPresenceMap());
    writeChatPresenceMap($presenceMap);
    return $presenceMap;
}

function ensureMessagesSchema(PDO $conn): void
{
    monitoring_require_schema_columns(
        $conn,
        'messages',
        ['Message_ID', 'sender_id', 'receiver_id', 'message_text', 'is_read', 'created_at'],
        'chat'
    );

    ensureIndex($conn, 'messages', 'idx_messages_receiver_read', '(`receiver_id`, `is_read`)');
    ensureIndex($conn, 'messages', 'idx_messages_receiver_sender_read', '(`receiver_id`, `sender_id`, `is_read`)');
    ensureIndex($conn, 'messages', 'idx_messages_sender_receiver_message', '(`sender_id`, `receiver_id`, `Message_ID`)');
    ensureIndex($conn, 'messages', 'idx_messages_receiver_sender_message', '(`receiver_id`, `sender_id`, `Message_ID`)');
}

function readPositiveIntValue($value): int
{
    $raw = trim((string)($value ?? ''));
    if ($raw === '' || !ctype_digit($raw)) {
        return 0;
    }

    $normalized = (int)$raw;
    return $normalized > 0 ? $normalized : 0;
}

function normalizeConversationLimit($value, int $default = 80, int $max = 200): int
{
    $normalized = readPositiveIntValue($value);
    if ($normalized <= 0) {
        return $default;
    }

    return min($max, max(1, $normalized));
}

function userExists(PDO $conn, int $userId): bool
{
    $stmt = $conn->prepare('SELECT 1 FROM `user` WHERE `User_id` = :user_id LIMIT 1');
    $stmt->execute([':user_id' => $userId]);
    return $stmt->fetchColumn() !== false;
}

function fetchUserRoleId(PDO $conn, int $userId): ?int
{
    $stmt = $conn->prepare('SELECT Role_id FROM `user` WHERE `User_id` = :user_id LIMIT 1');
    $stmt->execute([':user_id' => $userId]);
    $value = $stmt->fetchColumn();
    if ($value === false) {
        return null;
    }

    return (int)$value;
}

function senderTypeFromRoleId(?int $roleId): string
{
    return $roleId === MONITORING_ROLE_CLIENT ? 'user' : 'admin';
}

function inferSenderType(PDO $conn, int $userId): string
{
    return senderTypeFromRoleId(fetchUserRoleId($conn, $userId));
}

function chatMessagingTargetActionKeyForRoleId(int $roleId): string
{
    $roleKey = monitoring_module_permission_role_key_for_id($roleId);
    return $roleKey !== null && $roleKey !== '' ? 'contact-' . $roleKey : '';
}

function chatMessagingDefaultAccessByRoleKeys(string $senderRoleKey, string $targetRoleKey): bool
{
    $normalizedSenderRoleKey = trim(strtolower($senderRoleKey));
    $normalizedTargetRoleKey = trim(strtolower($targetRoleKey));

    if ($normalizedSenderRoleKey === 'admin') {
        return $normalizedTargetRoleKey !== '';
    }

    if ($normalizedSenderRoleKey === 'secretary' || $normalizedSenderRoleKey === 'accountant') {
        return in_array($normalizedTargetRoleKey, ['admin', 'secretary', 'accountant', 'client'], true);
    }

    if ($normalizedSenderRoleKey === 'client') {
        return in_array($normalizedTargetRoleKey, ['admin', 'secretary', 'accountant'], true);
    }

    return false;
}

function chatMessagingPermissions(PDO $conn): array
{
    static $permissions = null;
    if (is_array($permissions)) {
        return $permissions;
    }

    try {
        $permissions = monitoring_module_permissions_load($conn);
    } catch (Throwable $__) {
        $permissions = [];
    }

    return $permissions;
}

function chatIsRoleAllowedToMessageRole(PDO $conn, int $senderRoleId, int $targetRoleId): bool
{
    if ($senderRoleId <= 0 || $targetRoleId <= 0) {
        return false;
    }

    if ($senderRoleId === MONITORING_ROLE_ADMIN) {
        return true;
    }

    $senderRoleKey = monitoring_module_permission_role_key_for_id($senderRoleId);
    $targetRoleKey = monitoring_module_permission_role_key_for_id($targetRoleId);
    $actionKey = chatMessagingTargetActionKeyForRoleId($targetRoleId);

    if ($senderRoleKey === null || $targetRoleKey === null || $actionKey === '') {
        return false;
    }

    $permissions = chatMessagingPermissions($conn);
    $actionPermissions = $permissions['messaging']['actions'][$actionKey] ?? null;
    if (is_array($actionPermissions) && array_key_exists($senderRoleKey, $actionPermissions)) {
        return !empty($actionPermissions[$senderRoleKey]);
    }

    return chatMessagingDefaultAccessByRoleKeys($senderRoleKey, $targetRoleKey);
}

function chatAllowedPartnerRoleIds(PDO $conn, array $sessionUser): array
{
    $roleId = (int)($sessionUser['role_id'] ?? 0);
    if ($roleId <= 0) {
        return [];
    }

    $allowedRoleIds = [];
    foreach (monitoring_module_permission_select_role_ids($conn) as $candidateRoleId) {
        $normalizedCandidateRoleId = (int)$candidateRoleId;
        if ($normalizedCandidateRoleId <= 0) {
            continue;
        }

        if (chatIsRoleAllowedToMessageRole($conn, $roleId, $normalizedCandidateRoleId)) {
            $allowedRoleIds[$normalizedCandidateRoleId] = true;
        }
    }

    return array_values(array_map('intval', array_keys($allowedRoleIds)));
}

function chatRequirePartnerAccess(PDO $conn, array $sessionUser, int $partnerId): array
{
    if ($partnerId <= 0) {
        respond(400, ['success' => false, 'message' => 'Valid partner_id is required']);
    }

    $currentUserId = (int)$sessionUser['id'];
    if ($partnerId === $currentUserId) {
        respond(400, ['success' => false, 'message' => 'You cannot start a conversation with yourself']);
    }

    $stmt = $conn->prepare(
        'SELECT User_id AS id, Role_id AS role_id
         FROM `user`
         WHERE User_id = :user_id
         LIMIT 1'
    );
    $stmt->execute([':user_id' => $partnerId]);
    $partner = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$partner) {
        respond(404, ['success' => false, 'message' => 'Chat partner not found']);
    }

    $allowedRoleIds = chatAllowedPartnerRoleIds($conn, $sessionUser);
    $partnerRoleId = (int)($partner['role_id'] ?? 0);
    if (!in_array($partnerRoleId, $allowedRoleIds, true)) {
        respond(403, ['success' => false, 'message' => 'Access denied.']);
    }

    return [
        'id' => (int)$partner['id'],
        'role_id' => $partnerRoleId,
    ];
}

function fullNameFromRow(array $row): string
{
    $parts = [
        trim((string)($row['first_name'] ?? '')),
        trim((string)($row['middle_name'] ?? '')),
        trim((string)($row['last_name'] ?? '')),
    ];
    $parts = array_values(array_filter($parts, function ($value) {
        return $value !== '';
    }));

    if (!empty($parts)) {
        return implode(' ', $parts);
    }

    return trim((string)($row['username'] ?? 'Unknown User'));
}

function chatRoleSortValue($roleId): int
{
    switch ((int)$roleId) {
        case 1:
            return 1;
        case 2:
            return 2;
        case 3:
            return 3;
        case 4:
            return 4;
        default:
            return 5;
    }
}

function chatUserActivityTimestamp(array $user): int
{
    $lastMessageAt = trim((string)($user['last_message_at'] ?? ''));
    if ($lastMessageAt === '') {
        return 0;
    }

    $timestamp = strtotime($lastMessageAt);
    return $timestamp === false ? 0 : $timestamp;
}

function compareChatUsers(array $left, array $right): int
{
    $leftUnread = max(0, (int)($left['unread_count'] ?? 0));
    $rightUnread = max(0, (int)($right['unread_count'] ?? 0));
    if ($leftUnread !== $rightUnread) {
        return $rightUnread <=> $leftUnread;
    }

    $leftOnline = !empty($left['is_online']) ? 1 : 0;
    $rightOnline = !empty($right['is_online']) ? 1 : 0;
    if ($leftOnline !== $rightOnline) {
        return $rightOnline <=> $leftOnline;
    }

    $leftActivity = chatUserActivityTimestamp($left);
    $rightActivity = chatUserActivityTimestamp($right);
    if ($leftActivity !== $rightActivity) {
        return $rightActivity <=> $leftActivity;
    }

    $leftRoleSort = chatRoleSortValue($left['role_id'] ?? null);
    $rightRoleSort = chatRoleSortValue($right['role_id'] ?? null);
    if ($leftRoleSort !== $rightRoleSort) {
        return $leftRoleSort <=> $rightRoleSort;
    }

    $leftName = strtolower(trim((string)($left['full_name'] ?? $left['username'] ?? '')));
    $rightName = strtolower(trim((string)($right['full_name'] ?? $right['username'] ?? '')));
    $nameComparison = strcmp($leftName, $rightName);
    if ($nameComparison !== 0) {
        return $nameComparison;
    }

    return ((int)($left['id'] ?? 0)) <=> ((int)($right['id'] ?? 0));
}

function fetchChatUsers(PDO $conn, array $sessionUser, array $presenceMap = []): array
{
    $allowedRoleIds = chatAllowedPartnerRoleIds($conn, $sessionUser);
    if (empty($allowedRoleIds)) {
        return [];
    }

    $currentUserId = (int)($sessionUser['id'] ?? 0);
    $hasClientProfileImage = columnExists($conn, 'client', 'Profile_Image');
    $hasUserProfileImage = columnExists($conn, 'user', 'Profile_Image');

    $clientExpr = $hasClientProfileImage ? 'c.Profile_Image' : 'NULL';
    $userExpr = $hasUserProfileImage ? 'u.Profile_Image' : 'NULL';
    $roleList = implode(', ', array_map('intval', $allowedRoleIds));

    $sql = "SELECT
                u.User_id AS id,
                u.Username AS username,
                u.Role_id AS role_id,
                r.Role_name AS role_name,
                COALESCE(u.first_name, c.First_name) AS first_name,
                COALESCE(u.middle_name, c.Middle_name) AS middle_name,
                COALESCE(u.last_name, c.Last_name) AS last_name,
                COALESCE({$userExpr}, {$clientExpr}) AS profile_image,
                lm.message_text AS last_message,
                lm.created_at AS last_message_at,
                lm.sender_id AS last_message_sender_id,
                lim.message_text AS last_incoming_message,
                COALESCE(unread.unread_count, 0) AS unread_count
            FROM `user` u
            LEFT JOIN `role` r ON r.Role_id = u.Role_id
            LEFT JOIN `client` c ON c.User_id = u.User_id
            LEFT JOIN `messages` lm ON lm.Message_ID = (
                SELECT m.Message_ID
                FROM `messages` m
                WHERE (m.sender_id = :latest_current_user_id_outgoing AND m.receiver_id = u.User_id)
                   OR (m.sender_id = u.User_id AND m.receiver_id = :latest_current_user_id_incoming)
                ORDER BY m.Message_ID DESC
                LIMIT 1
            )
            LEFT JOIN `messages` lim ON lim.Message_ID = (
                SELECT m.Message_ID
                FROM `messages` m
                WHERE m.sender_id = u.User_id
                  AND m.receiver_id = :last_incoming_current_user_id
                  AND TRIM(COALESCE(m.message_text, '')) <> ''
                ORDER BY m.Message_ID DESC
                LIMIT 1
            )
            LEFT JOIN (
                SELECT sender_id AS partner_id, COUNT(*) AS unread_count
                FROM `messages`
                WHERE receiver_id = :unread_current_user_id
                  AND is_read = 0
                GROUP BY sender_id
            ) unread ON unread.partner_id = u.User_id
            WHERE u.User_id <> :current_user_id
              AND u.Role_id IN ({$roleList})
            ORDER BY
                CASE u.Role_id
                    WHEN 1 THEN 1
                    WHEN 2 THEN 2
                    WHEN 3 THEN 3
                    WHEN 4 THEN 4
                    ELSE 5
                END,
                COALESCE(u.first_name, c.First_name, u.Username) ASC,
                COALESCE(u.last_name, c.Last_name, u.Username) ASC";

    $stmt = $conn->prepare($sql);
    $stmt->execute([
        ':latest_current_user_id_outgoing' => $currentUserId,
        ':latest_current_user_id_incoming' => $currentUserId,
        ':last_incoming_current_user_id' => $currentUserId,
        ':unread_current_user_id' => $currentUserId,
        ':current_user_id' => $currentUserId,
    ]);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];

    $users = [];
    foreach ($rows as $row) {
        $userId = (int)$row['id'];
        $lastSeenTimestamp = isset($presenceMap[(string)$userId]) ? (int)$presenceMap[(string)$userId] : 0;
        $isOnline = $lastSeenTimestamp > 0;
        $lastMessage = trim((string)($row['last_message'] ?? ''));
        $lastIncomingMessage = trim((string)($row['last_incoming_message'] ?? ''));
        $users[] = [
            'id' => $userId,
            'full_name' => fullNameFromRow($row),
            'role' => trim((string)($row['role_name'] ?? 'User')) ?: 'User',
            'role_id' => isset($row['role_id']) ? (int)$row['role_id'] : null,
            'profile_image' => $row['profile_image'] ?? null,
            'username' => $row['username'] ?? null,
            'last_seen_at' => $isOnline ? gmdate('Y-m-d H:i:s', $lastSeenTimestamp) : null,
            'is_online' => $isOnline,
            'last_message' => $lastMessage !== '' ? $lastMessage : null,
            'last_incoming_message' => $lastIncomingMessage !== '' ? $lastIncomingMessage : null,
            'last_message_at' => $row['last_message_at'] ?? null,
            'last_message_is_own' => isset($row['last_message_sender_id'])
                ? (int)$row['last_message_sender_id'] === $currentUserId
                : false,
            'unread_count' => max(0, (int)($row['unread_count'] ?? 0)),
        ];
    }

    usort($users, 'compareChatUsers');

    return $users;
}

function mapConversationRows(array $rows, int $currentUserId): array
{
    return array_map(function (array $row) use ($currentUserId): array {
        $senderId = (int)$row['sender_id'];
        $senderRoleId = isset($row['sender_role_id']) ? (int)$row['sender_role_id'] : null;

        return [
            'id' => (int)$row['id'],
            'sender_id' => $senderId,
            'receiver_id' => (int)$row['receiver_id'],
            'sender_type' => senderTypeFromRoleId($senderRoleId),
            'message' => (string)($row['message_text'] ?? ''),
            'is_read' => (int)($row['is_read'] ?? 0) === 1,
            'created_at' => $row['created_at'] ?? null,
            'is_own' => $senderId === $currentUserId,
        ];
    }, $rows);
}

function fetchConversationPage(
    PDO $conn,
    int $currentUserId,
    int $partnerId,
    int $limit = 80,
    int $beforeMessageId = 0,
    int $afterMessageId = 0
): array {
    $normalizedLimit = normalizeConversationLimit($limit);
    $params = [
        ':current_user_id' => $currentUserId,
        ':partner_id' => $partnerId,
    ];
    $extraWhereSql = '';
    $orderSql = 'm.Message_ID DESC';
    $queryLimit = $normalizedLimit + 1;
    $usesOlderPageWindow = false;

    if ($afterMessageId > 0) {
        $extraWhereSql = ' AND m.Message_ID > :after_message_id';
        $params[':after_message_id'] = $afterMessageId;
        $orderSql = 'm.Message_ID ASC';
        $queryLimit = $normalizedLimit;
    } elseif ($beforeMessageId > 0) {
        $extraWhereSql = ' AND m.Message_ID < :before_message_id';
        $params[':before_message_id'] = $beforeMessageId;
        $usesOlderPageWindow = true;
    } else {
        $usesOlderPageWindow = true;
    }

    $stmt = $conn->prepare(
        'SELECT
            m.Message_ID AS id,
            m.sender_id,
            m.receiver_id,
            m.message_text,
            m.is_read,
            m.created_at,
            sender_user.Role_id AS sender_role_id
         FROM `messages` m
         LEFT JOIN `user` sender_user ON sender_user.User_id = m.sender_id
         WHERE (
                (m.sender_id = :current_user_id AND m.receiver_id = :partner_id)
             OR (m.sender_id = :partner_id AND m.receiver_id = :current_user_id)
         )'
         . $extraWhereSql .
        ' ORDER BY ' . $orderSql . '
          LIMIT :limit'
    );

    foreach ($params as $key => $value) {
        $stmt->bindValue($key, $value, PDO::PARAM_INT);
    }
    $stmt->bindValue(':limit', $queryLimit, PDO::PARAM_INT);
    $stmt->execute();

    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];
    $hasMoreBefore = false;
    if ($usesOlderPageWindow && count($rows) > $normalizedLimit) {
        $hasMoreBefore = true;
        array_pop($rows);
    }

    if ($orderSql === 'm.Message_ID DESC') {
        $rows = array_reverse($rows);
    }

    $messages = mapConversationRows($rows, $currentUserId);
    $oldestMessageId = !empty($messages) ? (int)($messages[0]['id'] ?? 0) : null;
    $latestMessageId = !empty($messages) ? (int)($messages[count($messages) - 1]['id'] ?? 0) : null;

    return [
        'messages' => $messages,
        'has_more_before' => $hasMoreBefore,
        'oldest_message_id' => $oldestMessageId > 0 ? $oldestMessageId : null,
        'latest_message_id' => $latestMessageId > 0 ? $latestMessageId : null,
    ];
}

function markConversationAsRead(PDO $conn, int $currentUserId, int $partnerId): void
{
    $stmt = $conn->prepare(
        'UPDATE `messages`
         SET `is_read` = 1
         WHERE `sender_id` = :partner_id
           AND `receiver_id` = :current_user_id
           AND `is_read` = 0'
    );
    $stmt->execute([
        ':partner_id' => $partnerId,
        ':current_user_id' => $currentUserId,
    ]);
}

function fetchUnreadCount(PDO $conn, int $currentUserId): int
{
    $stmt = $conn->prepare(
        'SELECT COUNT(*)
         FROM `messages`
         WHERE `receiver_id` = :current_user_id
           AND `is_read` = 0'
    );
    $stmt->execute([':current_user_id' => $currentUserId]);
    return (int)$stmt->fetchColumn();
}

try {
    $conn->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    ensureMessagesSchema($conn);

    $sessionUser = monitoring_require_auth();
    $currentUserId = (int)$sessionUser['id'];

    if (!userExists($conn, $currentUserId)) {
        monitoring_destroy_session();
        respond(401, ['success' => false, 'message' => 'Authentication is required.']);
    }

    if (!monitoring_user_has_module_access($conn, $sessionUser, 'messaging')) {
        respond(403, ['success' => false, 'message' => 'Access denied.']);
    }

    if (session_status() === PHP_SESSION_ACTIVE) {
        session_write_close();
    }

    $presenceMap = touchChatPresence($currentUserId);

    if ($_SERVER['REQUEST_METHOD'] === 'GET') {
        $action = strtolower(trim((string)($_GET['action'] ?? '')));

        if ($action === 'heartbeat') {
            respond(200, ['success' => true]);
        }

        if ($action === 'users') {
            respond(200, ['success' => true, 'users' => fetchChatUsers($conn, $sessionUser, $presenceMap)]);
        }

        if ($action === 'messages') {
            $partnerId = isset($_GET['partner_id']) ? (int)$_GET['partner_id'] : 0;
            $beforeMessageId = readPositiveIntValue($_GET['before_message_id'] ?? null);
            $afterMessageId = readPositiveIntValue($_GET['after_message_id'] ?? null);
            $limit = normalizeConversationLimit($_GET['limit'] ?? null);
            $partner = chatRequirePartnerAccess($conn, $sessionUser, $partnerId);

            markConversationAsRead($conn, $currentUserId, (int)$partner['id']);
            $conversation = fetchConversationPage(
                $conn,
                $currentUserId,
                (int)$partner['id'],
                $limit,
                $beforeMessageId,
                $afterMessageId
            );

            respond(200, [
                'success' => true,
                'messages' => $conversation['messages'],
                'has_more_before' => !empty($conversation['has_more_before']),
                'oldest_message_id' => $conversation['oldest_message_id'],
                'latest_message_id' => $conversation['latest_message_id'],
            ]);
        }

        if ($action === 'unread_count') {
            respond(200, [
                'success' => true,
                'unread_count' => fetchUnreadCount($conn, $currentUserId),
            ]);
        }

        respond(400, ['success' => false, 'message' => 'Invalid action']);
    }

    if ($_SERVER['REQUEST_METHOD'] === 'POST') {
        $data = json_decode(file_get_contents('php://input'), true);
        if (!is_array($data)) {
            respond(400, ['success' => false, 'message' => 'Invalid JSON payload']);
        }

        $action = strtolower(trim((string)($data['action'] ?? '')));
        if ($action !== 'send') {
            respond(400, ['success' => false, 'message' => 'Invalid action']);
        }

        $receiverId = (int)($data['receiver_id'] ?? 0);
        $partner = chatRequirePartnerAccess($conn, $sessionUser, $receiverId);
        $message = trim((string)($data['message'] ?? ''));

        if ($message === '') {
            respond(400, ['success' => false, 'message' => 'Message is required']);
        }

        $senderType = inferSenderType($conn, $currentUserId);
        $stmt = $conn->prepare(
            'INSERT INTO `messages` (`sender_id`, `receiver_id`, `message_text`, `is_read`)
             VALUES (:sender_id, :receiver_id, :message_text, 0)'
        );
        $stmt->execute([
            ':sender_id' => $currentUserId,
            ':receiver_id' => (int)$partner['id'],
            ':message_text' => $message,
        ]);

        $messageId = (int)$conn->lastInsertId();
        $messageStmt = $conn->prepare(
            'SELECT
                m.Message_ID AS id,
                m.sender_id,
                m.receiver_id,
                m.message_text,
                m.is_read,
                m.created_at
             FROM `messages` m
             WHERE m.Message_ID = :message_id
             LIMIT 1'
        );
        $messageStmt->execute([':message_id' => $messageId]);
        $row = $messageStmt->fetch(PDO::FETCH_ASSOC);

        respond(201, [
            'success' => true,
            'message_item' => [
                'id' => (int)($row['id'] ?? $messageId),
                'sender_id' => (int)($row['sender_id'] ?? $currentUserId),
                'receiver_id' => (int)($row['receiver_id'] ?? (int)$partner['id']),
                'sender_type' => $senderType,
                'message' => (string)($row['message_text'] ?? $message),
                'is_read' => (int)($row['is_read'] ?? 0) === 1,
                'created_at' => $row['created_at'] ?? null,
                'is_own' => true,
            ],
        ]);
    }

    respond(405, ['success' => false, 'message' => 'Method not allowed']);
} catch (Throwable $e) {
    error_log('chat error: ' . $e->getMessage());
    respond(500, ['success' => false, 'message' => 'Server error']);
}
