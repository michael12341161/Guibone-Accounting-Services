import React, { useEffect, useMemo, useState } from "react";
import Swal from "sweetalert2";
import { useLocation } from "react-router-dom";
import { DataTable } from "../../components/UI/table";
import { Modal } from "../../components/UI/modal";
import { useModulePermissions } from "../../context/ModulePermissionsContext";
import { useAuth } from "../../hooks/useAuth";
import { api } from "../../services/api";
import { formatStepDateTime, parseStepCompletionTimestamps } from "../../utils/task_step_metadata";
import { useErrorToast } from "../../utils/feedback";
import { hasFeatureActionAccess } from "../../utils/module_permissions";
import ArchiveTasksCompleted from "../admin_page/archive_tasks_completed";
import ArchiveTasksCompletedSecretary from "../secretary_page/archive_tasks_completed_secretary";

const STEP_LINE_RE = /^\s*Step\s+(\d+)(?:\s*\((Owner|Accountant|Secretary)\))?\s*:\s*(.*)$/i;
const ARCHIVED_TAG_RE = /^\s*\[Archived\]\s*(?:1|true|yes)?\s*$/i;
const SECRETARY_ARCHIVED_TAG_RE = /^\s*\[SecretaryArchived\]\s*(?:1|true|yes)?\s*$/i;
const HISTORY_PAGE_SIZE = 10;

const normalizeTaskIds = (ids) =>
  Array.from(
    new Set(
      (Array.isArray(ids) ? ids : [])
        .map((value) => String(value || "").trim())
        .filter(Boolean)
    )
  );

const areTaskIdListsEqual = (left, right) => {
  const a = normalizeTaskIds(left);
  const b = normalizeTaskIds(right);
  if (a.length !== b.length) return false;
  return a.every((value, index) => value === b[index]);
};

const extractMetaFromDescription = (descRaw) => {
  const desc = String(descRaw || "");

  const get = (key) => {
    const re = new RegExp(`^\\s*\\[${key}\\]\\s*(.+?)\\s*$`, "im");
    const match = desc.match(re);
    return match?.[1]?.trim() || "";
  };

  return {
    priority: get("Priority"),
    deadline: get("Deadline"),
  };
};

const parseDate = (value) => {
  if (!value) return null;

  const raw = String(value).trim();
  if (!raw || raw === "-") return null;

  let parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) return parsed;

  const dayFirstMatch = raw.match(/^\s*(\d{1,2})[/-](\d{1,2})[/-](\d{4})\s*$/);
  if (dayFirstMatch) {
    const day = parseInt(dayFirstMatch[1], 10);
    const month = parseInt(dayFirstMatch[2], 10);
    const year = parseInt(dayFirstMatch[3], 10);
    parsed = new Date(year, month - 1, day);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }

  return null;
};

const formatDate = (value) => {
  const date = value instanceof Date ? value : parseDate(value);
  if (!date) return "-";
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "2-digit" });
};

const getDeadline = (task) => (
  task?.deadline ||
  task?.due_date ||
  task?.end_date ||
  extractMetaFromDescription(task?.description)?.deadline ||
  ""
);

const isHistoryTask = (task) => {
  const status = String(task?.status || "").trim().toLowerCase();
  return status === "done" || status === "completed";
};

const getTaskKey = (task) => String(task?.id ?? task?.task_id ?? "").trim();

const getArchiveLines = (task) => String(task?.description || "").split(/\r?\n/);

const isAnyArchivedTask = (task) =>
  getArchiveLines(task).some((line) => {
    const value = String(line || "");
    return ARCHIVED_TAG_RE.test(value) || SECRETARY_ARCHIVED_TAG_RE.test(value);
  });

const clearTaskArchived = (descriptionRaw, mode = "all") => {
  const nextLines = String(descriptionRaw || "")
    .split(/\r?\n/)
    .filter((line) => {
      const value = String(line || "");
      if (mode === "secretary") {
        return !SECRETARY_ARCHIVED_TAG_RE.test(value);
      }
      if (mode === "default") {
        return !ARCHIVED_TAG_RE.test(value);
      }
      return !ARCHIVED_TAG_RE.test(value) && !SECRETARY_ARCHIVED_TAG_RE.test(value);
    });

  while (nextLines.length && !String(nextLines[nextLines.length - 1] || "").trim()) {
    nextLines.pop();
  }

  return nextLines.join("\n").trim();
};

