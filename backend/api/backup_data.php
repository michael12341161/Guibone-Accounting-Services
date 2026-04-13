<?php

require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/connection-pdo.php';
require_once __DIR__ . '/audit_logs_helper.php';

monitoring_bootstrap_api(['GET', 'POST', 'OPTIONS'], ['send_json_header' => false]);

const BACKUP_DATA_SCHEDULE_SETTING_KEY = 'database_backup_schedule';
const BACKUP_DATA_SCHEDULE_LOCK_NAME = 'monitoring_database_backup_schedule';

function backup_data_respond(int $code, array $payload): void
{
    http_response_code($code);
    header('Content-Type: application/json');
    echo json_encode($payload);
    exit;
}

function backup_data_storage_directory(): string
{
    return __DIR__ . '/../data/backups';
}

function backup_data_ensure_storage_directory(): string
{
    $directory = backup_data_storage_directory();
    if (is_dir($directory)) {
        return $directory;
    }

    if (!@mkdir($directory, 0777, true) && !is_dir($directory)) {
        throw new RuntimeException('Unable to create backup storage directory.');
    }

    return $directory;
}

function backup_data_database_name(PDO $conn): string
{
    $statement = $conn->query('SELECT DATABASE()');
    $databaseName = trim((string)($statement ? $statement->fetchColumn() : ''));
    return $databaseName !== '' ? $databaseName : 'database';
}

function backup_data_ensure_settings_table(PDO $conn): void
{
    monitoring_require_schema_columns(
        $conn,
        'settings',
        ['Settings_ID', 'setting_key', 'setting_value'],
        'backup scheduling settings'
    );
}

function backup_data_parse_bool($value, bool $fallback = false): bool
{
    if (is_bool($value)) {
        return $value;
    }

    if (is_int($value) || is_float($value)) {
        return ((int)$value) === 1;
    }

    $normalized = strtolower(trim((string)($value ?? '')));
    if ($normalized === '') {
        return $fallback;
    }

    if (in_array($normalized, ['1', 'true', 'yes', 'on'], true)) {
        return true;
    }

    if (in_array($normalized, ['0', 'false', 'no', 'off'], true)) {
        return false;
    }

    return $fallback;
}

function backup_data_normalize_iso_datetime($value): string
{
    $normalized = trim((string)($value ?? ''));
    if ($normalized === '') {
        return '';
    }

    $timestamp = strtotime($normalized);
    if ($timestamp === false) {
        return '';
    }

    return gmdate('c', $timestamp);
}

function backup_data_normalize_schedule_frequency($value): string
{
    $normalized = strtolower(trim((string)($value ?? '')));
    if (in_array($normalized, ['once', 'daily', 'weekly', 'monthly'], true)) {
        return $normalized;
    }

    return 'once';
}

function backup_data_schedule_frequency_label(string $frequency): string
{
    switch (backup_data_normalize_schedule_frequency($frequency)) {
        case 'daily':
            return 'daily';
        case 'weekly':
            return 'weekly';
        case 'monthly':
            return 'monthly';
        default:
            return 'one-time';
    }
}

function backup_data_normalize_monthly_day($value, int $fallback = 0): int
{
    $day = (int)$value;
    if ($day >= 1 && $day <= 31) {
        return $day;
    }

    return $fallback;
}

function backup_data_schedule_datetime(string $value): ?DateTimeImmutable
{
    $normalized = backup_data_normalize_iso_datetime($value);
    if ($normalized === '') {
        return null;
    }

    try {
        return new DateTimeImmutable($normalized);
    } catch (Throwable $_) {
        return null;
    }
}

function backup_data_default_schedule(): array
{
    return [
        'enabled' => false,
        'frequency' => 'once',
        'scheduled_for' => '',
        'monthly_day' => 0,
        'last_attempt_at' => '',
        'last_attempt_status' => '',
        'last_attempt_message' => '',
        'last_backup_name' => '',
    ];
}

