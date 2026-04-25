import { useEffect, useRef } from "react";
import { useAuth } from "../../hooks/useAuth";
import { useNotification } from "../../hooks/useNotification";
import { showAlertDialog, showInfoToast } from "../../utils/feedback";
import { ROLE_IDS } from "../../utils/helpers";
import { getTaskDeadlineNotificationKind } from "../../utils/task_deadline";

function isNotificationRead(notification) {
  const raw = notification?.is_read ?? notification?.isRead ?? notification?.read;
  if (raw === true || raw === 1 || raw === "1" || raw === "true") return true;
  if (raw === false || raw === 0 || raw === "0" || raw === "false") return false;
  return false;
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function pluralizeTask(count) {
  return count === 1 ? "task" : "tasks";
}

function buildSoonToastMessage(count) {
  const taskLabel = pluralizeTask(count);
  const pronoun = count === 1 ? "it" : "them";
  return `📅 You have ${count} ${taskLabel} due tomorrow. Make sure to complete ${pronoun} before the deadline.`;
}

function buildTodayToastMessage(count) {
  const taskLabel = pluralizeTask(count);
  const pronoun = count === 1 ? "it" : "them";
  return `⚠️ You have ${count} ${taskLabel} due today. Please complete ${pronoun} before the deadline.`;
}

export default function DeadlineAlert() {
  const { role, isAuthReady } = useAuth();
  const { notifications, userId } = useNotification();
  const shownRef = useRef(new Set());
  const userKeyRef = useRef("");

  useEffect(() => {
    const nextUserKey = String(userId || "");
    if (userKeyRef.current === nextUserKey) return;
    userKeyRef.current = nextUserKey;
    shownRef.current = new Set();
  }, [userId]);

  useEffect(() => {
    if (!isAuthReady) return;
    if (![ROLE_IDS.ADMIN, ROLE_IDS.SECRETARY, ROLE_IDS.ACCOUNTANT].includes(role)) return;

    const freshDeadlineNotifications = (Array.isArray(notifications) ? notifications : []).filter((notification) => {
      const notificationId = String(notification?.notifications_ID ?? notification?.id ?? "").trim();
      if (!notificationId || shownRef.current.has(notificationId)) return false;
      if (isNotificationRead(notification)) return false;
      return getTaskDeadlineNotificationKind(notification?.type ?? notification?.kind);
    });

    if (!freshDeadlineNotifications.length) return;

    freshDeadlineNotifications.forEach((notification) => {
      const notificationId = String(notification?.notifications_ID ?? notification?.id ?? "").trim();
      if (notificationId) {
        shownRef.current.add(notificationId);
      }
    });

    const soonNotifications = [];
    const todayNotifications = [];
    const overdueNotifications = [];

    freshDeadlineNotifications.forEach((notification) => {
      const kind = getTaskDeadlineNotificationKind(notification?.type ?? notification?.kind);
      if (kind === "soon") {
        soonNotifications.push(notification);
        return;
      }

      if (kind === "today") {
        todayNotifications.push(notification);
        return;
      }

      if (kind === "overdue") {
        overdueNotifications.push(notification);
      }
    });

    if (soonNotifications.length) {
      showInfoToast({
        title: buildSoonToastMessage(soonNotifications.length),
        duration: 5000,
        id: `deadline-soon-${userId || "user"}`,
      });
    }

    if (todayNotifications.length) {
      showInfoToast({
        title: buildTodayToastMessage(todayNotifications.length),
        duration: 5000,
        id: `deadline-today-${userId || "user"}`,
      });
    }

    if (!overdueNotifications.length) return;

    const popupHtml = overdueNotifications
      .map((notification) => {
        const body = escapeHtml(notification?.message).replace(/\r?\n/g, "<br/>");

        return `
          <div style="border:1px solid #fecaca;background:#fff1f2;border-radius:12px;padding:12px 14px;text-align:left;">
            <div style="font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#9f1239;">Overdue Task</div>
            <div style="margin-top:8px;line-height:1.55;color:#0f172a;">${body}</div>
          </div>
        `;
      })
      .join("");

    void showAlertDialog({
      icon: "warning",
      title: "Overdue Task Alert",
      html: `<div style="display:flex;flex-direction:column;gap:12px;">${popupHtml}</div>`,
      confirmButtonText: "OK",
    });
  }, [isAuthReady, notifications, role, userId]);

  return null;
}
