<?php

require_once __DIR__ . '/employee_specialization.php';
require_once __DIR__ . '/../../PHPMailer-master/src/Exception.php';
require_once __DIR__ . '/../../PHPMailer-master/src/PHPMailer.php';
require_once __DIR__ . '/../../PHPMailer-master/src/SMTP.php';

use PHPMailer\PHPMailer\PHPMailer;

if (!function_exists('monitoring_certificate_service_definitions')) {
    function monitoring_certificate_service_definitions(): array
    {
        return [
            'tax_filing' => [
                'key' => 'tax_filing',
                'label' => 'Tax Filing',
                'db_names' => ['Tax Filing'],
            ],
            'bookkeeping' => [
                'key' => 'bookkeeping',
                'label' => 'Bookkeeping',
                'db_names' => ['Book Keeping', 'Bookkeeping'],
            ],
            'auditing' => [
                'key' => 'auditing',
                'label' => 'Auditing',
                'db_names' => ['Auditing'],
            ],
        ];
    }
}

if (!function_exists('monitoring_certificate_page_definitions')) {
    function monitoring_certificate_page_definitions(): array
    {
        return [
            'A4' => ['label' => 'A4', 'width' => 794, 'height' => 1123],
            'LETTER' => ['label' => 'Letter', 'width' => 816, 'height' => 1056],
            'LEGAL' => ['label' => 'Legal', 'width' => 816, 'height' => 1344],
        ];
    }
}

if (!function_exists('monitoring_certificate_font_definitions')) {
    function monitoring_certificate_font_definitions(): array
    {
        return [
            'arial' => ['label' => 'Arial', 'family' => 'Arial, sans-serif'],
            'georgia' => ['label' => 'Georgia', 'family' => 'Georgia, serif'],
            'times' => ['label' => 'Times New Roman', 'family' => '"Times New Roman", serif'],
            'verdana' => ['label' => 'Verdana', 'family' => 'Verdana, sans-serif'],
            'trebuchet' => ['label' => 'Trebuchet MS', 'family' => '"Trebuchet MS", sans-serif'],
            'courier' => ['label' => 'Courier New', 'family' => '"Courier New", monospace'],
        ];
    }
}

if (!function_exists('monitoring_certificate_theme_definitions')) {
    function monitoring_certificate_theme_definitions(): array
    {
        return [
            'none' => [
                'label' => 'None',
                'has_decorations' => false,
                'sheet_background' => '#ffffff',
                'outer_border' => '#e2e8f0',
                'inner_border' => 'transparent',
                'accent_start' => 'transparent',
                'accent_end' => 'transparent',
                'seal_border' => 'transparent',
                'seal_glow' => 'transparent',
                'footer_rule' => 'transparent',
                'logo_border' => '#e2e8f0',
                'logo_background' => '#ffffff',
                'logo_shadow' => 'rgba(15, 23, 42, 0.08)',
                'shadow' => '0 28px 70px rgba(15, 23, 42, 0.16)',
            ],
            'classic' => [
                'label' => 'Classic',
                'has_decorations' => true,
                'sheet_background' => 'linear-gradient(180deg, #fffdf7 0%, #fff7ea 100%)',
                'outer_border' => 'rgba(180, 138, 62, 0.44)',
                'inner_border' => 'rgba(180, 138, 62, 0.24)',
                'accent_start' => 'rgba(180, 138, 62, 0.22)',
                'accent_end' => 'rgba(244, 200, 94, 0.12)',
                'seal_border' => 'rgba(180, 138, 62, 0.18)',
                'seal_glow' => 'rgba(244, 200, 94, 0.2)',
                'footer_rule' => 'rgba(180, 138, 62, 0.46)',
                'logo_border' => 'rgba(180, 138, 62, 0.28)',
                'logo_background' => 'rgba(255, 255, 255, 0.94)',
                'logo_shadow' => 'rgba(120, 85, 24, 0.12)',
                'shadow' => '0 28px 70px rgba(90, 62, 16, 0.12)',
            ],
            'royal' => [
                'label' => 'Royal Blue',
                'has_decorations' => true,
                'sheet_background' => 'linear-gradient(180deg, #fbfdff 0%, #edf4ff 100%)',
                'outer_border' => 'rgba(37, 99, 235, 0.4)',
                'inner_border' => 'rgba(37, 99, 235, 0.2)',
                'accent_start' => 'rgba(37, 99, 235, 0.24)',
                'accent_end' => 'rgba(147, 197, 253, 0.14)',
                'seal_border' => 'rgba(37, 99, 235, 0.16)',
                'seal_glow' => 'rgba(96, 165, 250, 0.18)',
                'footer_rule' => 'rgba(37, 99, 235, 0.42)',
                'logo_border' => 'rgba(37, 99, 235, 0.24)',
                'logo_background' => 'rgba(255, 255, 255, 0.95)',
                'logo_shadow' => 'rgba(37, 99, 235, 0.12)',
                'shadow' => '0 28px 70px rgba(30, 64, 175, 0.12)',
            ],
            'emerald' => [
                'label' => 'Emerald',
                'has_decorations' => true,
                'sheet_background' => 'linear-gradient(180deg, #fbfefb 0%, #eefcf4 100%)',
                'outer_border' => 'rgba(5, 150, 105, 0.4)',
                'inner_border' => 'rgba(5, 150, 105, 0.2)',
                'accent_start' => 'rgba(5, 150, 105, 0.2)',
                'accent_end' => 'rgba(110, 231, 183, 0.14)',
                'seal_border' => 'rgba(5, 150, 105, 0.16)',
                'seal_glow' => 'rgba(52, 211, 153, 0.18)',
                'footer_rule' => 'rgba(5, 150, 105, 0.42)',
                'logo_border' => 'rgba(5, 150, 105, 0.24)',
                'logo_background' => 'rgba(255, 255, 255, 0.95)',
                'logo_shadow' => 'rgba(5, 150, 105, 0.12)',
                'shadow' => '0 28px 70px rgba(6, 95, 70, 0.12)',
            ],
            'rose' => [
                'label' => 'Rose',
                'has_decorations' => true,
                'sheet_background' => 'linear-gradient(180deg, #fffdfd 0%, #fff1f3 100%)',
                'outer_border' => 'rgba(190, 24, 93, 0.32)',
                'inner_border' => 'rgba(190, 24, 93, 0.16)',
                'accent_start' => 'rgba(190, 24, 93, 0.18)',
                'accent_end' => 'rgba(253, 164, 175, 0.14)',
                'seal_border' => 'rgba(190, 24, 93, 0.14)',
                'seal_glow' => 'rgba(244, 114, 182, 0.16)',
                'footer_rule' => 'rgba(190, 24, 93, 0.36)',
                'logo_border' => 'rgba(190, 24, 93, 0.2)',
                'logo_background' => 'rgba(255, 255, 255, 0.95)',
                'logo_shadow' => 'rgba(157, 23, 77, 0.1)',
                'shadow' => '0 28px 70px rgba(136, 19, 55, 0.1)',
            ],
        ];
    }
}

if (!function_exists('monitoring_certificate_normalize_theme_key')) {
    function monitoring_certificate_normalize_theme_key($themeKey): string
    {
        $raw = trim((string)$themeKey);
        $definitions = monitoring_certificate_theme_definitions();

        return isset($definitions[$raw]) ? $raw : 'none';
    }
}

if (!function_exists('monitoring_certificate_safe_exec')) {
    function monitoring_certificate_safe_exec(PDO $conn, string $sql): void
    {
        try {
            $conn->exec($sql);
        } catch (Throwable $__) {
            // Keep runtime migrations best-effort only.
        }
    }
}

if (!function_exists('monitoring_certificate_index_exists')) {
    function monitoring_certificate_index_exists(PDO $conn, string $tableName, string $indexName): bool
    {
        try {
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
        } catch (Throwable $__) {
            return false;
        }
    }
}

if (!function_exists('monitoring_certificate_foreign_key_exists')) {
    function monitoring_certificate_foreign_key_exists(PDO $conn, string $tableName, string $constraintName): bool
    {
        try {
            $stmt = $conn->prepare(
                'SELECT 1
                 FROM information_schema.TABLE_CONSTRAINTS
                 WHERE TABLE_SCHEMA = DATABASE()
                   AND TABLE_NAME = :table_name
                   AND CONSTRAINT_NAME = :constraint_name
                   AND CONSTRAINT_TYPE = "FOREIGN KEY"
                 LIMIT 1'
            );
            $stmt->execute([
                ':table_name' => $tableName,
                ':constraint_name' => $constraintName,
            ]);
            return $stmt->fetchColumn() !== false;
        } catch (Throwable $__) {
            return false;
        }
    }
}

if (!function_exists('monitoring_certificate_json_encode')) {
    function monitoring_certificate_json_encode($value): string
    {
        return (string)json_encode($value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    }
}

if (!function_exists('monitoring_ensure_certificate_storage')) {
    function monitoring_ensure_certificate_storage(PDO $conn): void
    {
        static $checked = false;

        if ($checked) {
            return;
        }
        $checked = true;

        monitoring_require_schema_columns(
            $conn,
            'certificates',
            [
                'certificates_ID',
                'certificate_id',
                'Client_ID',
                'Client_services_ID',
                'Services_type_Id',
                'Edit_certificate_ID',
                'end_date',
                'issue_date',
                'issued_by',
                'company_name',
                'template_snapshot',
                'certificate_html',
                'recipient_email',
                'delivery_status',
                'delivery_message',
                'delivered_at',
                'created_at',
            ],
            'certificate storage'
        );
        monitoring_require_schema_columns(
            $conn,
            'edit_certificate',
            [
                'Edit_certificate_ID',
                'template_id',
                'Services_type_Id',
                'service_key',
                'template_name',
                'logo_src',
                'page_size',
                'font_family',
                'theme_key',
                'logo_block',
                'content_block',
                'text_blocks',
                'signature_blocks',
                'is_selected',
                'User_id',
                'created_at',
                'updated_at',
            ],
            'certificate templates'
        );
    }
}

if (!function_exists('monitoring_certificate_normalize_service_name')) {
    function monitoring_certificate_normalize_service_name(string $value): string
    {
        return trim((string)preg_replace('/\s+/', ' ', strtolower(str_replace(['_', '-'], ' ', trim($value)))));
    }
}

if (!function_exists('monitoring_certificate_resolve_service_definition')) {
    function monitoring_certificate_resolve_service_definition(string $value): ?array
    {
        $normalized = monitoring_certificate_normalize_service_name($value);
        if ($normalized === '') {
            return null;
        }

        foreach (monitoring_certificate_service_definitions() as $definition) {
            $candidates = array_merge([$definition['key'], $definition['label']], $definition['db_names']);
            foreach ($candidates as $candidate) {
                if ($normalized === monitoring_certificate_normalize_service_name((string)$candidate)) {
                    return $definition;
                }
            }
        }

        return null;
    }
}

if (!function_exists('monitoring_certificate_fetch_service_row')) {
    function monitoring_certificate_fetch_service_row(PDO $conn, string $serviceValue): ?array
    {
        $definition = monitoring_certificate_resolve_service_definition($serviceValue);
        if ($definition === null) {
            return null;
        }

        $dbNames = $definition['db_names'];
        $placeholders = implode(',', array_fill(0, count($dbNames), '?'));
        $stmt = $conn->prepare(
            "SELECT Services_type_Id, Name
             FROM services_type
             WHERE LOWER(TRIM(Name)) IN ({$placeholders})
             ORDER BY Services_type_Id ASC
             LIMIT 1"
        );

        foreach ($dbNames as $index => $dbName) {
            $stmt->bindValue($index + 1, strtolower(trim($dbName)), PDO::PARAM_STR);
        }

        $stmt->execute();
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$row) {
            return null;
        }

        return [
            'service_id' => (int)$row['Services_type_Id'],
            'service_name' => (string)$row['Name'],
            'service_key' => $definition['key'],
            'service_label' => $definition['label'],
        ];
    }
}

