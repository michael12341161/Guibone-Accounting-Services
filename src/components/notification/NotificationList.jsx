import React from "react";
import NotificationItem from "./NotificationItem";

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

  if (!sorted.length) {
    return (
      <div className="px-4 py-8 text-center text-sm text-slate-500">
        No notifications yet.
      </div>
    );
  }

  return (
    <ul className="space-y-2 px-3 pb-3">
      {sorted.map((notification) => (
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
