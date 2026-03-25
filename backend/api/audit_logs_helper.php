<?php

require_once __DIR__ . '/auth.php';

if (!function_exists('monitoring_ensure_audit_logs_table')) {
    function monitoring_ensure_audit_logs_table(PDO $conn): void
    {
        $conn->exec(
            'CREATE TABLE IF NOT EXISTS audit_logs (
                audit_logs_ID INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT DEFAULT NULL,
                action VARCHAR(255) DEFAULT NULL,
                ip_address VARCHAR(45) DEFAULT NULL,
                location VARCHAR(255) DEFAULT NULL,
                device VARCHAR(100) DEFAULT NULL,
                browser VARCHAR(100) DEFAULT NULL,
                os VARCHAR(100) DEFAULT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci'
        );
    }
}

if (!function_exists('monitoring_audit_substr')) {
    function monitoring_audit_substr(string $value, int $maxLength): string
    {
        if (function_exists('mb_substr')) {
            return mb_substr($value, 0, $maxLength);
        }

        return substr($value, 0, $maxLength);
    }
}

if (!function_exists('monitoring_audit_clean_text')) {
    function monitoring_audit_clean_text($value, int $maxLength): ?string
    {
        $normalized = trim((string)($value ?? ''));
        if ($normalized === '') {
            return null;
        }

        $normalized = preg_replace('/\s+/', ' ', $normalized);
        if ($normalized === null) {
            return null;
        }

        return monitoring_audit_substr($normalized, $maxLength);
    }
}

if (!function_exists('monitoring_get_request_ip_address')) {
    function monitoring_get_request_ip_address(): ?string
    {
        $candidates = [];

        $forwardedFor = trim((string)($_SERVER['HTTP_X_FORWARDED_FOR'] ?? ''));
        if ($forwardedFor !== '') {
            $candidates = array_merge($candidates, preg_split('/\s*,\s*/', $forwardedFor) ?: []);
        }

        $realIp = trim((string)($_SERVER['HTTP_X_REAL_IP'] ?? ''));
        if ($realIp !== '') {
            $candidates[] = $realIp;
        }

        $remoteAddr = trim((string)($_SERVER['REMOTE_ADDR'] ?? ''));
        if ($remoteAddr !== '') {
            $candidates[] = $remoteAddr;
        }

        foreach ($candidates as $candidate) {
            $candidate = trim((string)$candidate);
            if ($candidate !== '' && filter_var($candidate, FILTER_VALIDATE_IP)) {
                return $candidate;
            }
        }

        return null;
    }
}

if (!function_exists('monitoring_is_public_ip_address')) {
    function monitoring_is_public_ip_address(?string $ipAddress): bool
    {
        $normalized = trim((string)($ipAddress ?? ''));
        if ($normalized === '') {
            return false;
        }

        return filter_var(
            $normalized,
            FILTER_VALIDATE_IP,
            FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE
        ) !== false;
    }
}

if (!function_exists('monitoring_is_loopback_ip_address')) {
    function monitoring_is_loopback_ip_address(?string $ipAddress): bool
    {
        $normalized = strtolower(trim((string)($ipAddress ?? '')));
        return $normalized === '127.0.0.1' || $normalized === '::1';
    }
}

if (!function_exists('monitoring_describe_non_public_ip_location')) {
    function monitoring_describe_non_public_ip_location(?string $ipAddress): ?string
    {
        $normalized = trim((string)($ipAddress ?? ''));
        if ($normalized === '') {
            return null;
        }

        if (monitoring_is_loopback_ip_address($normalized)) {
            return 'Local development';
        }

        if (filter_var($normalized, FILTER_VALIDATE_IP) !== false) {
            return 'Private network';
        }

        return null;
    }
}

if (!function_exists('monitoring_build_audit_location')) {
    function monitoring_build_audit_location(array $source): ?string
    {
        $location = monitoring_audit_clean_text($source['location'] ?? null, 255);
        if ($location !== null) {
            return $location;
        }

        $parts = array_values(array_filter([
            monitoring_audit_clean_text($source['city'] ?? null, 80),
            monitoring_audit_clean_text($source['region'] ?? null, 80),
            monitoring_audit_clean_text($source['country_name'] ?? ($source['country'] ?? null), 80),
        ], static function ($value) {
            return $value !== null && $value !== '';
        }));

        if (empty($parts)) {
            return null;
        }

        return monitoring_audit_clean_text(implode(', ', $parts), 255);
    }
}

