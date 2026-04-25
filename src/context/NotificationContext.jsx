import React, { createContext, useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../services/api";
import { useAuth } from "../hooks/useAuth";

export const NotificationContext = createContext(null);

function normalizeRole(role) {
  const value = String(role || "").trim().toLowerCase();
  if (!value) return null;
  if (value === "accountant" || value === "client" || value === "secretary") return value;
  return null;
}

function normalizeMessage(message) {
  const value = String(message || "").trim();
  return value || "Notification";
}

function normalizeIdValue(value) {
  if (value === null || value === undefined || value === "") return null;
  return String(value);
}

function resolveNotificationId(notification) {
  return normalizeIdValue(notification?.notifications_ID ?? notification?.notification_id ?? notification?.id);
}

function resolveNotificationIds(notification) {
  if (Array.isArray(notification?.notificationIds)) {
    return Array.from(
      new Set(
        notification.notificationIds
          .map((value) => normalizeIdValue(value))
          .filter(Boolean)
      )
    );
  }

  const resolvedId = resolveNotificationId(notification);
  return resolvedId ? [resolvedId] : [];
}

function resolveTimestamp(notification) {
  const raw = notification?.created_at ?? notification?.createdAt ?? notification?.created;
  if (raw instanceof Date) {
    return Number.isNaN(raw.getTime()) ? null : raw.toISOString();
  }
  const text = String(raw || "").trim();
  return text || null;
}

function normalizeSignatureTimestamp(notification) {
  const timestamp = resolveTimestamp(notification);
  if (!timestamp) {
    return "";
  }

  const parsed = new Date(timestamp).getTime();
  if (!Number.isFinite(parsed)) {
    return String(timestamp).trim();
  }

  return new Date(parsed).toISOString();
}

function hashString(value) {
  const input = String(value ?? "");
  let hash = 5381;
  for (let idx = 0; idx < input.length; idx += 1) {
    hash = (hash * 33) ^ input.charCodeAt(idx);
  }
  return (hash >>> 0).toString(36);
}

function buildDeterministicNotificationId(notification) {
  if (!notification || typeof notification !== "object") {
    return `client:${hashString("empty")}`;
  }

  const userId = resolveNotificationUserId(notification) || "";
  const senderId = resolveNotificationSenderId(notification) || "";
  const type = resolveNotificationType(notification) || "";
  const message = normalizeMessage(notification.message);
  const createdAt = resolveTimestamp(notification) || "";
  const targetRole = normalizeRole(notification.targetRole) || "";
  const targetId =
    notification.targetId !== undefined && notification.targetId !== null ? String(notification.targetId) : "";

  return `client:${hashString(
    [userId, senderId, type, message, createdAt, targetRole, targetId].map((v) => String(v ?? "")).join("|")
  )}`;
}

function resolveNotificationUserId(notification) {
  return normalizeIdValue(notification?.user_id ?? notification?.userId ?? notification?.recipient_id);
}

function resolveNotificationSenderId(notification) {
  return normalizeIdValue(notification?.sender_id ?? notification?.senderId ?? notification?.from_user_id);
}

function resolveNotificationType(notification) {
  const raw = String(notification?.type ?? notification?.kind ?? "").trim();
  return raw || "general";
}

function buildNotificationSignature(notification) {
  const userId = resolveNotificationUserId(notification) || "";
  const senderId = resolveNotificationSenderId(notification) || "";
  const type = resolveNotificationType(notification).trim().toLowerCase();
  const message = normalizeMessage(notification?.message).trim().toLowerCase();
  const createdAt = normalizeSignatureTimestamp(notification);
  const targetRole = normalizeRole(notification?.targetRole) || "";
  const targetId =
    notification?.targetId !== undefined && notification?.targetId !== null ? String(notification.targetId) : "";

  return [userId, senderId, type, message, createdAt, targetRole, targetId].join("|");
}

function resolveNotificationRead(notification) {
  const raw = notification?.is_read ?? notification?.isRead ?? notification?.read;
  if (raw === true || raw === 1 || raw === "1" || raw === "true") return true;
  if (raw === false || raw === 0 || raw === "0" || raw === "false") return false;
  return false;
}

function countUnread(list) {
  const items = Array.isArray(list) ? list : [];
  return items.reduce((total, item) => total + (resolveNotificationRead(item) ? 0 : 1), 0);
}

export function NotificationProvider({ children }) {
  const { user, isAuthReady } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [hasLoadedNotifications, setHasLoadedNotifications] = useState(false);

  const normalizeNotification = useCallback(
    (input) => {
      const base = input && typeof input === "object" ? input : { message: String(input || "") };
      const createdAt = resolveTimestamp(base);
      const notificationId = resolveNotificationId(base) || buildDeterministicNotificationId(base);
      const userId = resolveNotificationUserId(base);
      const senderId = resolveNotificationSenderId(base);
      const type = resolveNotificationType(base);
      const isRead = resolveNotificationRead(base);
      const targetRole = normalizeRole(base.targetRole);
      const targetId = base.targetId !== undefined && base.targetId !== null ? String(base.targetId) : null;

      return {
        id: notificationId,
        notifications_ID: notificationId,
        notificationIds: resolveNotificationIds(base).length ? resolveNotificationIds(base) : [notificationId],
        user_id: userId,
        sender_id: senderId,
        message: normalizeMessage(base.message),
        createdAt,
        created_at: createdAt,
        targetRole,
        targetId,
        kind: type,
        type,
        is_read: isRead ? 1 : 0,
        isRead,
      };
    },
    []
  );

  const prepareNotifications = useCallback(
    (incoming) => {
      const normalizedItems = (Array.isArray(incoming) ? incoming : [incoming])
        .map(normalizeNotification)
        .filter(Boolean);

      const dedupedItems = [];
      const signatureIndex = new Map();

      normalizedItems.forEach((item) => {
        const signature = buildNotificationSignature(item);
        const existingIndex = signatureIndex.get(signature);

        if (existingIndex === undefined) {
          signatureIndex.set(signature, dedupedItems.length);
          dedupedItems.push(item);
          return;
        }

        const existingItem = dedupedItems[existingIndex];
        const mergedNotificationIds = Array.from(
          new Set([...resolveNotificationIds(existingItem), ...resolveNotificationIds(item)])
        );
        const hasUnreadDuplicate = !resolveNotificationRead(existingItem) || !resolveNotificationRead(item);

        dedupedItems[existingIndex] = {
          ...existingItem,
          notificationIds: mergedNotificationIds,
          is_read: hasUnreadDuplicate ? 0 : 1,
          isRead: !hasUnreadDuplicate,
        };
      });

      return dedupedItems;
    },
    [normalizeNotification]
  );

  const addNotifications = useCallback(
    (incoming) => {
      const items = prepareNotifications(incoming);
      if (!items.length) return [];
      setNotifications((prev) => {
        const next = prepareNotifications([...items, ...(Array.isArray(prev) ? prev : [])]);
        setUnreadCount(countUnread(next));
        return next;
      });
      return items;
    },
    [prepareNotifications]
  );

  const removeNotification = useCallback((id) => {
    if (!id) return;
    setNotifications((prev) => {
      const next = Array.isArray(prev) ? prev.filter((n) => n.id !== id) : [];
      setUnreadCount(countUnread(next));
      return next;
    });
  }, []);

  const clearNotifications = useCallback((predicate) => {
    if (typeof predicate !== "function") {
      setNotifications([]);
      setUnreadCount(0);
      return;
    }
    setNotifications((prev) => {
      const next = Array.isArray(prev) ? prev.filter((n) => !predicate(n)) : [];
      setUnreadCount(countUnread(next));
      return next;
    });
  }, []);

  const refreshNotifications = useCallback(async () => {
    const userId = normalizeIdValue(user?.id ?? user?.user_id ?? user?.User_ID);
    if (!isAuthReady || !userId) {
      setNotifications([]);
      setUnreadCount(0);
      setHasLoadedNotifications(false);
      return;
    }

    try {
      const response = await api.get("notification_list.php");
      const itemsRaw = Array.isArray(response?.data?.notifications) ? response.data.notifications : [];
      const items = prepareNotifications(itemsRaw);
      setNotifications(items);
      setUnreadCount(countUnread(items));
      setHasLoadedNotifications(true);
    } catch (_) {
      setHasLoadedNotifications(true);
    }
  }, [isAuthReady, prepareNotifications, user]);

  useEffect(() => {
    let active = true;
    const userId = normalizeIdValue(user?.id ?? user?.user_id ?? user?.User_ID);
    if (!isAuthReady || !userId) {
      setNotifications([]);
      setUnreadCount(0);
      setHasLoadedNotifications(false);
      return undefined;
    }

    setHasLoadedNotifications(false);
    void refreshNotifications();
    const intervalId = window.setInterval(() => {
      if (!active) return;
      void refreshNotifications();
    }, 5000);

    const handleWindowFocus = () => {
      if (!active) return;
      void refreshNotifications();
    };
    window.addEventListener("focus", handleWindowFocus);

    return () => {
      active = false;
      window.clearInterval(intervalId);
      window.removeEventListener("focus", handleWindowFocus);
    };
  }, [isAuthReady, refreshNotifications, user]);

  const notifyTaskCreated = useCallback(() => {
    void refreshNotifications();
  }, [refreshNotifications]);

  const markNotificationRead = useCallback(
    async (notificationId) => {
      const ids = Array.from(
        new Set(
          (Array.isArray(notificationId) ? notificationId : [notificationId])
            .map((value) => normalizeIdValue(value))
            .filter(Boolean)
        )
      );
      if (!ids.length) return;

      setNotifications((prev) => {
        const next = (Array.isArray(prev) ? prev : []).map((item) => {
          const itemIds = resolveNotificationIds(item);
          const shouldMarkRead = itemIds.some((itemId) => ids.includes(itemId));
          if (!shouldMarkRead) return item;
          return { ...item, is_read: 1, isRead: true };
        });
        setUnreadCount(countUnread(next));
        return next;
      });

      try {
        await api.post("notification_mark_read.php", {
          notification_ids: ids,
          notification_id: ids[0],
        });
      } catch (_) {
        void refreshNotifications();
      }
    },
    [refreshNotifications]
  );

  const value = useMemo(
    () => ({
      notifications,
      unreadCount,
      hasLoadedNotifications,
      addNotifications,
      removeNotification,
      clearNotifications,
      notifyTaskCreated,
      refreshNotifications,
      markNotificationRead,
    }),
    [
      notifications,
      unreadCount,
      hasLoadedNotifications,
      addNotifications,
      removeNotification,
      clearNotifications,
      notifyTaskCreated,
      refreshNotifications,
      markNotificationRead,
    ]
  );

  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
}
