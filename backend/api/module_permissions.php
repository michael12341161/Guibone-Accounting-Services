<?php

require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/connection-pdo.php';
require_once __DIR__ . '/audit_logs_helper.php';

monitoring_bootstrap_api(['GET', 'POST', 'OPTIONS']);

const MONITORING_MODULE_PERMISSIONS_FILE = __DIR__ . '/../data/module_permissions.json';

function module_permissions_respond(int $code, array $payload): void
{
    http_response_code($code);
    header('Content-Type: application/json');
    echo json_encode($payload);
    exit;
}

function module_permissions_storage_directory(): string
{
    return dirname(MONITORING_MODULE_PERMISSIONS_FILE);
}

function module_permissions_ensure_storage_directory(): void
{
    $directory = module_permissions_storage_directory();
    if (is_dir($directory)) {
        return;
    }

    if (!@mkdir($directory, 0777, true) && !is_dir($directory)) {
        throw new RuntimeException('Unable to create permissions storage directory.');
    }
}

function module_permissions_read_file_contents(): ?string
{
    if (!is_file(MONITORING_MODULE_PERMISSIONS_FILE)) {
        return null;
    }

    $contents = @file_get_contents(MONITORING_MODULE_PERMISSIONS_FILE);
    if ($contents === false) {
        throw new RuntimeException('Unable to read module permissions storage.');
    }

    return $contents;
}

function module_permissions_definitions(): array
{
    return [
        'dashboard' => ['admin' => true, 'secretary' => true, 'accountant' => true, 'client' => false],
        'user-management' => [
            'admin' => true,
            'secretary' => false,
            'accountant' => false,
            'client' => false,
            'actions' => [
                'view' => ['admin' => true, 'secretary' => false, 'accountant' => false, 'client' => false],
                'edit' => ['admin' => true, 'secretary' => false, 'accountant' => false, 'client' => false],
                'add-user' => ['admin' => true, 'secretary' => false, 'accountant' => false, 'client' => false],
            ],
        ],
        'permissions' => ['admin' => true, 'secretary' => false, 'accountant' => false, 'client' => false],
        'settings' => ['admin' => true, 'secretary' => false, 'accountant' => false, 'client' => false],
        'client-management' => [
            'admin' => true,
            'secretary' => true,
            'accountant' => false,
            'client' => false,
            'actions' => [
                'view' => ['admin' => true, 'secretary' => true, 'accountant' => false, 'client' => false],
                'edit' => ['admin' => true, 'secretary' => true, 'accountant' => false, 'client' => false],
                'add-new-client' => ['admin' => true, 'secretary' => true, 'accountant' => false, 'client' => false],
                'location' => ['admin' => true, 'secretary' => true, 'accountant' => false, 'client' => false],
            ],
        ],
        'new-client-management' => ['admin' => true, 'secretary' => true, 'accountant' => false, 'client' => false],
        'appointments' => [
            'admin' => true,
            'secretary' => true,
            'accountant' => false,
            'client' => false,
            'actions' => [
                'approve' => ['admin' => true, 'secretary' => true, 'accountant' => false, 'client' => false],
                'decline' => ['admin' => true, 'secretary' => true, 'accountant' => false, 'client' => false],
                'view-files' => ['admin' => true, 'secretary' => true, 'accountant' => false, 'client' => false],
            ],
        ],
        'scheduling' => [
            'admin' => true,
            'secretary' => true,
            'accountant' => false,
            'client' => false,
            'actions' => [
                'approve' => ['admin' => true, 'secretary' => true, 'accountant' => false, 'client' => false],
                'decline' => ['admin' => true, 'secretary' => true, 'accountant' => false, 'client' => false],
                'reschedule' => ['admin' => true, 'secretary' => true, 'accountant' => false, 'client' => false],
                'configure-times' => ['admin' => true, 'secretary' => false, 'accountant' => false, 'client' => false],
            ],
        ],
        'tasks' => ['admin' => true, 'secretary' => true, 'accountant' => true, 'client' => false],
        'calendar' => ['admin' => true, 'secretary' => true, 'accountant' => true, 'client' => false],
        'work-update' => ['admin' => true, 'secretary' => true, 'accountant' => false, 'client' => false],
        'my-tasks' => ['admin' => true, 'secretary' => false, 'accountant' => true, 'client' => false],
        'messaging' => ['admin' => true, 'secretary' => true, 'accountant' => false, 'client' => false],
        'invoices' => ['admin' => true, 'secretary' => false, 'accountant' => true, 'client' => false],
        'reports' => ['admin' => true, 'secretary' => true, 'accountant' => true, 'client' => false],
        'client-account' => ['admin' => false, 'secretary' => false, 'accountant' => false, 'client' => true],
    ];
}

