import React, { useState } from "react";
import { formatDateTime } from "../../utils/helpers";
import {
  formatTaskDeadlineNotificationMessage,
  getTaskDeadlineNotificationKind,
} from "../../utils/task_deadline";
import { Modal } from "../UI/modal";

const BUSINESS_PERMIT_NOTIFICATION_PREFIX = "business_permit_expired:";

function isReadNotification(notification) {
  const raw = notification?.is_read ?? notification?.isRead ?? notification?.read;
  if (raw === true || raw === 1 || raw === "1" || raw === "true") return true;
  if (raw === false || raw === 0 || raw === "0" || raw === "false") return false;
  return false;
}

function isBusinessPermitExpiryNotification(notification) {
  const type = String(notification?.type ?? notification?.kind ?? "").trim().toLowerCase();
  return type.startsWith(BUSINESS_PERMIT_NOTIFICATION_PREFIX);
}

function resolveNotificationIds(notification) {
  if (Array.isArray(notification?.notificationIds)) {
    return Array.from(
      new Set(
        notification.notificationIds
          .map((value) => String(value || "").trim())
          .filter(Boolean)
      )
    );
  }

  const raw = notification?.notifications_ID ?? notification?.id ?? null;
  if (raw === null || raw === undefined || raw === "") return [];
  return [String(raw).trim()];
}

export default function NotificationItem({ notification, onMarkRead }) {
  const [open, setOpen] = useState(false);
  if (!notification) return null;

  const message = formatTaskDeadlineNotificationMessage(
    notification.message,
    notification?.type ?? notification?.kind
  );
  const createdAtValue = notification.createdAt ?? notification.created_at ?? notification.created;
  const createdAt = createdAtValue ? formatDateTime(createdAtValue) : "";
  const isRead = isReadNotification(notification);
  const notificationIds = resolveNotificationIds(notification);
  const notificationId = notificationIds[0] ?? null;
  const canMarkRead = notificationIds.length > 0 && !isRead;
  const deadlineKind = getTaskDeadlineNotificationKind(notification?.type ?? notification?.kind);
  const isBusinessPermitNotification = isBusinessPermitExpiryNotification(notification);
  const tone =
    deadlineKind === "overdue"
      ? {
          iconWrap: isRead ? "bg-rose-100 text-rose-500" : "bg-rose-100 text-rose-700",
          cardWrap: isRead ? "border-rose-200 bg-rose-50/70" : "border-rose-200 bg-white",
        }
      : isBusinessPermitNotification
        ? {
            iconWrap: isRead ? "bg-amber-100 text-amber-500" : "bg-amber-100 text-amber-700",
            cardWrap: isRead ? "border-amber-200 bg-amber-50/70" : "border-amber-200 bg-white",
          }
      : deadlineKind === "today" || deadlineKind === "soon"
        ? {
            iconWrap: isRead ? "bg-amber-100 text-amber-500" : "bg-amber-100 text-amber-700",
            cardWrap: isRead ? "border-amber-200 bg-amber-50/70" : "border-amber-200 bg-white",
          }
        : {
            iconWrap: isRead ? "bg-slate-200 text-slate-500" : "bg-indigo-50 text-indigo-600",
            cardWrap: isRead ? "border-slate-200 bg-slate-50" : "border-slate-200 bg-white",
          };

  return (
    <li
      className={`flex gap-3 rounded-lg border px-3 py-2 shadow-sm ${tone.cardWrap}`}
    >
      <div
        className={`mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${tone.iconWrap}`}
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
              onMarkRead?.(notificationIds.length > 1 ? notificationIds : notificationId);
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
