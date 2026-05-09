const MODULE_PERMISSION_ALERT_STORAGE_KEY_PREFIX = "monitoring:module-permission-alerts:v2";
const MAX_STORED_NOTIFICATION_IDS = 500;

export const MODULE_PERMISSION_GRANTED_TYPE = "module_permission_granted";
export const MODULE_PERMISSION_REVOKED_TYPE = "module_permission_revoked";

function normalizeNotificationId(value) {
  if (value === null || value === undefined || value === "") {
    return "";
  }

  return String(value).trim();
}

function buildStorageKey(userKey) {
  const normalizedUserKey = String(userKey || "").trim();
  return normalizedUserKey ? `${MODULE_PERMISSION_ALERT_STORAGE_KEY_PREFIX}:${normalizedUserKey}` : "";
}

function dedupeNotificationIds(values) {
  return Array.from(
    new Set(
      (Array.isArray(values) ? values : [values])
        .map((value) => normalizeNotificationId(value))
        .filter(Boolean)
    )
  );
}

export function isNotificationRead(notification) {
  const raw = notification?.is_read ?? notification?.isRead ?? notification?.read;
  if (raw === true || raw === 1 || raw === "1" || raw === "true") return true;
  if (raw === false || raw === 0 || raw === "0" || raw === "false") return false;
  return false;
}

export function isModulePermissionNotification(notification, expectedType) {
  const type = String(notification?.type ?? notification?.kind ?? "").trim().toLowerCase();
  return type === String(expectedType || "").trim().toLowerCase();
}

export function resolveNotificationIds(notification) {
  if (Array.isArray(notification?.notificationIds)) {
    return dedupeNotificationIds(notification.notificationIds);
  }

  return dedupeNotificationIds(notification?.notifications_ID ?? notification?.notification_id ?? notification?.id);
}

export function resolveNotificationTimestampMs(notification) {
  const raw = notification?.created_at ?? notification?.createdAt ?? notification?.created ?? null;
  if (!raw) {
    return 0;
  }

  const timestamp = new Date(raw).getTime();
  return Number.isFinite(timestamp) ? Math.max(0, timestamp) : 0;
}

export function readSeenModulePermissionNotificationIds(userKey) {
  if (typeof window === "undefined") {
    return [];
  }

  const storageKey = buildStorageKey(userKey);
  if (!storageKey) {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) {
      return [];
    }

    return dedupeNotificationIds(JSON.parse(raw)).slice(-MAX_STORED_NOTIFICATION_IDS);
  } catch (_) {
    return [];
  }
}

export function writeSeenModulePermissionNotificationIds(userKey, ids) {
  if (typeof window === "undefined") {
    return;
  }

  const storageKey = buildStorageKey(userKey);
  if (!storageKey) {
    return;
  }

  try {
    window.localStorage.setItem(
      storageKey,
      JSON.stringify(dedupeNotificationIds(ids).slice(-MAX_STORED_NOTIFICATION_IDS))
    );
  } catch (_) {}
}

export function hasSeenModulePermissionNotification(notification, seenIds) {
  const seenSet = seenIds instanceof Set ? seenIds : new Set(dedupeNotificationIds(seenIds));
  const notificationIds = resolveNotificationIds(notification);
  if (!notificationIds.length) {
    return false;
  }

  return notificationIds.every((notificationId) => seenSet.has(notificationId));
}

export function markModulePermissionNotificationSeen(notification, seenIds) {
  const nextSeenIds = seenIds instanceof Set ? new Set(seenIds) : new Set(dedupeNotificationIds(seenIds));

  resolveNotificationIds(notification).forEach((notificationId) => {
    nextSeenIds.add(notificationId);
  });

  const trimmedIds = Array.from(nextSeenIds).slice(-MAX_STORED_NOTIFICATION_IDS);
  return new Set(trimmedIds);
}

export function parseModulePermissionAlertMessage(value, fallbackTitle, fallbackDescription) {
  const text = String(value || "").trim();
  if (!text) {
    return {
      title: String(fallbackTitle || "Module Access Updated").trim() || "Module Access Updated",
      description: String(fallbackDescription || "").trim() || "Your module permissions changed.",
    };
  }

  const separatorIndex = text.indexOf(":");
  if (separatorIndex <= 0) {
    return {
      title: String(fallbackTitle || "Module Access Updated").trim() || "Module Access Updated",
      description: text,
    };
  }

  const title = text.slice(0, separatorIndex).trim();
  const description = text.slice(separatorIndex + 1).trim();

  return {
    title: title || String(fallbackTitle || "Module Access Updated").trim() || "Module Access Updated",
    description: description || text || String(fallbackDescription || "").trim() || "Your module permissions changed.",
  };
}
