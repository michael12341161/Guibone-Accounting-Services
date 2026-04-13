import React, { useEffect, useMemo, useState } from "react";
import Swal from "sweetalert2";
import { Link } from "react-router-dom";
import { api } from "../../services/api";
import { useModulePermissions } from "../../context/ModulePermissionsContext";
import { useAuth } from "../../hooks/useAuth";
import { hasFeatureActionAccess } from "../../utils/module_permissions";
import { useErrorToast } from "../../utils/feedback";
import { getTaskDeadlineState } from "../../utils/task_deadline";
import {
  createLocalStepTimestamp,
  formatStepDateTime,
  parseStepCompletionTimestamps,
  parseStepRemarks,
  parseStepRemarkTimestamps,
  setStepRemark,
  setStepRemarkTimestamp,
} from "../../utils/task_step_metadata";

const STEP_LINE_RE = /^\s*Step\s+(\d+)(?:\s*\((Owner|Accountant|Secretary)\))?\s*:\s*(.*)$/i;
const STEP_DONE_RE = /^\s*\[StepDone\]\s*([^\r\n]*)\s*$/i;
const STEP_PENDING_RE = /^\s*\[StepPending\]\s*([^\r\n]*)\s*$/i;
const PROGRESS_RE = /^\s*\[Progress\]\s*(\d{1,3})\s*$/i;
const ARCHIVED_TAG_RE = /^\s*\[Archived\]\s*(?:1|true|yes)?\s*$/i;
const SECRETARY_ARCHIVED_TAG_RE = /^\s*\[SecretaryArchived\]\s*(?:1|true|yes)?\s*$/i;

const normalizeStepAssignee = (value, fallback = "accountant") => {
  const v = String(value || "").trim().toLowerCase();
  if (v === "owner" || v === "admin") return "owner";
  if (v === "accountant") return "accountant";
  if (v === "secretary") return "secretary";
  if (fallback === "owner") return "owner";
  if (fallback === "secretary") return "secretary";
  return "accountant";
};

const stepAssigneeLabel = (assignee) => {
  const normalized = normalizeStepAssignee(assignee);
  if (normalized === "owner") return "Owner";
  if (normalized === "secretary") return "Secretary";
  return "Accountant";
};

const stepAssigneeTone = (assignee) => {
  const normalized = normalizeStepAssignee(assignee);
  if (normalized === "owner") {
    return {
      wrap: "border-sky-200 bg-sky-50 text-sky-700",
      icon: "bg-sky-100 text-sky-700",
    };
  }
  if (normalized === "secretary") {
    return {
      wrap: "border-amber-200 bg-amber-50 text-amber-700",
      icon: "bg-amber-100 text-amber-700",
    };
  }
  return {
    wrap: "border-emerald-200 bg-emerald-50 text-emerald-700",
    icon: "bg-emerald-100 text-emerald-700",
  };
};

function StepAssigneeIdentity({ assignee }) {
  const label = stepAssigneeLabel(assignee);
  const tone = stepAssigneeTone(assignee);

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${tone.wrap}`}>
      <span className={`inline-flex h-4 w-4 items-center justify-center rounded-full ${tone.icon}`}>
        <svg className="h-2.5 w-2.5" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4Zm0 2c-3.33 0-6 2.24-6 5v1h12v-1c0-2.76-2.67-5-6-5Z" />
        </svg>
      </span>
      <span>{label}</span>
    </span>
  );
}

const parseTaskSteps = (descriptionRaw) => {
  const lines = String(descriptionRaw || "").split(/\r?\n/);
  const extracted = [];

  for (const line of lines) {
    const match = String(line || "").match(STEP_LINE_RE);
    if (!match) continue;
    const text = String(match[3] || "").trim();
    if (!text) continue;
    extracted.push({
      assignee: normalizeStepAssignee(match[2], "accountant"),
      text,
    });
  }

  return extracted.map((step, index) => ({
    number: index + 1,
    assignee: step.assignee,
    text: step.text,
  }));
};

const parseTaggedStepNumbers = (descriptionRaw, matcher) => {
  const lines = String(descriptionRaw || "").split(/\r?\n/);
  const set = new Set();

  for (const line of lines) {
    const match = String(line || "").match(matcher);
    if (!match) continue;
    const values = String(match[1] || "")
      .split(/[,\s]+/)
      .map((token) => parseInt(token, 10))
      .filter((n) => Number.isInteger(n) && n > 0);
    values.forEach((n) => set.add(n));
  }

  return set;
};

const parseCompletedStepNumbers = (descriptionRaw) => parseTaggedStepNumbers(descriptionRaw, STEP_DONE_RE);
const parsePendingStepNumbers = (descriptionRaw) => parseTaggedStepNumbers(descriptionRaw, STEP_PENDING_RE);

const extractProgress = (descriptionRaw) => {
  const lines = String(descriptionRaw || "").split(/\r?\n/);
  for (const line of lines) {
    const match = String(line || "").match(PROGRESS_RE);
    if (!match) continue;
    const progress = parseInt(match[1], 10);
    if (!Number.isFinite(progress)) return 0;
    return Math.max(0, Math.min(100, progress));
  }
  return 0;
};

const setTaggedStepNumbers = (descriptionRaw, matcher, tag, stepSet) => {
  const numbers = Array.from(stepSet || [])
    .map((n) => parseInt(n, 10))
    .filter((n) => Number.isInteger(n) && n > 0)
    .sort((a, b) => a - b);

  const lines = String(descriptionRaw || "").split(/\r?\n/);
  const nextLines = [];
  let written = false;

  for (const line of lines) {
    if (matcher.test(String(line || ""))) {
      if (!written && numbers.length > 0) {
        nextLines.push(`[${tag}] ${numbers.join(",")}`);
        written = true;
      }
      continue;
    }
    nextLines.push(line);
  }

  if (!written && numbers.length > 0) {
    while (nextLines.length && !String(nextLines[nextLines.length - 1] || "").trim()) {
      nextLines.pop();
    }
    nextLines.push(`[${tag}] ${numbers.join(",")}`);
  }

  return nextLines.join("\n").trim();
};

const setPendingStepNumbers = (descriptionRaw, pendingSet) =>
  setTaggedStepNumbers(descriptionRaw, STEP_PENDING_RE, "StepPending", pendingSet);

const setProgress = (descriptionRaw, progressRaw) => {
  const progress = Math.max(0, Math.min(100, parseInt(progressRaw, 10) || 0));
  const lines = String(descriptionRaw || "").split(/\r?\n/);
  const nextLines = [];
  let replaced = false;

  for (const line of lines) {
    if (PROGRESS_RE.test(String(line || ""))) {
      if (!replaced) {
        nextLines.push(`[Progress] ${progress}`);
        replaced = true;
      }
      continue;
    }
    nextLines.push(line);
  }

  if (!replaced) {
    nextLines.unshift(`[Progress] ${progress}`);
  }

  return nextLines.join("\n").trim();
};

const roleCanCompleteStep = (stepAssignee, actorRole) => {
  const stepRole = normalizeStepAssignee(stepAssignee, "accountant");
  const actor = normalizeStepAssignee(actorRole, "accountant");
  return stepRole === actor;
};

const getAssignedStepsForRole = (steps, actorRole) =>
  (Array.isArray(steps) ? steps : []).filter((step) => roleCanCompleteStep(step?.assignee, actorRole));

const getNextStepIndexForAccountant = (steps, doneSet, pendingSet) => {
  const taskSteps = Array.isArray(steps) ? steps : [];
  const completedSteps = doneSet instanceof Set ? doneSet : new Set(doneSet || []);
  const pendingSteps = pendingSet instanceof Set ? pendingSet : new Set(pendingSet || []);

  for (let i = 0; i < taskSteps.length; i++) {
    const stepNumber = i + 1;
    if (completedSteps.has(stepNumber)) continue;
    if (pendingSteps.has(stepNumber)) continue;
    return i;
  }

  return taskSteps.length;
};

const formatStepNumberLabel = (steps) => {
  const numbers = (Array.isArray(steps) ? steps : [])
    .map((step) => Number(step?.number))
    .filter((value) => Number.isInteger(value) && value > 0);

  if (!numbers.length) return "";
  if (numbers.length === 1) return `Step ${numbers[0]}`;
  if (numbers.length === 2) return `Steps ${numbers[0]} and ${numbers[1]}`;

  const preview = numbers.slice(0, 3).join(", ");
  return `Steps ${preview}${numbers.length > 3 ? ` +${numbers.length - 3}` : ""}`;
};

const priorityMeta = (priorityRaw) => {
  const p = String(priorityRaw || "").trim().toLowerCase();
  if (p === "high" || p === "urgent") return { label: "High", cls: "bg-rose-50 text-rose-700 border-rose-200" };
  if (p === "medium" || p === "normal") return { label: "Medium", cls: "bg-amber-50 text-amber-800 border-amber-200" };
  if (p === "low") return { label: "Low", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" };
  return { label: priorityRaw ? String(priorityRaw) : "—", cls: "bg-slate-50 text-slate-700 border-slate-200" };
};

const PriorityBadge = ({ value }) => {
  const meta = priorityMeta(value);
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${meta.cls}`}>
      <span className="inline-block h-1.5 w-1.5 rounded-full bg-current" />
      {meta.label}
    </span>
  );
};