function backup_data_normalize_schedule($value): array
{
    $source = is_array($value) ? $value : [];
    $defaults = backup_data_default_schedule();

    $scheduledFor = backup_data_normalize_iso_datetime($source['scheduled_for'] ?? '');
    $frequency = backup_data_normalize_schedule_frequency($source['frequency'] ?? $defaults['frequency']);
    $scheduledTimestamp = $scheduledFor !== '' ? strtotime($scheduledFor) : false;
    $monthlyDayFallback = $scheduledTimestamp !== false ? (int)gmdate('j', $scheduledTimestamp) : 0;
    $monthlyDay = $frequency === 'monthly'
        ? backup_data_normalize_monthly_day($source['monthly_day'] ?? 0, $monthlyDayFallback)
        : 0;
    $enabled = backup_data_parse_bool($source['enabled'] ?? false, false) && $scheduledFor !== '';
    if (!$enabled) {
        $scheduledFor = '';
    }

    $lastAttemptStatus = strtolower(trim((string)($source['last_attempt_status'] ?? '')));
    if (!in_array($lastAttemptStatus, ['success', 'error'], true)) {
        $lastAttemptStatus = '';
    }

    return [
        'enabled' => $enabled,
        'frequency' => $frequency,
        'scheduled_for' => $scheduledFor,
        'monthly_day' => $monthlyDay,
        'last_attempt_at' => backup_data_normalize_iso_datetime($source['last_attempt_at'] ?? ''),
        'last_attempt_status' => $lastAttemptStatus,
        'last_attempt_message' => trim((string)($source['last_attempt_message'] ?? $defaults['last_attempt_message'])),
        'last_backup_name' => trim((string)($source['last_backup_name'] ?? $defaults['last_backup_name'])),
    ];
}

function backup_data_get_schedule(PDO $conn): array
{
    backup_data_ensure_settings_table($conn);

    $statement = $conn->prepare(
        'SELECT setting_value
         FROM settings
         WHERE setting_key = :setting_key
         LIMIT 1'
    );
    $statement->execute([':setting_key' => BACKUP_DATA_SCHEDULE_SETTING_KEY]);
    $rawValue = $statement->fetchColumn();

    if ($rawValue === false || $rawValue === null || trim((string)$rawValue) === '') {
        return backup_data_default_schedule();
    }

    $decoded = json_decode((string)$rawValue, true);
    if (!is_array($decoded)) {
        return backup_data_default_schedule();
    }

    return backup_data_normalize_schedule($decoded);
}

function backup_data_save_schedule(PDO $conn, array $schedule): array
{
    backup_data_ensure_settings_table($conn);

    $normalized = backup_data_normalize_schedule($schedule);
    $statement = $conn->prepare(
        'INSERT INTO settings (setting_key, setting_value)
         VALUES (:setting_key, :setting_value)
         ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)'
    );
    $statement->execute([
        ':setting_key' => BACKUP_DATA_SCHEDULE_SETTING_KEY,
        ':setting_value' => json_encode($normalized, JSON_UNESCAPED_SLASHES),
    ]);

    return $normalized;
}

function backup_data_schedule_is_due(array $schedule, ?int $nowTimestamp = null): bool
{
    if (empty($schedule['enabled']) || trim((string)($schedule['scheduled_for'] ?? '')) === '') {
        return false;
    }

    $timestamp = strtotime((string)$schedule['scheduled_for']);
    if ($timestamp === false) {
        return false;
    }

    return $timestamp <= ($nowTimestamp ?? time());
}

function backup_data_increment_monthly_schedule(DateTimeImmutable $current, int $monthlyDay): DateTimeImmutable
{
    $nextMonth = $current
        ->setDate((int)$current->format('Y'), (int)$current->format('n'), 1)
        ->modify('+1 month');
    $targetYear = (int)$nextMonth->format('Y');
    $targetMonth = (int)$nextMonth->format('n');
    $daysInMonth = cal_days_in_month(CAL_GREGORIAN, $targetMonth, $targetYear);

    return $nextMonth->setDate($targetYear, $targetMonth, min(max(1, $monthlyDay), $daysInMonth));
}

function backup_data_calculate_next_scheduled_for(array $schedule, ?int $referenceTimestamp = null): string
{
    $frequency = backup_data_normalize_schedule_frequency($schedule['frequency'] ?? 'once');
    if ($frequency === 'once') {
        return '';
    }

    $current = backup_data_schedule_datetime((string)($schedule['scheduled_for'] ?? ''));
    if (!$current) {
        return '';
    }

    $cutoff = $referenceTimestamp ?? time();
    $monthlyDay = backup_data_normalize_monthly_day($schedule['monthly_day'] ?? 0, (int)$current->format('j'));

    do {
        if ($frequency === 'daily') {
            $current = $current->modify('+1 day');
        } elseif ($frequency === 'weekly') {
            $current = $current->modify('+7 days');
        } else {
            $current = backup_data_increment_monthly_schedule($current, $monthlyDay);
        }
    } while ($current->getTimestamp() <= $cutoff);

    return backup_data_normalize_iso_datetime($current->format(DateTimeInterface::ATOM));
}

function backup_data_acquire_schedule_lock(PDO $conn): bool
{
    try {
        $statement = $conn->prepare('SELECT GET_LOCK(:lock_name, 0)');
        $statement->execute([':lock_name' => BACKUP_DATA_SCHEDULE_LOCK_NAME]);
        return (int)$statement->fetchColumn() === 1;
    } catch (Throwable $_) {
        return false;
    }
}

