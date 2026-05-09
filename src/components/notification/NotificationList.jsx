import React from "react";
import NotificationItem from "./NotificationItem";

const BUSINESS_PERMIT_NOTIFICATION_PREFIX = "business_permit_expired:";

function resolveNotificationId(notification) {
  const raw = notification?.notifications_ID ?? notification?.id ?? null;
  if (raw === null || raw === undefined || raw === "") return "";
  return String(raw).trim();
}

function resolveNotificationType(notification) {
  return String(notification?.type ?? notification?.kind ?? "").trim().toLowerCase();
}

function isBusinessPermitExpiryNotification(notification) {
  return resolveNotificationType(notification).startsWith(BUSINESS_PERMIT_NOTIFICATION_PREFIX);
}

function resolveBusinessPermitClientKey(notification) {
  const type = resolveNotificationType(notification);
  if (!type.startsWith(BUSINESS_PERMIT_NOTIFICATION_PREFIX)) return "";

  const [, clientId = ""] = type.split(":");
  return String(clientId || "").trim();
}

function isReadNotification(notification) {
  const raw = notification?.is_read ?? notification?.isRead ?? notification?.read;
  if (raw === true || raw === 1 || raw === "1" || raw === "true") return true;
  if (raw === false || raw === 0 || raw === "0" || raw === "false") return false;
  return false;
}

function buildAggregateBusinessPermitNotification(notifications, affectedClientCount) {
  const items = Array.isArray(notifications) ? notifications : [];
  if (!items.length || affectedClientCount < 2) return null;

  const referenceNotification = items[0];
  const notificationIds = Array.from(
    new Set(items.map(resolveNotificationId).filter(Boolean))
  );
  const hasUnread = items.some((notification) => !isReadNotification(notification));
  const message = `\u26A0\uFE0F There are ${affectedClientCount} clients with expired business permits. Affected services are currently suspended until the permits are renewed.`;

  return {
    ...referenceNotification,
    id: `business_permit_aggregate:${notificationIds.join(",")}`,
    notifications_ID: notificationIds[0] || referenceNotification?.notifications_ID || referenceNotification?.id,
    notificationIds,
    message,
    type: "business_permit_expired:aggregate",
    kind: "business_permit_expired:aggregate",
    is_read: hasUnread ? 0 : 1,
    isRead: !hasUnread,
  };
}

function buildDisplayNotifications(notifications) {
  const items = Array.isArray(notifications) ? notifications : [];
  const businessPermitNotifications = items.filter(isBusinessPermitExpiryNotification);
  const affectedClientCount = new Set(
    businessPermitNotifications.map(resolveBusinessPermitClientKey).filter(Boolean)
  ).size;

  if (affectedClientCount < 2) {
    return items;
  }

  const aggregateNotification = buildAggregateBusinessPermitNotification(
    businessPermitNotifications,
    affectedClientCount
  );
  if (!aggregateNotification) {
    return items;
  }

  let aggregateInserted = false;
  return items.flatMap((notification) => {
    if (!isBusinessPermitExpiryNotification(notification)) {
      return [notification];
    }

    if (aggregateInserted) {
      return [];
    }

    aggregateInserted = true;
    return [aggregateNotification];
  });
}

export default function NotificationList({ notifications, onMarkRead }) {
  const list = Array.isArray(notifications) ? notifications : [];
  const sorted = list.slice().sort((a, b) => {
    const aRead = a?.is_read ?? a?.isRead ?? a?.read;
    const bRead = b?.is_read ?? b?.isRead ?? b?.read;
    const aIsRead = aRead === true || aRead === 1 || aRead === "1" || aRead === "true";
    const bIsRead = bRead === true || bRead === 1 || bRead === "1" || bRead === "true";
    if (aIsRead !== bIsRead) return aIsRead ? 1 : -1;

    const aTime = Date.parse(a?.created_at || a?.createdAt || a?.created || "");
    const bTime = Date.parse(b?.created_at || b?.createdAt || b?.created || "");
    const aHasTime = !Number.isNaN(aTime);
    const bHasTime = !Number.isNaN(bTime);
    if (aHasTime && bHasTime) return bTime - aTime;
    if (aHasTime && !bHasTime) return -1;
    if (!aHasTime && bHasTime) return 1;
    return 0;
  });
  const displayNotifications = buildDisplayNotifications(sorted);

  if (!displayNotifications.length) {
    return (
      <div className="px-4 py-8 text-center text-sm text-slate-500">
        No notifications yet.
      </div>
    );
  }

  return (
    <ul className="space-y-2 px-3 pb-3">
      {displayNotifications.map((notification) => (
        <NotificationItem
          key={
            notification?.id ||
            notification?.notifications_ID ||
            notification?.createdAt ||
            notification?.created_at
          }
          notification={notification}
          onMarkRead={onMarkRead}
        />
      ))}
    </ul>
  );
}