const extractMetaFromDescription = (descRaw) => {
  const desc = String(descRaw || "");
  const get = (key) => {
    const re = new RegExp(`^\\s*\\[${key}\\]\\s*(.+?)\\s*$`, "im");
    const m = desc.match(re);
    return m?.[1]?.trim() || "";
  };
  return { priority: get("Priority"), deadline: get("Deadline"), progress: get("Progress") };
};

const parseDate = (value) => {
  if (!value) return null;
  const v = String(value).trim();
  if (!v || v === "-") return null;

  let d = new Date(v);
  if (!Number.isNaN(d.getTime())) return d;

  // dd/mm/yyyy or dd-mm-yyyy
  const m = v.match(/^\s*(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})\s*$/);
  if (m) {
    const a = parseInt(m[1], 10);
    const b = parseInt(m[2], 10);
    const year = parseInt(m[3], 10);

    // Prefer dd/mm for values that can only be dd/mm (e.g. 25/02)
    if (a > 12) {
      d = new Date(year, b - 1, a);
      if (!Number.isNaN(d.getTime())) return d;
    }

    // Otherwise, assume dd/mm first
    d = new Date(year, b - 1, a);
    if (!Number.isNaN(d.getTime())) return d;

    // Fallback mm/dd
    d = new Date(year, a - 1, b);
    if (!Number.isNaN(d.getTime())) return d;
  }

  return null;
};

const formatDate = (value) => {
  const d = value instanceof Date ? value : parseDate(value);
  if (!d) return "—";
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "2-digit" });
};

const stripStepsFromPreview = (text) => {
  const t = String(text || "").trim();
  if (!t) return "";

  // Remove common inline step formats like:
  // "Step 1: ... Step 2: ..." (single line)
  // Also handles newlines.
  let out = t.replace(/\bStep\s*\d+(?:\s*\((?:Owner|Accountant|Secretary)\))?\s*:\s*/gi, "");

  // If it still looks like it contains multiple steps, hide preview entirely.
  const stepMarkers = (t.match(/\bStep\s*\d+(?:\s*\((?:Owner|Accountant|Secretary)\))?\s*:/gi) || []).length;
  if (stepMarkers >= 2) return "";

  return out.trim();
};

const cleanDescription = (desc) => {
  let d = String(desc || "");
  // Strip metadata lines (do NOT persist step state in DB description)
  d = d.replace(/^\s*\[(Progress|Priority|Deadline|Steps|Done|StepDone|StepPending|Archived|SecretaryArchived)\]\s*.*$/gim, "");
  d = d.replace(/^\s*\[(StepCompletedAt|StepRemark|StepRemarkAt)\s+\d+\]\s*.*$/gim, "");
  d = d.replace(/\s*\[Done\]\s*/gi, " ");
  return d.trim();
};

const isHistoryTask = (task) => {
  const status = String(task?.status || "").trim().toLowerCase();
  return status === "done" || status === "completed";
};

