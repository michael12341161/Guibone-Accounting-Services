import { useCallback, useContext, useMemo } from "react";
import { NotificationContext } from "../context/NotificationContext";
import { useAuth } from "./useAuth";
import { ROLE_IDS } from "../utils/helpers";

function resolveUserId(user) {
  const raw = user?.id ?? user?.user_id ?? user?.User_ID ?? user?.client_id ?? user?.Client_ID;
  if (raw === null || raw === undefined || raw === "") return null;
  return String(raw);
}

function resolveNotificationRecipientId(notification) {
  const raw =
    notification?.user_id ??
    notification?.userId ??
    notification?.recipient_id ??
    notification?.recipientId ??
    null;
  if (raw === null || raw === undefined || raw === "") return null;
  return String(raw);
}

function isNotificationRead(notification) {
  const raw = notification?.is_read ?? notification?.isRead ?? notification?.read;
  if (raw === true || raw === 1 || raw === "1" || raw === "true") return true;
  if (raw === false || raw === 0 || raw === "0" || raw === "false") return false;
  return false;
}

function resolveRoleKey(user, roleId) {
  if (roleId === ROLE_IDS.SECRETARY) return "secretary";
  if (roleId === ROLE_IDS.ACCOUNTANT) return "accountant";
  if (roleId === ROLE_IDS.CLIENT) return "client";

  const roleText = String(user?.role || user?.role_name || "").trim().toLowerCase();
  if (roleText === "secretary" || roleText === "accountant" || roleText === "client") return roleText;
  return null;
}

function isNotificationForUser(notification, roleKey, userId) {
  if (!notification) return false;
  const recipientId = resolveNotificationRecipientId(notification);
  if (recipientId) {
    if (!userId) return false;
    return recipientId === userId;
  }
  const targetRole = String(notification.targetRole || "").trim().toLowerCase();
  const targetId = notification.targetId !== undefined && notification.targetId !== null ? String(notification.targetId) : null;

  if (targetRole && roleKey && targetRole !== roleKey) return false;
  if (targetRole && !roleKey) return false;

  if (targetId) {
    if (!userId) return false;
    return targetId === userId;
  }

  return true;
}

export function useNotification() {
  const context = useContext(NotificationContext);
  const { user, role } = useAuth();

  if (!context) {
    throw new Error("useNotification must be used within a NotificationProvider");
  }

  const roleKey = resolveRoleKey(user, role);
  const userId = resolveUserId(user);

  const notifications = useMemo(() => {
    const list = Array.isArray(context.notifications) ? context.notifications : [];
    return list.filter((item) => isNotificationForUser(item, roleKey, userId));
  }, [context.notifications, roleKey, userId]);

  const unreadCount = useMemo(() => {
    if (Number.isFinite(context.unreadCount)) {
      return Math.max(0, Number(context.unreadCount));
    }
    return notifications.reduce((total, item) => total + (isNotificationRead(item) ? 0 : 1), 0);
  }, [context.unreadCount, notifications]);

  const clearMyNotifications = useCallback(() => {
    if (typeof context.clearNotifications !== "function") return;
    context.clearNotifications((item) => isNotificationForUser(item, roleKey, userId));
  }, [context, roleKey, userId]);

  return {
    ...context,
    notifications,
    total: unreadCount,
    unreadCount,
    roleKey,
    userId,
    clearMyNotifications,
  };
}
