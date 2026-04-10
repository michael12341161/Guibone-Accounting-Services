<?php

function monitoring_ensure_client_service_steps_column_supports_long_text(PDO $conn): void {
    static $checked = false;

    if ($checked) {
        return;
    }
    $checked = true;

    monitoring_require_schema_columns(
        $conn,
        'client_services',
        ['Steps'],
        'task service steps'
    );

    $type = monitoring_schema_column_type($conn, 'client_services', 'Steps');
    if ($type !== null && preg_match('/\b(?:text|mediumtext|longtext)\b/', $type)) {
        return;
    }

    throw new RuntimeException(
        'Database schema is incompatible for task service steps. Column `Steps` on `client_services` must be a TEXT-like type. '
        . 'Import monitoring/monitoring.sql or apply the required migration before using this endpoint.'
    );
}