const getTaskKey = (task) => String(task?.id ?? task?.task_id ?? "").trim();

const isTaskArchived = (task) => {
  const lines = String(task?.description || "").split(/\r?\n/);
  return lines.some((line) =>
    ARCHIVED_TAG_RE.test(String(line || "")) || SECRETARY_ARCHIVED_TAG_RE.test(String(line || ""))
  );
};

// eslint-disable-next-line no-unused-vars
const parseSteps = (descRaw) => {
  const desc = cleanDescription(descRaw);
  if (!desc) return [];

  // 1) Prefer line-based parsing.
  const lines = desc
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const extracted = [];
  for (const l of lines) {
    // Supports:
    //  - "1. Do thing" / "2) Do thing"
    //  - "- Do thing" / "• Do thing" / "* Do thing"
    //  - "Step 1: Do thing"
    const m = l.match(/^\s*(?:Step\s*\d+\s*:\s*|\d+\s*[\.)]\s*|[-*•]\s+)(.*)$/i);
    if (m && m[1]) extracted.push(m[1].trim());
  }
  // IMPORTANT: show even a single step.
  if (extracted.length >= 1) return extracted;

  // 2) Inline "Step 1: ... Step 2: ..." parsing.
  const inline = [];
  const re = /\bStep\s*\d+\s*:\s*([^]+?)(?=\bStep\s*\d+\s*:|$)/gi;
  let match;
  while ((match = re.exec(desc)) !== null) {
    const s = String(match[1] || "").trim();
    if (s) inline.push(s.replace(/\s+/g, " "));
  }
  if (inline.length >= 1) return inline;

  // 3) Fallback: split by semicolons if it looks like steps.
  if (desc.includes(";")) {
    const parts = desc
      .split(";")
      .map((p) => p.trim())
      .filter(Boolean);
    if (parts.length >= 1) return parts;
  }

  return [];
};