if (!function_exists('monitoring_certificate_default_logo_block')) {
    function monitoring_certificate_default_logo_block(): array
    {
        return ['x' => 346, 'y' => 72, 'size' => 102];
    }
}

if (!function_exists('monitoring_certificate_default_content_block')) {
    function monitoring_certificate_default_content_block(): array
    {
        return [
            'x' => 90,
            'y' => 352,
            'width' => 540,
            'text' => '',
            'fontSize' => 30,
            'bold' => false,
            'align' => 'center',
            'color' => '#0f172a',
        ];
    }
}

if (!function_exists('monitoring_certificate_default_guide_title_text')) {
    function monitoring_certificate_default_guide_title_text(): string
    {
        return 'CERTIFICATE OF SERVICE COMPLETION';
    }
}

if (!function_exists('monitoring_certificate_default_guide_body_text')) {
    function monitoring_certificate_default_guide_body_text(): string
    {
        return "This is to certify that\n\n[CLIENT NAME]\n\nhas successfully completed the [SERVICE TYPE]\nprovided by [COMPANY NAME].\n\nThe service covered the period from [START DATE] to [END DATE],\nand has been completed in accordance with professional accounting standards.\n\nThis certificate is issued as proof that the required service has been duly completed.\n\nIssued this [DATE]\n\n[COMPANY NAME]";
    }
}

if (!function_exists('monitoring_certificate_legacy_guide_body_text')) {
    function monitoring_certificate_legacy_guide_body_text(): string
    {
        return "This is to certify that\n[Client Name]\n\nhas successfully completed the [Service Type]\nprovided by [Company Name].\n\nThe service covered the period from [Start Date] to [End Date],\nand has been completed in accordance with professional accounting standards.\n\nThis certificate is issued as proof that the required service has been duly completed.\n\nIssued this [Date]\n\n[Accountant Name]\nAuthorized Accountant\n\n[Company Name]\n\nCertificate ID: [Certificate ID]";
    }
}

if (!function_exists('monitoring_certificate_legacy_guide_body_with_signature_text')) {
    function monitoring_certificate_legacy_guide_body_with_signature_text(): string
    {
        return "This is to certify that\n\n[CLIENT NAME]\n\nhas successfully completed the [SERVICE TYPE]\nprovided by [COMPANY NAME].\n\nThe service covered the period from [START DATE] to [END DATE],\nand has been completed in accordance with professional accounting standards.\n\nThis certificate is issued as proof that the required service has been duly completed.\n\nIssued this [DATE]\n\n[AUTHORIZED SIGNATORY NAME]\nAuthorized Representative\n\n[COMPANY NAME]\n\nCertificate ID: [CERTIFICATE ID]";
    }
}

if (!function_exists('monitoring_certificate_legacy_guide_body_with_certificate_id_text')) {
    function monitoring_certificate_legacy_guide_body_with_certificate_id_text(): string
    {
        return "This is to certify that\n\n[CLIENT NAME]\n\nhas successfully completed the [SERVICE TYPE]\nprovided by [COMPANY NAME].\n\nThe service covered the period from [START DATE] to [END DATE],\nand has been completed in accordance with professional accounting standards.\n\nThis certificate is issued as proof that the required service has been duly completed.\n\nIssued this [DATE]\n\n[COMPANY NAME]\n\nCertificate ID: [CERTIFICATE ID]";
    }
}

if (!function_exists('monitoring_certificate_default_guide_footer_text')) {
    function monitoring_certificate_default_guide_footer_text(): string
    {
        return 'Certificate ID: [CERTIFICATE ID]';
    }
}

if (!function_exists('monitoring_certificate_default_guide_signature_label')) {
    function monitoring_certificate_default_guide_signature_label(): string
    {
        return "[AUTHORIZED SIGNATORY NAME]\nAuthorized Representative";
    }
}

if (!function_exists('monitoring_certificate_default_guide_text_blocks')) {
    function monitoring_certificate_default_guide_text_blocks(): array
    {
        return [
            [
                'id' => 'default-title',
                'x' => 120,
                'y' => 220,
                'width' => 554,
                'text' => monitoring_certificate_default_guide_title_text(),
                'fontSize' => 24,
                'bold' => true,
                'align' => 'center',
                'color' => '#000000',
            ],
            [
                'id' => 'default-body',
                'x' => 124,
                'y' => 304,
                'width' => 548,
                'text' => monitoring_certificate_default_guide_body_text(),
                'fontSize' => 18,
                'bold' => false,
                'align' => 'left',
                'color' => '#000000',
            ],
            [
                'id' => 'default-footer',
                'x' => 124,
                'y' => 1051,
                'width' => 548,
                'text' => monitoring_certificate_default_guide_footer_text(),
                'fontSize' => 14,
                'bold' => false,
                'align' => 'left',
                'color' => '#000000',
            ],
        ];
    }
}

if (!function_exists('monitoring_certificate_default_guide_signature_blocks')) {
    function monitoring_certificate_default_guide_signature_blocks(): array
    {
        return [
            [
                'id' => 'default-authorized-signature',
                'x' => 474,
                'y' => 938,
                'width' => 220,
                'label' => monitoring_certificate_default_guide_signature_label(),
                'fontSize' => 11,
                'color' => '#000000',
                'signatureSrc' => '',
            ],
        ];
    }
}

if (!function_exists('monitoring_certificate_text_has_dynamic_placeholders')) {
    function monitoring_certificate_text_has_dynamic_placeholders(string $text): bool
    {
        return preg_match(
            '/\[(Client Name|Service Name|Service Type|Issue Date|Date|Company Name|Certificate ID|Issued By|Client Email|Start Date|End Date|Accountant Name|Admin Name|Owner Name|Authorized Signatory Name)\]|{{(client_name|service_name|service_type|issue_date|date|company_name|certificate_id|issued_by|client_email|start_date|end_date|accountant_name|admin_name|owner_name|authorized_signatory_name)}}/i',
            $text
        ) === 1;
    }
}

if (!function_exists('monitoring_certificate_looks_like_legacy_guide_text')) {
    function monitoring_certificate_looks_like_legacy_guide_text(string $text): bool
    {
        $normalized = strtolower(trim((string)preg_replace('/\s+/', ' ', $text)));
        if ($normalized === '') {
            return false;
        }

        return strpos($normalized, 'this is to certify that') !== false
            && strpos($normalized, 'has successfully completed') !== false
            && strpos($normalized, 'certificate id:') !== false;
    }
}

if (!function_exists('monitoring_certificate_normalize_guide_text')) {
    function monitoring_certificate_normalize_guide_text($value): string
    {
        return strtolower(trim(str_replace("\r\n", "\n", (string)$value)));
    }
}

if (!function_exists('monitoring_certificate_matches_guide_text')) {
    function monitoring_certificate_matches_guide_text($value, $expected): bool
    {
        return monitoring_certificate_normalize_guide_text($value) === monitoring_certificate_normalize_guide_text($expected);
    }
}

if (!function_exists('monitoring_certificate_is_default_guide_signature_block')) {
    function monitoring_certificate_is_default_guide_signature_block($block): bool
    {
        if (!is_array($block)) {
            return false;
        }

        $label = monitoring_certificate_normalize_guide_text((string)($block['label'] ?? ''));
        $hasSignatureImage = trim((string)($block['signatureSrc'] ?? '')) !== '';

        return !$hasSignatureImage && (
            $label === monitoring_certificate_normalize_guide_text(monitoring_certificate_default_guide_signature_label())
            || $label === monitoring_certificate_normalize_guide_text('Signature: [Admin Name]')
            || $label === monitoring_certificate_normalize_guide_text('Signature [Admin Name]')
            || $label === monitoring_certificate_normalize_guide_text('Authorized Signature')
        );
    }
}