function backup_data_release_schedule_lock(PDO $conn): void
{
    try {
        $statement = $conn->prepare('SELECT RELEASE_LOCK(:lock_name)');
        $statement->execute([':lock_name' => BACKUP_DATA_SCHEDULE_LOCK_NAME]);
    } catch (Throwable $_) {
    }
}

function backup_data_safe_slug(string $value): string
{
    $slug = preg_replace('/[^a-z0-9]+/i', '-', strtolower(trim($value)));
    $slug = trim((string)$slug, '-');
    return $slug !== '' ? $slug : 'database';
}

function backup_data_unique_suffix(): string
{
    try {
        return '-' . bin2hex(random_bytes(2));
    } catch (Throwable $_) {
        return '-' . (string)mt_rand(1000, 9999);
    }
}

function backup_data_quote_identifier(string $value): string
{
    return '`' . str_replace('`', '``', $value) . '`';
}

function backup_data_write($handle, string $contents): void
{
    if (@fwrite($handle, $contents) === false) {
        throw new RuntimeException('Unable to write the backup file.');
    }
}

function backup_data_normalize_backup_filename($value): string
{
    $filename = basename(trim((string)$value));
    if ($filename === '' || !preg_match('/\A[a-zA-Z0-9._-]+\.sql\z/', $filename)) {
        throw new InvalidArgumentException('Invalid backup file name.');
    }

    return $filename;
}

function backup_data_resolve_backup_path(string $filename): string
{
    $directory = backup_data_ensure_storage_directory();
    $path = $directory . DIRECTORY_SEPARATOR . $filename;
    if (!is_file($path)) {
        throw new OutOfBoundsException('Backup file not found.');
    }

    $realDirectory = realpath($directory);
    $realPath = realpath($path);
    if ($realDirectory === false || $realPath === false) {
        throw new RuntimeException('Unable to resolve the requested backup file.');
    }

    $normalizedDirectory = rtrim($realDirectory, DIRECTORY_SEPARATOR);
    if ($realPath !== $normalizedDirectory && strpos($realPath, $normalizedDirectory . DIRECTORY_SEPARATOR) !== 0) {
        throw new RuntimeException('Backup file path is outside the allowed storage directory.');
    }

    return $realPath;
}

function backup_data_fetch_table_stats(PDO $conn): array
{
    $statement = $conn->query(
        "SELECT TABLE_NAME AS table_name,
                ENGINE AS engine,
                TABLE_ROWS AS table_rows,
                COALESCE(DATA_LENGTH, 0) + COALESCE(INDEX_LENGTH, 0) AS size_bytes
         FROM information_schema.tables
         WHERE table_schema = DATABASE()
           AND table_type = 'BASE TABLE'
         ORDER BY TABLE_NAME ASC"
    );

    $rows = $statement ? ($statement->fetchAll(PDO::FETCH_ASSOC) ?: []) : [];
    $tables = [];
    foreach ($rows as $row) {
        $tableName = trim((string)($row['table_name'] ?? ''));
        if ($tableName === '') {
            continue;
        }

        $tables[] = [
            'name' => $tableName,
            'engine' => trim((string)($row['engine'] ?? '')),
            'rows' => max(0, (int)($row['table_rows'] ?? 0)),
            'size_bytes' => max(0, (int)($row['size_bytes'] ?? 0)),
        ];
    }

    return $tables;
}

function backup_data_fetch_table_names(PDO $conn): array
{
    return array_values(array_map(static function (array $table): string {
        return $table['name'];
    }, backup_data_fetch_table_stats($conn)));
}

function backup_data_fetch_table_columns(PDO $conn, string $tableName): array
{
    $statement = $conn->query('SHOW COLUMNS FROM ' . backup_data_quote_identifier($tableName));
    $rows = $statement ? ($statement->fetchAll(PDO::FETCH_ASSOC) ?: []) : [];

    $columns = [];
    foreach ($rows as $row) {
        $columnName = trim((string)($row['Field'] ?? ''));
        if ($columnName !== '') {
            $columns[] = $columnName;
        }
    }

    return $columns;
}

function backup_data_is_valid_table(PDO $conn, string $tableName): bool
{
    foreach (backup_data_fetch_table_names($conn) as $candidate) {
        if ($candidate === $tableName) {
            return true;
        }
    }

    return false;
}

