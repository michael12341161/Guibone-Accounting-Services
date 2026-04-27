<?php
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/connection-pdo.php';

monitoring_bootstrap_api(['GET', 'POST', 'OPTIONS']);

const MONITORING_CONSULTATION_SLOT_SETTING_KEY = 'consultation_slot_settings';
const MONITORING_CONSULTATION_SLOT_LIMIT = 500;

function respond($code, $payload) {
    http_response_code($code);
    echo json_encode($payload);
    exit;
}

function ensureSettingsTable(PDO $conn): void {
    monitoring_require_schema_columns(
        $conn,
        'settings',
        ['Settings_ID', 'setting_key', 'setting_value'],
        'consultation slot settings'
    );
}

function normalizeSlotTime($value): string {
    $raw = trim((string)$value);
    if ($raw === '') {
        return '';
    }

    if (preg_match('/^\d{2}:\d{2}:\d{2}$/', $raw)) {
        $raw = substr($raw, 0, 5);
    }

    return preg_match('/^\d{2}:\d{2}$/', $raw) ? $raw : '';
}

function normalizeConsultationSlots($value): array {
    $source = is_array($value) ? $value : [];
    $normalized = [];
    $seen = [];

    foreach ($source as $slot) {
        if (is_string($slot) || is_numeric($slot)) {
            $time = normalizeSlotTime($slot);
        } elseif (is_array($slot)) {
            $time = normalizeSlotTime($slot['time'] ?? $slot['Time'] ?? $slot['value'] ?? '');
        } else {
            $time = '';
        }

        if ($time === '') {
            continue;
        }

        $key = $time;
        if (isset($seen[$key])) {
            continue;
        }

        $seen[$key] = true;
        $normalized[] = [
            'time' => $time,
        ];
    }

    usort($normalized, static function (array $left, array $right): int {
        return strcmp($left['time'], $right['time']);
    });

    return $normalized;
}

function loadConsultationSlots(PDO $conn): array {
    ensureSettingsTable($conn);

    $stmt = $conn->prepare(
        'SELECT setting_value
         FROM settings
         WHERE setting_key = :setting_key
         LIMIT 1'
    );
    $stmt->execute([':setting_key' => MONITORING_CONSULTATION_SLOT_SETTING_KEY]);
    $rawValue = $stmt->fetchColumn();

    if ($rawValue === false || $rawValue === null || trim((string)$rawValue) === '') {
        return [];
    }

    $decoded = json_decode((string)$rawValue, true);
    if (is_array($decoded) && isset($decoded['slots']) && is_array($decoded['slots'])) {
        return normalizeConsultationSlots($decoded['slots']);
    }

    return normalizeConsultationSlots($decoded);
}

function saveConsultationSlots(PDO $conn, array $slots): array {
    ensureSettingsTable($conn);

    $statement = $conn->prepare(
        'INSERT INTO settings (setting_key, setting_value)
         VALUES (:setting_key, :setting_value)
         ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)'
    );
    $statement->execute([
        ':setting_key' => MONITORING_CONSULTATION_SLOT_SETTING_KEY,
        ':setting_value' => json_encode($slots, JSON_UNESCAPED_SLASHES),
    ]);

    return $slots;
}

try {
    $sessionUser = monitoring_require_auth();
    $conn->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

    if ($_SERVER['REQUEST_METHOD'] === 'GET') {
        monitoring_require_roles(
            [MONITORING_ROLE_ADMIN, MONITORING_ROLE_SECRETARY, MONITORING_ROLE_CLIENT],
            $sessionUser
        );

        respond(200, [
            'success' => true,
            'slots' => loadConsultationSlots($conn),
        ]);
    }

    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        respond(405, ['success' => false, 'message' => 'Method not allowed']);
    }

    monitoring_require_roles([MONITORING_ROLE_ADMIN], $sessionUser);

    $raw = file_get_contents('php://input');
    $data = json_decode($raw, true);
    if (!is_array($data)) {
        respond(400, ['success' => false, 'message' => 'Invalid JSON payload']);
    }

    $slotsInput = $data['slots'] ?? null;
    if (!is_array($slotsInput)) {
        respond(422, ['success' => false, 'message' => 'slots must be an array']);
    }

    if (count($slotsInput) > MONITORING_CONSULTATION_SLOT_LIMIT) {
        respond(422, [
            'success' => false,
            'message' => 'Too many consultation times. Keep it under 500 entries.',
        ]);
    }

    $normalizedSlots = normalizeConsultationSlots($slotsInput);
    $savedSlots = saveConsultationSlots($conn, $normalizedSlots);

    respond(200, [
        'success' => true,
        'message' => 'Consultation times saved successfully.',
        'slots' => $savedSlots,
    ]);
} catch (Throwable $e) {
    error_log('consultation_slot_settings error: ' . $e->getMessage());
    respond(500, ['success' => false, 'message' => 'Server error']);
}