if (!function_exists('monitoring_certificate_apply_guide_defaults')) {
    function monitoring_certificate_apply_guide_defaults(array $template): array
    {
        $hasMainContent = trim((string)($template['contentBlock']['text'] ?? '')) !== '';
        $hasTextBlocks = false;
        foreach (($template['textBlocks'] ?? []) as $block) {
            if (trim((string)($block['text'] ?? '')) !== '') {
                $hasTextBlocks = true;
                break;
            }
        }

        $guideDetected = false;

        if (
            !$hasMainContent
            && !$hasTextBlocks
            && empty($template['signatureBlocks'])
        ) {
            $template['textBlocks'] = monitoring_certificate_default_guide_text_blocks();
            $template['signatureBlocks'] = monitoring_certificate_default_guide_signature_blocks();
            return $template;
        }

        $template['signatureBlocks'] = array_values(array_filter(
            is_array($template['signatureBlocks'] ?? null) ? $template['signatureBlocks'] : [],
            static fn($block) => !monitoring_certificate_is_default_guide_signature_block($block)
        ));

        $contentText = trim((string)($template['contentBlock']['text'] ?? ''));
        if (
            $contentText !== ''
            && (
                monitoring_certificate_matches_guide_text($contentText, monitoring_certificate_legacy_guide_body_with_certificate_id_text())
                || (
                monitoring_certificate_matches_guide_text($contentText, monitoring_certificate_legacy_guide_body_with_signature_text())
                )
                || (
                    monitoring_certificate_matches_guide_text($contentText, monitoring_certificate_legacy_guide_body_text())
                )
                || (
                    monitoring_certificate_looks_like_legacy_guide_text($contentText)
                    && !monitoring_certificate_text_has_dynamic_placeholders($contentText)
                )
            )
        ) {
            $template['contentBlock']['text'] = monitoring_certificate_default_guide_body_text();
            $template['contentBlock']['fontSize'] = 18;
            $template['contentBlock']['align'] = 'left';
            $template['contentBlock']['color'] = '#000000';
            $guideDetected = true;
        }

        $hasTitleBlock = false;
        $textBlocks = [];
        $hasGuideFooter = false;
        foreach (($template['textBlocks'] ?? []) as $block) {
            if (!is_array($block)) {
                continue;
            }

            $text = trim((string)($block['text'] ?? ''));
            if (strcasecmp($text, monitoring_certificate_default_guide_title_text()) === 0) {
                $hasTitleBlock = true;
            }
            if (monitoring_certificate_matches_guide_text($text, monitoring_certificate_default_guide_footer_text())) {
                $hasGuideFooter = true;
            }

            if (
                $text !== ''
                && (
                    monitoring_certificate_matches_guide_text($text, monitoring_certificate_legacy_guide_body_with_certificate_id_text())
                    || (
                    monitoring_certificate_matches_guide_text($text, monitoring_certificate_legacy_guide_body_with_signature_text())
                    )
                    || (
                        monitoring_certificate_matches_guide_text($text, monitoring_certificate_legacy_guide_body_text())
                    )
                    || (
                        monitoring_certificate_looks_like_legacy_guide_text($text)
                        && !monitoring_certificate_text_has_dynamic_placeholders($text)
                    )
                )
            ) {
                $block['text'] = monitoring_certificate_default_guide_body_text();
                $block['fontSize'] = 18;
                $block['align'] = 'left';
                $block['color'] = '#000000';
                $guideDetected = true;
            }

            $textBlocks[] = $block;
        }

        if ($guideDetected && !$hasTitleBlock) {
            array_unshift($textBlocks, monitoring_certificate_default_guide_text_blocks()[0]);
        }
        $hasGuideBody = monitoring_certificate_matches_guide_text($contentText, monitoring_certificate_default_guide_body_text())
            || monitoring_certificate_matches_guide_text($contentText, monitoring_certificate_legacy_guide_body_with_certificate_id_text())
            || monitoring_certificate_matches_guide_text($contentText, monitoring_certificate_legacy_guide_body_with_signature_text());
        if (!$hasGuideBody) {
            foreach ($textBlocks as $block) {
                if (
                    monitoring_certificate_matches_guide_text((string)($block['text'] ?? ''), monitoring_certificate_default_guide_body_text())
                    || monitoring_certificate_matches_guide_text((string)($block['text'] ?? ''), monitoring_certificate_legacy_guide_body_with_certificate_id_text())
                    || monitoring_certificate_matches_guide_text((string)($block['text'] ?? ''), monitoring_certificate_legacy_guide_body_with_signature_text())
                ) {
                    $hasGuideBody = true;
                    break;
                }
            }
        }

        if (($guideDetected || ($hasTitleBlock && $hasGuideBody)) && !$hasGuideFooter) {
            $textBlocks[] = monitoring_certificate_default_guide_text_blocks()[2];
            $hasGuideFooter = true;
        }
        $template['textBlocks'] = $textBlocks;

        if (($guideDetected || ($hasTitleBlock && $hasGuideBody)) && empty($template['signatureBlocks'])) {
            $template['signatureBlocks'] = monitoring_certificate_default_guide_signature_blocks();
        }

        return $template;
    }
}

if (!function_exists('monitoring_certificate_decode_json_array')) {
    function monitoring_certificate_decode_json_array($value, array $fallback): array
    {
        if (is_array($value)) {
            return $value;
        }

        $text = trim((string)$value);
        if ($text === '') {
            return $fallback;
        }

        $decoded = json_decode($text, true);
        return is_array($decoded) ? $decoded : $fallback;
    }
}

if (!function_exists('monitoring_certificate_normalize_template_payload')) {
    function monitoring_certificate_normalize_template_payload($template): array
    {
        $source = is_array($template) ? $template : [];

        return monitoring_certificate_apply_guide_defaults([
            'themeKey' => monitoring_certificate_normalize_theme_key($source['themeKey'] ?? 'none'),
            'pageSize' => trim((string)($source['pageSize'] ?? 'A4')) ?: 'A4',
            'fontFamily' => trim((string)($source['fontFamily'] ?? 'arial')) ?: 'arial',
            'logoSrc' => (string)($source['logoSrc'] ?? ''),
            'logoBlock' => is_array($source['logoBlock'] ?? null)
                ? $source['logoBlock']
                : monitoring_certificate_default_logo_block(),
            'contentBlock' => is_array($source['contentBlock'] ?? null)
                ? $source['contentBlock']
                : monitoring_certificate_default_content_block(),
            'textBlocks' => is_array($source['textBlocks'] ?? null) ? array_values($source['textBlocks']) : [],
            'signatureBlocks' => is_array($source['signatureBlocks'] ?? null) ? array_values($source['signatureBlocks']) : [],
        ]);
    }
}

if (!function_exists('monitoring_certificate_trim_asset_for_storage')) {
    function monitoring_certificate_trim_asset_for_storage($value): string
    {
        $text = trim((string)$value);
        if ($text === '') {
            return '';
        }

        if (stripos($text, 'data:') === 0 || strlen($text) > 2048) {
            return '';
        }

        return $text;
    }
}

if (!function_exists('monitoring_certificate_prepare_template_for_storage')) {
    function monitoring_certificate_prepare_template_for_storage(array $template): array
    {
        $normalized = monitoring_certificate_normalize_template_payload($template);
        $normalized['logoSrc'] = monitoring_certificate_trim_asset_for_storage($normalized['logoSrc'] ?? '');

        $signatureBlocks = [];
        foreach (($normalized['signatureBlocks'] ?? []) as $block) {
            if (!is_array($block)) {
                continue;
            }

            $nextBlock = $block;
            $nextBlock['signatureSrc'] = monitoring_certificate_trim_asset_for_storage($block['signatureSrc'] ?? '');
            $signatureBlocks[] = $nextBlock;
        }
        $normalized['signatureBlocks'] = $signatureBlocks;

        return $normalized;
    }
}

if (!function_exists('monitoring_certificate_row_to_entry')) {
    function monitoring_certificate_row_to_entry(array $row): array
    {
        $serviceKey = trim((string)($row['service_key'] ?? ''));
        if ($serviceKey === '' && !empty($row['service_name'])) {
            $definition = monitoring_certificate_resolve_service_definition((string)$row['service_name']);
            $serviceKey = $definition['key'] ?? 'tax_filing';
        }
        if ($serviceKey === '') {
            $serviceKey = 'tax_filing';
        }

        $editorUserId = isset($row['User_id']) && $row['User_id'] !== null ? (int)$row['User_id'] : null;
        $editorUser = [
            'first_name' => trim((string)($row['editor_first_name'] ?? '')),
            'middle_name' => trim((string)($row['editor_middle_name'] ?? '')),
            'last_name' => trim((string)($row['editor_last_name'] ?? '')),
            'username' => trim((string)($row['editor_username'] ?? '')),
            'email' => trim((string)($row['editor_email'] ?? '')),
        ];
        $hasEditorDetails = false;
        foreach ($editorUser as $value) {
            if ($value !== '') {
                $hasEditorDetails = true;
                break;
            }
        }
        $editorName = $hasEditorDetails
            ? monitoring_certificate_user_display_name($editorUser)
            : null;

        return [
            'id' => trim((string)($row['template_id'] ?? '')),
            'serviceKey' => $serviceKey,
            'createdAt' => isset($row['created_at']) ? (string)$row['created_at'] : null,
            'updatedAt' => isset($row['updated_at']) ? (string)$row['updated_at'] : null,
            'templateName' => trim((string)($row['template_name'] ?? '')) ?: null,
            'editorUserId' => $editorUserId > 0 ? $editorUserId : null,
            'editorName' => $editorName,
            'isSelected' => !empty($row['is_selected']),
            'template' => [
                'themeKey' => monitoring_certificate_normalize_theme_key($row['theme_key'] ?? 'none'),
                'pageSize' => trim((string)($row['page_size'] ?? 'A4')) ?: 'A4',
                'fontFamily' => trim((string)($row['font_family'] ?? 'arial')) ?: 'arial',
                'logoSrc' => (string)($row['logo_src'] ?? ''),
                'logoBlock' => monitoring_certificate_decode_json_array($row['logo_block'] ?? '', monitoring_certificate_default_logo_block()),
                'contentBlock' => monitoring_certificate_decode_json_array($row['content_block'] ?? '', monitoring_certificate_default_content_block()),
                'textBlocks' => monitoring_certificate_decode_json_array($row['text_blocks'] ?? '', []),
                'signatureBlocks' => monitoring_certificate_decode_json_array($row['signature_blocks'] ?? '', []),
            ],
        ];
    }
}

if (!function_exists('monitoring_certificate_build_state')) {
    function monitoring_certificate_build_state(PDO $conn): ?array
    {
        monitoring_ensure_certificate_storage($conn);

        $stmt = $conn->query(
            'SELECT
                ec.*,
                st.Name AS service_name,
                editor_user.Username AS editor_username,
                editor_user.first_name AS editor_first_name,
                editor_user.middle_name AS editor_middle_name,
                editor_user.last_name AS editor_last_name,
                editor_user.Email AS editor_email
             FROM edit_certificate ec
             LEFT JOIN services_type st ON st.Services_type_Id = ec.Services_type_Id
             LEFT JOIN user editor_user ON editor_user.User_id = ec.User_id
             ORDER BY ec.updated_at DESC, ec.Edit_certificate_ID DESC'
        );
        $rows = $stmt ? ($stmt->fetchAll(PDO::FETCH_ASSOC) ?: []) : [];

        $entries = [];
        foreach ($rows as $row) {
            $entry = monitoring_certificate_row_to_entry($row);
            if ($entry['id'] === '') {
                continue;
            }
            $entries[] = $entry;
        }

        if (empty($entries)) {
            return null;
        }

        $selectedTemplateIds = [];
        foreach (array_keys(monitoring_certificate_service_definitions()) as $serviceKey) {
            foreach ($entries as $entry) {
                if ($entry['serviceKey'] === $serviceKey && !empty($entry['isSelected'])) {
                    $selectedTemplateIds[] = $entry['id'];
                    break;
                }
            }
        }

        $fallback = !empty($selectedTemplateIds)
            ? $selectedTemplateIds[0]
            : $entries[0]['id'];

        $selectedService = 'tax_filing';
        foreach ($entries as $entry) {
            if ($entry['id'] === $fallback) {
                $selectedService = $entry['serviceKey'];
                break;
            }
        }

        return [
            'selectedService' => $selectedService,
            'selectedTemplateId' => $fallback,
            'selectedTemplateIds' => array_slice($selectedTemplateIds, 0, 3),
            'templates' => array_map(static function (array $entry): array {
                return [
                    'id' => $entry['id'],
                    'serviceKey' => $entry['serviceKey'],
                    'createdAt' => $entry['createdAt'],
                    'updatedAt' => $entry['updatedAt'],
                    'templateName' => $entry['templateName'],
                    'editorUserId' => $entry['editorUserId'],
                    'editorName' => $entry['editorName'],
                    'template' => $entry['template'],
                ];
            }, $entries),
        ];
    }
}

if (!function_exists('monitoring_certificate_generate_template_id')) {
    function monitoring_certificate_generate_template_id(): string
    {
        try {
            $suffix = bin2hex(random_bytes(4));
        } catch (Throwable $__) {
            $suffix = substr(md5(uniqid((string)mt_rand(), true)), 0, 8);
        }

        return 'certificate-' . time() . '-' . $suffix;
    }
}