function module_permissions_role_defaults(array $definition): array
{
    return [
        'admin' => (bool)($definition['admin'] ?? false),
        'secretary' => (bool)($definition['secretary'] ?? false),
        'accountant' => (bool)($definition['accountant'] ?? false),
        'client' => (bool)($definition['client'] ?? false),
    ];
}

function module_permissions_default_permissions(): array
{
    $defaults = [];
    foreach (module_permissions_definitions() as $featureKey => $featureDefinition) {
        $defaults[$featureKey] = module_permissions_role_defaults($featureDefinition);

        if (isset($featureDefinition['actions']) && is_array($featureDefinition['actions'])) {
            $defaults[$featureKey]['actions'] = [];
            foreach ($featureDefinition['actions'] as $actionKey => $actionDefinition) {
                $defaults[$featureKey]['actions'][$actionKey] = module_permissions_role_defaults($actionDefinition);
            }
        }
    }

    return $defaults;
}

function module_permissions_normalize_bool($value, bool $default = false): bool
{
    if (is_bool($value)) {
        return $value;
    }

    if (is_int($value)) {
        return $value !== 0;
    }

    if (is_float($value)) {
        return ((int)$value) !== 0;
    }

    $normalized = strtolower(trim((string)($value ?? '')));
    if ($normalized === '') {
        return $default;
    }

    if (in_array($normalized, ['1', 'true', 'yes', 'on'], true)) {
        return true;
    }

    if (in_array($normalized, ['0', 'false', 'no', 'off'], true)) {
        return false;
    }

    return $default;
}

function module_permissions_normalize(array $permissions): array
{
    $definitions = module_permissions_definitions();
    $defaults = module_permissions_default_permissions();
    $normalized = $defaults;

    foreach ($definitions as $featureKey => $featureDefinition) {
        $featurePermissions = isset($permissions[$featureKey]) && is_array($permissions[$featureKey])
            ? $permissions[$featureKey]
            : [];

        $normalized[$featureKey] = [
            'admin' => module_permissions_normalize_bool($featurePermissions['admin'] ?? null, (bool)$featureDefinition['admin']),
            'secretary' => module_permissions_normalize_bool($featurePermissions['secretary'] ?? null, (bool)$featureDefinition['secretary']),
            'accountant' => module_permissions_normalize_bool($featurePermissions['accountant'] ?? null, (bool)$featureDefinition['accountant']),
            'client' => module_permissions_normalize_bool($featurePermissions['client'] ?? null, (bool)$featureDefinition['client']),
        ];

        if (isset($featureDefinition['actions']) && is_array($featureDefinition['actions'])) {
            $featureActions = isset($featurePermissions['actions']) && is_array($featurePermissions['actions'])
                ? $featurePermissions['actions']
                : [];

            $normalized[$featureKey]['actions'] = [];
            foreach ($featureDefinition['actions'] as $actionKey => $actionDefinition) {
                $actionPermissions = isset($featureActions[$actionKey]) && is_array($featureActions[$actionKey])
                    ? $featureActions[$actionKey]
                    : [];
                $defaultActionPermissions = $defaults[$featureKey]['actions'][$actionKey] ?? module_permissions_role_defaults($actionDefinition);

                $normalized[$featureKey]['actions'][$actionKey] = [
                    'admin' => module_permissions_normalize_bool($actionPermissions['admin'] ?? null, (bool)$defaultActionPermissions['admin']),
                    'secretary' => module_permissions_normalize_bool($actionPermissions['secretary'] ?? null, (bool)$defaultActionPermissions['secretary']),
                    'accountant' => module_permissions_normalize_bool($actionPermissions['accountant'] ?? null, (bool)$defaultActionPermissions['accountant']),
                    'client' => module_permissions_normalize_bool($actionPermissions['client'] ?? null, (bool)$defaultActionPermissions['client']),
                ];
            }

            $actionValues = array_values($normalized[$featureKey]['actions']);
            $normalized[$featureKey]['admin'] = false;
            $normalized[$featureKey]['secretary'] = false;
            $normalized[$featureKey]['accountant'] = false;
            $normalized[$featureKey]['client'] = false;
            foreach ($actionValues as $actionValue) {
                if (($actionValue['admin'] ?? false) === true) {
                    $normalized[$featureKey]['admin'] = true;
                }
                if (($actionValue['secretary'] ?? false) === true) {
                    $normalized[$featureKey]['secretary'] = true;
                }
                if (($actionValue['accountant'] ?? false) === true) {
                    $normalized[$featureKey]['accountant'] = true;
                }
                if (($actionValue['client'] ?? false) === true) {
                    $normalized[$featureKey]['client'] = true;
                }
            }
        }
    }

    return $normalized;
}

