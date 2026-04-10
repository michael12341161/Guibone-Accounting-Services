import { useEffect, useRef } from "react";
import { LOGIN_SESSION_STORAGE_KEY } from "../../context/AuthContext";
import { useModulePermissions } from "../../context/ModulePermissionsContext";
import { useAuth } from "../../hooks/useAuth";
import { useNotification } from "../../hooks/useNotification";
import { showErrorToast } from "../../utils/feedback";
import { ROLE_IDS } from "../../utils/helpers";

const MODULE_PERMISSION_ALERT_STORAGE_KEY = "monitoring:module-permission-revoke-alerts";
const MODULE_PERMISSION_REVOKED_TYPE = "module_permission_revoked";

function isNotificationRead(notification) {
  const raw = notification?.is_read ?? notification?.isRead ?? notification?.read;
  if (raw === true || raw === 1 || raw === "1" || raw === "true") return true;
  if (raw === false || raw === 0 || raw === "0" || raw === "false") return false;
  return false;
}

function isModulePermissionRevokedNotification(notification) {
  const type = String(notification?.type ?? notification?.kind ?? "").trim().toLowerCase();
  return type === MODULE_PERMISSION_REVOKED_TYPE;
}

function readLoginSessionKey() {
  try {
    return String(sessionStorage.getItem(LOGIN_SESSION_STORAGE_KEY) || "").trim();
  } catch (_) {
    return "";
  }
}

function readShownState(userKey) {
  try {
    const raw = localStorage.getItem(MODULE_PERMISSION_ALERT_STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;

    const normalizedUserKey = String(userKey || "").trim();
    const ids = normalizedUserKey && Array.isArray(parsed[normalizedUserKey])
      ? parsed[normalizedUserKey]
      : [];

    return ids.map((value) => String(value || "").trim()).filter(Boolean);
  } catch (_) {
    return null;
  }
}

function persistShownState(userKey, ids) {
  try {
    const normalizedUserKey = String(userKey || "").trim();
    if (!normalizedUserKey) return;

    let parsed = {};
    try {
      const raw = localStorage.getItem(MODULE_PERMISSION_ALERT_STORAGE_KEY);
      const nextParsed = raw ? JSON.parse(raw) : {};
      if (nextParsed && typeof nextParsed === "object") {
        parsed = nextParsed;
      }
    } catch (_) {}

    localStorage.setItem(
      MODULE_PERMISSION_ALERT_STORAGE_KEY,
      JSON.stringify({
        ...parsed,
        [normalizedUserKey]: Array.isArray(ids) ? ids : [],
      })
    );
  } catch (_) {}
}

function parseRevokeMessage(value) {
  const text = String(value || "").trim();
  if (!text) {
    return {
      title: "Module Access Removed",
      description: "Admin removed your access to a module.",
    };
  }

  const separatorIndex = text.indexOf(":");
  if (separatorIndex <= 0) {
    return {
      title: "Module Access Removed",
      description: text,
    };
  }

  const title = text.slice(0, separatorIndex).trim();
  const description = text.slice(separatorIndex + 1).trim();
  return {
    title: title || "Module Access Removed",
    description: description || text,
  };
}

export default function ModulePermissionRevokeAlertObserver() {
  const { role, isAuthReady } = useAuth();
  const { notifications, userId } = useNotification();
  const { refreshPermissions } = useModulePermissions();
  const shownRef = useRef(new Set());
  const scopeKeyRef = useRef("");

  useEffect(() => {
    const currentUserKey = String(userId || "").trim();
    const loginSessionKey = readLoginSessionKey();
    const scopeKey = `${currentUserKey}::${loginSessionKey}`;
    if (scopeKeyRef.current === scopeKey) return;

    scopeKeyRef.current = scopeKey;

    const storedIds = readShownState(currentUserKey);
    if (storedIds) {
      shownRef.current = new Set(storedIds);
      return;
    }

    shownRef.current = new Set();
  }, [userId]);

  useEffect(() => {
    if (!isAuthReady) return;
    if (![ROLE_IDS.SECRETARY, ROLE_IDS.ACCOUNTANT].includes(role)) return;

    const currentUserKey = String(userId || "").trim();
    const loginSessionKey = readLoginSessionKey();
    if (!currentUserKey || !loginSessionKey) return;

    const freshNotifications = (Array.isArray(notifications) ? notifications : []).filter((notification) => {
      const notificationId = String(notification?.notifications_ID ?? notification?.id ?? "").trim();
      if (!notificationId || shownRef.current.has(notificationId)) return false;
      if (isNotificationRead(notification)) return false;
      return isModulePermissionRevokedNotification(notification);
    });

    if (!freshNotifications.length) {
      return;
    }

    freshNotifications.forEach((notification) => {
      const notificationId = String(notification?.notifications_ID ?? notification?.id ?? "").trim();
      if (notificationId) {
        shownRef.current.add(notificationId);
      }
    });
    persistShownState(currentUserKey, Array.from(shownRef.current));

    void refreshPermissions({ silent: true });

    freshNotifications.forEach((notification) => {
      const notificationId = String(notification?.notifications_ID ?? notification?.id ?? "").trim();
      const { title, description } = parseRevokeMessage(notification?.message);

      showErrorToast({
        title,
        description,
        duration: 3600,
        id: `module-permission-revoked:${currentUserKey}:${notificationId || loginSessionKey}`,
      });
    });
  }, [isAuthReady, notifications, refreshPermissions, role, userId]);

  return null;
}