if (!function_exists('monitoring_certificate_generate_record_id')) {
    function monitoring_certificate_generate_record_id(PDO $conn): string
    {
        monitoring_ensure_certificate_storage($conn);

        for ($attempt = 0; $attempt < 5; $attempt++) {
            try {
                $suffix = strtoupper(substr(bin2hex(random_bytes(3)), 0, 6));
            } catch (Throwable $__) {
                $suffix = strtoupper(substr(md5(uniqid((string)mt_rand(), true)), 0, 6));
            }

            $candidate = 'CERT-' . date('Ymd') . '-' . $suffix;
            $stmt = $conn->prepare('SELECT certificates_ID FROM certificates WHERE certificate_id = :certificate_id LIMIT 1');
            $stmt->execute([':certificate_id' => $candidate]);
            if (!$stmt->fetchColumn()) {
                return $candidate;
            }
        }

        return 'CERT-' . date('YmdHis') . '-' . strtoupper((string)mt_rand(1000, 9999));
    }
}

if (!function_exists('monitoring_certificate_upsert_template')) {
    function monitoring_certificate_upsert_template(PDO $conn, array $payload, array $issuerUser = []): array
    {
        monitoring_ensure_certificate_storage($conn);

        $serviceKey = trim((string)($payload['service_key'] ?? $payload['serviceKey'] ?? ''));
        $service = monitoring_certificate_fetch_service_row($conn, $serviceKey);
        if ($service === null) {
            throw new RuntimeException('Invalid certificate service.');
        }

        $template = monitoring_certificate_normalize_template_payload($payload['template'] ?? null);
        $templateId = trim((string)($payload['template_id'] ?? $payload['id'] ?? ''));
        $templateName = trim((string)($payload['template_name'] ?? $payload['templateName'] ?? ''));
        if ($templateName === '') {
            $templateName = $service['service_label'] . ' Certificate';
        }

        $selectAfterSave = !empty($payload['select_after_save']);

        $existing = null;
        if ($templateId !== '') {
            $stmt = $conn->prepare('SELECT * FROM edit_certificate WHERE template_id = :template_id LIMIT 1');
            $stmt->execute([':template_id' => $templateId]);
            $existing = $stmt->fetch(PDO::FETCH_ASSOC) ?: null;
        }

        if ($templateId === '') {
            $templateId = monitoring_certificate_generate_template_id();
        }

        $selectionStmt = $conn->prepare(
            'SELECT template_id
             FROM edit_certificate
             WHERE Services_type_Id = :service_id
               AND is_selected = 1
             LIMIT 1'
        );
        $selectionStmt->execute([':service_id' => $service['service_id']]);
        $hasSelectedTemplate = $selectionStmt->fetchColumn() !== false;

        $isSelected = $existing ? !empty($existing['is_selected']) : false;
        if (array_key_exists('is_selected', $payload)) {
            $isSelected = !empty($payload['is_selected']);
        } elseif (!$existing && (!$hasSelectedTemplate || $selectAfterSave)) {
            $isSelected = true;
        }
        $editorUserId = isset($issuerUser['id']) ? (int)$issuerUser['id'] : 0;
        $editorUserId = $editorUserId > 0 ? $editorUserId : null;

        $conn->beginTransaction();
        try {
            if ($isSelected) {
                $clearStmt = $conn->prepare(
                    'UPDATE edit_certificate
                     SET is_selected = 0
                     WHERE Services_type_Id = :service_id
                       AND template_id <> :template_id'
                );
                $clearStmt->execute([
                    ':service_id' => $service['service_id'],
                    ':template_id' => $templateId,
                ]);
            }

            if ($existing) {
                $stmt = $conn->prepare(
                    'UPDATE edit_certificate
                     SET Services_type_Id = :service_id,
                        service_key = :service_key,
                        template_name = :template_name,
                        logo_src = :logo_src,
                        page_size = :page_size,
                        font_family = :font_family,
                        theme_key = :theme_key,
                         logo_block = :logo_block,
                        content_block = :content_block,
                        text_blocks = :text_blocks,
                        signature_blocks = :signature_blocks,
                        User_id = :user_id,
                        is_selected = :is_selected
                     WHERE template_id = :template_id'
                );
            } else {
                $stmt = $conn->prepare(
                    'INSERT INTO edit_certificate
                        (template_id, Services_type_Id, service_key, template_name, logo_src, page_size, font_family, theme_key, logo_block, content_block, text_blocks, signature_blocks, is_selected, User_id)
                     VALUES
                        (:template_id, :service_id, :service_key, :template_name, :logo_src, :page_size, :font_family, :theme_key, :logo_block, :content_block, :text_blocks, :signature_blocks, :is_selected, :user_id)'
                );
            }

            $stmt->execute([
                ':template_id' => $templateId,
                ':service_id' => $service['service_id'],
                ':service_key' => $service['service_key'],
                ':template_name' => $templateName,
                ':logo_src' => trim((string)($template['logoSrc'] ?? '')) !== '' ? (string)$template['logoSrc'] : null,
                ':page_size' => (string)$template['pageSize'],
                ':font_family' => (string)$template['fontFamily'],
                ':theme_key' => monitoring_certificate_normalize_theme_key($template['themeKey'] ?? 'none'),
                ':logo_block' => monitoring_certificate_json_encode($template['logoBlock']),
                ':content_block' => monitoring_certificate_json_encode($template['contentBlock']),
                ':text_blocks' => monitoring_certificate_json_encode($template['textBlocks']),
                ':signature_blocks' => monitoring_certificate_json_encode($template['signatureBlocks']),
                ':user_id' => $editorUserId,
                ':is_selected' => $isSelected ? 1 : 0,
            ]);

            $conn->commit();
        } catch (Throwable $e) {
            if ($conn->inTransaction()) {
                $conn->rollBack();
            }
            throw $e;
        }

        $sync = $isSelected
            ? monitoring_certificate_sync_pending_for_service($conn, (int)$service['service_id'], $issuerUser)
            : null;

        return [
            'templateId' => $templateId,
            'state' => monitoring_certificate_build_state($conn),
            'sync' => $sync,
        ];
    }
}

if (!function_exists('monitoring_certificate_set_selected_templates')) {
    function monitoring_certificate_set_selected_templates(PDO $conn, array $templateIds, array $issuerUser = []): ?array
    {
        monitoring_ensure_certificate_storage($conn);

        $normalizedTemplateIds = [];
        foreach ($templateIds as $templateId) {
            $value = trim((string)$templateId);
            if ($value === '' || in_array($value, $normalizedTemplateIds, true)) {
                continue;
            }
            $normalizedTemplateIds[] = $value;
        }
        $normalizedTemplateIds = array_slice($normalizedTemplateIds, 0, 3);

        $rowsById = [];
        if (!empty($normalizedTemplateIds)) {
            $placeholders = implode(',', array_fill(0, count($normalizedTemplateIds), '?'));
            $stmt = $conn->prepare(
                "SELECT template_id, Services_type_Id, service_key
                 FROM edit_certificate
                 WHERE template_id IN ({$placeholders})"
            );
            foreach ($normalizedTemplateIds as $index => $templateId) {
                $stmt->bindValue($index + 1, $templateId, PDO::PARAM_STR);
            }
            $stmt->execute();
            foreach (($stmt->fetchAll(PDO::FETCH_ASSOC) ?: []) as $row) {
                $rowsById[(string)$row['template_id']] = $row;
            }
        }

        $selectedByService = [];
        foreach ($normalizedTemplateIds as $templateId) {
            if (!isset($rowsById[$templateId])) {
                continue;
            }

            $row = $rowsById[$templateId];
            $serviceKey = trim((string)($row['service_key'] ?? ''));
            if ($serviceKey === '') {
                continue;
            }
            $selectedByService[$serviceKey] = (string)$row['template_id'];
        }

        $finalTemplateIds = array_values($selectedByService);

        $conn->beginTransaction();
        try {
            $conn->exec('UPDATE edit_certificate SET is_selected = 0');

            if (!empty($finalTemplateIds)) {
                $placeholders = implode(',', array_fill(0, count($finalTemplateIds), '?'));
                $stmt = $conn->prepare(
                    "UPDATE edit_certificate
                     SET is_selected = 1
                     WHERE template_id IN ({$placeholders})"
                );
                foreach ($finalTemplateIds as $index => $templateId) {
                    $stmt->bindValue($index + 1, $templateId, PDO::PARAM_STR);
                }
                $stmt->execute();
            }

            $conn->commit();
        } catch (Throwable $e) {
            if ($conn->inTransaction()) {
                $conn->rollBack();
            }
            throw $e;
        }

        $serviceIdsToSync = [];
        foreach ($rowsById as $row) {
            $serviceId = isset($row['Services_type_Id']) ? (int)$row['Services_type_Id'] : 0;
            if ($serviceId > 0 && in_array((string)$row['template_id'], $finalTemplateIds, true)) {
                $serviceIdsToSync[$serviceId] = $serviceId;
            }
        }

        foreach (array_values($serviceIdsToSync) as $serviceId) {
            monitoring_certificate_sync_pending_for_service($conn, $serviceId, $issuerUser);
        }

        return monitoring_certificate_build_state($conn);
    }
}

if (!function_exists('monitoring_certificate_delete_template')) {
    function monitoring_certificate_delete_template(PDO $conn, string $templateId, array $issuerUser = []): ?array
    {
        monitoring_ensure_certificate_storage($conn);

        $templateId = trim($templateId);
        if ($templateId === '') {
            throw new RuntimeException('template_id is required.');
        }

        $stmt = $conn->prepare('SELECT * FROM edit_certificate WHERE template_id = :template_id LIMIT 1');
        $stmt->execute([':template_id' => $templateId]);
        $existing = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$existing) {
            throw new RuntimeException('Certificate template not found.');
        }

        $serviceId = isset($existing['Services_type_Id']) ? (int)$existing['Services_type_Id'] : 0;
        $wasSelected = !empty($existing['is_selected']);

        $conn->beginTransaction();
        try {
            $deleteStmt = $conn->prepare('DELETE FROM edit_certificate WHERE template_id = :template_id');
            $deleteStmt->execute([':template_id' => $templateId]);

            if ($wasSelected && $serviceId > 0) {
                $replacementStmt = $conn->prepare(
                    'SELECT Edit_certificate_ID
                     FROM edit_certificate
                     WHERE Services_type_Id = :service_id
                     ORDER BY updated_at DESC, Edit_certificate_ID DESC
                     LIMIT 1'
                );
                $replacementStmt->execute([':service_id' => $serviceId]);
                $replacementId = (int)($replacementStmt->fetchColumn() ?: 0);
                if ($replacementId > 0) {
                    $selectStmt = $conn->prepare('UPDATE edit_certificate SET is_selected = 1 WHERE Edit_certificate_ID = :id');
                    $selectStmt->execute([':id' => $replacementId]);
                }
            }

            $conn->commit();
        } catch (Throwable $e) {
            if ($conn->inTransaction()) {
                $conn->rollBack();
            }
            throw $e;
        }

        if ($wasSelected && $serviceId > 0) {
            monitoring_certificate_sync_pending_for_service($conn, $serviceId, $issuerUser);
        }

        return monitoring_certificate_build_state($conn);
    }
}

