import React, { useEffect, useRef, useState } from "react";
import { IconButton } from "../UI/buttons";
import { useNotification } from "../../hooks/useNotification";
import NotificationList from "./NotificationList";
import { getTaskDeadlineNotificationKind } from "../../utils/task_deadline";

function pluralizeTask(count) {
  return count === 1 ? "task" : "tasks";
}

function buildOverdueSummaryMessage(count) {
  const taskLabel = pluralizeTask(count);
  const pronoun = count === 1 ? "it" : "them";
  return `\u26A0\uFE0F You have ${count} overdue ${taskLabel}. Please complete ${pronoun} as soon as possible.`;
}

export default function NotificationBell({
  buttonClass = "",
  panelClass = "absolute right-0 top-[3em] w-[22em] max-w-[92vw] rounded-xl border border-slate-200 bg-white shadow-xl z-50",
}) {
  const { notifications, total, refreshNotifications, markNotificationRead } = useNotification();
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const count = total || 0;
  const badgeText = count > 99 ? "99+" : String(count);
  const overdueCount = (Array.isArray(notifications) ? notifications : []).reduce((totalCount, notification) => {
    return totalCount + (getTaskDeadlineNotificationKind(notification?.type ?? notification?.kind) === "overdue" ? 1 : 0);
  }, 0);

  async function handleMarkRead(value) {
    if (typeof markNotificationRead !== "function") return;

    const ids = Array.from(
      new Set(
        (Array.isArray(value) ? value : [value])
          .map((item) => String(item || "").trim())
          .filter(Boolean)
      )
    );
    if (!ids.length) return;

    for (const id of ids) {
      await markNotificationRead(id);
    }

    if (ids.length > 1 && typeof refreshNotifications === "function") {
      await refreshNotifications();
    }
  }

  useEffect(() => {
    function handleDocClick(event) {
      if (!open) return;
      if (!rootRef.current) return;
      if (!rootRef.current.contains(event.target)) {
        setOpen(false);
      }
    }

    function handleKey(event) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", handleDocClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleDocClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    if (typeof refreshNotifications === "function") {
      refreshNotifications();
    }
    const handleResize = () => setOpen(false);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [open, refreshNotifications]);

  return (
    <div ref={rootRef} className="relative">
      <IconButton
        variant="secondary"
        type="button"
        aria-label="Notifications"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
        className={`relative ${buttonClass}`}
      >
        <BellIcon className="h-5 w-5" />
        {count > 0 ? (
          <span className="absolute -right-1 -top-1 inline-flex min-w-[1.25rem] items-center justify-center">
            <span className="absolute inset-0 rounded-full bg-rose-400/70 animate-ping" />
            <span className="relative inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-rose-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">
              {badgeText}
            </span>
          </span>
        ) : null}
      </IconButton>

      {open ? (
        <div className={panelClass} role="dialog" aria-label="Notifications">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <div className="text-sm font-semibold text-slate-800">Notifications</div>
            <div className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
              {count}
            </div>
          </div>
          {overdueCount > 0 ? (
            <div className="border-b border-rose-100 bg-rose-50 px-4 py-3">
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-rose-700">
                Overdue Task Alert
              </div>
              <p className="mt-1 text-sm leading-relaxed text-rose-800">
                {buildOverdueSummaryMessage(overdueCount)}
              </p>
            </div>
          ) : null}
          <div className="max-h-80 overflow-auto">
            <NotificationList notifications={notifications} onMarkRead={handleMarkRead} />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function BellIcon({ className = "h-5 w-5" }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
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