function backup_data_collect_backup_files(): array
{
    $directory = backup_data_ensure_storage_directory();
    $items = @scandir($directory);
    if ($items === false) {
        throw new RuntimeException('Unable to read backup storage directory.');
    }

    $entries = [];
    foreach ($items as $item) {
        if ($item === '.' || $item === '..') {
            continue;
        }

        $path = $directory . DIRECTORY_SEPARATOR . $item;
        if (!is_file($path) || strtolower((string)pathinfo($path, PATHINFO_EXTENSION)) !== 'sql') {
            continue;
        }

        $timestamp = @filemtime($path);
        $timestamp = $timestamp !== false ? (int)$timestamp : time();
        $size = @filesize($path);

        $entries[] = [
            'name' => basename($item),
            'path' => $path,
            'created_at' => date('c', $timestamp),
            'timestamp' => $timestamp,
            'size_bytes' => $size !== false ? max(0, (int)$size) : 0,
        ];
    }

    usort($entries, static function (array $left, array $right): int {
        return ($right['timestamp'] <=> $left['timestamp']) ?: strcmp($right['name'], $left['name']);
    });

    return $entries;
}

function backup_data_list_backups(int $limit = 10): array
{
    $entries = backup_data_collect_backup_files();
    if ($limit > 0) {
        $entries = array_slice($entries, 0, $limit);
    }

    return array_values(array_map(static function (array $entry): array {
        return [
            'name' => $entry['name'],
            'created_at' => $entry['created_at'],
            'size_bytes' => $entry['size_bytes'],
        ];
    }, $entries));
}

function backup_data_fetch_dashboard(PDO $conn): array
{
    $databaseName = backup_data_database_name($conn);
    $tables = backup_data_fetch_table_stats($conn);
    $backups = backup_data_list_backups(25);
    $schedule = backup_data_get_schedule($conn);

    $approxRows = 0;
    $databaseSizeBytes = 0;
    foreach ($tables as $table) {
        $approxRows += (int)($table['rows'] ?? 0);
        $databaseSizeBytes += (int)($table['size_bytes'] ?? 0);
    }

    $backupCount = 0;
    $backupStorageBytes = 0;
    foreach (backup_data_collect_backup_files() as $backup) {
        $backupCount++;
        $backupStorageBytes += (int)($backup['size_bytes'] ?? 0);
    }

    return [
        'summary' => [
            'database_name' => $databaseName,
            'table_count' => count($tables),
            'approx_rows' => $approxRows,
            'database_size_bytes' => $databaseSizeBytes,
            'backup_count' => $backupCount,
            'backup_storage_bytes' => $backupStorageBytes,
            'last_backup_at' => $backups[0]['created_at'] ?? null,
            'last_backup_name' => $backups[0]['name'] ?? '',
        ],
        'schedule' => $schedule,
        'tables' => $tables,
        'backups' => $backups,
    ];
}

function backup_data_sql_value(PDO $conn, $value): string
{
    if ($value === null) {
        return 'NULL';
    }

    if (is_bool($value)) {
        return $value ? '1' : '0';
    }

    if (is_int($value) || is_float($value)) {
        return (string)$value;
    }

    return $conn->quote((string)$value);
}

function backup_data_build_insert_statement(PDO $conn, string $tableName, array $row): string
{
    $columns = array_keys($row);
    $quotedColumns = array_map(static function ($column): string {
        return backup_data_quote_identifier((string)$column);
    }, $columns);

    $values = array_map(static function ($value) use ($conn): string {
        return backup_data_sql_value($conn, $value);
    }, array_values($row));

    return 'INSERT INTO ' . backup_data_quote_identifier($tableName)
        . ' (' . implode(', ', $quotedColumns) . ') VALUES (' . implode(', ', $values) . ');';
}