const setTaskArchived = (descriptionRaw, mode = "default") => {
  const archiveLine = mode === "secretary" ? "[SecretaryArchived] 1" : "[Archived] 1";
  const nextBase = clearTaskArchived(descriptionRaw, mode);
  const nextLines = String(nextBase || "")
    .split(/\r?\n/)
    .filter((line) => String(line || "").trim());
  nextLines.push(archiveLine);
  return nextLines.join("\n").trim();
};

const parseTaskSteps = (descriptionRaw) => {
  const lines = String(descriptionRaw || "").split(/\r?\n/);
  const extracted = [];

  for (const line of lines) {
    const match = String(line || "").match(STEP_LINE_RE);
    if (!match) continue;
    const text = String(match[3] || "").trim();
    if (!text) continue;
    extracted.push(text);
  }

  return extracted;
};

const buildTaskStepItems = (task) => {
  const steps = parseTaskSteps(task?.description);
  const completionTimestamps = parseStepCompletionTimestamps(task?.description);

  return steps.map((text, index) => ({
    number: index + 1,
    text,
    completedOn: formatStepDateTime(completionTimestamps[index + 1]),
  }));
};

const getTaskCompletedOnLabel = (task) => {
  const completionTimestamps = Object.values(parseStepCompletionTimestamps(task?.description));
  let latestRaw = "";
  let latestTime = Number.NEGATIVE_INFINITY;

  completionTimestamps.forEach((value) => {
    const raw = String(value || "").trim();
    if (!raw) return;

    const time = new Date(raw).getTime();
    if (!Number.isNaN(time) && time > latestTime) {
      latestRaw = raw;
      latestTime = time;
      return;
    }

    if (!latestRaw) {
      latestRaw = raw;
    }
  });

  return latestRaw ? formatStepDateTime(latestRaw) : "";
};

const cleanDescription = (desc) => {
  let value = String(desc || "");

  value = value.replace(/^\s*\[(Progress|Priority|Deadline|Done|StepDone|StepPending|Archived|SecretaryArchived|CreatedAt)\]\s*.*$/gim, "");
  value = value.replace(/^\s*\[(StepCompletedAt|StepRemark|StepRemarkAt)\s+\d+\]\s*.*$/gim, "");
  value = value.replace(/\s*\[Done\]\s*/gi, " ");
  value = value.replace(/^\s*Step\s*\d+(?:\s*\((?:Owner|Accountant|Secretary)\))?\s*[:-]\s*.*$/gim, "");
  value = value.replace(/\bStep\s*\d+(?:\s*\((?:Owner|Accountant|Secretary)\))?\s*[:-]\s*.*?(?=\bStep\s*\d+(?:\s*\((?:Owner|Accountant|Secretary)\))?\s*[:-]|$)/gis, "");

  return value.trim();
};

const priorityMeta = (priorityRaw) => {
  const value = String(priorityRaw || "").trim().toLowerCase();
  if (value === "high" || value === "urgent") {
    return { label: "High", cls: "border-rose-200 bg-rose-50 text-rose-700" };
  }
  if (value === "medium" || value === "normal") {
    return { label: "Medium", cls: "border-amber-200 bg-amber-50 text-amber-800" };
  }
  if (value === "low") {
    return { label: "Low", cls: "border-emerald-200 bg-emerald-50 text-emerald-700" };
  }
  return {
    label: priorityRaw ? String(priorityRaw) : "Low",
    cls: "border-slate-200 bg-slate-50 text-slate-700",
  };
};

const compareHistoryTasks = (left, right) => {
  const leftTime = parseDate(left?.created_at || left?.createdAt)?.getTime() || 0;
  const rightTime = parseDate(right?.created_at || right?.createdAt)?.getTime() || 0;
  if (leftTime !== rightTime) return rightTime - leftTime;

  const leftId = Number(left?.id || left?.task_id || 0);
  const rightId = Number(right?.id || right?.task_id || 0);
  return rightId - leftId;
};