function module_permissions_save(array $permissions): array
{
    $normalized = module_permissions_normalize($permissions);
    $encoded = json_encode($normalized, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
    if ($encoded === false) {
        module_permissions_respond(500, [
            'success' => false,
            'message' => 'Unable to encode module permissions.',
        ]);
    }

    module_permissions_ensure_storage_directory();
    if (@file_put_contents(MONITORING_MODULE_PERMISSIONS_FILE, $encoded, LOCK_EX) === false) {
        module_permissions_respond(500, [
            'success' => false,
            'message' => 'Unable to save module permissions.',
        ]);
    }

    return $normalized;
}

function module_permissions_load(): array
{
    $rawValue = module_permissions_read_file_contents();

    if ($rawValue === false || trim((string)$rawValue) === '') {
        return module_permissions_default_permissions();
    }

    $decoded = json_decode((string)$rawValue, true);
    if (!is_array($decoded)) {
        return module_permissions_default_permissions();
    }

    return module_permissions_normalize($decoded);
}

try {
    $sessionUser = monitoring_require_auth();
    $method = strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'GET'));

    if ($method === 'GET') {
        if (session_status() === PHP_SESSION_ACTIVE) {
            session_write_close();
        }
        module_permissions_respond(200, [
            'success' => true,
            'permissions' => module_permissions_load(),
        ]);
    }

    if ($method === 'POST') {
        monitoring_require_roles([MONITORING_ROLE_ADMIN], $sessionUser);

        $raw = file_get_contents('php://input');
        $data = json_decode($raw, true);
        if (!is_array($data)) {
            $data = $_POST;
        }

        if (!is_array($data) || empty($data)) {
            module_permissions_respond(400, [
                'success' => false,
                'message' => 'Invalid JSON payload',
            ]);
        }

        $payload = isset($data['permissions']) && is_array($data['permissions']) ? $data['permissions'] : $data;
        if (!is_array($payload)) {
            module_permissions_respond(400, [
                'success' => false,
                'message' => 'permissions is required',
            ]);
        }

        $permissions = module_permissions_save($payload);
        monitoring_write_audit_log($conn, (int)($sessionUser['id'] ?? 0), 'Module permissions updated');

        module_permissions_respond(200, [
            'success' => true,
            'message' => 'Module permissions saved successfully.',
            'permissions' => $permissions,
        ]);
    }

    module_permissions_respond(405, [
        'success' => false,
        'message' => 'Method not allowed',
    ]);
} catch (Throwable $e) {
    module_permissions_respond(500, [
        'success' => false,
        'message' => 'Server error',
        'error' => $e->getMessage(),
    ]);
}
