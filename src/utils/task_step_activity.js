import { api } from "../services/api";

export const STEP_FILE_ACCEPT =
  ".pdf,.doc,.docx,.xls,.xlsx,.csv,.jpg,.jpeg,.png,.gif,.webp,.txt,.zip";

export function stepActionKey(taskId, stepNumber, action) {
  return `${action}:${taskId}:${stepNumber}`;
}

export function stepDraftKey(taskId, stepNumber) {
  return `${taskId}:${stepNumber}`;
}

export function getUpdatedTaskDescription(response, fallbackDescription = "") {
  return String(response?.data?.task?.description ?? fallbackDescription ?? "");
}

export function replaceTaskDescription(tasks, taskId, description) {
  return (Array.isArray(tasks) ? tasks : []).map((task) =>
    String(task?.id) === String(taskId) || String(task?.task_id) === String(taskId)
      ? { ...task, description }
      : task
  );
}

export function resolveTaskStepFileUrl(path) {
  const value = String(path || "").trim();
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value;

  try {
    const backendRoot = String(api.defaults.baseURL || "").replace(/api\/?$/i, "");
    return new URL(value, backendRoot).href;
  } catch (_) {
    return value;
  }
}

export function toDateTimeLocalInput(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";

  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return "";

  const pad = (part) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;
}

export async function saveTaskStepActivity({ taskId, stepNumber, action, responseText = "", continueAt = "" }) {
  return api.post("task_step_activity.php", {
    task_id: taskId,
    step_number: stepNumber,
    action,
    response: responseText,
    continue_at: continueAt,
  });
}

export async function uploadTaskStepFile({ taskId, stepNumber, file }) {
  const formData = new FormData();
  formData.append("task_id", taskId);
  formData.append("step_number", stepNumber);
  formData.append("action", "upload");
  formData.append("file", file);
  return api.post("task_step_activity.php", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
}