if (!function_exists('monitoring_prepare_audit_log_context')) {
    function monitoring_prepare_audit_log_context($input): array
    {
        $source = is_array($input) ? $input : [];

        $providedIp = trim((string)($source['ip_address'] ?? ($source['ip'] ?? '')));
        $requestIp = monitoring_get_request_ip_address();
        $ipAddress = monitoring_is_public_ip_address($providedIp)
            ? $providedIp
            : (monitoring_is_public_ip_address($requestIp) ? $requestIp : null);
        $location = monitoring_build_audit_location($source);
        if ($location === null) {
            $location = monitoring_describe_non_public_ip_location($providedIp ?: $requestIp);
        }

        return [
            'ip_address' => monitoring_audit_clean_text($ipAddress, 45),
            'location' => monitoring_audit_clean_text($location, 255),
            'device' => monitoring_audit_clean_text($source['device'] ?? null, 100),
            'browser' => monitoring_audit_clean_text($source['browser'] ?? null, 100),
            'os' => monitoring_audit_clean_text($source['os'] ?? null, 100),
        ];
    }
}

if (!function_exists('monitoring_store_audit_context')) {
    function monitoring_store_audit_context($context): void
    {
        monitoring_start_session();
        $_SESSION['monitoring_audit_context'] = monitoring_prepare_audit_log_context($context);
    }
}

if (!function_exists('monitoring_read_audit_context')) {
    function monitoring_read_audit_context(): array
    {
        monitoring_start_session();
        $raw = $_SESSION['monitoring_audit_context'] ?? null;
        return monitoring_prepare_audit_log_context($raw);
    }
}

if (!function_exists('monitoring_write_audit_log')) {
    function monitoring_write_audit_log(PDO $conn, ?int $userId, string $action, $context = null): bool
    {
        $actionValue = monitoring_audit_clean_text($action, 255);
        if ($actionValue === null) {
            return false;
        }

        try {
            monitoring_ensure_audit_logs_table($conn);
            $payload = monitoring_prepare_audit_log_context($context ?? monitoring_read_audit_context());

            $statement = $conn->prepare(
                'INSERT INTO audit_logs (user_id, action, ip_address, location, device, browser, os)
                 VALUES (:user_id, :action, :ip_address, :location, :device, :browser, :os)'
            );
            $statement->bindValue(':user_id', ($userId !== null && $userId > 0) ? $userId : null, $userId !== null && $userId > 0 ? PDO::PARAM_INT : PDO::PARAM_NULL);
            $statement->bindValue(':action', $actionValue, PDO::PARAM_STR);
            $statement->bindValue(':ip_address', $payload['ip_address'], $payload['ip_address'] !== null ? PDO::PARAM_STR : PDO::PARAM_NULL);
            $statement->bindValue(':location', $payload['location'], $payload['location'] !== null ? PDO::PARAM_STR : PDO::PARAM_NULL);
            $statement->bindValue(':device', $payload['device'], $payload['device'] !== null ? PDO::PARAM_STR : PDO::PARAM_NULL);
            $statement->bindValue(':browser', $payload['browser'], $payload['browser'] !== null ? PDO::PARAM_STR : PDO::PARAM_NULL);
            $statement->bindValue(':os', $payload['os'], $payload['os'] !== null ? PDO::PARAM_STR : PDO::PARAM_NULL);
            $statement->execute();

            return true;
        } catch (Throwable $_) {
            return false;
        }
    }
}

if (!function_exists('monitoring_audit_cutoff_for_range')) {
    function monitoring_audit_cutoff_for_range(string $range): ?string
    {
        $normalized = strtolower(trim($range));
        if ($normalized === '24h') {
            return date('Y-m-d H:i:s', time() - 86400);
        }
        if ($normalized === '7d') {
            return date('Y-m-d H:i:s', time() - (7 * 86400));
        }
        if ($normalized === '30d') {
            return date('Y-m-d H:i:s', time() - (30 * 86400));
        }

        return null;
    }
}

if (!function_exists('monitoring_map_audit_log_row')) {
    function monitoring_map_audit_log_row(array $row): array
    {
        $displayName = monitoring_audit_clean_text($row['user_full_name'] ?? null, 150);
        if ($displayName === null) {
            $displayName = monitoring_audit_clean_text($row['client_full_name'] ?? null, 150);
        }
        if ($displayName === null) {
            $displayName = monitoring_audit_clean_text($row['username'] ?? null, 150);
        }

        return [
            'id' => isset($row['audit_logs_ID']) ? (int)$row['audit_logs_ID'] : 0,
            'user_id' => isset($row['user_id']) && $row['user_id'] !== null ? (int)$row['user_id'] : null,
            'username' => monitoring_audit_clean_text($row['username'] ?? null, 100),
            'display_name' => $displayName,
            'action' => monitoring_audit_clean_text($row['action'] ?? null, 255),
            'ip_address' => monitoring_audit_clean_text($row['ip_address'] ?? null, 45),
            'location' => monitoring_audit_clean_text($row['location'] ?? null, 255),
            'device' => monitoring_audit_clean_text($row['device'] ?? null, 100),
            'browser' => monitoring_audit_clean_text($row['browser'] ?? null, 100),
            'os' => monitoring_audit_clean_text($row['os'] ?? null, 100),
            'created_at' => monitoring_audit_clean_text($row['created_at'] ?? null, 40),
        ];
    }
}

