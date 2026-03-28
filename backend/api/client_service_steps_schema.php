<?php

function monitoring_ensure_client_service_steps_column_supports_long_text(PDO $conn): void {
    static $checked = false;

    if ($checked) {
        return;
    }
    $checked = true;

    try {
        $stmt = $conn->query("SHOW COLUMNS FROM `client_services` LIKE 'Steps'");
        $column = $stmt ? $stmt->fetch(PDO::FETCH_ASSOC) : null;
        if (!$column) {
            return;
        }

        $type = strtolower(trim((string)($column['Type'] ?? '')));
        if ($type !== '' && preg_match('/\b(?:text|mediumtext|longtext)\b/', $type)) {
            return;
        }

        $conn->exec('ALTER TABLE `client_services` MODIFY `Steps` TEXT NULL');
    } catch (Throwable $__) {
        // Leave the existing schema untouched if the migration check fails.
    }
}
