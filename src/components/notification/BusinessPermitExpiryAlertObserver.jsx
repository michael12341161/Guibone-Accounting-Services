import { useEffect, useRef } from "react";
import { useAuth } from "../../hooks/useAuth";
import { useNotification } from "../../hooks/useNotification";
import {
  readSharedLoginSessionKey,
} from "../../context/AuthContext";
import { showAlertDialog } from "../../utils/feedback";
import { ROLE_IDS } from "../../utils/helpers";

const BUSINESS_PERMIT_ALERT_SESSION_STORAGE_KEY = "monitoring:business-permit-alerts";
const BUSINESS_PERMIT_NOTIFICATION_PREFIX = "business_permit_expired:";

function isNotificationRead(notification) {
  const raw = notification?.is_read ?? notification?.isRead ?? notification?.read;
  if (raw === true || raw === 1 || raw === "1" || raw === "true") return true;
  if (raw === false || raw === 0 || raw === "0" || raw === "false") return false;
  return false;
}

function isBusinessPermitExpiryNotification(notification) {
  const type = String(notification?.type ?? notification?.kind ?? "").trim().toLowerCase();
  return type.startsWith(BUSINESS_PERMIT_NOTIFICATION_PREFIX);
}

function resolveBusinessPermitClientKey(notification) {
  const type = String(notification?.type ?? notification?.kind ?? "").trim().toLowerCase();
  if (!type.startsWith(BUSINESS_PERMIT_NOTIFICATION_PREFIX)) return "";

  const [, clientId = ""] = type.split(":");
  return String(clientId || "").trim();
}

function readShownState() {
  try {
    const raw = localStorage.getItem(BUSINESS_PERMIT_ALERT_SESSION_STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;

    return {
      userKey: String(parsed.userKey || "").trim(),
      loginSessionKey: String(parsed.loginSessionKey || "").trim(),
      ids: Array.isArray(parsed.ids)
        ? parsed.ids.map((value) => String(value || "").trim()).filter(Boolean)
        : [],
    };
  } catch (_) {
    return null;
  }
}

function persistShownState(userKey, loginSessionKey, ids) {
  try {
    localStorage.setItem(
      BUSINESS_PERMIT_ALERT_SESSION_STORAGE_KEY,
      JSON.stringify({
        userKey,
        loginSessionKey,
        ids: Array.isArray(ids) ? ids : [],
      })
    );
  } catch (_) {}
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export default function BusinessPermitExpiryAlertObserver() {
  const { role, isAuthReady } = useAuth();
  const { notifications, userId } = useNotification();
  const shownRef = useRef(new Set());
  const scopeKeyRef = useRef("");

  useEffect(() => {
    const currentUserKey = String(userId || "").trim();
    const loginSessionKey = readSharedLoginSessionKey();
    const scopeKey = `${currentUserKey}::${loginSessionKey}`;
    if (scopeKeyRef.current === scopeKey) return;

    scopeKeyRef.current = scopeKey;

    const stored = readShownState();
    if (
      stored &&
      stored.userKey === currentUserKey &&
      stored.loginSessionKey === loginSessionKey
    ) {
      shownRef.current = new Set(stored.ids);
      return;
    }

    shownRef.current = new Set();
  }, [userId]);

  useEffect(() => {
    if (!isAuthReady) return;
    if (![ROLE_IDS.ADMIN, ROLE_IDS.SECRETARY, ROLE_IDS.CLIENT].includes(role)) return;

    const currentUserKey = String(userId || "").trim();
    const loginSessionKey = readSharedLoginSessionKey();
    if (!currentUserKey || !loginSessionKey) return;

    const freshNotifications = (Array.isArray(notifications) ? notifications : []).filter((notification) => {
      const notificationId = String(notification?.notifications_ID ?? notification?.id ?? "").trim();
      if (!notificationId || shownRef.current.has(notificationId)) return false;
      if (isNotificationRead(notification)) return false;
      return isBusinessPermitExpiryNotification(notification);
    });

    if (!freshNotifications.length) {
      return;
    }

    const currentBusinessPermitNotifications = (Array.isArray(notifications) ? notifications : []).filter(
      isBusinessPermitExpiryNotification
    );

    freshNotifications.forEach((notification) => {
      const notificationId = String(notification?.notifications_ID ?? notification?.id ?? "").trim();
      if (notificationId) {
        shownRef.current.add(notificationId);
      }
    });
    persistShownState(currentUserKey, loginSessionKey, Array.from(shownRef.current));

    const isOfficeRole = [ROLE_IDS.ADMIN, ROLE_IDS.SECRETARY].includes(role);
    const affectedClientCount =
      new Set(
        currentBusinessPermitNotifications
          .map(resolveBusinessPermitClientKey)
          .filter(Boolean)
      ).size || freshNotifications.length;
    const shouldShowAggregateOfficeMessage = isOfficeRole && affectedClientCount > 1;

    const title = shouldShowAggregateOfficeMessage
      ? "Business Permit Expiry Alerts"
      : freshNotifications.length === 1
        ? "Business Permit Expired"
        : "Business Permit Expiry Alerts";
    const html = shouldShowAggregateOfficeMessage
      ? (() => {
          const message = `There are ${affectedClientCount} clients with expired business permits. Affected services are currently suspended until the permits are renewed.`;
          return `<div style="padding:8px 0;line-height:1.65;color:inherit;">&#9888;&#65039; ${escapeHtml(message)}</div>`;
        })()
      : freshNotifications
          .map((notification) => {
            const body = escapeHtml(notification?.message).replace(/\r?\n/g, "<br/>");
            return `<div style="padding:8px 0;line-height:1.65;color:inherit;">${body}</div>`;
          })
          .join('<div style="height:1px;background:#e2e8f0;margin:6px 0;"></div>');

    void showAlertDialog({
      icon: "warning",
      title,
      html,
      confirmButtonText: "OK",
    });
  }, [isAuthReady, notifications, role, userId]);

  return null;
}