if (!function_exists('monitoring_fetch_audit_logs')) {
    function monitoring_fetch_audit_logs(PDO $conn, array $filters = []): array
    {
        monitoring_ensure_audit_logs_table($conn);

        $perPage = isset($filters['per_page'])
            ? (int)$filters['per_page']
            : (isset($filters['limit']) ? (int)$filters['limit'] : 25);
        if ($perPage <= 0) {
            $perPage = 25;
        }
        if ($perPage > 200) {
            $perPage = 200;
        }

        $page = isset($filters['page']) ? (int)$filters['page'] : 1;
        if ($page <= 0) {
            $page = 1;
        }

        $range = isset($filters['range']) ? (string)$filters['range'] : '30d';
        $search = monitoring_audit_clean_text($filters['search'] ?? null, 120);
        $cutoff = monitoring_audit_cutoff_for_range($range);

        $userFullNameExpr = "TRIM(CONCAT_WS(' ', NULLIF(TRIM(u.first_name), ''), NULLIF(TRIM(u.middle_name), ''), NULLIF(TRIM(u.last_name), '')))";
        $clientFullNameExpr = "TRIM(CONCAT_WS(' ', NULLIF(TRIM(c.First_name), ''), NULLIF(TRIM(c.Middle_name), ''), NULLIF(TRIM(c.Last_name), '')))";

        $selectSql = 'SELECT al.audit_logs_ID,
                             al.user_id,
                             al.action,
                             al.ip_address,
                             al.location,
                             al.device,
                             al.browser,
                             al.os,
                             al.created_at,
                             u.Username AS username,
                             ' . $userFullNameExpr . ' AS user_full_name,
                             ' . $clientFullNameExpr . ' AS client_full_name';
        $fromSql = ' FROM audit_logs al
                     LEFT JOIN user u ON u.User_id = al.user_id
                     LEFT JOIN client c ON c.User_id = u.User_id
                     WHERE 1 = 1';

        $params = [];
        if ($cutoff !== null) {
            $fromSql .= ' AND al.created_at >= :cutoff';
            $params[':cutoff'] = $cutoff;
        }

        if ($search !== null) {
            $searchValue = '%' . $search . '%';
            $fromSql .= ' AND (
                al.action LIKE :search_action
                OR al.ip_address LIKE :search_ip
                OR al.location LIKE :search_location
                OR al.device LIKE :search_device
                OR al.browser LIKE :search_browser
                OR al.os LIKE :search_os
                OR u.Username LIKE :search_username
                OR ' . $userFullNameExpr . ' LIKE :search_user_full_name
                OR ' . $clientFullNameExpr . ' LIKE :search_client_full_name
            )';
            $params[':search_action'] = $searchValue;
            $params[':search_ip'] = $searchValue;
            $params[':search_location'] = $searchValue;
            $params[':search_device'] = $searchValue;
            $params[':search_browser'] = $searchValue;
            $params[':search_os'] = $searchValue;
            $params[':search_username'] = $searchValue;
            $params[':search_user_full_name'] = $searchValue;
            $params[':search_client_full_name'] = $searchValue;
        }

        $countStatement = $conn->prepare('SELECT COUNT(*)' . $fromSql);
        foreach ($params as $key => $value) {
            $countStatement->bindValue($key, $value, PDO::PARAM_STR);
        }
        $countStatement->execute();
        $total = (int)$countStatement->fetchColumn();

        $totalPages = $total > 0 ? (int)ceil($total / $perPage) : 1;
        if ($page > $totalPages) {
            $page = $totalPages;
        }
        $offset = ($page - 1) * $perPage;

        $statement = $conn->prepare(
            $selectSql
            . $fromSql
            . ' ORDER BY al.created_at DESC, al.audit_logs_ID DESC LIMIT :limit OFFSET :offset'
        );
        foreach ($params as $key => $value) {
            $statement->bindValue($key, $value, PDO::PARAM_STR);
        }
        $statement->bindValue(':limit', $perPage, PDO::PARAM_INT);
        $statement->bindValue(':offset', $offset, PDO::PARAM_INT);
        $statement->execute();

        $rows = $statement->fetchAll(PDO::FETCH_ASSOC) ?: [];
        return [
            'logs' => array_map('monitoring_map_audit_log_row', $rows),
            'total' => $total,
            'page' => $page,
            'per_page' => $perPage,
            'total_pages' => $totalPages,
        ];
    }
}