function backup_data_create_backup(PDO $conn): array
{
    set_time_limit(0);

    $directory = backup_data_ensure_storage_directory();
    $databaseName = backup_data_database_name($conn);
    $fileName = backup_data_safe_slug($databaseName) . '-backup-' . date('Ymd-His') . backup_data_unique_suffix() . '.sql';
    $filePath = $directory . DIRECTORY_SEPARATOR . $fileName;
    $tableNames = backup_data_fetch_table_names($conn);

    $handle = @fopen($filePath, 'wb');
    if ($handle === false) {
        throw new RuntimeException('Unable to create the backup file.');
    }

    try {
        backup_data_write($handle, "-- Monitoring backup\n");
        backup_data_write($handle, "-- Database: " . $databaseName . "\n");
        backup_data_write($handle, "-- Generated at: " . date('c') . "\n\n");
        backup_data_write($handle, "SET SQL_MODE = \"NO_AUTO_VALUE_ON_ZERO\";\n");
        backup_data_write($handle, "SET time_zone = \"+00:00\";\n");
        backup_data_write($handle, "SET FOREIGN_KEY_CHECKS = 0;\n");
        backup_data_write($handle, "START TRANSACTION;\n\n");

        foreach ($tableNames as $tableName) {
            $createStatement = $conn->query('SHOW CREATE TABLE ' . backup_data_quote_identifier($tableName));
            $createRow = $createStatement ? $createStatement->fetch(PDO::FETCH_ASSOC) : null;
            if (!is_array($createRow)) {
                throw new RuntimeException('Unable to read table schema for ' . $tableName . '.');
            }

            $createSql = '';
            foreach ($createRow as $key => $value) {
                if (stripos((string)$key, 'create ') === 0) {
                    $createSql = (string)$value;
                    break;
                }
            }

            if ($createSql === '') {
                throw new RuntimeException('Unable to build schema SQL for ' . $tableName . '.');
            }

            backup_data_write($handle, '-- Table structure for ' . $tableName . "\n");
            backup_data_write($handle, 'DROP TABLE IF EXISTS ' . backup_data_quote_identifier($tableName) . ";\n");
            backup_data_write($handle, $createSql . ";\n\n");

            $statement = $conn->query('SELECT * FROM ' . backup_data_quote_identifier($tableName));
            if (!$statement) {
                throw new RuntimeException('Unable to read rows for ' . $tableName . '.');
            }

            $rowCount = 0;
            while (($row = $statement->fetch(PDO::FETCH_ASSOC)) !== false) {
                backup_data_write($handle, backup_data_build_insert_statement($conn, $tableName, $row) . "\n");
                $rowCount++;
            }

            if ($rowCount === 0) {
                backup_data_write($handle, '-- No rows exported for ' . $tableName . "\n");
            }

            backup_data_write($handle, "\n");
        }

        backup_data_write($handle, "COMMIT;\n");
        backup_data_write($handle, "SET FOREIGN_KEY_CHECKS = 1;\n");
    } catch (Throwable $error) {
        @fclose($handle);
        @unlink($filePath);
        throw $error;
    }

    @fclose($handle);
    clearstatcache(true, $filePath);
    $size = @filesize($filePath);

    return [
        'name' => $fileName,
        'created_at' => date('c'),
        'size_bytes' => $size !== false ? max(0, (int)$size) : 0,
    ];
}

function backup_data_process_scheduled_backup(PDO $conn, int $triggeredByUserId = 0): array
{
    $schedule = backup_data_get_schedule($conn);
    $result = [
        'processed' => false,
        'due' => backup_data_schedule_is_due($schedule),
        'executed' => false,
        'failed' => false,
        'message' => '',
        'schedule' => $schedule,
        'backup' => null,
    ];

    if (!$result['due']) {
        return $result;
    }

    if (!backup_data_acquire_schedule_lock($conn)) {
        return $result;
    }

    try {
        $schedule = backup_data_get_schedule($conn);
        $result['schedule'] = $schedule;
        $result['due'] = backup_data_schedule_is_due($schedule);
        if (!$result['due']) {
            return $result;
        }

        $result['processed'] = true;
        $attemptedAt = gmdate('c');

        try {
            $backup = backup_data_create_backup($conn);
            $nextScheduledFor = backup_data_calculate_next_scheduled_for($schedule, time());
            $updatedSchedule = backup_data_save_schedule($conn, array_merge($schedule, [
                'enabled' => $nextScheduledFor !== '',
                'scheduled_for' => $nextScheduledFor,
                'last_attempt_at' => $attemptedAt,
                'last_attempt_status' => 'success',
                'last_attempt_message' => 'Scheduled ' . backup_data_schedule_frequency_label((string)($schedule['frequency'] ?? 'once')) . ' backup created successfully.',
                'last_backup_name' => $backup['name'] ?? '',
            ]));

            monitoring_write_audit_log(
                $conn,
                $triggeredByUserId > 0 ? $triggeredByUserId : null,
                'Scheduled database backup created: ' . ($backup['name'] ?? 'unknown file')
            );

            $result['executed'] = true;
            $result['message'] = $updatedSchedule['last_attempt_message'];
            $result['schedule'] = $updatedSchedule;
            $result['backup'] = $backup;
            return $result;
        } catch (Throwable $error) {
            $failureMessage = trim((string)$error->getMessage());
            if ($failureMessage === '') {
                $failureMessage = 'Unable to create the scheduled backup.';
            }

            $nextScheduledFor = backup_data_calculate_next_scheduled_for($schedule, time());
            $updatedSchedule = backup_data_save_schedule($conn, array_merge($schedule, [
                'enabled' => $nextScheduledFor !== '',
                'scheduled_for' => $nextScheduledFor,
                'last_attempt_at' => $attemptedAt,
                'last_attempt_status' => 'error',
                'last_attempt_message' => $failureMessage,
            ]));

            monitoring_write_audit_log(
                $conn,
                $triggeredByUserId > 0 ? $triggeredByUserId : null,
                'Scheduled database backup failed: ' . $failureMessage
            );

            $result['failed'] = true;
            $result['message'] = $failureMessage;
            $result['schedule'] = $updatedSchedule;
            return $result;
        }
    } finally {
        backup_data_release_schedule_lock($conn);
    }
}