if (!function_exists('monitoring_certificate_escape_html')) {
    function monitoring_certificate_escape_html($value): string
    {
        return htmlspecialchars((string)$value, ENT_QUOTES, 'UTF-8');
    }
}

if (!function_exists('monitoring_certificate_render_text')) {
    function monitoring_certificate_render_text(string $text, array $tokens): string
    {
        return strtr($text, $tokens);
    }
}

if (!function_exists('monitoring_certificate_build_tokens')) {
    function monitoring_certificate_build_tokens(array $context): array
    {
        $clientName = (string)($context['client_name'] ?? '');
        $serviceName = (string)($context['service_name'] ?? '');
        $serviceType = (string)($context['service_type'] ?? $context['service_name'] ?? '');
        $issueDate = (string)($context['issue_date_display'] ?? '');
        $dateDisplay = (string)($context['date_display'] ?? $context['issue_date_display'] ?? '');
        $companyName = (string)($context['company_name'] ?? '');
        $certificateId = (string)($context['certificate_id'] ?? '');
        $issuedBy = (string)($context['issued_by'] ?? '');
        $clientEmail = (string)($context['client_email'] ?? '');
        $startDate = (string)($context['start_date_display'] ?? '');
        $endDate = (string)($context['end_date_display'] ?? '');
        $accountantName = (string)($context['accountant_name'] ?? '');
        $adminName = (string)($context['admin_name'] ?? '');
        $ownerName = (string)($context['owner_name'] ?? $context['admin_name'] ?? '');
        $authorizedSignatoryName = (string)($context['authorized_signatory_name'] ?? $context['owner_name'] ?? $context['admin_name'] ?? $context['accountant_name'] ?? '');

        return [
            '[Client Name]' => $clientName,
            '[CLIENT NAME]' => $clientName,
            '[Service Name]' => $serviceName,
            '[SERVICE NAME]' => $serviceName,
            '[Service Type]' => $serviceType,
            '[SERVICE TYPE]' => $serviceType,
            '[Issue Date]' => $issueDate,
            '[ISSUE DATE]' => $issueDate,
            '[Date]' => $dateDisplay,
            '[DATE]' => $dateDisplay,
            '[Company Name]' => $companyName,
            '[COMPANY NAME]' => $companyName,
            '[Certificate ID]' => $certificateId,
            '[CERTIFICATE ID]' => $certificateId,
            '[Issued By]' => $issuedBy,
            '[ISSUED BY]' => $issuedBy,
            '[Client Email]' => $clientEmail,
            '[CLIENT EMAIL]' => $clientEmail,
            '[Start Date]' => $startDate,
            '[START DATE]' => $startDate,
            '[End Date]' => $endDate,
            '[END DATE]' => $endDate,
            '[Accountant Name]' => $accountantName,
            '[ACCOUNTANT NAME]' => $accountantName,
            '[Admin Name]' => $adminName,
            '[ADMIN NAME]' => $adminName,
            '[Owner Name]' => $ownerName,
            '[OWNER NAME]' => $ownerName,
            '[Authorized Signatory Name]' => $authorizedSignatoryName,
            '[AUTHORIZED SIGNATORY NAME]' => $authorizedSignatoryName,
            '{{client_name}}' => $clientName,
            '{{service_name}}' => $serviceName,
            '{{service_type}}' => $serviceType,
            '{{issue_date}}' => $issueDate,
            '{{date}}' => $dateDisplay,
            '{{company_name}}' => $companyName,
            '{{certificate_id}}' => $certificateId,
            '{{issued_by}}' => $issuedBy,
            '{{client_email}}' => $clientEmail,
            '{{start_date}}' => $startDate,
            '{{end_date}}' => $endDate,
            '{{accountant_name}}' => $accountantName,
            '{{admin_name}}' => $adminName,
            '{{owner_name}}' => $ownerName,
            '{{authorized_signatory_name}}' => $authorizedSignatoryName,
        ];
    }
}

if (!function_exists('monitoring_certificate_render_template')) {
    function monitoring_certificate_render_template(array $template, array $tokens): array
    {
        $normalized = monitoring_certificate_normalize_template_payload($template);

        $normalized['contentBlock']['text'] = monitoring_certificate_render_text(
            (string)($normalized['contentBlock']['text'] ?? ''),
            $tokens
        );

        $normalized['textBlocks'] = array_map(static function ($block) use ($tokens) {
            if (!is_array($block)) {
                return $block;
            }
            $block['text'] = monitoring_certificate_render_text((string)($block['text'] ?? ''), $tokens);
            return $block;
        }, $normalized['textBlocks']);

        $normalized['signatureBlocks'] = array_map(static function ($block) use ($tokens) {
            if (!is_array($block)) {
                return $block;
            }
            $block['label'] = monitoring_certificate_render_text((string)($block['label'] ?? ''), $tokens);
            return $block;
        }, $normalized['signatureBlocks']);

        return $normalized;
    }
}

if (!function_exists('monitoring_certificate_page_config')) {
    function monitoring_certificate_page_config(string $pageSize): array
    {
        $definitions = monitoring_certificate_page_definitions();
        return $definitions[$pageSize] ?? $definitions['A4'];
    }
}

if (!function_exists('monitoring_certificate_font_config')) {
    function monitoring_certificate_font_config(string $fontFamily): array
    {
        $definitions = monitoring_certificate_font_definitions();
        return $definitions[$fontFamily] ?? $definitions['arial'];
    }
}

if (!function_exists('monitoring_certificate_theme_config')) {
    function monitoring_certificate_theme_config(string $themeKey): array
    {
        $definitions = monitoring_certificate_theme_definitions();
        $normalizedThemeKey = monitoring_certificate_normalize_theme_key($themeKey);
        return $definitions[$normalizedThemeKey] ?? $definitions['none'];
    }
}

if (!function_exists('monitoring_certificate_signature_height')) {
    function monitoring_certificate_signature_height(array $block): int
    {
        $width = isset($block['width']) ? (int)$block['width'] : 220;
        return max(48, min(96, (int)round($width * 0.28)));
    }
}

if (!function_exists('monitoring_certificate_signature_label_parts')) {
    function monitoring_certificate_signature_label_parts(string $label): array
    {
        $normalized = trim($label);
        if ($normalized === '') {
            return ['top' => '', 'bottom' => ''];
        }

        $lines = preg_split('/\r?\n+/', $normalized) ?: [];
        $lines = array_values(array_filter(array_map(static fn($line) => trim((string)$line), $lines), static fn($line) => $line !== ''));
        if (count($lines) >= 2) {
            return [
                'top' => (string)$lines[0],
                'bottom' => implode("\n", array_slice($lines, 1)),
            ];
        }

        if (preg_match('/^(.*?):\s*(.+)$/', $normalized, $matches)) {
            return [
                'top' => trim((string)($matches[2] ?? '')),
                'bottom' => trim((string)($matches[1] ?? '')),
            ];
        }

        if (preg_match('/^(signature)\s+(.+)$/i', $normalized, $matches)) {
            return [
                'top' => trim((string)($matches[2] ?? '')),
                'bottom' => trim((string)($matches[1] ?? '')),
            ];
        }

        if (preg_match('/signature/i', $normalized)) {
            return ['top' => '', 'bottom' => $normalized];
        }

        return ['top' => $normalized, 'bottom' => ''];
    }
}

if (!function_exists('monitoring_certificate_signature_top_offset')) {
    function monitoring_certificate_signature_top_offset(array $block, string $topText): int
    {
        if (trim($topText) === '') {
            return 0;
        }

        $fontSize = (int)($block['fontSize'] ?? 11);
        if ($fontSize <= 0) {
            $fontSize = 11;
        }

        return max(18, (int)round($fontSize * 1.8));
    }
}

if (!function_exists('monitoring_certificate_signature_image_bottom_offset')) {
    function monitoring_certificate_signature_image_bottom_offset(array $block, string $topText): int
    {
        return max(0, monitoring_certificate_signature_top_offset($block, $topText) - 18);
    }
}

