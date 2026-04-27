import { useEffect, useRef } from "react";
import { ROLE_IDS } from "../utils/helpers";
import {
  isModulePermissionNotification,
  isNotificationRead,
  resolveNotificationIds,
  resolveNotificationTimestampMs,
} from "../utils/module_permission_notifications";

/**
 * Shows permission-related toasts only when new notification IDs appear after the
 * initial list sync for this session (avoids replaying stale unread rows on login/reconnect).
 */
export function useModulePermissionRealtimeToasts({
  isAuthReady,
  role,
  hasLoadedNotifications,
  notifications,
  userId,
  refreshPermissions,
  moduleType,
  showAlertForNotification,
}) {
  const syncPhaseRef = useRef("awaiting");
  const knownIdsRef = useRef(new Set());
  const showAlertRef = useRef(showAlertForNotification);
  showAlertRef.current = showAlertForNotification;

  useEffect(() => {
    if (!hasLoadedNotifications) {
      syncPhaseRef.current = "awaiting";
      knownIdsRef.current = new Set();
      return;
    }
    if (!isAuthReady) return;
    if (![ROLE_IDS.SECRETARY, ROLE_IDS.ACCOUNTANT, ROLE_IDS.CLIENT].includes(role)) return;

    const currentUserKey = String(userId || "").trim();
    if (!currentUserKey) return;

    const matches = (Array.isArray(notifications) ? notifications : []).filter((notification) => {
      if (!isModulePermissionNotification(notification, moduleType)) return false;
      if (!resolveNotificationIds(notification).length) return false;
      return true;
    });

    const allIds = new Set();
    matches.forEach((notification) => {
      resolveNotificationIds(notification).forEach((id) => allIds.add(id));
    });

    if (syncPhaseRef.current === "awaiting") {
      syncPhaseRef.current = "ready";
      knownIdsRef.current = new Set(allIds);
      const hasUnread = matches.some((item) => !isNotificationRead(item));
      if (hasUnread) {
        void refreshPermissions({ silent: true });
      }
      return;
    }

    const newIdList = [...allIds].filter((id) => !knownIdsRef.current.has(id));
    if (!newIdList.length) {
      knownIdsRef.current = new Set(allIds);
      return;
    }

    const newIdSet = new Set(newIdList);
    const toAlert = matches
      .filter(
        (notification) =>
          !isNotificationRead(notification) &&
          resolveNotificationIds(notification).some((id) => newIdSet.has(id))
      )
      .sort((left, right) => resolveNotificationTimestampMs(left) - resolveNotificationTimestampMs(right));

    if (toAlert.length) {
      void refreshPermissions({ silent: true });
      toAlert.forEach((notification) => {
        showAlertRef.current(notification, currentUserKey);
      });
    }

    knownIdsRef.current = new Set(allIds);
  }, [
    hasLoadedNotifications,
    isAuthReady,
    moduleType,
    notifications,
    refreshPermissions,
    role,
    userId,
  ]);
}
