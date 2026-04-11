import { getTaskDeadlineState, isTaskClosedStatus, normalizeTaskStatusLabel, readTaskMetaLine } from "./task_deadline";

export function isArchivedTask(task) {
  const description = String(task?.description || "");
  const archivedValue = String(readTaskMetaLine(description, "Archived") || "")
    .trim()
    .toLowerCase();
  const secretaryArchivedValue = String(readTaskMetaLine(description, "SecretaryArchived") || "")
    .trim()
    .toLowerCase();

  return ["1", "true", "yes"].includes(archivedValue) || ["1", "true", "yes"].includes(secretaryArchivedValue);
}

function resolveTaskAttentionKey(task) {
  const taskId = String(task?.Client_services_ID ?? task?.client_services_id ?? task?.task_id ?? task?.id ?? "").trim();
  if (taskId) {
    return taskId;
  }

  const fallbackDeadlineKey = String(task?.deadline ?? task?.due_date ?? task?.end_date ?? "").trim();
  const fallbackNameKey = String(task?.Name ?? task?.name ?? task?.task_name ?? "").trim();
  if (!fallbackDeadlineKey && !fallbackNameKey) {
    return "";
  }

  return `${fallbackNameKey}::${fallbackDeadlineKey}`;
}

export function summarizeTasksRequiringAttention(list) {
  const seen = new Set();
  const summary = { soon: 0, today: 0, overdue: 0 };

  (Array.isArray(list) ? list : []).forEach((task) => {
    if (!task || isArchivedTask(task)) return;

    const deadlineState = getTaskDeadlineState(task);
    if (!deadlineState || deadlineState.isClosed) return;

    const taskKey = resolveTaskAttentionKey(task);
    if (!taskKey || seen.has(taskKey)) return;
    seen.add(taskKey);

    if (deadlineState.isOverdue) {
      summary.overdue += 1;
      return;
    }

    if (deadlineState.isDueToday) {
      summary.today += 1;
      return;
    }

    if (deadlineState.isNearDeadline) {
      summary.soon += 1;
    }
  });

  return summary;
}

export function countTasksRequiringAttention(list) {
  const summary = summarizeTasksRequiringAttention(list);
  return summary.soon + summary.today + summary.overdue;
}

export function countOpenTasks(list) {
  const seen = new Set();
  let total = 0;

  (Array.isArray(list) ? list : []).forEach((task) => {
    if (!task || isArchivedTask(task)) return;

    const taskKey = resolveTaskAttentionKey(task);
    if (!taskKey || seen.has(taskKey)) return;
    seen.add(taskKey);

    const status = normalizeTaskStatusLabel(task?.status);
    if (isTaskClosedStatus(status)) return;

    total += 1;
  });

  return total;
}

export function countUrgentUnfinishedTasks(list) {
  const summary = summarizeTasksRequiringAttention(list);
  return summary.today + summary.overdue;
}

export function buildPendingTaskAttentionMessage(count) {
  const normalizedCount = Math.max(0, Math.trunc(Number(count) || 0));
  const taskLabel = normalizedCount === 1 ? "task" : "tasks";
  return `You have ${normalizedCount} pending ${taskLabel} that require your attention.`;
}
