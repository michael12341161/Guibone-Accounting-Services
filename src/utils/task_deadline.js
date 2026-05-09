import { parseDate, toIsoDate } from "./helpers";

export const TASK_DEADLINE_NOTIFICATION_PREFIX = "task_deadline_";

export function readTaskMetaLine(descriptionRaw, key) {
  const description = String(descriptionRaw || "");
  const matcher = new RegExp(`^\\s*\\[${String(key || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\]\\s*([^\\r\\n]*)\\s*$`, "im");
  const match = description.match(matcher);
  return match?.[1]?.trim() || "";
}

export function getTaskDeadlineValue(task) {
  return (
    task?.deadline ||
    task?.due_date ||
    task?.end_date ||
    readTaskMetaLine(task?.description, "Deadline") ||
    ""
  );
}

export function normalizeTaskStatusLabel(statusRaw) {
  const status = String(statusRaw || "").trim().toLowerCase();

  if (status === "completed" || status === "done") return "Completed";
  if (status === "declined" || status === "cancelled" || status === "canceled") return "Declined";
  if (status === "overdue") return "Overdue";
  if (status === "incomplete") return "Incomplete";
  if (status === "in progress" || status === "started") return "In Progress";
  if (status === "not started" || status === "pending" || status === "") return "Not Started";

  return statusRaw ? String(statusRaw).trim() : "Not Started";
}

export function isTaskClosedStatus(statusRaw) {
  const normalized = normalizeTaskStatusLabel(statusRaw);
  return normalized === "Completed" || normalized === "Declined";
}

export function getTaskDeadlineState(task, options = {}) {
  const soonThresholdDays = Number.isFinite(options.soonThresholdDays) ? Math.max(0, Math.trunc(options.soonThresholdDays)) : 1;
  const now = options.today instanceof Date ? new Date(options.today.getTime()) : new Date();
  const dueRaw = getTaskDeadlineValue(task);
  const dueDate = parseDate(dueRaw);
  const status = normalizeTaskStatusLabel(task?.status);
  const isClosed = isTaskClosedStatus(status);
  const isStatusOverdue = status === "Overdue";

  if (!(dueDate instanceof Date) || Number.isNaN(dueDate.getTime())) {
    return {
      dueRaw,
      dueDate: null,
      status,
      isClosed,
      diffDays: null,
      isNearDeadline: false,
      isDueToday: false,
      isOverdue: false,
    };
  }

  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dueStart = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate());
  const diffDays = Math.round((dueStart.getTime() - todayStart.getTime()) / 86400000);
  const isOverdue = !isClosed && (isStatusOverdue || diffDays < 0);
  const isDueToday = !isClosed && !isOverdue && diffDays === 0;
  const isNearDeadline = !isClosed && diffDays > 0 && diffDays <= soonThresholdDays;

  return {
    dueRaw,
    dueDate,
    status,
    isClosed,
    diffDays,
    isNearDeadline,
    isDueToday,
    isOverdue,
  };
}

export function getTaskDeadlineNotificationKind(typeRaw) {
  const type = String(typeRaw || "").trim().toLowerCase();
  if (type.startsWith("task_deadline_soon:")) return "soon";
  if (type.startsWith("task_deadline_today:")) return "today";
  if (type.startsWith("task_deadline_overdue:")) return "overdue";
  return "";
}

function resolveTaskDeadlineNotificationTaskId(task) {
  return String(task?.Client_services_ID ?? task?.client_services_id ?? task?.task_id ?? task?.id ?? "").trim();
}

export function getCurrentTaskDeadlineNotificationType(task, options = {}) {
  const taskId = resolveTaskDeadlineNotificationTaskId(task);
  if (!taskId) return "";

  const deadlineState = getTaskDeadlineState(task, options);
  if (!deadlineState || deadlineState.isClosed || !(deadlineState.dueDate instanceof Date)) {
    return "";
  }

  let kind = "";
  if (deadlineState.isOverdue) {
    kind = "overdue";
  } else if (deadlineState.isDueToday) {
    kind = "today";
  } else if (deadlineState.isNearDeadline) {
    kind = "soon";
  }

  if (!kind) return "";

  const dueDateKey = toIsoDate(deadlineState.dueDate);
  if (!dueDateKey) return "";

  return `${TASK_DEADLINE_NOTIFICATION_PREFIX}${kind}:${taskId}:${dueDateKey}`;
}

function parseTaskDeadlineNotificationMessage(messageRaw) {
  const text = String(messageRaw || "").trim();
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const values = new Map();
  lines.forEach((line) => {
    const match = line.match(/^([^:]+):\s*(.*)$/);
    if (!match) return;

    const key = String(match[1] || "").trim().toLowerCase();
    const value = String(match[2] || "").trim();
    if (!key || !value) return;
    values.set(key, value);
  });

  return {
    text,
    taskName: values.get("task") || "",
    clientName: values.get("client") || "",
    dueDateRaw: values.get("deadline") || values.get("due") || "",
  };
}

export function formatSoonTaskDeadlineNotificationMessage(messageRaw) {
  const { text, taskName, clientName, dueDateRaw } = parseTaskDeadlineNotificationMessage(messageRaw);
  if (!text) return "Deadline reminder";

  if (!taskName && !clientName && !dueDateRaw) {
    return text;
  }

  const dueDateLabel = String(dueDateRaw || "-").trim() || "-";

  return `\u26A0\uFE0F Task nearing deadline: ${taskName || "Untitled task"} (Client: ${
    clientName || "Unknown client"
  }) \u2014 Due ${dueDateLabel}`;
}

function formatTodayTaskDeadlineNotificationMessage(messageRaw) {
  const { text, taskName, clientName, dueDateRaw } = parseTaskDeadlineNotificationMessage(messageRaw);
  if (!text) return "Today's task alert";

  if (!taskName && !clientName && !dueDateRaw) {
    return text;
  }

  const dueDateLabel = String(dueDateRaw || "-").trim() || "-";

  return `\u26A0\uFE0F Task due today: ${taskName || "Untitled task"} (Client: ${
    clientName || "Unknown client"
  }) \u2014 Due ${dueDateLabel}`;
}

function formatOverdueTaskDeadlineNotificationMessage(messageRaw) {
  const { text, taskName, clientName, dueDateRaw } = parseTaskDeadlineNotificationMessage(messageRaw);
  if (!text) return "Overdue task alert";

  if (!taskName && !clientName && !dueDateRaw) {
    return text;
  }

  const dueDateLabel = String(dueDateRaw || "-").trim() || "-";

  return `\u26A0\uFE0F Overdue task: ${taskName || "Untitled task"} (Client: ${
    clientName || "Unknown client"
  }) \u2014 Due ${dueDateLabel}`;
}

export function formatTaskDeadlineNotificationMessage(messageRaw, typeRaw) {
  const kind = getTaskDeadlineNotificationKind(typeRaw);
  if (kind === "soon") {
    return formatSoonTaskDeadlineNotificationMessage(messageRaw);
  }
  if (kind === "today") {
    return formatTodayTaskDeadlineNotificationMessage(messageRaw);
  }
  if (kind === "overdue") {
    return formatOverdueTaskDeadlineNotificationMessage(messageRaw);
  }

  return String(messageRaw || "").trim() || "Notification";
}

export function isTaskDeadlineNotification(notificationOrType) {
  const type =
    typeof notificationOrType === "string"
      ? notificationOrType
      : notificationOrType?.type ?? notificationOrType?.kind ?? "";
  return getTaskDeadlineNotificationKind(type) !== "";
}
