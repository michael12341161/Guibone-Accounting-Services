import React, { useMemo, useState } from "react";
import { formatDateTime } from "../../utils/helpers";
import { Modal } from "../UI/modal";

function isReadNotification(notification) {
  const raw = notification?.is_read ?? notification?.isRead ?? notification?.read;
  if (raw === true || raw === 1 || raw === "1" || raw === "true") return true;
  if (raw === false || raw === 0 || raw === "0" || raw === "false") return false;
  return false;
}

export default function NotificationItem({ notification, onMarkRead }) {
  const [open, setOpen] = useState(false);
  if (!notification) return null;

  const message = String(notification.message || "Notification").trim();
  const createdAtValue = notification.createdAt ?? notification.created_at ?? notification.created;
  const createdAt = createdAtValue ? formatDateTime(createdAtValue) : "";
  const isRead = isReadNotification(notification);
  const notificationId = notification?.notifications_ID ?? notification?.id ?? null;
  const canMarkRead = Boolean(notificationId) && !isRead;

  return (
    <li
      className={`flex gap-3 rounded-lg border px-3 py-2 shadow-sm ${
        isRead ? "border-slate-200 bg-slate-50" : "border-slate-200 bg-white"
      }`}
    >
      <div
        className={`mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
          isRead ? "bg-slate-200 text-slate-500" : "bg-indigo-50 text-indigo-600"
        }`}
      >
        <BellIcon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className={`text-sm ${isRead ? "text-slate-500" : "text-slate-700"}`}>{message}</p>
        {createdAt ? <p className="mt-0.5 text-xs text-slate-400">{createdAt}</p> : null}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="inline-flex items-center rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
          >
            View
          </button>
          <button
            type="button"
            onClick={() => {
              if (!canMarkRead) return;
              onMarkRead?.(notificationId);
            }}
            disabled={!canMarkRead}
            className={`inline-flex items-center rounded-md border px-2.5 py-1 text-xs font-semibold shadow-sm transition ${
              canMarkRead
                ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                : "border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed"
            }`}
          >
            {isRead ? "Read" : "Mark as Read"}
          </button>
        </div>
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Notification"
        description={createdAt ? `Received ${createdAt}` : undefined}
        size="sm"
      >
        <div className="space-y-3">
          <p className="text-base leading-relaxed text-slate-800 whitespace-pre-line">{message}</p>
        </div>
      </Modal>
    </li>
  );
}

function BellIcon({ className = "h-4 w-4" }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 7 3 7H3s3 0 3-7" />
      <path d="M10.3 18a2 2 0 0 0 3.4 0" />
    </svg>
  );
}