if (!function_exists('monitoring_certificate_build_html')) {
    function monitoring_certificate_build_html(array $template): string
    {
        $pageConfig = monitoring_certificate_page_config((string)($template['pageSize'] ?? 'A4'));
        $fontConfig = monitoring_certificate_font_config((string)($template['fontFamily'] ?? 'arial'));
        $theme = monitoring_certificate_theme_config((string)($template['themeKey'] ?? 'none'));
        $logoBlock = is_array($template['logoBlock'] ?? null) ? $template['logoBlock'] : monitoring_certificate_default_logo_block();
        $contentBlock = is_array($template['contentBlock'] ?? null) ? $template['contentBlock'] : monitoring_certificate_default_content_block();
        $textBlocks = is_array($template['textBlocks'] ?? null) ? $template['textBlocks'] : [];
        $signatureBlocks = is_array($template['signatureBlocks'] ?? null) ? $template['signatureBlocks'] : [];
        $logoSrc = trim((string)($template['logoSrc'] ?? ''));

        $logoMarkup = '';
        if ($logoSrc !== '') {
            $logoMarkup = '<div class="logo-shell" style="left:' . (int)($logoBlock['x'] ?? 0) . 'px;top:' . (int)($logoBlock['y'] ?? 0) . 'px;width:' . (int)($logoBlock['size'] ?? 102) . 'px;height:' . (int)($logoBlock['size'] ?? 102) . ';">'
                . '<img src="' . monitoring_certificate_escape_html($logoSrc) . '" alt="Certificate logo" class="logo-image" />'
                . '</div>';
        }

        $themeMarkup = !empty($theme['has_decorations'])
            ? '<div class="theme-frame" style="border-color:' . monitoring_certificate_escape_html($theme['outer_border']) . ';"></div>'
                . '<div class="theme-inner-frame" style="border-color:' . monitoring_certificate_escape_html($theme['inner_border']) . ';"></div>'
                . '<div class="theme-accent-band" style="background:linear-gradient(135deg, ' . monitoring_certificate_escape_html($theme['accent_start']) . ' 0%, ' . monitoring_certificate_escape_html($theme['accent_end']) . ' 100%);"></div>'
                . '<div class="theme-seal" style="border-color:' . monitoring_certificate_escape_html($theme['seal_border']) . ';background:radial-gradient(circle at 50% 50%, ' . monitoring_certificate_escape_html($theme['seal_glow']) . ' 0%, rgba(255, 255, 255, 0) 68%);"></div>'
                . '<div class="theme-footer-rule" style="background:linear-gradient(90deg, transparent 0%, ' . monitoring_certificate_escape_html($theme['footer_rule']) . ' 50%, transparent 100%);"></div>'
            : '';

        $bodyText = nl2br(monitoring_certificate_escape_html((string)($contentBlock['text'] ?? '')), false);
        $contentMarkup = trim((string)($contentBlock['text'] ?? '')) !== ''
            ? '<section class="content" style="left:' . (int)($contentBlock['x'] ?? 0) . 'px;top:' . (int)($contentBlock['y'] ?? 0) . 'px;width:' . (int)($contentBlock['width'] ?? 540) . 'px;font-size:' . (int)($contentBlock['fontSize'] ?? 30) . 'px;font-weight:' . (!empty($contentBlock['bold']) ? '700' : '400') . ';text-align:' . monitoring_certificate_escape_html((string)($contentBlock['align'] ?? 'center')) . ';color:' . monitoring_certificate_escape_html((string)($contentBlock['color'] ?? '#0f172a')) . ';">' . $bodyText . '</section>'
            : '';

        $textBlocksMarkup = '';
        foreach ($textBlocks as $block) {
            if (!is_array($block)) {
                continue;
            }
            $textBlocksMarkup .= '<section class="extra-text" style="left:' . (int)($block['x'] ?? 0) . 'px;top:' . (int)($block['y'] ?? 0) . 'px;width:' . (int)($block['width'] ?? 480) . 'px;font-size:' . (int)($block['fontSize'] ?? 18) . 'px;font-weight:' . (!empty($block['bold']) ? '700' : '400') . ';text-align:' . monitoring_certificate_escape_html((string)($block['align'] ?? 'center')) . ';color:' . monitoring_certificate_escape_html((string)($block['color'] ?? '#000000')) . ';">'
                . nl2br(monitoring_certificate_escape_html((string)($block['text'] ?? '')), false)
                . '</section>';
        }

        $signatureMarkup = '';
        foreach ($signatureBlocks as $block) {
            if (!is_array($block)) {
                continue;
            }

            $labelParts = monitoring_certificate_signature_label_parts((string)($block['label'] ?? ''));
            $imageBottomOffset = monitoring_certificate_signature_image_bottom_offset($block, (string)($labelParts['top'] ?? ''));
            $signatureImageMarkup = '';
            if (trim((string)($block['signatureSrc'] ?? '')) !== '') {
                $signatureImageMarkup = '<img src="' . monitoring_certificate_escape_html((string)$block['signatureSrc']) . '" alt="" class="signature-image" style="bottom:calc(100% + ' . $imageBottomOffset . 'px);height:' . monitoring_certificate_signature_height($block) . 'px;" />';
            }

            $signatureNameMarkup = trim((string)($labelParts['top'] ?? '')) !== ''
                ? '<div class="signature-name">' . monitoring_certificate_escape_html((string)($labelParts['top'] ?? '')) . '</div>'
                : '';
            $signatureLabelMarkup = trim((string)($labelParts['bottom'] ?? '')) !== ''
                ? '<div class="signature-label">' . monitoring_certificate_escape_html((string)($labelParts['bottom'] ?? '')) . '</div>'
                : '';

            $signatureMarkup .= '<section class="signature-block" style="left:' . (int)($block['x'] ?? 0) . 'px;top:' . (int)($block['y'] ?? 0) . 'px;width:' . (int)($block['width'] ?? 220) . 'px;font-size:' . (int)($block['fontSize'] ?? 11) . 'px;color:' . monitoring_certificate_escape_html((string)($block['color'] ?? '#000000')) . ';">'
                . $signatureImageMarkup
                . $signatureNameMarkup
                . '<div class="signature-line"></div>'
                . $signatureLabelMarkup
                . '</section>';
        }

        return '<!doctype html>'
            . '<html lang="en"><head><meta charset="utf-8" />'
            . '<meta name="viewport" content="width=device-width, initial-scale=1" />'
            . '<title>Certificate</title>'
            . '<style>'
            . '*{box-sizing:border-box;}'
            . 'body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#eef2f7;font-family:' . $fontConfig['family'] . ';color:#0f172a;}'
            . '.sheet{position:relative;width:' . (int)$pageConfig['width'] . 'px;height:' . (int)$pageConfig['height'] . 'px;overflow:hidden;background:#ffffff;border:1px solid transparent;box-shadow:none;}'
            . '.theme-frame,.theme-inner-frame,.theme-accent-band,.theme-seal,.theme-footer-rule{position:absolute;pointer-events:none;}'
            . '.theme-frame{left:18px;right:18px;top:18px;bottom:18px;border:2px solid transparent;border-radius:28px;}'
            . '.theme-inner-frame{left:34px;right:34px;top:34px;bottom:34px;border:1px solid transparent;border-radius:22px;}'
            . '.theme-accent-band{left:56px;right:56px;top:42px;height:112px;border-radius:34px 34px 56px 56px;}'
            . '.theme-seal{left:50%;top:84px;width:170px;height:170px;transform:translateX(-50%);border-radius:999px;border:1px solid transparent;}'
            . '.theme-footer-rule{left:72px;right:72px;bottom:64px;height:1px;}'
            . '.logo-shell{position:absolute;display:grid;place-items:center;overflow:hidden;border:1px solid rgba(15,23,42,0.32);border-radius:999px;box-sizing:border-box;z-index:2;}'
            . '.logo-image{width:100%;height:100%;object-fit:cover;border-radius:999px;}'
            . '.content{position:absolute;z-index:1;font-family:' . $fontConfig['family'] . ';line-height:1.55;white-space:normal;word-break:break-word;}'
            . '.extra-text{position:absolute;z-index:1;font-family:' . $fontConfig['family'] . ';line-height:1.45;white-space:normal;word-break:break-word;}'
            . '.signature-block{position:absolute;z-index:1;text-align:center;font-family:' . $fontConfig['family'] . ';}'
            . '.signature-image{position:absolute;left:50%;transform:translateX(-50%);max-width:92%;object-fit:contain;}'
            . '.signature-name{position:absolute;left:50%;bottom:calc(100% + 6px);width:100%;transform:translateX(-50%);font-weight:700;letter-spacing:0.18em;text-transform:uppercase;white-space:pre-wrap;word-break:break-word;}'
            . '.signature-line{height:1px;background:currentColor;}'
            . '.signature-label{margin-top:8px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;white-space:pre-wrap;word-break:break-word;}'
            . '@media print{body{background:#ffffff;}.sheet{box-shadow:none;border:none;}}'
            . '</style></head><body><main class="sheet" style="background:' . monitoring_certificate_escape_html($theme['sheet_background']) . ';border-color:' . monitoring_certificate_escape_html($theme['outer_border']) . ';box-shadow:' . monitoring_certificate_escape_html($theme['shadow']) . ';">'
            . $themeMarkup
            . $logoMarkup
            . $contentMarkup
            . $textBlocksMarkup
            . $signatureMarkup
            . '</main></body></html>';
    }
}

if (!function_exists('monitoring_certificate_smtp_settings')) {
    function monitoring_certificate_smtp_settings(PDO $conn): array
    {
        $smtp = monitoring_get_system_smtp_settings($conn);

        if ((trim((string)($smtp['user'] ?? '')) === '' || trim((string)($smtp['pass'] ?? '')) === '') && file_exists(__DIR__ . '/smtp_config.php')) {
            $localConfig = require __DIR__ . '/smtp_config.php';
            if (is_array($localConfig)) {
                $smtp['user'] = trim((string)($smtp['user'] ?? '')) !== '' ? $smtp['user'] : trim((string)($localConfig['SMTP_USER'] ?? ''));
                $smtp['pass'] = trim((string)($smtp['pass'] ?? '')) !== '' ? $smtp['pass'] : trim((string)($localConfig['SMTP_PASS'] ?? ''));
                $smtp['host'] = trim((string)($smtp['host'] ?? '')) !== '' ? $smtp['host'] : trim((string)($localConfig['SMTP_HOST'] ?? 'smtp.gmail.com'));
                $smtp['port'] = !empty($smtp['port']) ? (int)$smtp['port'] : (int)($localConfig['SMTP_PORT'] ?? 587);
            }
        }

        return [
            'user' => trim((string)($smtp['user'] ?? '')),
            'pass' => trim((string)($smtp['pass'] ?? '')),
            'host' => trim((string)($smtp['host'] ?? 'smtp.gmail.com')) ?: 'smtp.gmail.com',
            'port' => (int)($smtp['port'] ?? 587) ?: 587,
        ];
    }
}

if (!function_exists('monitoring_certificate_send_email')) {
    function monitoring_certificate_send_email(PDO $conn, array $context): array
    {
        $recipientEmail = trim((string)($context['recipient_email'] ?? ''));
        if ($recipientEmail === '' || !filter_var($recipientEmail, FILTER_VALIDATE_EMAIL)) {
            return [
                'attempted' => false,
                'sent' => false,
                'status' => 'skipped',
                'message' => 'No valid client email was found for certificate delivery.',
            ];
        }

        $smtp = monitoring_certificate_smtp_settings($conn);
        if ($smtp['user'] === '' || $smtp['pass'] === '') {
            return [
                'attempted' => false,
                'sent' => false,
                'status' => 'failed',
                'message' => 'SMTP credentials are not configured for certificate delivery.',
            ];
        }

        $companyName = monitoring_get_system_company_name($conn);
        $supportEmail = monitoring_get_system_support_email($conn);
        $clientName = trim((string)($context['client_name'] ?? 'Client'));
        $serviceName = trim((string)($context['service_name'] ?? 'Service'));
        $certificateId = trim((string)($context['certificate_id'] ?? ''));
        $certificateHtml = (string)($context['certificate_html'] ?? '');
        $attachmentName = ($certificateId !== '' ? strtolower($certificateId) : 'certificate') . '.html';

        $mail = new PHPMailer(true);

        try {
            $mail->isSMTP();
            $mail->Host = $smtp['host'];
            $mail->SMTPAuth = true;
            $mail->Username = $smtp['user'];
            $mail->Password = $smtp['pass'];
            $mail->SMTPSecure = PHPMailer::ENCRYPTION_STARTTLS;
            $mail->Port = $smtp['port'];

            $mail->setFrom($smtp['user'], $companyName);
            if ($supportEmail !== '') {
                $mail->addReplyTo($supportEmail, $companyName . ' Support');
            }
            $mail->addAddress($recipientEmail, $clientName !== '' ? $clientName : 'Client');
            $mail->Subject = $companyName . ' Completion Certificate';
            $mail->isHTML(true);
            $mail->Body = '<!doctype html><html><body style="margin:0;padding:24px;background:#f8fafc;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">'
                . '<div style="max-width:620px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:18px;overflow:hidden;">'
                . '<div style="padding:18px 22px;background:#0f766e;color:#ffffff;">'
                . '<div style="font-size:14px;opacity:.9;">' . monitoring_certificate_escape_html($companyName) . '</div>'
                . '<div style="margin-top:6px;font-size:22px;font-weight:700;">Your Certificate Is Ready</div>'
                . '</div>'
                . '<div style="padding:24px 22px;font-size:14px;line-height:1.7;">'
                . '<p style="margin:0 0 14px;">Hello ' . monitoring_certificate_escape_html($clientName !== '' ? $clientName : 'Client') . ',</p>'
                . '<p style="margin:0 0 14px;">Congratulations. Your <strong>' . monitoring_certificate_escape_html($serviceName) . '</strong> service has been completed.</p>'
                . '<p style="margin:0 0 14px;">We attached your certificate so you can open and keep a copy.</p>'
                . ($certificateId !== '' ? '<p style="margin:0 0 14px;"><strong>Certificate ID:</strong> ' . monitoring_certificate_escape_html($certificateId) . '</p>' : '')
                . '<p style="margin:0;">Thank you,<br />' . monitoring_certificate_escape_html($companyName) . '</p>'
                . '</div></div></body></html>';
            $mail->AltBody = "Hello " . ($clientName !== '' ? $clientName : 'Client') . ",\n\n"
                . "Your {$serviceName} service has been completed.\n"
                . ($certificateId !== '' ? "Certificate ID: {$certificateId}\n" : '')
                . "Your certificate is attached to this email.\n\n"
                . "Thank you,\n{$companyName}";

            if ($certificateHtml !== '') {
                $mail->addStringAttachment($certificateHtml, $attachmentName, PHPMailer::ENCODING_BASE64, 'text/html');
            }

            $mail->send();

            return [
                'attempted' => true,
                'sent' => true,
                'status' => 'sent',
                'message' => 'Certificate sent to ' . $recipientEmail . '.',
            ];
        } catch (Throwable $__) {
            return [
                'attempted' => true,
                'sent' => false,
                'status' => 'failed',
                'message' => 'The certificate was generated, but the email could not be sent.',
            ];
        }
    }
}