function backup_data_cleanup_backups(int $days, int $keepLatest = 3): array
{
    if ($days < 1) {
        throw new InvalidArgumentException('Cleanup days must be at least 1.');
    }

    if ($keepLatest < 0) {
        throw new InvalidArgumentException('Keep latest must be zero or greater.');
    }

    $cutoffTimestamp = time() - ($days * 86400);
    $entries = backup_data_collect_backup_files();
    $deletedCount = 0;
    $deletedBytes = 0;

    foreach ($entries as $index => $entry) {
        if ($index < $keepLatest) {
            continue;
        }

        if ((int)($entry['timestamp'] ?? 0) > $cutoffTimestamp) {
            continue;
        }

        if (@unlink($entry['path'])) {
            $deletedCount++;
            $deletedBytes += (int)($entry['size_bytes'] ?? 0);
        }
    }

    return [
        'days' => $days,
        'keep_latest' => $keepLatest,
        'deleted_count' => $deletedCount,
        'deleted_bytes' => $deletedBytes,
    ];
}

function backup_data_delete_backup(string $filename): array
{
    $filePath = backup_data_resolve_backup_path($filename);
    clearstatcache(true, $filePath);
    $size = @filesize($filePath);

    if (!@unlink($filePath)) {
        throw new RuntimeException('Unable to delete the selected backup file.');
    }

    return [
        'name' => $filename,
        'size_bytes' => $size !== false ? max(0, (int)$size) : 0,
    ];
}

function backup_data_stream_file_download(string $filePath, string $downloadName, string $contentType): void
{
    clearstatcache(true, $filePath);
    $size = @filesize($filePath);

    header('Content-Type: ' . $contentType);
    header('Content-Disposition: attachment; filename="' . $downloadName . '"; filename*=UTF-8\'\'' . rawurlencode($downloadName));
    if ($size !== false) {
        header('Content-Length: ' . (string)$size);
    }
    header('Cache-Control: no-store, no-cache, must-revalidate');
    header('Pragma: no-cache');

    $stream = @fopen($filePath, 'rb');
    if ($stream === false) {
        throw new RuntimeException('Unable to open the requested file for download.');
    }

    while (!feof($stream)) {
        echo fread($stream, 8192);
    }

    fclose($stream);
    exit;
}

function backup_data_stream_table_export(PDO $conn, string $tableName, string $format): void
{
    set_time_limit(0);

    if (!backup_data_is_valid_table($conn, $tableName)) {
        throw new OutOfBoundsException('Table not found.');
    }

    $normalizedFormat = strtolower(trim($format));
    if (!in_array($normalizedFormat, ['csv', 'json', 'sql'], true)) {
        throw new InvalidArgumentException('Export format must be csv, json, or sql.');
    }

    $statement = $conn->query('SELECT * FROM ' . backup_data_quote_identifier($tableName));
    if (!$statement) {
        throw new RuntimeException('Unable to export the selected table.');
    }

    $downloadName = backup_data_safe_slug($tableName) . '-export-' . date('Ymd-His') . backup_data_unique_suffix() . '.' . $normalizedFormat;

    if ($normalizedFormat === 'csv') {
        header('Content-Type: text/csv; charset=utf-8');
        header('Content-Disposition: attachment; filename="' . $downloadName . '"; filename*=UTF-8\'\'' . rawurlencode($downloadName));
        header('Cache-Control: no-store, no-cache, must-revalidate');
        header('Pragma: no-cache');

        $output = fopen('php://output', 'wb');
        if ($output === false) {
            throw new RuntimeException('Unable to stream the CSV export.');
        }

        fwrite($output, "\xEF\xBB\xBF");
        $wroteHeader = false;
        while (($row = $statement->fetch(PDO::FETCH_ASSOC)) !== false) {
            if (!$wroteHeader) {
                fputcsv($output, array_keys($row));
                $wroteHeader = true;
            }

            fputcsv($output, array_values($row));
        }

        if (!$wroteHeader) {
            $columns = backup_data_fetch_table_columns($conn, $tableName);
            if (!empty($columns)) {
                fputcsv($output, $columns);
            }
        }

        fclose($output);
        exit;
    }

    if ($normalizedFormat === 'sql') {
        $createStatement = $conn->query('SHOW CREATE TABLE ' . backup_data_quote_identifier($tableName));
        $createRow = $createStatement ? $createStatement->fetch(PDO::FETCH_ASSOC) : null;
        if (!is_array($createRow)) {
            throw new RuntimeException('Unable to read table schema for SQL export.');
        }

        $createSql = '';
        foreach ($createRow as $key => $value) {
            if (stripos((string)$key, 'create ') === 0) {
                $createSql = (string)$value;
                break;
            }
        }

        if ($createSql === '') {
            throw new RuntimeException('Unable to build table schema for SQL export.');
        }

        header('Content-Type: application/sql; charset=utf-8');
        header('Content-Disposition: attachment; filename="' . $downloadName . '"; filename*=UTF-8\'\'' . rawurlencode($downloadName));
        header('Cache-Control: no-store, no-cache, must-revalidate');
        header('Pragma: no-cache');

        echo "-- Monitoring table export\n";
        echo "-- Table: " . $tableName . "\n";
        echo "-- Exported at: " . date('c') . "\n\n";
        echo "SET FOREIGN_KEY_CHECKS = 0;\n";
        echo 'DROP TABLE IF EXISTS ' . backup_data_quote_identifier($tableName) . ";\n";
        echo $createSql . ";\n\n";

        $rowCount = 0;
        while (($row = $statement->fetch(PDO::FETCH_ASSOC)) !== false) {
            echo backup_data_build_insert_statement($conn, $tableName, $row) . "\n";
            $rowCount++;
        }

        if ($rowCount === 0) {
            echo '-- No rows exported for ' . $tableName . "\n";
        }

        echo "\nSET FOREIGN_KEY_CHECKS = 1;\n";
        exit;
    }

    $rows = $statement->fetchAll(PDO::FETCH_ASSOC) ?: [];
    header('Content-Type: application/json; charset=utf-8');
    header('Content-Disposition: attachment; filename="' . $downloadName . '"; filename*=UTF-8\'\'' . rawurlencode($downloadName));
    header('Cache-Control: no-store, no-cache, must-revalidate');
    header('Pragma: no-cache');
    echo json_encode([
        'table' => $tableName,
        'exported_at' => date('c'),
        'row_count' => count($rows),
        'rows' => $rows,
    ], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

$method = strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'GET'));

