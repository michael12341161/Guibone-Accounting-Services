import { useEffect, useRef } from "react";
import { LOGIN_SESSION_STORAGE_KEY } from "../../context/AuthContext";
import { useAuth } from "../../hooks/useAuth";
import { useNotification } from "../../hooks/useNotification";
import { showSuccessToast } from "../../utils/feedback";
import { ROLE_IDS } from "../../utils/helpers";

const MODULE_PERMISSION_ALERT_STORAGE_KEY = "monitoring:module-permission-alerts";
const MODULE_PERMISSION_GRANTED_TYPE = "module_permission_granted";

function isNotificationRead(notification) {
  const raw = notification?.is_read ?? notification?.isRead ?? notification?.read;
  if (raw === true || raw === 1 || raw === "1" || raw === "true") return true;
  if (raw === false || raw === 0 || raw === "0" || raw === "false") return false;
  return false;
}

function isModulePermissionGrantedNotification(notification) {
  const type = String(notification?.type ?? notification?.kind ?? "").trim().toLowerCase();
  return type === MODULE_PERMISSION_GRANTED_TYPE;
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

function parseGrantMessage(value) {
  const text = String(value || "").trim();
  if (!text) {
    return {
      title: "Module Access Granted",
      description: "Admin granted you access to a module.",
    };
  }

  const separatorIndex = text.indexOf(":");
  if (separatorIndex <= 0) {
    return {
      title: "Module Access Granted",
      description: text,
    };
  }

  const title = text.slice(0, separatorIndex).trim();
  const description = text.slice(separatorIndex + 1).trim();
  return {
    title: title || "Module Access Granted",
    description: description || text,
  };
}

export default function ModulePermissionGrantAlertObserver() {
  const { role, isAuthReady } = useAuth();
  const { notifications, userId } = useNotification();
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
      return isModulePermissionGrantedNotification(notification);
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

    freshNotifications.forEach((notification) => {
      const notificationId = String(notification?.notifications_ID ?? notification?.id ?? "").trim();
      const { title, description } = parseGrantMessage(notification?.message);

      showSuccessToast({
        title,
        description,
        duration: 3200,
        id: `module-permission-granted:${currentUserKey}:${notificationId || loginSessionKey}`,
      });
    });
  }, [isAuthReady, notifications, role, userId]);

  return null;
}
