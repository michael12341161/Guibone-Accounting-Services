<?php
require_once __DIR__ . '/../../vendor/autoload.php';

const MONITORING_TEMP_MAIL_BLOCKLIST_FILE = __DIR__ . '/../data/temp_mail_blocklist.json';

function monitoring_disposable_email_registration_message(): string {
    return 'This email address exists but is not allowed for registration.';
}

function monitoring_temp_mail_blocked_message(): string {
    return 'Email not allowed.';
}

function monitoring_temp_mail_seed_values(): array {
    return [
        'comejoinuspro.org',
        'gixpos.com',
    ];
}

function monitoring_temp_mail_entry_id(string $value): string {
    return substr(sha1(strtolower(trim($value))), 0, 16);
}

function monitoring_temp_mail_normalize_value($value): array {
    $raw = strtolower(trim((string)$value));
    $raw = trim($raw, "\"' \t\n\r\0\x0B");
    $raw = preg_replace('/^mailto:/i', '', $raw);

    if (strpos($raw, '://') !== false) {
        $host = parse_url($raw, PHP_URL_HOST);
        if (is_string($host) && trim($host) !== '') {
            $raw = $host;
        }
    }

    $raw = preg_replace('/^\\*\\./', '', ltrim($raw, '@'));
    $raw = explode('/', $raw)[0];
    $raw = explode(':', $raw)[0];
    $raw = rtrim($raw, '.');

    if ($raw === '') {
        throw new InvalidArgumentException('Enter an email address or domain to block.');
    }

    if (strpos($raw, '@') !== false) {
        if (!filter_var($raw, FILTER_VALIDATE_EMAIL)) {
            throw new InvalidArgumentException('Enter a valid email address or domain.');
        }

        return [
            'value' => $raw,
            'type' => 'email',
        ];
    }

    if (!preg_match('/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\\.)+[a-z]{2,63}$/', $raw)) {
        throw new InvalidArgumentException('Enter a valid email address or domain.');
    }

    return [
        'value' => $raw,
        'type' => 'domain',
    ];
}

function monitoring_temp_mail_create_entry(string $value, ?string $createdAt = null): array {
    $normalized = monitoring_temp_mail_normalize_value($value);
    $entryValue = $normalized['value'];

    return [
        'id' => monitoring_temp_mail_entry_id($entryValue),
        'value' => $entryValue,
        'type' => $normalized['type'],
        'created_at' => $createdAt ?: gmdate('c'),
    ];
}

function monitoring_temp_mail_seed_entries(): array {
    return array_map(
        static fn($value) => monitoring_temp_mail_create_entry($value),
        monitoring_temp_mail_seed_values()
    );
}

function monitoring_temp_mail_sort_entries(array $entries): array {
    usort($entries, static function ($left, $right) {
        return strcmp((string)($left['value'] ?? ''), (string)($right['value'] ?? ''));
    });

    return array_values($entries);
}

function monitoring_temp_mail_normalize_entries(array $entries): array {
    $normalized = [];
    foreach ($entries as $entry) {
        try {
            $value = is_array($entry) ? ($entry['value'] ?? '') : $entry;
            $createdAt = is_array($entry) ? trim((string)($entry['created_at'] ?? '')) : '';
            $nextEntry = monitoring_temp_mail_create_entry((string)$value, $createdAt !== '' ? $createdAt : null);
            $normalized[$nextEntry['value']] = $nextEntry;
        } catch (Throwable $__) {
            continue;
        }
    }

    return monitoring_temp_mail_sort_entries(array_values($normalized));
}

function monitoring_temp_mail_write_entries(array $entries): void {
    $path = MONITORING_TEMP_MAIL_BLOCKLIST_FILE;
    $directory = dirname($path);
    if (!is_dir($directory) && !@mkdir($directory, 0755, true)) {
        throw new RuntimeException('Unable to create temp mail blocklist storage.');
    }

    $payload = json_encode(
        ['entries' => monitoring_temp_mail_normalize_entries($entries)],
        JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES
    );
    if ($payload === false) {
        throw new RuntimeException('Unable to encode temp mail blocklist.');
    }

    @unlink($path . '.tmp');
    if (@file_put_contents($path, $payload, LOCK_EX) === false) {
        throw new RuntimeException('Unable to save temp mail blocklist.');
    }
}

