import React, { createContext, useCallback, useEffect, useMemo, useRef, useState } from "react";
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

function resolveTimestamp(notification) {
  const raw = notification?.created_at ?? notification?.createdAt ?? notification?.created;
  if (raw instanceof Date) {
    return Number.isNaN(raw.getTime()) ? null : raw.toISOString();
  }
  const text = String(raw || "").trim();
  return text || null;
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
  const { user } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const idRef = useRef(0);

  const createId = useCallback(() => {
    idRef.current += 1;
    return `${Date.now()}-${idRef.current}`;
  }, []);

  const normalizeNotification = useCallback(
    (input) => {
      const base = input && typeof input === "object" ? input : { message: String(input || "") };
      const createdAt = resolveTimestamp(base) || new Date().toISOString();
      const notificationId = resolveNotificationId(base) || createId();
      const userId = resolveNotificationUserId(base);
      const senderId = resolveNotificationSenderId(base);
      const type = resolveNotificationType(base);
      const isRead = resolveNotificationRead(base);
      const targetRole = normalizeRole(base.targetRole);
      const targetId = base.targetId !== undefined && base.targetId !== null ? String(base.targetId) : null;

      return {
        id: notificationId,
        notifications_ID: notificationId,
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
    [createId]
  );

  const addNotifications = useCallback(
    (incoming) => {
      const items = (Array.isArray(incoming) ? incoming : [incoming]).map(normalizeNotification);
      if (!items.length) return [];
      setNotifications((prev) => {
        const next = [...items, ...(Array.isArray(prev) ? prev : [])];
        setUnreadCount(countUnread(next));
        return next;
      });
      return items;
    },
    [normalizeNotification]
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
    if (!userId) {
      setNotifications([]);
      setUnreadCount(0);
      return;
    }

    try {
      const response = await api.get("notification_list.php");
      const itemsRaw = Array.isArray(response?.data?.notifications) ? response.data.notifications : [];
      const items = itemsRaw.map(normalizeNotification);
      setNotifications(items);
      const unreadRaw = response?.data?.unread_count;
      if (Number.isFinite(unreadRaw)) {
        setUnreadCount(Math.max(0, Number(unreadRaw)));
      } else {
        setUnreadCount(countUnread(items));
      }
    } catch (_) {}
  }, [normalizeNotification, user]);

  useEffect(() => {
    let active = true;
    const userId = normalizeIdValue(user?.id ?? user?.user_id ?? user?.User_ID);
    if (!userId) {
      setNotifications([]);
      setUnreadCount(0);
      return undefined;
    }

    void refreshNotifications();
    const intervalId = window.setInterval(() => {
      if (!active) return;
      void refreshNotifications();
    }, 10000);

    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, [refreshNotifications, user]);

  const notifyTaskCreated = useCallback(() => {
    void refreshNotifications();
  }, [refreshNotifications]);

  const markNotificationRead = useCallback(
    async (notificationId) => {
      const id = normalizeIdValue(notificationId);
      if (!id) return;

      setNotifications((prev) => {
        const next = (Array.isArray(prev) ? prev : []).map((item) => {
          const itemId = normalizeIdValue(item?.notifications_ID ?? item?.id);
          if (itemId !== id) return item;
          return { ...item, is_read: 1, isRead: true };
        });
        setUnreadCount(countUnread(next));
        return next;
      });

      try {
        const response = await api.post("notification_mark_read.php", { notification_id: id });
        const unreadRaw = response?.data?.unread_count;
        if (Number.isFinite(unreadRaw)) {
          setUnreadCount(Math.max(0, Number(unreadRaw)));
        }
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
