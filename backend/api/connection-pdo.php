<?php
    $servername = getenv('DB_HOST') ?: "localhost";
    $dbusername = getenv('DB_USER') ?: "root";
    $dbpassword = getenv('DB_PASS') ?: "";
    $dbname = getenv('DB_NAME') ?: "dbmonitoring";

    try {
        $conn = new PDO("mysql:host=$servername;dbname=$dbname", $dbusername, $dbpassword);
        // set the PDO error mode to exception
        $conn->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    } catch(PDOException $e) {
        error_log('Database connection failed: ' . $e->getMessage());
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => 'Database connection failed.']);
        exit;
    }

    if (!function_exists('monitoring_schema_quote_identifier')) {
        function monitoring_schema_quote_identifier(string $name): string
        {
            return '`' . str_replace('`', '``', $name) . '`';
        }
    }

    if (!function_exists('monitoring_schema_table_exists')) {
        function monitoring_schema_table_exists(PDO $conn, string $tableName): bool
        {
            try {
                $stmt = $conn->prepare('SHOW TABLES LIKE :table_name');
                $stmt->execute([':table_name' => $tableName]);
                return (bool)$stmt->fetchColumn();
            } catch (Throwable $__) {
                return false;
            }
        }
    }

    if (!function_exists('monitoring_schema_column_exists')) {
        function monitoring_schema_column_exists(PDO $conn, string $tableName, string $columnName): bool
        {
            try {
                $stmt = $conn->prepare(
                    'SHOW COLUMNS FROM ' . monitoring_schema_quote_identifier($tableName) . ' LIKE :column_name'
                );
                $stmt->execute([':column_name' => $columnName]);
                return (bool)$stmt->fetch(PDO::FETCH_ASSOC);
            } catch (Throwable $__) {
                return false;
            }
        }
    }

    if (!function_exists('monitoring_schema_column_type')) {
        function monitoring_schema_column_type(PDO $conn, string $tableName, string $columnName): ?string
        {
            try {
                $stmt = $conn->prepare(
                    'SHOW COLUMNS FROM ' . monitoring_schema_quote_identifier($tableName) . ' LIKE :column_name'
                );
                $stmt->execute([':column_name' => $columnName]);
                $column = $stmt->fetch(PDO::FETCH_ASSOC);
                if (!$column) {
                    return null;
                }

                $type = strtolower(trim((string)($column['Type'] ?? '')));
                return $type !== '' ? $type : null;
            } catch (Throwable $__) {
                return null;
            }
        }
    }

    if (!function_exists('monitoring_schema_missing_requirement_message')) {
        function monitoring_schema_missing_requirement_message(
            string $requirementType,
            string $identifier,
            string $featureLabel = 'this feature'
        ): string {
            $feature = trim($featureLabel) !== '' ? trim($featureLabel) : 'this feature';
            return 'Database schema is missing required '
                . $requirementType
                . ' '
                . $identifier
                . ' for '
                . $feature
                . '. Import monitoring/database/monitoring.sql before using this endpoint.';
        }
    }

    if (!function_exists('monitoring_require_schema_table')) {
        function monitoring_require_schema_table(PDO $conn, string $tableName, string $featureLabel = 'this feature'): void
        {
            if (monitoring_schema_table_exists($conn, $tableName)) {
                return;
            }

            throw new RuntimeException(
                monitoring_schema_missing_requirement_message('table', monitoring_schema_quote_identifier($tableName), $featureLabel)
            );
        }
    }

    if (!function_exists('monitoring_require_schema_columns')) {
        function monitoring_require_schema_columns(
            PDO $conn,
            string $tableName,
            array $columnNames,
            string $featureLabel = 'this feature'
        ): void {
            monitoring_require_schema_table($conn, $tableName, $featureLabel);

            $missing = [];
            foreach ($columnNames as $columnName) {
                $normalized = trim((string)$columnName);
                if ($normalized === '') {
                    continue;
                }

                if (!monitoring_schema_column_exists($conn, $tableName, $normalized)) {
                    $missing[] = monitoring_schema_quote_identifier($normalized);
                }
            }

            if (empty($missing)) {
                return;
            }

            throw new RuntimeException(
                monitoring_schema_missing_requirement_message(
                    'column(s)',
                    implode(', ', $missing) . ' on ' . monitoring_schema_quote_identifier($tableName),
                    $featureLabel
                )
            );
        }
    }
?>