if (!function_exists('monitoring_certificate_user_display_name')) {
    function monitoring_certificate_user_display_name(array $user): string
    {
        $parts = [];
        foreach (['first_name', 'middle_name', 'last_name'] as $field) {
            $value = trim((string)($user[$field] ?? ''));
            if ($value !== '') {
                $parts[] = $value;
            }
        }
        if (!empty($parts)) {
            return trim(implode(' ', $parts));
        }

        $username = trim((string)($user['username'] ?? ''));
        if ($username !== '') {
            return $username;
        }

        $email = trim((string)($user['email'] ?? ''));
        if ($email !== '') {
            return $email;
        }

        return 'System';
    }
}

if (!function_exists('monitoring_certificate_format_display_date')) {
    function monitoring_certificate_format_display_date(string $rawValue, string $fallback = ''): string
    {
        $value = trim($rawValue);
        if ($value === '') {
            return $fallback;
        }

        $timestamp = strtotime($value);
        if ($timestamp === false) {
            return $value;
        }

        return date('F j, Y', $timestamp);
    }
}

if (!function_exists('monitoring_certificate_read_meta_line')) {
    function monitoring_certificate_read_meta_line(string $source, string $key): string
    {
        if (preg_match('/^\s*\[' . preg_quote($key, '/') . '\]\s*([^\r\n]*)\s*$/im', $source, $matches)) {
            return trim((string)($matches[1] ?? ''));
        }

        return '';
    }
}

if (!function_exists('monitoring_certificate_fetch_primary_admin_name')) {
    function monitoring_certificate_fetch_primary_admin_name(PDO $conn, array $fallbackUser = []): string
    {
        static $cached = null;

        if ($cached !== null) {
            return $cached;
        }

        $stmt = $conn->prepare(
            'SELECT
                Username AS username,
                first_name,
                middle_name,
                last_name,
                email
             FROM user
             WHERE Role_id = :role_id
             ORDER BY User_id ASC
             LIMIT 1'
        );
        $stmt->execute([':role_id' => 1]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC) ?: [];

        $name = monitoring_certificate_user_display_name($row);
        if ($name === '' && !empty($fallbackUser)) {
            $name = monitoring_certificate_user_display_name($fallbackUser);
        }

        $cached = $name !== '' ? $name : 'Authorized Admin';
        return $cached;
    }
}

if (!function_exists('monitoring_certificate_build_render_context')) {
    function monitoring_certificate_build_render_context(PDO $conn, array $task, array $options = []): array
    {
        $clientName = trim(implode(' ', array_filter([
            trim((string)($task['first_name'] ?? '')),
            trim((string)($task['middle_name'] ?? '')),
            trim((string)($task['last_name'] ?? '')),
        ])));
        if ($clientName === '') {
            $clientName = trim((string)($options['client_name'] ?? ''));
        }
        if ($clientName === '') {
            $clientName = 'Client';
        }

        $serviceLabel = trim((string)($options['service_label'] ?? $task['service_label'] ?? $task['service_name'] ?? ''));
        if ($serviceLabel === '') {
            $serviceLabel = 'Service';
        }

        $companyName = monitoring_get_system_company_name($conn);
        $issueDate = trim((string)($options['issue_date'] ?? ''));
        if ($issueDate === '') {
            $issueDate = date('Y-m-d');
        }
        $issueDateDisplay = monitoring_certificate_format_display_date($issueDate, date('F j, Y'));

        $createdAtRaw = trim((string)($task['created_at'] ?? ''));
        if ($createdAtRaw === '') {
            $createdAtRaw = monitoring_certificate_read_meta_line((string)($task['steps'] ?? ''), 'CreatedAt');
        }
        $startDateDisplay = monitoring_certificate_format_display_date($createdAtRaw, $issueDateDisplay);
        $endDateDisplay = monitoring_certificate_format_display_date(
            trim((string)($options['end_date'] ?? $issueDate)),
            $issueDateDisplay
        );

        $accountantName = trim((string)($task['accountant_name_display'] ?? $task['accountant_name'] ?? ''));
        if ($accountantName === '') {
            $accountantName = trim((string)($options['accountant_name'] ?? ''));
        }
        if ($accountantName === '') {
            $accountantName = 'Assigned Accountant';
        }

        $issuerUser = is_array($options['issuer_user'] ?? null) ? $options['issuer_user'] : [];
        $adminName = monitoring_certificate_fetch_primary_admin_name($conn, $issuerUser);
        $issuedBy = trim((string)($options['issued_by'] ?? ''));
        if ($issuedBy === '') {
            $issuedBy = monitoring_certificate_user_display_name($issuerUser);
        }
        if ($issuedBy === '') {
            $issuedBy = $adminName;
        }

        return [
            'client_name' => $clientName,
            'service_name' => $serviceLabel,
            'service_type' => $serviceLabel,
            'issue_date_display' => $issueDateDisplay,
            'date_display' => $issueDateDisplay,
            'company_name' => $companyName,
            'certificate_id' => trim((string)($options['certificate_id'] ?? '')),
            'issued_by' => $issuedBy,
            'client_email' => trim((string)($task['client_email'] ?? $options['client_email'] ?? '')),
            'start_date_display' => $startDateDisplay,
            'end_date_display' => $endDateDisplay,
            'accountant_name' => $accountantName,
            'admin_name' => $adminName,
            'owner_name' => $adminName,
            'authorized_signatory_name' => $adminName,
        ];
    }
}

if (!function_exists('monitoring_certificate_fetch_selected_template_row')) {
    function monitoring_certificate_fetch_selected_template_row(PDO $conn, int $serviceId): ?array
    {
        if ($serviceId <= 0) {
            return null;
        }

        $stmt = $conn->prepare(
            'SELECT ec.*, st.Name AS service_name
             FROM edit_certificate ec
             LEFT JOIN services_type st ON st.Services_type_Id = ec.Services_type_Id
             WHERE ec.Services_type_Id = :service_id
             ORDER BY ec.is_selected DESC, ec.updated_at DESC, ec.Edit_certificate_ID DESC
             LIMIT 1'
        );
        $stmt->execute([':service_id' => $serviceId]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);

        return $row ?: null;
    }
}

if (!function_exists('monitoring_certificate_fetch_template_row_by_id')) {
    function monitoring_certificate_fetch_template_row_by_id(PDO $conn, int $editCertificateId): ?array
    {
        if ($editCertificateId <= 0) {
            return null;
        }

        $stmt = $conn->prepare(
            'SELECT ec.*, st.Name AS service_name
             FROM edit_certificate ec
             LEFT JOIN services_type st ON st.Services_type_Id = ec.Services_type_Id
             WHERE ec.Edit_certificate_ID = :edit_certificate_id
             LIMIT 1'
        );
        $stmt->execute([':edit_certificate_id' => $editCertificateId]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);

        return $row ?: null;
    }
}

if (!function_exists('monitoring_certificate_client_service_is_completed')) {
    function monitoring_certificate_client_service_is_completed(array $row): bool
    {
        $steps = (string)($row['steps'] ?? '');
        if (preg_match('/^\s*\[Done\]\s*$/mi', $steps)) {
            return true;
        }

        $statusName = strtolower(trim((string)($row['status_name'] ?? '')));
        return $statusName === 'completed' || $statusName === 'done';
    }
}

if (!function_exists('monitoring_certificate_sync_pending_for_service')) {
    function monitoring_certificate_sync_pending_for_service(PDO $conn, int $serviceId, array $issuerUser = []): array
    {
        monitoring_ensure_certificate_storage($conn);

        if ($serviceId <= 0) {
            return [
                'checked' => 0,
                'processed' => 0,
                'created' => 0,
                'retried' => 0,
                'sent' => 0,
                'failed' => 0,
            ];
        }

        $stmt = $conn->prepare(
            'SELECT
                cs.Client_services_ID AS client_service_id,
                COALESCE(cs.Steps, "") AS steps,
                COALESCE(st.Status_name, "") AS status_name,
                cert.certificates_ID AS certificate_db_id,
                cert.delivery_status
             FROM client_services cs
             LEFT JOIN status st ON st.Status_id = cs.Status_ID
             LEFT JOIN certificates cert ON cert.Client_services_ID = cs.Client_services_ID
             WHERE cs.Services_type_Id = :service_id
             ORDER BY cs.Client_services_ID ASC'
        );
        $stmt->execute([':service_id' => $serviceId]);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];

        $summary = [
            'checked' => 0,
            'processed' => 0,
            'created' => 0,
            'retried' => 0,
            'sent' => 0,
            'failed' => 0,
        ];

        foreach ($rows as $row) {
            if (!monitoring_certificate_client_service_is_completed($row)) {
                continue;
            }

            $summary['checked']++;

            $deliveryStatus = strtolower(trim((string)($row['delivery_status'] ?? '')));
            if (!empty($row['certificate_db_id']) && $deliveryStatus === 'sent') {
                continue;
            }

            $result = monitoring_certificate_issue_for_client_service(
                $conn,
                (int)($row['client_service_id'] ?? 0),
                $issuerUser
            );

            if (!empty($result['alreadyExists']) && strtolower((string)($result['status'] ?? '')) === 'sent') {
                continue;
            }

            $summary['processed']++;
            if (!empty($result['resent'])) {
                $summary['retried']++;
            } elseif (!empty($result['issued'])) {
                $summary['created']++;
            }

            if (!empty($result['sent']) || strtolower((string)($result['status'] ?? '')) === 'sent') {
                $summary['sent']++;
            } else {
                $summary['failed']++;
            }
        }

        return $summary;
    }
}