function monitoring_temp_mail_read_entries(): array {
    $path = MONITORING_TEMP_MAIL_BLOCKLIST_FILE;
    if (!is_file($path)) {
        $seedEntries = monitoring_temp_mail_seed_entries();
        try {
            monitoring_temp_mail_write_entries($seedEntries);
        } catch (Throwable $__) {
            // The seed list still applies even if the JSON file cannot be created yet.
        }
        return monitoring_temp_mail_sort_entries($seedEntries);
    }

    $raw = file_get_contents($path);
    if ($raw === false || trim($raw) === '') {
        return [];
    }

    $decoded = json_decode($raw, true);
    if (!is_array($decoded)) {
        return [];
    }

    $entries = isset($decoded['entries']) && is_array($decoded['entries']) ? $decoded['entries'] : $decoded;
    return monitoring_temp_mail_normalize_entries($entries);
}

function monitoring_temp_mail_add_entry(string $value): array {
    $entries = monitoring_temp_mail_read_entries();
    $entry = monitoring_temp_mail_create_entry($value);
    foreach ($entries as $existingEntry) {
        if (($existingEntry['value'] ?? '') === $entry['value']) {
            return [
                'entry' => $existingEntry,
                'entries' => $entries,
                'added' => false,
            ];
        }
    }

    $entries[] = $entry;
    $entries = monitoring_temp_mail_sort_entries($entries);
    monitoring_temp_mail_write_entries($entries);

    return [
        'entry' => $entry,
        'entries' => $entries,
        'added' => true,
    ];
}

function monitoring_temp_mail_remove_entry(string $idOrValue): array {
    $needle = strtolower(trim($idOrValue));
    if ($needle === '') {
        throw new InvalidArgumentException('Choose an entry to remove.');
    }

    $entries = monitoring_temp_mail_read_entries();
    $remaining = [];
    $removed = null;
    foreach ($entries as $entry) {
        $entryId = strtolower((string)($entry['id'] ?? ''));
        $entryValue = strtolower((string)($entry['value'] ?? ''));
        if ($removed === null && ($needle === $entryId || $needle === $entryValue)) {
            $removed = $entry;
            continue;
        }
        $remaining[] = $entry;
    }

    if ($removed === null) {
        throw new InvalidArgumentException('Blocked entry was not found.');
    }

    monitoring_temp_mail_write_entries($remaining);

    return [
        'entry' => $removed,
        'entries' => monitoring_temp_mail_sort_entries($remaining),
    ];
}

function monitoring_temp_mail_email_domain(string $email): string {
    $parts = explode('@', strtolower(trim($email)));
    return count($parts) >= 2 ? trim((string)end($parts)) : '';
}

function monitoring_temp_mail_domain_matches(string $emailDomain, string $blockedDomain): bool {
    if ($emailDomain === $blockedDomain) {
        return true;
    }

    $suffix = '.' . $blockedDomain;
    return strlen($emailDomain) > strlen($suffix)
        && substr($emailDomain, -strlen($suffix)) === $suffix;
}

function monitoring_email_matches_managed_temp_mail_blocklist(string $email): bool {
    $normalizedEmail = strtolower(trim($email));
    if ($normalizedEmail === '') {
        return false;
    }

    $emailDomain = monitoring_temp_mail_email_domain($normalizedEmail);
    foreach (monitoring_temp_mail_read_entries() as $entry) {
        $value = strtolower((string)($entry['value'] ?? ''));
        $type = strtolower((string)($entry['type'] ?? 'domain'));
        if ($type === 'email' && $normalizedEmail === $value) {
            return true;
        }
        if ($type === 'domain' && $emailDomain !== '' && monitoring_temp_mail_domain_matches($emailDomain, $value)) {
            return true;
        }
    }

    return false;
}

function monitoring_email_is_blocked_by_temp_mail_rules(string $email): bool {
    $normalizedEmail = strtolower(trim($email));
    if ($normalizedEmail === '') {
        return false;
    }

    return monitoring_email_matches_managed_temp_mail_blocklist($normalizedEmail)
        || \Fgribreau\MailChecker::isBlacklisted($normalizedEmail);
}

function monitoring_email_is_disposable_for_registration(string $email): bool {
    return monitoring_email_is_blocked_by_temp_mail_rules($email);
}
