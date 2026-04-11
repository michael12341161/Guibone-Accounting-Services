import { useEffect, useRef, useState } from "react";
import { useAuth } from "../../hooks/useAuth";
import { useNotification } from "../../hooks/useNotification";
import {
  DEADLINE_ALERT_SESSION_STORAGE_KEY,
  DEADLINE_REMINDER_SESSION_STORAGE_KEY,
  LOGIN_SESSION_STORAGE_KEY,
} from "../../context/AuthContext";
import { showAlertDialog, showInfoToast } from "../../utils/feedback";
import { ROLE_IDS } from "../../utils/helpers";
import {
  api,
  DEFAULT_SYSTEM_CONFIGURATION,
  fetchSystemConfiguration,
  MONITORING_SYSTEM_CONFIG_UPDATED_EVENT,
} from "../../services/api";
import { getTaskDeadlineNotificationKind } from "../../utils/task_deadline";
import { countTasksRequiringAttention, summarizeTasksRequiringAttention } from "../../utils/task_attention";

const DEFAULT_DEADLINE_REMINDER_INTERVAL_MS =
  (DEFAULT_SYSTEM_CONFIGURATION.taskReminderIntervalHours * 60 +
    DEFAULT_SYSTEM_CONFIGURATION.taskReminderIntervalMinutes) *
  60 *
  1000;

function isNotificationRead(notification) {
  const raw = notification?.is_read ?? notification?.isRead ?? notification?.read;
  if (raw === true || raw === 1 || raw === "1" || raw === "true") return true;
  if (raw === false || raw === 0 || raw === "0" || raw === "false") return false;
  return false;
}

function pluralizeTask(count) {
  return count === 1 ? "task" : "tasks";
}

function buildSoonToastMessage(count) {
  const taskLabel = pluralizeTask(count);
  const pronoun = count === 1 ? "it" : "them";
  return `\uD83D\uDCC5 You have ${count} ${taskLabel} due tomorrow. Make sure to complete ${pronoun} before the deadline.`;
}

function buildTodayAlertMessage(count) {
  const taskLabel = pluralizeTask(count);
  const pronoun = count === 1 ? "it" : "them";
  return `\u26A0\uFE0F You have ${count} ${taskLabel} due today. Please complete ${pronoun} before the deadline.`;
}

function buildOverdueAlertMessage(count) {
  const taskLabel = count === 1 ? "task" : "tasks";
  const pronoun = count === 1 ? "it" : "them";
  return `\u26A0\uFE0F You have ${count} overdue ${taskLabel}. Please complete ${pronoun} as soon as possible.`;
}

function buildPendingReminderMessage(count) {
  const taskLabel = count === 1 ? "task" : "tasks";
  return `\uD83D\uDD14 Reminder: You have ${count} pending ${taskLabel}. Please complete ${count === 1 ? "it" : "them"}.`;
}

function readLoginSessionKey() {
  try {
    return String(sessionStorage.getItem(LOGIN_SESSION_STORAGE_KEY) || "").trim();
  } catch (_) {
    return "";
  }
}