if (!function_exists('monitoring_certificate_issue_for_client_service')) {
    function monitoring_certificate_issue_for_client_service(PDO $conn, int $clientServiceId, array $issuerUser = []): array
    {
        monitoring_ensure_certificate_storage($conn);

        if ($clientServiceId <= 0) {
            return [
                'attempted' => false,
                'issued' => false,
                'message' => 'Missing completed client service reference.',
            ];
        }

        $taskStmt = $conn->prepare(
            'SELECT
                cs.Client_services_ID AS client_service_id,
                cs.Client_ID AS client_id,
                cs.Services_type_Id AS service_id,
                cs.Date AS due_date,
                COALESCE(cs.Steps, "") AS steps,
                COALESCE(st.Name, cs.Name) AS service_name,
                c.First_name AS first_name,
                c.Middle_name AS middle_name,
                c.Last_name AS last_name,
                c.Email AS client_email,
                c.User_id AS client_user_id,
                COALESCE(
                    NULLIF(TRIM(CONCAT_WS(" ", NULLIF(TRIM(acc.first_name), ""), NULLIF(TRIM(acc.middle_name), ""), NULLIF(TRIM(acc.last_name), ""))), ""),
                    NULLIF(TRIM(acc.Username), "")
                ) AS accountant_name_display
             FROM client_services cs
             LEFT JOIN services_type st ON st.Services_type_Id = cs.Services_type_Id
             LEFT JOIN client c ON c.Client_ID = cs.Client_ID
             LEFT JOIN user acc ON acc.User_id = cs.User_ID
             WHERE cs.Client_services_ID = :client_service_id
             LIMIT 1'
        );
        $taskStmt->execute([':client_service_id' => $clientServiceId]);
        $task = $taskStmt->fetch(PDO::FETCH_ASSOC);
        if (!$task) {
            return [
                'attempted' => false,
                'issued' => false,
                'message' => 'Completed service details could not be found.',
            ];
        }

        $existingStmt = $conn->prepare(
            'SELECT certificates_ID, certificate_id, Edit_certificate_ID, issue_date, template_snapshot, certificate_html, recipient_email, delivery_status
             FROM certificates
             WHERE Client_services_ID = :client_service_id
             LIMIT 1'
        );
        $existingStmt->execute([':client_service_id' => $clientServiceId]);
        $existing = $existingStmt->fetch(PDO::FETCH_ASSOC);
        if ($existing && strtolower(trim((string)($existing['delivery_status'] ?? ''))) === 'sent') {
            return [
                'attempted' => false,
                'issued' => false,
                'alreadyExists' => true,
                'certificateId' => (string)$existing['certificate_id'],
                'status' => (string)($existing['delivery_status'] ?? 'pending'),
                'message' => 'A certificate has already been issued for this completed service.',
            ];
        }

        $service = monitoring_certificate_fetch_service_row($conn, (string)($task['service_name'] ?? ''));
        $serviceLabel = $service !== null
            ? (string)$service['service_label']
            : (trim((string)($task['service_name'] ?? '')) !== '' ? trim((string)$task['service_name']) : 'Service');

        if ($existing === false || $existing === null) {
            $existing = null;
        }

        if ($existing === null && $service === null) {
            return [
                'attempted' => false,
                'issued' => false,
                'message' => 'This completed service does not use certificate delivery.',
            ];
        }

        $companyName = monitoring_get_system_company_name($conn);
        $issueDate = trim((string)($existing['issue_date'] ?? ''));
        if ($issueDate === '') {
            $issueDate = date('Y-m-d');
        }
        $issueDateDisplay = date('F j, Y', strtotime($issueDate));
        $recipientEmail = trim((string)($task['client_email'] ?? ''));
        if ($recipientEmail === '') {
            $recipientEmail = trim((string)($existing['recipient_email'] ?? ''));
        }
        $certificateId = trim((string)($existing['certificate_id'] ?? ''));
        if ($certificateId === '') {
            $certificateId = monitoring_certificate_generate_record_id($conn);
        }

        $context = monitoring_certificate_build_render_context($conn, $task, [
            'service_label' => $serviceLabel,
            'issue_date' => $issueDate,
            'end_date' => $issueDate,
            'certificate_id' => $certificateId,
            'issuer_user' => $issuerUser,
            'client_email' => $recipientEmail,
        ]);
        $clientName = (string)$context['client_name'];
        $issuedBy = (string)$context['issued_by'];

        $renderedTemplate = [];
        $templateSnapshot = '';
        $emailCertificateHtml = '';
        $storedCertificateHtml = trim((string)($existing['certificate_html'] ?? ''));
        $templateRow = null;
        $selectedTemplateId = (int)($existing['Edit_certificate_ID'] ?? 0);

        $snapshotSource = trim((string)($existing['template_snapshot'] ?? ''));
        $fallbackCertificateHtml = $storedCertificateHtml;
        if ($snapshotSource !== '') {
            $decodedSnapshot = json_decode($snapshotSource, true);
            if (is_array($decodedSnapshot)) {
                $storedTemplate = monitoring_certificate_normalize_template_payload($decodedSnapshot);
                $templateSnapshot = monitoring_certificate_json_encode($storedTemplate);
                if ($fallbackCertificateHtml === '') {
                    $fallbackCertificateHtml = monitoring_certificate_build_html($storedTemplate);
                }
            }
        }

        if ($service !== null) {
            if ($selectedTemplateId > 0) {
                $templateRow = monitoring_certificate_fetch_template_row_by_id($conn, $selectedTemplateId);
            }
            if ($templateRow === null) {
                $templateRow = monitoring_certificate_fetch_selected_template_row($conn, (int)$service['service_id']);
            }
        }

        if ($templateRow !== null) {
            $templateEntry = monitoring_certificate_row_to_entry($templateRow);
            $tokens = monitoring_certificate_build_tokens($context);
            $renderedTemplate = monitoring_certificate_render_template($templateEntry['template'], $tokens);
            $emailCertificateHtml = monitoring_certificate_build_html($renderedTemplate);
            $templateSnapshot = monitoring_certificate_json_encode(
                monitoring_certificate_prepare_template_for_storage($renderedTemplate)
            );
            $selectedTemplateId = (int)($templateRow['Edit_certificate_ID'] ?? 0);
        }

        if ($emailCertificateHtml === '') {
            $emailCertificateHtml = $fallbackCertificateHtml;
        }

        if ($emailCertificateHtml === '' && $existing !== null && $service === null) {
            return [
                'attempted' => false,
                'issued' => false,
                'message' => 'The stored certificate is missing its rendered document and the service template could not be resolved.',
            ];
        }

        if ($emailCertificateHtml === '') {
            return [
                'attempted' => false,
                'issued' => false,
                'message' => $service !== null
                    ? ('No certificate template is available for ' . $serviceLabel . '.')
                    : 'The certificate document could not be rendered.',
            ];
        }

        if ($existing === null) {
            if ($service === null) {
                return [
                    'attempted' => false,
                    'issued' => false,
                    'message' => 'This completed service does not use certificate delivery.',
                ];
            }

            if ($templateRow === null || $emailCertificateHtml === '') {
                return [
                    'attempted' => false,
                    'issued' => false,
                    'message' => 'No certificate template is available for ' . $serviceLabel . '.',
                ];
            }

            $insertStmt = $conn->prepare(
                'INSERT INTO certificates
                    (certificate_id, Client_ID, Client_services_ID, Services_type_Id, Edit_certificate_ID, end_date, issue_date, issued_by, company_name, template_snapshot, certificate_html, recipient_email, delivery_status, delivery_message)
                 VALUES
                    (:certificate_id, :client_id, :client_service_id, :service_id, :edit_certificate_id, :end_date, :issue_date, :issued_by, :company_name, :template_snapshot, :certificate_html, :recipient_email, :delivery_status, :delivery_message)'
            );
            $insertStmt->execute([
                ':certificate_id' => $certificateId,
                ':client_id' => (int)($task['client_id'] ?? 0),
                ':client_service_id' => (int)($task['client_service_id'] ?? 0),
                ':service_id' => (int)$service['service_id'],
                ':edit_certificate_id' => (int)($templateRow['Edit_certificate_ID'] ?? 0) ?: null,
                ':end_date' => $issueDate,
                ':issue_date' => $issueDate,
                ':issued_by' => $issuedBy,
                ':company_name' => $companyName,
                ':template_snapshot' => $templateSnapshot !== '' ? $templateSnapshot : null,
                ':certificate_html' => null,
                ':recipient_email' => $recipientEmail !== '' ? $recipientEmail : null,
                ':delivery_status' => 'pending',
                ':delivery_message' => null,
            ]);

            $certificateDbId = (int)$conn->lastInsertId();
        } else {
            $certificateDbId = (int)($existing['certificates_ID'] ?? 0);
        }

        $emailResult = monitoring_certificate_send_email($conn, [
            'recipient_email' => $recipientEmail,
            'client_name' => $clientName,
            'service_name' => $serviceLabel,
            'certificate_id' => $certificateId,
            'certificate_html' => $emailCertificateHtml,
        ]);

        $updateStmt = $conn->prepare(
            'UPDATE certificates
             SET certificate_id = :certificate_id,
                 Services_type_Id = :service_id,
                 Edit_certificate_ID = :edit_certificate_id,
                 issued_by = :issued_by,
                 company_name = :company_name,
                 template_snapshot = :template_snapshot,
                 certificate_html = :certificate_html,
                 recipient_email = :recipient_email,
                 delivery_status = :delivery_status,
                 delivery_message = :delivery_message,
                 delivered_at = :delivered_at
             WHERE certificates_ID = :certificate_db_id'
        );
        $updateStmt->execute([
            ':certificate_id' => $certificateId,
            ':service_id' => $service !== null ? (int)$service['service_id'] : ((int)($task['service_id'] ?? 0) ?: null),
            ':edit_certificate_id' => $selectedTemplateId > 0 ? $selectedTemplateId : null,
            ':issued_by' => $issuedBy,
            ':company_name' => $companyName,
            ':template_snapshot' => $templateSnapshot !== '' ? $templateSnapshot : null,
            ':certificate_html' => null,
            ':recipient_email' => $recipientEmail !== '' ? $recipientEmail : null,
            ':delivery_status' => (string)($emailResult['status'] ?? 'pending'),
            ':delivery_message' => (string)($emailResult['message'] ?? ''),
            ':delivered_at' => !empty($emailResult['sent']) ? date('Y-m-d H:i:s') : null,
            ':certificate_db_id' => $certificateDbId,
        ]);

        return [
            'attempted' => true,
            'issued' => true,
            'resent' => $existing !== null,
            'certificateId' => $certificateId,
            'sent' => !empty($emailResult['sent']),
            'status' => (string)($emailResult['status'] ?? 'pending'),
            'message' => (string)($emailResult['message'] ?? 'Certificate generated.'),
        ];
    }
}
