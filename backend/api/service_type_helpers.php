<?php

if (!function_exists('monitoring_service_type_label')) {
    function monitoring_service_type_label($name, $description = null): string
    {
        $serviceName = trim((string)$name);
        $serviceDescription = trim((string)$description);

        if ($serviceName === '') {
            return '';
        }

        return $serviceDescription !== ''
            ? $serviceName . ' - ' . $serviceDescription
            : $serviceName;
    }
}

if (!function_exists('monitoring_service_type_label_sql')) {
    function monitoring_service_type_label_sql(string $alias = ''): string
    {
        $prefix = trim($alias) !== '' ? trim($alias) . '.' : '';
        $nameColumn = $prefix . '`Name`';
        $descriptionColumn = $prefix . '`description`';

        return "CASE WHEN {$descriptionColumn} IS NOT NULL AND TRIM({$descriptionColumn}) <> '' "
            . "THEN CONCAT({$nameColumn}, ' - ', {$descriptionColumn}) ELSE {$nameColumn} END";
    }
}

if (!function_exists('monitoring_service_type_require_schema')) {
    function monitoring_service_type_require_schema(PDO $conn, string $featureLabel = 'service types'): void
    {
        monitoring_require_schema_columns(
            $conn,
            'services_type',
            ['Services_type_Id', 'Name', 'description'],
            $featureLabel
        );
    }
}

if (!function_exists('monitoring_service_type_from_row')) {
    function monitoring_service_type_from_row(array $row): ?array
    {
        $serviceId = (int)($row['Services_type_Id'] ?? $row['service_id'] ?? $row['id'] ?? 0);
        $serviceName = trim((string)($row['service_name'] ?? $row['raw_name'] ?? $row['Name'] ?? ''));
        if ($serviceName === '') {
            $serviceName = trim((string)($row['name'] ?? ''));
        }
        $description = trim((string)($row['description'] ?? $row['service_description'] ?? ''));

        if ($serviceId <= 0 || $serviceName === '') {
            return null;
        }

        $label = monitoring_service_type_label($serviceName, $description);

        return [
            'id' => $serviceId,
            'Services_type_Id' => $serviceId,
            'name' => $serviceName,
            'Name' => $serviceName,
            'description' => $description !== '' ? $description : null,
            'label' => $label,
            'service_label' => $label,
        ];
    }
}

if (!function_exists('monitoring_service_type_payload')) {
    function monitoring_service_type_payload(array $row, bool $disabled = false, array $extra = []): ?array
    {
        $service = monitoring_service_type_from_row($row);
        if ($service === null) {
            return null;
        }

        return array_merge([
            'id' => $service['id'],
            'Services_type_Id' => $service['id'],
            'name' => $service['label'],
            'service_label' => $service['label'],
            'display_name' => $service['label'],
            'service_name' => $service['name'],
            'raw_name' => $service['name'],
            'Name' => $service['name'],
            'description' => $service['description'],
            'disabled' => $disabled,
        ], $extra);
    }
}

if (!function_exists('monitoring_find_service_type')) {
    function monitoring_find_service_type(PDO $conn, $serviceValue = '', int $serviceId = 0, bool $fallbackToFirst = false): ?array
    {
        monitoring_service_type_require_schema($conn);

        $labelSql = monitoring_service_type_label_sql();
        if ($serviceId > 0) {
            $stmt = $conn->prepare(
                "SELECT Services_type_Id, Name, description, {$labelSql} AS service_label
                 FROM services_type
                 WHERE Services_type_Id = :service_id
                 LIMIT 1"
            );
            $stmt->execute([':service_id' => $serviceId]);
            $row = $stmt->fetch(PDO::FETCH_ASSOC);
            if ($row) {
                return monitoring_service_type_from_row($row);
            }
        }

        $serviceLabel = trim((string)$serviceValue);
        if ($serviceLabel !== '') {
            $stmt = $conn->prepare(
                "SELECT Services_type_Id, Name, description, {$labelSql} AS service_label
                 FROM services_type
                 WHERE LOWER(TRIM({$labelSql})) = LOWER(TRIM(:label_match))
                    OR LOWER(TRIM(Name)) = LOWER(TRIM(:name_match))
                 ORDER BY
                    CASE WHEN LOWER(TRIM({$labelSql})) = LOWER(TRIM(:label_order)) THEN 0 ELSE 1 END,
                    Services_type_Id ASC
                 LIMIT 1"
            );
            $stmt->execute([
                ':label_match' => $serviceLabel,
                ':name_match' => $serviceLabel,
                ':label_order' => $serviceLabel,
            ]);
            $row = $stmt->fetch(PDO::FETCH_ASSOC);
            if ($row) {
                return monitoring_service_type_from_row($row);
            }
        }

        if (!$fallbackToFirst) {
            return null;
        }

        $stmt = $conn->query(
            "SELECT Services_type_Id, Name, description, {$labelSql} AS service_label
             FROM services_type
             ORDER BY Services_type_Id ASC
             LIMIT 1"
        );
        $row = $stmt ? $stmt->fetch(PDO::FETCH_ASSOC) : null;
        return $row ? monitoring_service_type_from_row($row) : null;
    }
}

?>