function readShownDeadlineState() {
  try {
    const raw = sessionStorage.getItem(DEADLINE_ALERT_SESSION_STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;

    return {
      userKey: String(parsed.userKey || "").trim(),
      loginSessionKey: String(parsed.loginSessionKey || "").trim(),
      ids: Array.isArray(parsed.ids)
        ? parsed.ids
            .map((value) => String(value || "").trim())
            .filter(Boolean)
        : [],
    };
  } catch (_) {
    return null;
  }
}

function persistShownDeadlineState(userKey, loginSessionKey, ids) {
  try {
    sessionStorage.setItem(
      DEADLINE_ALERT_SESSION_STORAGE_KEY,
      JSON.stringify({
        userKey,
        loginSessionKey,
        ids: Array.isArray(ids) ? ids : [],
      })
    );
  } catch (_) {}
}

function readReminderState() {
  try {
    const raw = sessionStorage.getItem(DEADLINE_REMINDER_SESSION_STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;

    const lastShownAt = Number(parsed.lastShownAt);
    return {
      userKey: String(parsed.userKey || "").trim(),
      loginSessionKey: String(parsed.loginSessionKey || "").trim(),
      lastShownAt: Number.isFinite(lastShownAt) ? lastShownAt : null,
    };
  } catch (_) {
    return null;
  }
}

function persistReminderState(userKey, loginSessionKey, lastShownAt) {
  try {
    sessionStorage.setItem(
      DEADLINE_REMINDER_SESSION_STORAGE_KEY,
      JSON.stringify({
        userKey,
        loginSessionKey,
        lastShownAt,
      })
    );
  } catch (_) {}
}

function parseLoginSessionStartedAt(loginSessionKey) {
  const segments = String(loginSessionKey || "").split(":");
  const startedAt = Number(segments[segments.length - 1]);
  return Number.isFinite(startedAt) ? startedAt : Date.now();
}

function normalizeReminderIntervalMs(hoursValue, minutesValue = 0) {
  const hours = Number(hoursValue);
  const minutes = Number(minutesValue);
  if (!Number.isFinite(hours) || hours < 0) {
    return DEFAULT_DEADLINE_REMINDER_INTERVAL_MS;
  }

  if (!Number.isFinite(minutes) || minutes < 0 || minutes > 59) {
    return DEFAULT_DEADLINE_REMINDER_INTERVAL_MS;
  }

  const totalMinutes = Math.trunc(hours) * 60 + Math.trunc(minutes);
  if (totalMinutes < 1 || totalMinutes > 1440) {
    return DEFAULT_DEADLINE_REMINDER_INTERVAL_MS;
  }

  return totalMinutes * 60 * 1000;
}

export default function DeadlineAlertObserver() {
  const { role, isAuthReady } = useAuth();
  const { notifications, userId } = useNotification();
  const shownRef = useRef(new Set());
  const scopeKeyRef = useRef("");
  const reminderTimeoutRef = useRef(null);
  const [reminderIntervalMs, setReminderIntervalMs] = useState(DEFAULT_DEADLINE_REMINDER_INTERVAL_MS);
  const [reminderTaskCount, setReminderTaskCount] = useState(0);

  useEffect(() => {
    const nextUserKey = String(userId || "");
    const nextLoginSessionKey = readLoginSessionKey();
    const nextScopeKey = `${nextUserKey}::${nextLoginSessionKey}`;
    if (scopeKeyRef.current === nextScopeKey) return;

    scopeKeyRef.current = nextScopeKey;

    const stored = readShownDeadlineState();
    if (
      stored &&
      stored.userKey === nextUserKey &&
      stored.loginSessionKey &&
      stored.loginSessionKey === nextLoginSessionKey
    ) {
      shownRef.current = new Set(stored.ids);
      return;
    }

    shownRef.current = new Set();
  }, [userId]);

  useEffect(() => {
    return () => {
      if (reminderTimeoutRef.current !== null) {
        window.clearTimeout(reminderTimeoutRef.current);
        reminderTimeoutRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!isAuthReady) return;
    if (![ROLE_IDS.ADMIN, ROLE_IDS.SECRETARY, ROLE_IDS.ACCOUNTANT].includes(role)) return;

    let active = true;

    const loadReminderInterval = async () => {
      try {
        const response = await fetchSystemConfiguration();
        if (!active) return;

        const nextSettings = response?.data?.settings;
        setReminderIntervalMs(
          normalizeReminderIntervalMs(
            nextSettings?.taskReminderIntervalHours,
            nextSettings?.taskReminderIntervalMinutes
          )
        );
      } catch (_) {
        if (!active) return;
        setReminderIntervalMs(DEFAULT_DEADLINE_REMINDER_INTERVAL_MS);
      }
    };

    const handleConfigUpdated = (event) => {
      const nextSettings = event?.detail?.settings;
      setReminderIntervalMs(
        normalizeReminderIntervalMs(
          nextSettings?.taskReminderIntervalHours,
          nextSettings?.taskReminderIntervalMinutes
        )
      );
    };

    void loadReminderInterval();
    window.addEventListener(MONITORING_SYSTEM_CONFIG_UPDATED_EVENT, handleConfigUpdated);

    return () => {
      active = false;
      window.removeEventListener(MONITORING_SYSTEM_CONFIG_UPDATED_EVENT, handleConfigUpdated);
    };
  }, [isAuthReady, role]);

  useEffect(() => {
    if (!isAuthReady) return;
    if (![ROLE_IDS.ADMIN, ROLE_IDS.SECRETARY, ROLE_IDS.ACCOUNTANT].includes(role)) return;
    const loginSessionKey = readLoginSessionKey();
    const currentUserKey = String(userId || "").trim();
    if (!loginSessionKey || !currentUserKey) return;
    let active = true;
    const controller = new AbortController();

    const freshDeadlineNotifications = (Array.isArray(notifications) ? notifications : []).filter((notification) => {
      const notificationId = String(notification?.notifications_ID ?? notification?.id ?? "").trim();
      if (!notificationId || shownRef.current.has(notificationId)) return false;
      if (isNotificationRead(notification)) return false;
      const kind = getTaskDeadlineNotificationKind(notification?.type ?? notification?.kind);
      return Boolean(kind);
    });

    if (!freshDeadlineNotifications.length) return;

    freshDeadlineNotifications.forEach((notification) => {
      const notificationId = String(notification?.notifications_ID ?? notification?.id ?? "").trim();
      if (notificationId) {
        shownRef.current.add(notificationId);
      }
    });
    persistShownDeadlineState(currentUserKey, loginSessionKey, Array.from(shownRef.current));

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
        title: "Today's Task Alert",
        description: buildTodayAlertMessage(todayNotifications.length),
        duration: 5000,
      });
    }

    if (!overdueNotifications.length) {
      return () => {
        active = false;
        controller.abort();
      };
    }

    const fallbackOverdueCount = overdueNotifications.length;

    const showCurrentStateAlert = async () => {
      let overdueCount = fallbackOverdueCount;

      try {
        const response = await api.get("task_list.php", { signal: controller.signal });
        if (!active) return;

        const tasks = Array.isArray(response?.data?.tasks) ? response.data.tasks : [];
        const summary = summarizeTasksRequiringAttention(tasks);
        overdueCount = summary.overdue;
      } catch (_) {
        if (!active) return;
      }

      if (overdueCount > 0) {
        await showAlertDialog({
          icon: "warning",
          title: "Overdue Task Alert",
          html: `<div style="padding:4px 0;line-height:1.6;color:inherit;">${buildOverdueAlertMessage(
            overdueCount
          )}</div>`,
          confirmButtonText: "OK",
        });
      }
    };

    void showCurrentStateAlert();

    return () => {
      active = false;
      controller.abort();
    };
  }, [isAuthReady, notifications, role, userId]);

  useEffect(() => {
    if (!isAuthReady) {
      setReminderTaskCount(0);
      return;
    }

    if (![ROLE_IDS.ADMIN, ROLE_IDS.SECRETARY, ROLE_IDS.ACCOUNTANT].includes(role)) {
      setReminderTaskCount(0);
      return;
    }

    let active = true;
    const controller = new AbortController();

    const loadReminderTaskCount = async () => {
      try {
        const response = await api.get("task_list.php", { signal: controller.signal });
        if (!active) return;

        const tasks = Array.isArray(response?.data?.tasks) ? response.data.tasks : [];
        setReminderTaskCount(countTasksRequiringAttention(tasks));
      } catch (_) {
        if (!active) return;
        setReminderTaskCount(0);
      }
    };

    void loadReminderTaskCount();

    return () => {
      active = false;
      controller.abort();
    };
  }, [isAuthReady, notifications, role, userId]);

  useEffect(() => {
    if (reminderTimeoutRef.current !== null) {
      window.clearTimeout(reminderTimeoutRef.current);
      reminderTimeoutRef.current = null;
    }

    if (!isAuthReady) return;
    if (![ROLE_IDS.ADMIN, ROLE_IDS.SECRETARY, ROLE_IDS.ACCOUNTANT].includes(role)) return;

    const currentUserKey = String(userId || "").trim();
    const loginSessionKey = readLoginSessionKey();
    if (!currentUserKey || !loginSessionKey) return;

    const pendingCount = reminderTaskCount;
    if (pendingCount <= 0) return;
    let active = true;
    const controller = new AbortController();

    const reminderState = readReminderState();
    const now = Date.now();
    const baseTimestamp =
      reminderState &&
      reminderState.userKey === currentUserKey &&
      reminderState.loginSessionKey === loginSessionKey &&
      Number.isFinite(reminderState.lastShownAt)
        ? reminderState.lastShownAt
        : parseLoginSessionStartedAt(loginSessionKey);

    const nextReminderAt = baseTimestamp + reminderIntervalMs;
    const showReminder = async () => {
      try {
        const response = await api.get("task_list.php", { signal: controller.signal });
        if (!active) return;

        const tasks = Array.isArray(response?.data?.tasks) ? response.data.tasks : [];
        const nextReminderTaskCount = countTasksRequiringAttention(tasks);
        setReminderTaskCount(nextReminderTaskCount);
        if (nextReminderTaskCount <= 0) return;

        persistReminderState(currentUserKey, loginSessionKey, Date.now());
        await showAlertDialog({
          icon: "info",
          title: "Task Reminder",
          html: `<div style="padding:4px 0;line-height:1.6;color:inherit;">${buildPendingReminderMessage(
            nextReminderTaskCount
          )}</div>`,
          confirmButtonText: "OK",
        });
      } catch (_) {
        if (!active) return;
      }
    };

    if (now >= nextReminderAt) {
      void showReminder();
    } else {
      reminderTimeoutRef.current = window.setTimeout(() => {
        void showReminder();
      }, nextReminderAt - now);
    }

    return () => {
      active = false;
      controller.abort();
      if (reminderTimeoutRef.current !== null) {
        window.clearTimeout(reminderTimeoutRef.current);
        reminderTimeoutRef.current = null;
      }
    };
  }, [isAuthReady, reminderIntervalMs, reminderTaskCount, role, userId]);

  return null;
}