export default function MyTasks({ user }) {
  const { permissions } = useModulePermissions();
  const { user: authUser } = useAuth();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useErrorToast(error);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [priorityFilter, setPriorityFilter] = useState("All");
  const [declineOpen, setDeclineOpen] = useState(false);
  const [declineTask, setDeclineTask] = useState(null);
  const [declineReason, setDeclineReason] = useState("");

  // Steps floating card state (in-memory per task)
  const [stepsOpen, setStepsOpen] = useState(false);
  const [stepsTask, setStepsTask] = useState(null);
  const [stepRemarkEditor, setStepRemarkEditor] = useState(null);
  const [stepRemarkSaving, setStepRemarkSaving] = useState(false);

  const persistedUser = (() => {
    try {
      const raw = localStorage.getItem("session:user");
      return raw ? JSON.parse(raw) : null;
    } catch (_) {
      return null;
    }
  })();
  const effectiveUser = user ?? authUser ?? persistedUser;
  const userId = effectiveUser?.id;
  const isVisibleToCurrentAccountant = (task) => {
    if (!userId) return true;
    const assigneeId = Number(task?.accountant_id || task?.user_id || task?.User_ID || 0);
    const partnerId = Number(task?.partner_id || 0);
    return assigneeId === Number(userId) || partnerId === Number(userId);
  };
  const canCheckTaskSteps = hasFeatureActionAccess(effectiveUser, "work-update", "check-steps", permissions);
  const canViewTaskUpdateHistory = hasFeatureActionAccess(effectiveUser, "work-update", "history", permissions);
  const canEditTaskUpdates = hasFeatureActionAccess(effectiveUser, "work-update", "edit", permissions);
  const canDeclineTaskUpdates = hasFeatureActionAccess(effectiveUser, "work-update", "decline", permissions);
  const canManageStepRemarks = canViewTaskUpdateHistory && (canEditTaskUpdates || canCheckTaskSteps);

  useEffect(() => {
    let stop = false;
    (async () => {
      try {
        setLoading(true);
        const res = await api.get("task_list.php");
        if (!stop) {
          const list = Array.isArray(res.data?.tasks) ? res.data.tasks : [];
          const mine = userId ? list.filter(isVisibleToCurrentAccountant) : list;
          setTasks(mine);
        }
      } catch (e) {
        if (!stop) setError(e?.response?.data?.message || e?.message || "Failed to load tasks");
      } finally {
        if (!stop) setLoading(false);
      }
    })();

    const intv = setInterval(async () => {
      try {
        const res = await api.get("task_list.php");
        const list = Array.isArray(res.data?.tasks) ? res.data.tasks : [];
        const mine = userId ? list.filter(isVisibleToCurrentAccountant) : list;
        setTasks(mine);
      } catch {}
    }, 15000);

    return () => {
      stop = true;
      clearInterval(intv);
    };
  }, [userId]);

  const progressStatusMeta = (task) => {
    const status = String(task?.status || "").trim().toLowerCase();
    const progress = getProgress(task);
    const deadlineState = getTaskDeadlineState(task);
    const pendingReviewCount = parsePendingStepNumbers(task?.description).size;

    if (status === "declined" || status === "cancelled") {
      return { label: "Declined", cls: "bg-rose-50 text-rose-700 border-rose-200" };
    }
    if (status === "completed" || status === "done") {
      return { label: "Completed", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" };
    }
    if (pendingReviewCount > 0) {
      return { label: "Pending Review", cls: "bg-amber-50 text-amber-700 border-amber-200" };
    }
    if (status === "overdue" || deadlineState.isOverdue) {
      return { label: "Overdue", cls: "bg-rose-50 text-rose-700 border-rose-200" };
    }
    if (status === "incomplete" || progress >= 100) {
      return { label: "Incomplete", cls: "bg-orange-50 text-orange-700 border-orange-200" };
    }
    if (!Number.isFinite(progress) || progress <= 0) {
      return { label: "Not Started", cls: "bg-slate-50 text-slate-700 border-slate-200" };
    }

    return { label: "In Progress", cls: "bg-sky-50 text-sky-700 border-sky-200" };
  };

  const archivedTaskIdSet = useMemo(
    () =>
      new Set(
        (Array.isArray(tasks) ? tasks : [])
          .filter((task) => isTaskArchived(task))
          .map((task) => getTaskKey(task))
          .filter(Boolean)
      ),
    [tasks]
  );
  const activeTasks = useMemo(
    () =>
      (Array.isArray(tasks) ? tasks : []).filter((task) => {
        const taskKey = getTaskKey(task);
        if (taskKey && archivedTaskIdSet.has(taskKey)) return false;
        return !isHistoryTask(task);
      }),
    [tasks, archivedTaskIdSet]
  );

  const getProgress = (task) => {
    return extractProgress(task?.description);
  };

  const refreshMine = async () => {
    const res = await api.get("task_list.php");
    const list = Array.isArray(res.data?.tasks) ? res.data.tasks : [];
    const mine = userId ? list.filter(isVisibleToCurrentAccountant) : list;
    setTasks(mine);
  };

  const openSteps = (task) => {
    setStepsTask(task);
    setStepRemarkEditor(null);
    setStepsOpen(true);
  };

  const closeSteps = () => {
    setStepsOpen(false);
    setStepsTask(null);
    setStepRemarkEditor(null);
  };

  const beginStepRemarkEdit = (task, stepNumber, currentValue = "") => {
    if (!canManageStepRemarks) return;
    const taskId = Number(task?.id || 0);
    if (!taskId) return;

    setStepRemarkEditor({
      taskId,
      stepNumber: Number(stepNumber),
      value: String(currentValue || ""),
    });
  };

  const cancelStepRemarkEdit = () => {
    if (stepRemarkSaving) return;
    setStepRemarkEditor(null);
  };

  const isEditingStepRemark = (taskId, stepNumber) =>
    String(stepRemarkEditor?.taskId || "") === String(taskId || "") &&
    Number(stepRemarkEditor?.stepNumber) === Number(stepNumber);

  const saveStepRemark = async (task, stepNumber) => {
    if (!canManageStepRemarks) return;
    const taskId = Number(task?.id || 0);
    if (!taskId || !isEditingStepRemark(taskId, stepNumber)) return;
    if (parseCompletedStepNumbers(task?.description).has(stepNumber)) return;
    if (parsePendingStepNumbers(task?.description).has(stepNumber)) return;

    const nextRemark = String(stepRemarkEditor?.value || "");
    let updatedDesc = setStepRemark(String(task?.description || ""), stepNumber, nextRemark);
    updatedDesc = setStepRemarkTimestamp(
      updatedDesc,
      stepNumber,
      nextRemark.trim() ? createLocalStepTimestamp() : ""
    );

    try {
      setStepRemarkSaving(true);
      setError("");
      await api.post("task_update_status.php", { task_id: taskId, description: updatedDesc });
      setStepRemarkEditor((current) =>
        String(current?.taskId || "") === String(taskId) && Number(current?.stepNumber) === Number(stepNumber)
          ? null
          : current
      );
      await refreshMine();
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || "Failed to save remark");
      await refreshMine();
    } finally {
      setStepRemarkSaving(false);
    }
  };

  const updateStep = async (task, index, value) => {
    if (!canCheckTaskSteps) return;
    const id = task?.id;
    if (!id) return;

    if (value !== "done") return;

    const steps = parseTaskSteps(task?.description);
    if (!steps.length) return;

    const doneSet = parseCompletedStepNumbers(task?.description);
    const pendingSet = parsePendingStepNumbers(task?.description);
    const nextRequiredIndex = getNextStepIndexForAccountant(steps, doneSet, pendingSet);

    if (index !== nextRequiredIndex) return;

    const step = steps[index];
    if (!step) return;
    if (!roleCanCompleteStep(step.assignee, "accountant")) return;
    if (pendingSet.has(index + 1)) return;

    const confirmation = await Swal.fire({
      title: `Submit Step ${index + 1}?`,
      text: "This will send the step to admin or secretary for approval.",
      icon: "question",
      showCancelButton: true,
      confirmButtonText: "Yes, submit it",
      cancelButtonText: "Cancel",
      confirmButtonColor: "#2563eb",
      cancelButtonColor: "#64748b",
      reverseButtons: true,
      focusCancel: true,
    });
    if (!confirmation.isConfirmed) return;

    const nextPending = new Set(pendingSet);
    nextPending.add(index + 1);
    let updatedDesc = setPendingStepNumbers(String(task?.description || ""), nextPending);
    const nextProgress = Math.round((doneSet.size / steps.length) * 100);
    updatedDesc = setProgress(updatedDesc, nextProgress);

    try {
      await api.post("task_update_status.php", { task_id: id, description: updatedDesc });
      await refreshMine();
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || "Failed to update progress");
      await refreshMine();
    }
  };

  const onDecline = (task) => {
    if (!canDeclineTaskUpdates) return;
    setDeclineTask(task);
    setDeclineReason("");
    setDeclineOpen(true);
  };

  const submitDecline = async () => {
    if (!canDeclineTaskUpdates) return;
    if (!declineTask?.id) return;

    const id = declineTask.id;
    const prev = declineTask;

    if ((prev?.status || "").toLowerCase() === "declined") {
      setDeclineOpen(false);
      setDeclineTask(null);
      setDeclineReason("");
      return;
    }

    setTasks((prevList) =>
      prevList.map((t) =>
        t.id === id
          ? {
              ...t,
              status: "Declined",
              description: t.description ? `${t.description}\n[Declined reason] ${declineReason}` : `[Declined reason] ${declineReason}`,
            }
          : t
      )
    );

    setDeclineOpen(false);

    try {
      await api.post("task_update_status.php", { task_id: id, status: "Declined", reason: declineReason });
    } catch (e) {
      if ((e?.response?.status || 0) === 409) return;

      setTasks((prevList) => prevList.map((t) => (t.id === id ? { ...t, status: prev.status, description: prev.description } : t)));
      setError(e?.response?.data?.message || e?.message || "Failed to cancel task");
    } finally {
      setDeclineTask(null);
      setDeclineReason("");
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return activeTasks.filter((t) => {
      const st = (t.status || "").toLowerCase();
      const selectedStatus = statusFilter.toLowerCase();
      if (selectedStatus !== "all") {
        if (selectedStatus === "incomplete") {
          if (st !== "incomplete") return false;
        } else if (selectedStatus === "declined") {
          if (st !== "declined") return false;
        } else if (selectedStatus === "not started") {
          if (!(st === "pending" || st === "not started" || !st)) return false;
        }
      }

      const meta = extractMetaFromDescription(t.description);
      const priorityValue = String(t.priority || t.task_priority || t.level || meta.priority || "Low").trim().toLowerCase();
      const selectedPriority = priorityFilter.toLowerCase();
      if (selectedPriority !== "all" && priorityValue !== selectedPriority) return false;
      if (!q) return true;
      const title = (t.title || t.name || "").toLowerCase();
      const desc = (t.description || "").toLowerCase();
      const client = (t.client_name || String(t.client_id || "")).toLowerCase();
      return title.includes(q) || desc.includes(q) || client.includes(q) || st.includes(q);
    });
  }, [activeTasks, search, statusFilter, priorityFilter]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-slate-800">My Tasks</h2>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center flex-1 min-w-[220px]">
          <div className="relative flex-1 min-w-[220px]">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="7"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              </svg>
            </span>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by title, client, description or status..."
              className="w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500/20"
            />
          </div>
          {canViewTaskUpdateHistory ? (
            <Link
              to="/accountant/my-tasks/history"
              className="inline-flex shrink-0 items-center justify-center rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-700 transition-colors hover:bg-emerald-100"
            >
              History
            </Link>
          ) : null}
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full sm:w-48 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500/20"
          >
            <option>All</option>
            <option>Declined</option>
            <option>Incomplete</option>
            <option>Not Started</option>
            <option>Overdue</option>
          </select>

          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className="w-full sm:w-40 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500/20"
          >
            <option>All</option>
            <option>Low</option>
            <option>Medium</option>
            <option>High</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {loading ? (
          <div className="col-span-full text-center text-slate-500">Loading...</div>
        ) : filtered.length > 0 ? (
          filtered.map((t, idx) => {
            const meta = extractMetaFromDescription(t.description);
            const priorityValue = t.priority || t.task_priority || t.level || meta.priority;
            const dueRaw = t.due_date || t.deadline || meta.deadline;
            const steps = parseTaskSteps(t.description);
            const doneSet = parseCompletedStepNumbers(t.description);
            const pendingReviewSet = parsePendingStepNumbers(t.description);
            const taskStatus = String(t.status || "").toLowerCase();
            const deadlineState = getTaskDeadlineState(t);
            const isOverdue = taskStatus === "overdue" || deadlineState.isOverdue;
            const isTaskDone = ["done", "completed"].includes(taskStatus);
            const isTaskDeclined = taskStatus === "declined";
            const accountantSteps = getAssignedStepsForRole(steps, "accountant");
            const pendingReviewAccountantSteps = accountantSteps.filter(
              (step) => pendingReviewSet.has(step.number) && !doneSet.has(step.number)
            );
            const pendingAccountantSteps = accountantSteps.filter(
              (step) => !doneSet.has(step.number) && !pendingReviewSet.has(step.number)
            );
            const nextRequiredStepIndex = getNextStepIndexForAccountant(steps, doneSet, pendingReviewSet);
            const nextRequiredStepNumber = nextRequiredStepIndex < steps.length ? nextRequiredStepIndex + 1 : null;
            const hasCurrentAccountantStep = pendingAccountantSteps.some((step) => step.number === nextRequiredStepNumber);
            const taskKey = getTaskKey(t);
            const cardKey = taskKey || String(idx);
            const canUseDeclineAction = canDeclineTaskUpdates && !isTaskDeclined && !isTaskDone;

            return (
              <div
                key={cardKey}
                className={`group rounded-xl border p-4 shadow-sm transition-shadow hover:shadow-md ${
                  isOverdue ? "border-rose-300 bg-rose-50/40" : "border-slate-200 bg-white"
                }`}
              >
                {/* Header */}
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="min-w-0">
                      <h3 className="text-sm font-semibold text-slate-900 truncate">{t.title || t.name || "Untitled"}</h3>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                        <div className="inline-flex items-center gap-1">
                          <svg className="h-3.5 w-3.5 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                            <path d="M16 11c1.657 0 3-1.79 3-4s-1.343-4-3-4-3 1.79-3 4 1.343 4 3 4Zm-8 0c1.657 0 3-1.79 3-4S9.657 3 8 3 5 4.79 5 7s1.343 4 3 4Zm0 2c-2.761 0-5 1.79-5 4v2h10v-2c0-2.21-2.239-4-5-4Zm8 0c-.48 0-.94.056-1.371.159 1.6.744 2.871 2.02 2.871 3.841v2h6v-2c0-2.21-2.239-4-5-4Z" />
                          </svg>
                          <span className="truncate max-w-[160px]">{t.client_name || t.client_id || "-"}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {(() => {
                    const meta = progressStatusMeta(t);
                    return (
                      <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${meta.cls}`}>
                        <span className="inline-block h-1.5 w-1.5 rounded-full bg-current" />
                        {meta.label}
                      </span>
                    );
                  })()}
                </div>

                {/* Meta row: priority + deadline */}
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <div className="rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2">
                    <div className="text-[11px] uppercase tracking-wide text-slate-500">Priority</div>
                    <div className="mt-1">
                      <PriorityBadge value={priorityValue} />
                    </div>
                  </div>

                  <div
                    className={`rounded-lg border px-3 py-2 ${
                      isOverdue ? "border-rose-200 bg-rose-50/80" : "border-slate-200 bg-slate-50/60"
                    }`}
                  >
                    <div className={`text-[11px] uppercase tracking-wide ${isOverdue ? "text-rose-600" : "text-slate-500"}`}>
                      Deadline
                    </div>
                    <div className="mt-1 flex items-center gap-2">
                      <svg
                        className={`h-4 w-4 ${isOverdue ? "text-rose-500" : "text-slate-400"}`}
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                      >
                        <path d="M8 7V3m8 4V3M4 11h16M5 21h14a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2Z" />
                      </svg>
                      <span className={`text-sm font-medium tabular-nums ${isOverdue ? "text-rose-700" : "text-slate-800"}`} title={String(dueRaw || "")}>
                        {formatDate(dueRaw)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Description preview (hide step-by-step text on card; show it only in the modal) */}
                {(() => {
                  const cleaned = cleanDescription(t.description);
                  const preview = stripStepsFromPreview(cleaned);
                  if (!preview) return null;
                  return <p className="mt-3 text-sm text-slate-600 line-clamp-3">{preview}</p>;
                })()}

                {accountantSteps.length > 0 && (
                  <div
                    className={`mt-3 rounded-lg border px-3 py-2 ${
                      pendingAccountantSteps.length > 0
                        ? "border-emerald-200 bg-emerald-50/80"
                        : pendingReviewAccountantSteps.length > 0
                          ? "border-amber-200 bg-amber-50/80"
                        : "border-slate-200 bg-slate-50/80"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div
                          className={`text-[11px] uppercase tracking-wide ${
                            pendingAccountantSteps.length > 0
                              ? "text-emerald-700"
                              : pendingReviewAccountantSteps.length > 0
                                ? "text-amber-700"
                                : "text-slate-500"
                          }`}
                        >
                          Assigned To You
                        </div>
                        <div
                          className={`mt-1 text-sm font-semibold ${
                            pendingAccountantSteps.length > 0
                              ? "text-emerald-950"
                              : pendingReviewAccountantSteps.length > 0
                                ? "text-amber-950"
                                : "text-slate-700"
                          }`}
                        >
                          {pendingAccountantSteps.length > 0
                            ? pendingAccountantSteps.length === 1
                              ? `${formatStepNumberLabel(pendingAccountantSteps)} is assigned to you`
                              : `${pendingAccountantSteps.length} steps are assigned to you`
                            : pendingReviewAccountantSteps.length > 0
                              ? pendingReviewAccountantSteps.length === 1
                                ? `${formatStepNumberLabel(pendingReviewAccountantSteps)} is waiting for review`
                                : `${pendingReviewAccountantSteps.length} steps are waiting for review`
                            : accountantSteps.length === 1
                              ? "Your assigned step is already completed"
                              : "Your assigned steps are already completed"}
                        </div>
                        <div
                          className={`mt-1 text-[11px] ${
                            pendingAccountantSteps.length > 0
                              ? "text-emerald-700/90"
                              : pendingReviewAccountantSteps.length > 0
                                ? "text-amber-700/90"
                                : "text-slate-500"
                          }`}
                        >
                          {pendingAccountantSteps.length > 0
                            ? hasCurrentAccountantStep
                              ? "Ready for your update now."
                              : `${formatStepNumberLabel(pendingAccountantSteps)} will open after earlier steps are done.`
                            : pendingReviewAccountantSteps.length > 0
                              ? "Submitted to admin or secretary for approval."
                            : `${formatStepNumberLabel(accountantSteps)} completed.`}
                        </div>
                      </div>

                      <span
                        className={`inline-flex h-10 min-w-[2.5rem] shrink-0 items-center justify-center rounded-full px-3 text-sm font-bold ${
                          pendingAccountantSteps.length > 0
                            ? "bg-emerald-600 text-white shadow-sm"
                            : pendingReviewAccountantSteps.length > 0
                              ? "bg-amber-500 text-white shadow-sm"
                            : "border border-slate-200 bg-white text-slate-600"
                        }`}
                        title={
                          pendingAccountantSteps.length > 0
                            ? `${pendingAccountantSteps.length} pending accountant-assigned ${
                                pendingAccountantSteps.length === 1 ? "step" : "steps"
                              }`
                            : pendingReviewAccountantSteps.length > 0
                              ? `${pendingReviewAccountantSteps.length} submitted ${
                                  pendingReviewAccountantSteps.length === 1 ? "step" : "steps"
                                } waiting for review`
                            : `${accountantSteps.length} accountant-assigned ${accountantSteps.length === 1 ? "step" : "steps"}`
                        }
                      >
                        {pendingAccountantSteps.length > 1
                          ? pendingAccountantSteps.length
                          : pendingAccountantSteps[0]?.number ||
                            (pendingReviewAccountantSteps.length > 1
                              ? pendingReviewAccountantSteps.length
                              : pendingReviewAccountantSteps[0]?.number) ||
                            accountantSteps[0]?.number}
                      </span>
                    </div>
                  </div>
                )}

                {/* Progress + actions */}
                <div className="mt-4 space-y-2">
                  <div className="flex items-center justify-between text-xs text-slate-600">
                    <span className="font-medium">Progress</span>
                    <span className="tabular-nums font-semibold text-slate-700">{getProgress(t)}%</span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden border border-slate-200">
                    <div
                      className={`h-full rounded-full ${getProgress(t) >= 100 ? "bg-emerald-500" : "bg-indigo-500"}`}
                      style={{ width: `${getProgress(t)}%` }}
                    />
                  </div>

                  <div className="pt-1 flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => openSteps(t)}
                      className="inline-flex items-center gap-2 rounded-md border border-slate-300 px-3 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      <span>View Steps</span>
                      {accountantSteps.length > 0 && (
                        <span
                          className={`inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full px-1.5 text-[10px] font-bold ${
                            pendingAccountantSteps.length > 0
                              ? "bg-emerald-600 text-white"
                              : pendingReviewAccountantSteps.length > 0
                                ? "bg-amber-500 text-white"
                                : "bg-slate-200 text-slate-600"
                          }`}
                        >
                          {pendingAccountantSteps.length > 0
                            ? pendingAccountantSteps.length
                            : pendingReviewAccountantSteps.length > 0
                              ? pendingReviewAccountantSteps.length
                              : accountantSteps.length}
                        </span>
                      )}
                    </button>

                    <div className="flex items-center gap-2">
                      {canDeclineTaskUpdates ? (
                        <button
                          type="button"
                          onClick={() => onDecline(t)}
                          disabled={!canUseDeclineAction}
                          className={`rounded-md px-2 py-1 text-[11px] font-medium border ${
                            isTaskDeclined
                              ? "border-rose-200 bg-rose-50 text-rose-700 cursor-not-allowed"
                              : "border-rose-300 text-rose-700 hover:bg-rose-50"
                          } ${!canUseDeclineAction ? "opacity-60 cursor-not-allowed" : ""}`}
                          title={
                            isTaskDeclined
                              ? "Already Cancelled"
                              : isTaskDone
                                ? "Completed tasks cannot be cancelled"
                                : "Cancel task"
                          }
                        >
                          {isTaskDeclined ? "Cancelled" : "Cancel"}
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        ) : (
          <div className="col-span-full">
            <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-500">
              <div className="mx-auto mb-3 grid h-10 w-10 place-items-center rounded-full bg-slate-100 text-slate-500">
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M12 6v12m6-6H6" />
                </svg>
              </div>
              <div className="text-sm">No tasks assigned to you.</div>
            </div>
          </div>
        )}
      </div>

      {/* Cancel Modal */}
      {declineOpen && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/40" onClick={() => setDeclineOpen(false)} />
          <div className="absolute inset-0 grid place-items-center p-4">
            <div className="w-full max-w-md rounded-xl bg-white shadow-2xl border border-slate-200">
              <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between bg-slate-50/60 rounded-t-xl">
                <h3 className="text-sm font-semibold text-slate-800">Cancel Task</h3>
                <button
                  type="button"
                  onClick={() => setDeclineOpen(false)}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100"
                  aria-label="Close"
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="p-4 space-y-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Reason</label>
                  <textarea
                    rows={4}
                    value={declineReason}
                    onChange={(e) => setDeclineReason(e.target.value)}
                    placeholder="Provide a short explanation..."
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-rose-500/20"
                  />
                </div>
                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setDeclineOpen(false)}
                    className="rounded-md px-3 py-2 text-sm font-medium text-slate-700 border border-slate-300 bg-white hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={submitDecline}
                    disabled={!declineReason.trim()}
                    className="inline-flex items-center gap-2 rounded-md bg-rose-600 px-4 py-2 text-white text-sm font-semibold shadow-sm hover:bg-rose-700 disabled:opacity-60"
                  >
                    Confirm Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Steps Floating Card */}
      {stepsOpen && stepsTask && (
        <div className="fixed inset-0 z-50 pointer-events-none">
          {/* click-catcher for close */}
          <div className="absolute inset-0 bg-black/30 pointer-events-auto" onClick={closeSteps} />

          {/* Floating card container */}
          <div className="absolute inset-0 p-4 sm:p-6 pointer-events-none">
            <div className="mx-auto w-full max-w-lg pointer-events-none">
              <div className="pointer-events-auto flex max-h-[calc(100vh-2rem)] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl sm:max-h-[calc(100vh-3rem)]">
                <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between bg-slate-50/70">
                  <div className="min-w-0">
                    <div className="text-xs text-slate-500">My Tasks • Step-by-step</div>
                    <div className="text-sm font-semibold text-slate-800 truncate">{stepsTask.title || stepsTask.name || "Untitled"}</div>
                  </div>
                  <button
                    type="button"
                    onClick={closeSteps}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100"
                    aria-label="Close"
                  >
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto p-4">
                  {(() => {
                    const liveTask = tasks.find((x) => String(x?.id) === String(stepsTask?.id)) || stepsTask;
                    const steps = parseTaskSteps(liveTask?.description);
                    if (!steps.length) {
                      return <div className="text-sm text-slate-600">No step-by-step tasks found in the description.</div>;
                    }

                    const doneSet = parseCompletedStepNumbers(liveTask?.description);
                    const pendingReviewSet = parsePendingStepNumbers(liveTask?.description);
                    const completionTimestamps = parseStepCompletionTimestamps(liveTask?.description);
                    const stepRemarks = parseStepRemarks(liveTask?.description);
                    const stepRemarkTimestamps = parseStepRemarkTimestamps(liveTask?.description);
                    const nextRequiredIndex = getNextStepIndexForAccountant(steps, doneSet, pendingReviewSet);

                    const taskLocked = ["done", "completed"].includes(String(liveTask?.status || "").toLowerCase());

                    return (
                      <div className="space-y-3">
                        <div className="text-xs text-slate-500">
                          {canCheckTaskSteps
                            ? "Check your current accountant step to submit it for admin or secretary approval. Once submitted, you can keep moving to your next accountant step while it is under review."
                            : "Step completion is disabled for your role. You can review the task details here."}
                        </div>

                        <div className="space-y-2">
                          {steps.map((step, i) => {
                            const stepNumber = i + 1;
                            const done = doneSet.has(stepNumber);
                            const pendingReview = pendingReviewSet.has(stepNumber) && !done;
                            const canCompleteByOrder = i === nextRequiredIndex;
                            const isAssignedToAccountant = roleCanCompleteStep(step.assignee, "accountant");
                            const canComplete =
                              canCheckTaskSteps &&
                              !taskLocked &&
                              !done &&
                              !pendingReview &&
                              canCompleteByOrder &&
                              isAssignedToAccountant;
                            const canEditRemark =
                              canManageStepRemarks && !taskLocked && !done && !pendingReview && isAssignedToAccountant;
                            const stepRemark = canViewTaskUpdateHistory ? String(stepRemarks[stepNumber] || "").trim() : "";
                            const completionLabel = canViewTaskUpdateHistory
                              ? formatStepDateTime(completionTimestamps[stepNumber])
                              : "";
                            const stepRemarkTimeLabel = canViewTaskUpdateHistory
                              ? formatStepDateTime(stepRemarkTimestamps[stepNumber])
                              : "";
                            const remarkEditorOpen = isEditingStepRemark(liveTask?.id, stepNumber);

                            return (
                              <div
                                key={`step-${stepsTask.id}-${i}`}
                                className={`flex items-start gap-3 rounded-xl border px-3 py-2 transition-colors ${
                                  done
                                    ? "border-emerald-200 bg-emerald-50/40"
                                    : pendingReview
                                      ? "border-amber-200 bg-amber-50/70"
                                      : "border-slate-200 bg-white"
                                }`}
                              >
                                <div className="pt-0.5">
                                  <input
                                    type="checkbox"
                                    checked={done}
                                    disabled={taskLocked || done || pendingReview || !canComplete}
                                    onChange={(e) => {
                                      if (e.target.checked) updateStep(liveTask, i, "done");
                                    }}
                                    className={`h-4 w-4 rounded border-slate-300 focus:ring-indigo-500/30 transition-opacity ${
                                      done
                                        ? "text-emerald-600 opacity-60"
                                        : pendingReview
                                          ? "text-amber-500 opacity-100"
                                          : "text-indigo-600 opacity-100"
                                    }`}
                                    aria-label={`Step ${stepNumber}`}
                                    title={
                                      !canCheckTaskSteps
                                        ? "Step completion is disabled for your role"
                                        : done
                                          ? "Step already completed"
                                          : pendingReview
                                            ? "Step submitted and waiting for review"
                                          : canComplete
                                            ? `Submit Step ${stepNumber} for approval`
                                            : !isAssignedToAccountant
                                              ? "Only accountant-assigned steps can be completed"
                                              : "This step will unlock after earlier steps are done"
                                    }
                                  />
                                </div>

                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center justify-between gap-2">
                                    <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold text-slate-500">
                                      <span>{`Step ${stepNumber}`}</span>
                                      <StepAssigneeIdentity assignee={step.assignee} />
                                    </div>
                                    {done ? (
                                      <span className="text-[11px] font-medium text-emerald-700">Completed</span>
                                    ) : pendingReview ? (
                                      <span className="text-[11px] font-medium text-amber-700">Pending Review</span>
                                    ) : canComplete ? (
                                      <span className="text-[11px] font-medium text-indigo-700">Current</span>
                                    ) : !canCheckTaskSteps && isAssignedToAccountant ? (
                                      <span className="text-[11px] font-medium text-slate-400">Read only</span>
                                    ) : !isAssignedToAccountant ? (
                                      <span className="text-[11px] font-medium text-sky-700">{stepAssigneeLabel(step.assignee)} step</span>
                                    ) : (
                                      <span className="text-[11px] font-medium text-slate-400">Locked</span>
                                    )}
                                  </div>

                                  <div
                                    className={`mt-0.5 text-sm leading-5 transition-colors ${
                                      done ? "line-through text-slate-400" : pendingReview ? "text-amber-950" : "text-slate-800"
                                    }`}
                                    style={done ? { textDecorationThickness: "2px" } : undefined}
                                  >
                                    {step.text}
                                  </div>

                                  {done && completionLabel ? (
                                    <div className="mt-2 text-[11px] font-medium text-emerald-700">
                                      Completed on {completionLabel}
                                    </div>
                                  ) : pendingReview ? (
                                    <div className="mt-2 text-[11px] font-medium text-amber-700">
                                      Waiting for admin or secretary approval.
                                    </div>
                                  ) : null}

                                  {stepRemark ? (
                                    <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                                      <div className="text-[10px] font-semibold uppercase tracking-wide text-amber-700">
                                        Emergency remark
                                      </div>
                                      {stepRemarkTimeLabel ? (
                                        <div className="mt-1 text-[11px] font-medium text-amber-700">
                                          Updated on {stepRemarkTimeLabel}
                                        </div>
                                      ) : null}
                                      <div className="mt-1 whitespace-pre-wrap text-xs leading-5 text-amber-900">
                                        {stepRemark}
                                      </div>
                                    </div>
                                  ) : null}

                                  {canManageStepRemarks ? (
                                    <div className="mt-2 flex flex-wrap items-center gap-2">
                                      <button
                                        type="button"
                                        disabled={!canEditRemark || stepRemarkSaving}
                                        onClick={() => beginStepRemarkEdit(liveTask, stepNumber, stepRemark)}
                                        title={
                                          canEditRemark
                                            ? (stepRemark ? "Edit remark" : "Add remark")
                                            : done
                                              ? "Completed steps cannot add remarks"
                                              : pendingReview
                                                ? "Submitted steps cannot add remarks until reviewed"
                                              : "Only accountant-assigned steps can add remarks"
                                        }
                                        className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${
                                          !canEditRemark || stepRemarkSaving
                                            ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400"
                                            : "border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100"
                                        }`}
                                      >
                                        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" />
                                        </svg>
                                        <span>{stepRemark ? "Edit remark" : "Add remark"}</span>
                                      </button>
                                    </div>
                                  ) : null}

                                  {remarkEditorOpen ? (
                                    <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
                                      <div className="text-[11px] font-semibold text-slate-700">Emergency remark</div>
                                      <textarea
                                        value={stepRemarkEditor?.value || ""}
                                        onChange={(e) =>
                                          setStepRemarkEditor((current) =>
                                            current &&
                                            String(current?.taskId || "") === String(liveTask?.id || "") &&
                                            Number(current?.stepNumber) === Number(stepNumber)
                                              ? { ...current, value: e.target.value }
                                              : current
                                          )
                                        }
                                        rows={3}
                                        placeholder="Example: BIR is closed today, continue processing tomorrow."
                                        className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-amber-500/20"
                                      />
                                      <div className="mt-2 flex items-center justify-end gap-2">
                                        <button
                                          type="button"
                                          disabled={stepRemarkSaving}
                                          onClick={cancelStepRemarkEdit}
                                          className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                                        >
                                          Cancel
                                        </button>
                                        <button
                                          type="button"
                                          disabled={stepRemarkSaving}
                                          onClick={() => saveStepRemark(liveTask, stepNumber)}
                                          className={`rounded-md px-3 py-1.5 text-xs font-semibold text-white ${
                                            stepRemarkSaving ? "bg-amber-300" : "bg-amber-600 hover:bg-amber-700"
                                          }`}
                                        >
                                          {stepRemarkSaving
                                            ? "Saving..."
                                            : (stepRemarkEditor?.value || "").trim()
                                              ? "Save remark"
                                              : stepRemark
                                                ? "Remove remark"
                                                : "Save remark"}
                                        </button>
                                      </div>
                                    </div>
                                  ) : null}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}
                </div>

                <div className="px-4 py-3 border-t border-slate-200 bg-white flex items-center justify-end">
                  <button
                    type="button"
                    onClick={closeSteps}
                    className="rounded-md px-3 py-2 text-sm font-medium text-slate-700 border border-slate-300 bg-white hover:bg-slate-50"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