try {
    $conn->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $sessionUser = monitoring_require_auth();

    if ($method === 'GET') {
        if (isset($_GET['download_backup'])) {
            monitoring_require_roles([MONITORING_ROLE_ADMIN], $sessionUser);
            $filename = backup_data_normalize_backup_filename($_GET['download_backup']);
            $filePath = backup_data_resolve_backup_path($filename);
            monitoring_write_audit_log($conn, (int)($sessionUser['id'] ?? 0), 'Database backup downloaded: ' . $filename);
            backup_data_stream_file_download($filePath, $filename, 'application/sql');
        }

        if (isset($_GET['export_table'])) {
            monitoring_require_roles([MONITORING_ROLE_ADMIN], $sessionUser);
            $tableName = trim((string)$_GET['export_table']);
            $format = isset($_GET['format']) ? (string)$_GET['format'] : 'csv';
            if (!backup_data_is_valid_table($conn, $tableName)) {
                throw new OutOfBoundsException('Table not found.');
            }
            if (!in_array(strtolower(trim($format)), ['csv', 'json', 'sql'], true)) {
                throw new InvalidArgumentException('Export format must be csv, json, or sql.');
            }
            monitoring_write_audit_log(
                $conn,
                (int)($sessionUser['id'] ?? 0),
                'Database table exported: ' . $tableName . ' (' . strtolower(trim($format)) . ')'
            );
            backup_data_stream_table_export($conn, $tableName, $format);
        }

        monitoring_require_roles([MONITORING_ROLE_ADMIN], $sessionUser);
        $scheduledBackup = backup_data_process_scheduled_backup($conn, (int)($sessionUser['id'] ?? 0));
        $dashboard = backup_data_fetch_dashboard($conn);
        backup_data_respond(200, array_merge([
            'success' => true,
            'scheduled_backup' => [
                'processed' => !empty($scheduledBackup['processed']),
                'due' => !empty($scheduledBackup['due']),
                'executed' => !empty($scheduledBackup['executed']),
                'failed' => !empty($scheduledBackup['failed']),
                'message' => $scheduledBackup['message'] ?? '',
            ],
        ], $dashboard));
    }

    if ($method !== 'POST') {
        backup_data_respond(405, ['success' => false, 'message' => 'Method not allowed.']);
    }

    $raw = file_get_contents('php://input');
    $data = json_decode($raw, true);
    if (!is_array($data)) {
        $data = $_POST;
    }
    if (!is_array($data)) {
        $data = [];
    }

    $action = strtolower(trim((string)($data['action'] ?? '')));

    if ($action === 'process_scheduled_backup') {
        $result = backup_data_process_scheduled_backup($conn, (int)($sessionUser['id'] ?? 0));
        backup_data_respond(200, [
            'success' => true,
            'message' => $result['message'] ?? '',
            'processed' => !empty($result['processed']),
            'due' => !empty($result['due']),
            'executed' => !empty($result['executed']),
            'failed' => !empty($result['failed']),
            'schedule' => $result['schedule'] ?? backup_data_default_schedule(),
            'backup' => $result['backup'],
        ]);
    }

    if ($action === 'create_backup') {
        monitoring_require_roles([MONITORING_ROLE_ADMIN], $sessionUser);
        $backup = backup_data_create_backup($conn);
        monitoring_write_audit_log($conn, (int)($sessionUser['id'] ?? 0), 'Database backup created: ' . $backup['name']);

        backup_data_respond(200, [
            'success' => true,
            'message' => 'Database backup created successfully.',
            'backup' => $backup,
        ]);
    }

    if ($action === 'cleanup_backups') {
        monitoring_require_roles([MONITORING_ROLE_ADMIN], $sessionUser);
        $days = isset($data['days']) ? (int)$data['days'] : 30;
        $keepLatest = isset($data['keep_latest']) ? (int)$data['keep_latest'] : 3;
        $result = backup_data_cleanup_backups($days, $keepLatest);

        monitoring_write_audit_log(
            $conn,
            (int)($sessionUser['id'] ?? 0),
            'Backup cleanup executed: deleted ' . $result['deleted_count'] . ' file(s) older than ' . $days . ' days'
        );

        backup_data_respond(200, [
            'success' => true,
            'message' => $result['deleted_count'] > 0
                ? 'Old backup files deleted successfully.'
                : 'No backup files matched the cleanup rules.',
            'deleted_count' => $result['deleted_count'],
            'deleted_bytes' => $result['deleted_bytes'],
            'days' => $result['days'],
            'keep_latest' => $result['keep_latest'],
        ]);
    }

    if ($action === 'delete_backup') {
        monitoring_require_roles([MONITORING_ROLE_ADMIN], $sessionUser);
        $filename = backup_data_normalize_backup_filename($data['filename'] ?? '');
        $deletedBackup = backup_data_delete_backup($filename);

        monitoring_write_audit_log($conn, (int)($sessionUser['id'] ?? 0), 'Database backup deleted: ' . $filename);

        backup_data_respond(200, [
            'success' => true,
            'message' => 'Backup file deleted successfully.',
            'backup' => $deletedBackup,
        ]);
    }

    if ($action === 'save_schedule') {
        monitoring_require_roles([MONITORING_ROLE_ADMIN], $sessionUser);
        $existingSchedule = backup_data_get_schedule($conn);
        $enabled = backup_data_parse_bool($data['enabled'] ?? false, false);
        $frequency = backup_data_normalize_schedule_frequency($data['frequency'] ?? ($existingSchedule['frequency'] ?? 'once'));
        $scheduledFor = backup_data_normalize_iso_datetime($data['scheduled_for'] ?? '');

        if ($enabled && $scheduledFor === '') {
            throw new InvalidArgumentException('Choose a valid date and time for the automatic backup.');
        }

        if ($enabled) {
            $scheduledTimestamp = strtotime($scheduledFor);
            if ($scheduledTimestamp === false || $scheduledTimestamp <= time()) {
                throw new InvalidArgumentException('Choose a future date and time for the automatic backup.');
            }
        }

        $savedSchedule = backup_data_save_schedule($conn, array_merge($existingSchedule, [
            'enabled' => $enabled,
            'frequency' => $frequency,
            'scheduled_for' => $enabled ? $scheduledFor : '',
            'monthly_day' => $enabled && $frequency === 'monthly'
                ? backup_data_normalize_monthly_day(
                    $data['monthly_day'] ?? 0,
                    (int)gmdate('j', strtotime($scheduledFor))
                )
                : 0,
        ]));

        monitoring_write_audit_log(
            $conn,
            (int)($sessionUser['id'] ?? 0),
            $savedSchedule['enabled']
                ? 'Automatic ' . backup_data_schedule_frequency_label($savedSchedule['frequency']) . ' backup scheduled for ' . $savedSchedule['scheduled_for']
                : 'Automatic backup schedule cleared'
        );

        backup_data_respond(200, [
            'success' => true,
            'message' => $savedSchedule['enabled']
                ? 'Automatic ' . backup_data_schedule_frequency_label($savedSchedule['frequency']) . ' backup scheduled successfully.'
                : 'Automatic backup schedule cleared.',
            'schedule' => $savedSchedule,
        ]);
    }

    backup_data_respond(422, ['success' => false, 'message' => 'Unknown backup action.']);
} catch (OutOfBoundsException $error) {
    backup_data_respond(404, ['success' => false, 'message' => $error->getMessage()]);
} catch (InvalidArgumentException $error) {
    backup_data_respond(422, ['success' => false, 'message' => $error->getMessage()]);
} catch (RuntimeException $error) {
    backup_data_respond(500, ['success' => false, 'message' => $error->getMessage()]);
} catch (Throwable $error) {
    backup_data_respond(500, ['success' => false, 'message' => 'Unable to process the backup request.']);
}
