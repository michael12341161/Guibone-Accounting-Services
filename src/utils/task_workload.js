export const DEFAULT_TASK_WORKLOAD_LIMIT = 5;
export const MIN_TASK_WORKLOAD_LIMIT = 1;
export const MAX_TASK_WORKLOAD_LIMIT = 999;

export const DEFAULT_TASK_WORKLOAD_SETTINGS = Object.freeze({
  limit: DEFAULT_TASK_WORKLOAD_LIMIT,
});

export function normalizeTaskWorkloadLimit(value, fallback = DEFAULT_TASK_WORKLOAD_LIMIT) {
  const normalizedFallback =
    typeof fallback === "number" && Number.isFinite(fallback) ? Math.trunc(fallback) : DEFAULT_TASK_WORKLOAD_LIMIT;

  if (typeof value === "number" && Number.isFinite(value)) {
    const nextValue = Math.trunc(value);
    if (nextValue >= MIN_TASK_WORKLOAD_LIMIT && nextValue <= MAX_TASK_WORKLOAD_LIMIT) {
      return nextValue;
    }
    return normalizedFallback;
  }

  const rawValue = String(value ?? "").trim();
  if (!/^\d+$/.test(rawValue)) {
    return normalizedFallback;
  }

  const nextValue = Number.parseInt(rawValue, 10);
  if (nextValue < MIN_TASK_WORKLOAD_LIMIT || nextValue > MAX_TASK_WORKLOAD_LIMIT) {
    return normalizedFallback;
  }

  return nextValue;
}

export function normalizeTaskWorkloadSettings(input) {
  const source = input && typeof input === "object" ? input : {};

  return {
    limit: normalizeTaskWorkloadLimit(source.limit, DEFAULT_TASK_WORKLOAD_LIMIT),
  };
}

export function isTaskCountedInWorkload(task) {
  const status = String(task?.status || task?.status_name || "").trim().toLowerCase();
  return status !== "completed" && status !== "declined" && status !== "cancelled" && status !== "canceled";
}

export function getTaskWorkloadLevel(totalTasks, limit) {
  const normalizedTotal = Number.isFinite(Number(totalTasks)) ? Number(totalTasks) : 0;
  const normalizedLimit = normalizeTaskWorkloadLimit(limit, DEFAULT_TASK_WORKLOAD_LIMIT);

  if (normalizedTotal > normalizedLimit) {
    return "over";
  }
  if (normalizedTotal === normalizedLimit) {
    return "at";
  }
  return "available";
}

export function hasReachedTaskWorkloadLimit(totalTasks, limit) {
  const normalizedTotal = Number.isFinite(Number(totalTasks)) ? Number(totalTasks) : 0;
  const normalizedLimit = normalizeTaskWorkloadLimit(limit, DEFAULT_TASK_WORKLOAD_LIMIT);
  return normalizedTotal >= normalizedLimit;
}