export default function TasksUpdateHistory() {
  const location = useLocation();
  const { user } = useAuth();
  const { permissions } = useModulePermissions();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("All");
  const [selectedTaskIds, setSelectedTaskIds] = useState([]);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [archiveLoading, setArchiveLoading] = useState(false);
  const [restoreLoadingId, setRestoreLoadingId] = useState("");
  const [viewTaskId, setViewTaskId] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  useErrorToast(error);

  const refresh = async ({ silent } = { silent: false }) => {
    try {
      if (!silent) setLoading(true);
      setError("");
      const response = await api.get("task_list.php");
      const list = response?.data?.tasks || response?.data || [];
      setTasks(Array.isArray(list) ? list : []);
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || "Unable to load task update history.");
      setTasks([]);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    let mounted = true;

    void refresh({ silent: false });

    const intervalId = setInterval(() => {
      if (!mounted) return;
      void refresh({ silent: true });
    }, 3000);

    return () => {
      mounted = false;
      clearInterval(intervalId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const persistedUser = useMemo(() => {
    try {
      const raw = sessionStorage.getItem("session:user");
      return raw ? JSON.parse(raw) : null;
    } catch (_) {
      return null;
    }
  }, []);

  const effectiveUser = user ?? persistedUser;
  const effectiveUserId = String(effectiveUser?.id || "").trim();
  const canArchiveTaskHistory = hasFeatureActionAccess(effectiveUser, "work-update", "archive", permissions);
  const canRestoreTaskHistory = hasFeatureActionAccess(effectiveUser, "work-update", "restore", permissions);
  const canOpenArchive = canArchiveTaskHistory || canRestoreTaskHistory;
  const routeRole = useMemo(() => {
    const pathname = String(location.pathname || "").toLowerCase();
    if (pathname.startsWith("/secretary/")) return "secretary";
    if (pathname.startsWith("/accountant/")) return "accountant";
    return "admin";
  }, [location.pathname]);

  const scopedTasks = useMemo(() => {
    const rows = Array.isArray(tasks) ? tasks : [];
    if (routeRole !== "accountant") return rows;
    if (!effectiveUserId) return [];

    return rows.filter((task) => {
      const taskAccountantId = String(task?.accountant_id || task?.user_id || task?.User_ID || "").trim();
      return taskAccountantId === effectiveUserId;
    });
  }, [tasks, routeRole, effectiveUserId]);

  const historyTasks = useMemo(() => {
    return scopedTasks
      .filter((task) => isHistoryTask(task) && !isAnyArchivedTask(task))
      .sort(compareHistoryTasks);
  }, [scopedTasks]);

  const historyTaskIds = useMemo(
    () => normalizeTaskIds(historyTasks.map((task) => getTaskKey(task))),
    [historyTasks]
  );
  const historyTaskIdSet = useMemo(() => new Set(historyTaskIds), [historyTaskIds]);
  const selectedTaskIdSet = useMemo(() => new Set(selectedTaskIds), [selectedTaskIds]);

  useEffect(() => {
    setSelectedTaskIds((current) => {
      const next = normalizeTaskIds(current).filter((id) => historyTaskIdSet.has(id));
      return areTaskIdListsEqual(current, next) ? current : next;
    });
  }, [historyTaskIdSet]);

  useEffect(() => {
    if (viewTaskId && !historyTaskIdSet.has(viewTaskId)) {
      setViewTaskId("");
    }
  }, [historyTaskIdSet, viewTaskId]);

  useEffect(() => {
    if (!canArchiveTaskHistory) {
      setSelectedTaskIds([]);
    }
  }, [canArchiveTaskHistory]);

  useEffect(() => {
    if (!canOpenArchive && archiveOpen) {
      setArchiveOpen(false);
    }
  }, [archiveOpen, canOpenArchive]);

  const filteredTasks = useMemo(() => {
    const query = search.trim().toLowerCase();
    const selectedPriority = priorityFilter.toLowerCase();

    return historyTasks.filter((task) => {
      const meta = extractMetaFromDescription(task.description);
      const priorityValue = String(task.priority || task.task_priority || task.level || meta.priority || "Low").trim().toLowerCase();

      if (selectedPriority !== "all" && priorityValue !== selectedPriority) {
        return false;
      }

      if (!query) {
        return true;
      }

      const title = String(task.title || task.name || "").toLowerCase();
      const clientName = String(task.client_name || task.client_id || "").toLowerCase();
      const serviceName = String(task.service || task.service_name || "").toLowerCase();
      const description = String(task.description || "").toLowerCase();
      const assignedTo = String(task.accountant_name || "").toLowerCase();

      return (
        title.includes(query) ||
        clientName.includes(query) ||
        serviceName.includes(query) ||
        description.includes(query) ||
        assignedTo.includes(query)
      );
    });
  }, [historyTasks, priorityFilter, search]);

  useEffect(() => {
    setCurrentPage(1);
  }, [priorityFilter, search]);

  const archivedTaskRows = useMemo(() => {
    return scopedTasks
      .filter((task) => isAnyArchivedTask(task))
      .sort(compareHistoryTasks)
      .map((task) => {
        const meta = extractMetaFromDescription(task.description);
        const priorityValue = task.priority || task.task_priority || task.level || meta.priority || "Low";
        const dueDate = getDeadline(task);

        return {
          id: task.id || task.task_id || getTaskKey(task),
          title: task.title || task.name || "Untitled task",
          clientName: task.client_name || task.client_id || "Client",
          serviceName: String(task.service || task.service_name || task.status || task.title || task.name || "").trim() || "Service",
          accountantName: task.accountant_name || "Unassigned",
          statusLabel: String(task.status || "Completed").trim() || "Completed",
          priority: priorityValue,
          dueDateLabel: formatDate(dueDate),
          description: cleanDescription(task.description),
          stepCount: parseTaskSteps(task.description).length,
        };
      });
  }, [scopedTasks]);

  const viewTask = useMemo(() => {
    if (!viewTaskId) return null;
    return historyTasks.find((task) => getTaskKey(task) === viewTaskId) || null;
  }, [historyTasks, viewTaskId]);
  const viewTaskSteps = useMemo(() => (viewTask ? buildTaskStepItems(viewTask) : []), [viewTask]);
  const viewTaskCompletedOn = useMemo(() => getTaskCompletedOnLabel(viewTask), [viewTask]);
  const viewTaskDescription = useMemo(() => cleanDescription(viewTask?.description), [viewTask]);

  const archiveTasks = async (taskIds) => {
    if (!canArchiveTaskHistory) return;

    const ids = normalizeTaskIds(taskIds).filter((id) => historyTaskIdSet.has(id));
    if (ids.length === 0) return;

    const confirmation = await Swal.fire({
      title: ids.length === 1 ? "Archive selected task?" : `Archive ${ids.length} selected tasks?`,
      text: 'Type "archive" to confirm this action.',
      icon: "warning",
      background: "#ffffff",
      color: "#0f172a",
      input: "text",
      inputLabel: "Confirmation",
      inputPlaceholder: "Type archive",
      showCancelButton: true,
      confirmButtonText: "Archive",
      cancelButtonText: "Cancel",
      confirmButtonColor: "#475569",
      cancelButtonColor: "#94a3b8",
      reverseButtons: true,
      focusCancel: true,
      didOpen: () => {
        const popup = Swal.getPopup();
        const input = Swal.getInput();
        const confirmButton = Swal.getConfirmButton();
        const cancelButton = Swal.getCancelButton();
        if (popup) {
          popup.style.backgroundColor = "#ffffff";
          popup.style.color = "#0f172a";
        }
        if (!input) return;
        input.style.backgroundColor = "#ffffff";
        input.style.color = "#0f172a";
        input.style.borderColor = "#cbd5e1";
        if (confirmButton) {
          confirmButton.style.backgroundColor = "#dc2626";
          confirmButton.style.color = "#ffffff";
          confirmButton.style.border = "1px solid #dc2626";
          confirmButton.style.boxShadow = "none";
        }
        if (cancelButton) {
          cancelButton.style.backgroundColor = "#e2e8f0";
          cancelButton.style.color = "#0f172a";
          cancelButton.style.border = "1px solid #cbd5e1";
          cancelButton.style.boxShadow = "none";
        }
      },
      preConfirm: (value) => {
        if (String(value || "").trim().toLowerCase() !== "archive") {
          Swal.showValidationMessage('Please type "archive" to continue.');
          return false;
        }
        return true;
      },
    });

    if (!confirmation.isConfirmed) return;

    const taskMap = new Map(historyTasks.map((task) => [getTaskKey(task), task]));
    const archiveMode = routeRole === "secretary" ? "secretary" : "default";

    try {
      setArchiveLoading(true);
      setError("");

      await Promise.all(
        ids.map((id) => {
          const task = taskMap.get(id);
          if (!task) return Promise.resolve();

          return api.post("task_update_status.php", {
            task_id: Number(id),
            description: setTaskArchived(String(task.description || ""), archiveMode),
          });
        })
      );

      await refresh({ silent: true });
      setSelectedTaskIds((current) => current.filter((id) => !ids.includes(id)));
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || "Failed to archive task.");
    } finally {
      setArchiveLoading(false);
    }
  };

  const restoreArchivedTask = async (taskId) => {
    if (!canRestoreTaskHistory) return;

    const normalizedId = String(taskId || "").trim();
    if (!normalizedId) return;

    const task = scopedTasks.find((entry) => getTaskKey(entry) === normalizedId);
    if (!task) return;

    const confirmation = await Swal.fire({
      title: "Restore archived task?",
      text: "This will move the task back to the history list.",
      icon: "question",
      showCancelButton: true,
      confirmButtonText: "Restore",
      cancelButtonText: "Cancel",
      confirmButtonColor: "#059669",
      cancelButtonColor: "#94a3b8",
      reverseButtons: true,
      focusCancel: true,
    });

    if (!confirmation.isConfirmed) return;

    try {
      setRestoreLoadingId(normalizedId);
      setError("");
      await api.post("task_update_status.php", {
        task_id: Number(normalizedId),
        description: clearTaskArchived(String(task.description || ""), "all"),
      });
      await refresh({ silent: true });
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || "Failed to restore task.");
    } finally {
      setRestoreLoadingId("");
    }
  };

  const totalPages = Math.max(1, Math.ceil(filteredTasks.length / HISTORY_PAGE_SIZE));

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const safeCurrentPage = Math.min(currentPage, totalPages);
  const startIndex = (safeCurrentPage - 1) * HISTORY_PAGE_SIZE;
  const endIndex = Math.min(startIndex + HISTORY_PAGE_SIZE, filteredTasks.length);
  const pagedTasks = useMemo(
    () => filteredTasks.slice(startIndex, startIndex + HISTORY_PAGE_SIZE),
    [filteredTasks, startIndex]
  );
  const canPrev = safeCurrentPage > 1;
  const canNext = safeCurrentPage < totalPages;
  const pagedHistoryRows = useMemo(
    () =>
      pagedTasks.map((task) => {
        const meta = extractMetaFromDescription(task.description);
        const priority = priorityMeta(task.priority || task.task_priority || task.level || meta.priority || "Low");

        return {
          ...task,
          taskKey: getTaskKey(task),
          titleLabel: task.title || task.name || "Untitled task",
          clientLabel: task.client_name || task.client_id || "Client",
          serviceLabel: task.service || task.service_name || "Service",
          assigneeLabel: task.accountant_name || "Unassigned",
          createdLabel: formatDate(task.created_at || task.createdAt),
          deadlineLabel: formatDate(getDeadline(task)),
          completedLabel: getTaskCompletedOnLabel(task) || "-",
          stepCount: parseTaskSteps(task.description).length,
          priority,
        };
      }),
    [pagedTasks]
  );

  const historyColumns = [
    ...(canArchiveTaskHistory
      ? [
          {
            key: "select",
            header: "",
            width: "56px",
            align: "center",
            render: (_, row) => (
              <input
                type="checkbox"
                checked={selectedTaskIdSet.has(row.taskKey)}
                onChange={() =>
                  setSelectedTaskIds((current) => {
                    const ids = normalizeTaskIds(current);
                    if (!row.taskKey) return ids;
                    if (ids.includes(row.taskKey)) {
                      return ids.filter((id) => id !== row.taskKey);
                    }
                    return [...ids, row.taskKey];
                  })
                }
                onClick={(event) => event.stopPropagation()}
                disabled={archiveLoading || !row.taskKey}
                className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500/30"
                aria-label={`Select ${row.titleLabel}`}
              />
            ),
          },
        ]
      : []),
    {
      key: "titleLabel",
      header: "Task",
      width: "24%",
      render: (_, row) => (
        <div className="min-w-0">
          <div className="font-medium text-slate-900">{row.titleLabel}</div>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
              Completed
            </span>
            <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${row.priority.cls}`}>
              {row.priority.label} Priority
            </span>
          </div>
        </div>
      ),
    },
    {
      key: "clientLabel",
      header: "Client",
      width: "14%",
      render: (value) => <span className="text-sm text-slate-700">{value}</span>,
    },
    {
      key: "serviceLabel",
      header: "Service",
      width: "14%",
      render: (value) => <span className="text-sm text-slate-700">{value}</span>,
    },
    {
      key: "assigneeLabel",
      header: "Assignee",
      width: "14%",
      render: (value) => <span className="text-sm text-slate-700">{value}</span>,
    },
    {
      key: "createdLabel",
      header: "Created",
      width: "10%",
    },
    {
      key: "deadlineLabel",
      header: "Deadline",
      width: "10%",
    },
    {
      key: "completedLabel",
      header: "Completed",
      width: "13%",
    },
    {
      key: "stepCount",
      header: "Steps",
      width: "7%",
      align: "center",
      render: (value) => <span className="font-medium text-slate-700">{value}</span>,
    },
    {
      key: "action",
      header: "Action",
      width: "94px",
      align: "center",
      render: (_, row) => (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            if (row.taskKey) setViewTaskId(row.taskKey);
          }}
          disabled={!row.taskKey}
          className="inline-flex items-center justify-center rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700 transition-colors hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
        >
          View
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1 min-w-[220px]">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-4 w-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <circle cx="11" cy="11" r="7"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              </svg>
            </span>
            <input
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search completed tasks by title, client, service or assignee..."
              className="w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500/20"
            />
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <select
              value={priorityFilter}
              onChange={(event) => setPriorityFilter(event.target.value)}
              className="w-full sm:w-40 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500/20"
            >
              <option>All</option>
              <option>Low</option>
              <option>Medium</option>
              <option>High</option>
            </select>

            {canArchiveTaskHistory ? (
              <button
                type="button"
                onClick={() => archiveTasks(selectedTaskIds)}
                disabled={selectedTaskIds.length === 0 || archiveLoading}
                className={`rounded-lg border px-3 py-2 text-sm font-medium transition ${
                  selectedTaskIds.length === 0 || archiveLoading
                    ? "border-slate-200 bg-slate-50 text-slate-400 cursor-not-allowed"
                    : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                {selectedTaskIds.length > 0 ? `Archive Selected (${selectedTaskIds.length})` : "Archive Selected"}
              </button>
            ) : null}

            {canOpenArchive ? (
              <button
                type="button"
                onClick={() => setArchiveOpen(true)}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-4 w-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 7.5h18" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 7.5V18a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7.5" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 7.5 6 4h12l1.5 3.5" />
                </svg>
                View Archive
              </button>
            ) : null}
          </div>
        </div>

        {error ? (
          <div className="rounded-md border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error}</div>
        ) : null}

        <DataTable
          columns={historyColumns}
          rows={error ? [] : pagedHistoryRows}
          keyField="taskKey"
          loading={loading}
          compact
          striped={false}
          emptyMessage={error ? "Unable to load task update history." : "No completed tasks found in history yet."}
          className="shadow-none"
          tableClassName="min-w-full"
        />

        {!loading && !error ? (
          <div className="flex flex-col items-center justify-between gap-2 sm:flex-row">
            <div className="text-xs text-slate-600">
              Showing <span className="font-medium">{filteredTasks.length === 0 ? 0 : startIndex + 1}</span>-
              <span className="font-medium">{filteredTasks.length === 0 ? 0 : endIndex}</span> of{" "}
              <span className="font-medium">{filteredTasks.length}</span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  if (canPrev) setCurrentPage((page) => page - 1);
                }}
                disabled={!canPrev}
                className={`inline-flex items-center justify-center rounded-lg border px-3 py-2 text-sm font-medium transition ${
                  canPrev
                    ? "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                    : "border-slate-200 bg-slate-50 text-slate-400 cursor-not-allowed"
                }`}
              >
                Previous
              </button>

              <div className="text-xs text-slate-600">
                Page <span className="font-medium">{safeCurrentPage}</span> of{" "}
                <span className="font-medium">{totalPages}</span>
              </div>

              <button
                type="button"
                onClick={() => {
                  if (canNext) setCurrentPage((page) => page + 1);
                }}
                disabled={!canNext}
                className={`inline-flex items-center justify-center rounded-lg border px-3 py-2 text-sm font-medium transition ${
                  canNext
                    ? "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                    : "border-slate-200 bg-slate-50 text-slate-400 cursor-not-allowed"
                }`}
              >
                Next
              </button>
            </div>
          </div>
        ) : null}
      </div>

      <Modal
        open={Boolean(viewTask)}
        onClose={() => setViewTaskId("")}
        title={viewTask?.title || viewTask?.name || "Task Details"}
        description={
          viewTask
            ? `${viewTask.client_name || viewTask.client_id || "Client"} - ${viewTask.service || viewTask.service_name || "Service"}`
            : undefined
        }
        size="lg"
        footer={(
          <button
            type="button"
            onClick={() => setViewTaskId("")}
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Close
          </button>
        )}
      >
        {viewTask ? (
          <div className="space-y-4">
            {viewTaskCompletedOn ? (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
                <div className="text-[11px] uppercase tracking-wide text-emerald-700">Completed</div>
                <div className="mt-1 text-sm font-semibold text-emerald-700">
                  Completed on {viewTaskCompletedOn}
                </div>
              </div>
            ) : null}

            {viewTaskSteps.length > 0 ? (
              <div className="space-y-3">
                {viewTaskSteps.map((step) => (
                  <div key={`view-task-step-${step.number}`} className="rounded-lg border border-slate-200 bg-white px-4 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                        Step {step.number}
                      </div>
                      {step.completedOn ? (
                        <div className="text-[11px] font-medium text-emerald-700">Completed on {step.completedOn}</div>
                      ) : null}
                    </div>
                    <div className="mt-2 text-sm leading-relaxed text-slate-700">{step.text}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm text-slate-500">
                No step-by-step entries were saved for this task.
              </div>
            )}

            {viewTaskDescription ? (
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                <div className="text-[11px] uppercase tracking-wide text-slate-500">Description</div>
                <div className="mt-2 text-sm leading-relaxed text-slate-700">{viewTaskDescription}</div>
              </div>
            ) : null}
          </div>
        ) : null}
      </Modal>

      <Modal
        open={archiveOpen}
        onClose={() => setArchiveOpen(false)}
        title="Archived Tasks"
        description="Archived tasks from task history are shown here."
        size="lg"
        footer={(
          <button
            type="button"
            onClick={() => setArchiveOpen(false)}
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Close
          </button>
        )}
      >
        {routeRole === "secretary" ? (
          <ArchiveTasksCompletedSecretary
            tasks={archivedTaskRows}
            onRestore={canRestoreTaskHistory ? restoreArchivedTask : null}
            restoringTaskId={restoreLoadingId}
          />
        ) : (
          <ArchiveTasksCompleted
            tasks={archivedTaskRows}
            onRestore={canRestoreTaskHistory ? restoreArchivedTask : null}
            restoringTaskId={restoreLoadingId}
          />
        )}
      </Modal>
    </div>
  );
}
