import React, { useEffect, useMemo, useState } from "react";
import Swal from "sweetalert2";
import { Link } from "react-router-dom";
import { api, fetchAvailableServices } from "../../services/api";
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
  setStepCompletionTimestamp,
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

const getUserRole = (userLike) => String(userLike?.role || "").trim().toLowerCase();
const isSecretaryUser = (userLike) => getUserRole(userLike) === "secretary";
const isAccountantUser = (userLike) => getUserRole(userLike) === "accountant";

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

const setCompletedStepNumbers = (descriptionRaw, completedSet) =>
  setTaggedStepNumbers(descriptionRaw, STEP_DONE_RE, "StepDone", completedSet);

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

const getNextOpenStepIndex = (steps, doneSet, pendingSet) => {
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

// Helpers copied/adapted from secretary task management to keep the same look/behavior
const statusStyle = (statusRaw) => {
  const s = (statusRaw || "Pending").toLowerCase();
  if (s === "completed" || s === "done") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (s === "pending review") return "bg-amber-50 text-amber-700 border-amber-200";
  if (s === "overdue") return "bg-rose-50 text-rose-700 border-rose-200";
  if (s === "incomplete") return "bg-orange-50 text-orange-700 border-orange-200";
  if (s === "declined") return "bg-rose-50 text-rose-700 border-rose-200";
  if (s === "in progress") return "bg-sky-50 text-sky-700 border-sky-200";
  if (s === "cancelled") return "bg-rose-50 text-rose-700 border-rose-200";
  return "bg-amber-50 text-amber-700 border-amber-200"; // pending / default
};

const StatusBadge = ({ value }) => (
  <span
    className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${statusStyle(
      value
    )}`}
  >
    <span className="inline-block h-1.5 w-1.5 rounded-full bg-current"></span>
    {value || "Pending"}
  </span>
);

const priorityMeta = (priorityRaw) => {
  const p = String(priorityRaw || "").trim().toLowerCase();
  if (p === "high" || p === "urgent") {
    return { label: "High", cls: "bg-rose-50 text-rose-700 border-rose-200" };
  }
  if (p === "medium" || p === "normal") {
    return { label: "Medium", cls: "bg-amber-50 text-amber-800 border-amber-200" };
  }
  if (p === "low") {
    return { label: "Low", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" };
  }
  return {
    label: priorityRaw ? String(priorityRaw) : "—",
    cls: "bg-slate-50 text-slate-700 border-slate-200",
  };
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
    // Supports: [Priority] Medium
    //          [Deadline] 25/02/2026
    //          [Progress] 80
    const re = new RegExp(`^\\s*\\[${key}\\]\\s*(.+?)\\s*$`, "im");
    const m = desc.match(re);
    return m?.[1]?.trim() || "";
  };

  return {
    priority: get("Priority"),
    deadline: get("Deadline"),
    progress: get("Progress"),
  };
};

const parseDate = (value) => {
  if (!value) return null;
  const v = String(value).trim();
  if (!v || v === "-") return null;

  // Try native parsing first (works for ISO strings like 2026-02-25)
  let d = new Date(v);
  if (!Number.isNaN(d.getTime())) return d;

  // Support common dashboard input formats
  // dd/mm/yyyy or dd-mm-yyyy
  const m1 = v.match(/^\s*(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})\s*$/);
  if (m1) {
    const day = parseInt(m1[1], 10);
    const month = parseInt(m1[2], 10);
    const year = parseInt(m1[3], 10);
    d = new Date(year, month - 1, day);
    if (!Number.isNaN(d.getTime())) return d;
  }

  // mm/dd/yyyy or mm-dd-yyyy (fallback)
  const m2 = v.match(/^\s*(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})\s*$/);
  if (m2) {
    const month = parseInt(m2[1], 10);
    const day = parseInt(m2[2], 10);
    const year = parseInt(m2[3], 10);
    d = new Date(year, month - 1, day);
    if (!Number.isNaN(d.getTime())) return d;
  }

  return null;
};

const formatDate = (value) => {
  const d = value instanceof Date ? value : parseDate(value);
  if (!d) return "—";
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "2-digit" });
};

const getDeadline = (task) => {
  // Prefer explicit fields, otherwise fall back to bracket meta in description.
  return (
    task?.deadline ||
    task?.due_date ||
    task?.end_date ||
    extractMetaFromDescription(task?.description)?.deadline ||
    ""
  );
};

const getProgress = (task) => {
  return extractProgress(task?.description);
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

const cleanDescription = (desc) => {
  let d = String(desc || "");

  // Remove meta lines/segments that are not part of the actual step-by-step tasks.
  // Supports formats like:
  // [Progress] 80
  // [Priority] Medium
  // [Deadline] 25/02/2026
  d = d.replace(/^\s*\[(Progress|Priority|Deadline|Done|StepDone|StepPending|Archived|SecretaryArchived|CreatedAt)\]\s*.*$/gim, "");
  d = d.replace(/^\s*\[(StepCompletedAt|StepRemark|StepRemarkAt)\s+\d+\]\s*.*$/gim, "");
  d = d.replace(/\s*\[Done\]\s*/gi, " ");

  // Remove step-by-step lines from the CARD description preview.
  // Steps are shown only in the floating "View Steps" card.
  d = d.replace(/^\s*Step\s*\d+(?:\s*\((?:Owner|Accountant|Secretary)\))?\s*[:\-]\s*.*$/gim, "");

  // Remove inline "Step 1: ... Step 2: ..." segments
  d = d.replace(/\bStep\s*\d+(?:\s*\((?:Owner|Accountant|Secretary)\))?\s*[:\-]\s*.*?(?=\bStep\s*\d+(?:\s*\((?:Owner|Accountant|Secretary)\))?\s*[:\-]|$)/gis, "");

  return d.trim();
};

// Extract steps from the RAW description (do not pass through cleanDescription)
// eslint-disable-next-line no-unused-vars
const parseSteps = (descRaw) => {
  const desc = String(descRaw || "").trim();
  if (!desc) return [];

  // 1) "Step N: ..." lines
  const stepLines = desc
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const m = l.match(/^\s*Step\s*(\d+)\s*[:\-]\s*(.+)\s*$/i);
      if (!m) return null;
      return m[2]?.trim() || "";
    })
    .filter(Boolean);

  if (stepLines.length) return stepLines;

  // 2) Numbered/bulleted lines
  const lines = desc
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const extracted = [];
  for (const l of lines) {
    const m = l.match(/^\s*(?:\d+\s*[\.)]|[-*•])\s+(.*)$/);
    if (m && m[1]) extracted.push(m[1].trim());
  }
  if (extracted.length >= 2) return extracted;

  // 3) Inline "Step 1: ... Step 2: ..." in one paragraph
  const inline = [];
  const re = /\bStep\s*\d+\s*[:\-]\s*([^]+?)(?=\bStep\s*\d+\s*[:\-]|$)/gi;
  let match;
  while ((match = re.exec(desc))) {
    const v = String(match[1] || "").trim();
    if (v) inline.push(v);
  }
  if (inline.length) return inline;

  // 4) Fallback: split by semicolons
  if (desc.includes(";")) {
    const parts = desc
      .split(";")
      .map((p) => p.trim())
      .filter(Boolean);
    if (parts.length >= 2) return parts;
  }

  return [];
};

// (parseSteps moved above)

export default function AdminWorkUpdate() {
  const { user } = useAuth();
  const { permissions } = useModulePermissions();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useErrorToast(error);
  const canCheckTaskSteps = hasFeatureActionAccess(user, "work-update", "check-steps", permissions);
  const canViewTaskUpdateHistory = hasFeatureActionAccess(user, "work-update", "history", permissions);
  const canEditTaskUpdates = hasFeatureActionAccess(user, "work-update", "edit", permissions);
  const canMarkTaskDone = hasFeatureActionAccess(user, "work-update", "mark-done", permissions);
  const canDeclineTaskUpdates = hasFeatureActionAccess(user, "work-update", "decline", permissions);
  const canManageStepRemarks = canViewTaskUpdateHistory && canEditTaskUpdates;

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [priorityFilter, setPriorityFilter] = useState("All");

  // Steps floating card state
  const [stepsOpen, setStepsOpen] = useState(false);
  const [stepsTask, setStepsTask] = useState(null);
  const [stepRemarkEditor, setStepRemarkEditor] = useState(null);
  const [stepRemarkSaving, setStepRemarkSaving] = useState(false);

  // Edit modal state
  const [editOpen, setEditOpen] = useState(false);
  const [editTask, setEditTask] = useState(null);
  const [editSaving, setEditSaving] = useState(false);
  const [clients, setClients] = useState([]);
  const [services, setServices] = useState([]);
  const [accountants, setAccountants] = useState([]);
  const [editForm, setEditForm] = useState({ accountant_id: "", partner_id: "", client_id: "", service: "", deadline: "" });

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
      await refresh({ silent: true });
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || "Failed to save remark.");
      await refresh({ silent: true });
    } finally {
      setStepRemarkSaving(false);
    }
  };

  const updateStep = async (task, index, value) => {
    if (!canCheckTaskSteps) return;
    if (value !== "done") return;
    const id = task?.id;
    if (!id) return;

    const steps = parseTaskSteps(task?.description);
    if (!steps.length) return;

    const doneSet = parseCompletedStepNumbers(task?.description);
    const pendingSet = parsePendingStepNumbers(task?.description);
    const nextRequiredIndex = getNextOpenStepIndex(steps, doneSet, pendingSet);

    if (index !== nextRequiredIndex) return;

    const step = steps[index];
    if (!step) return;
    if (!roleCanCompleteStep(step.assignee, "owner")) return;
    if (pendingSet.has(index + 1)) return;

    const confirmation = await Swal.fire({
      title: `Submit Step ${index + 1}?`,
      text: "This will send the step to pending review until admin or secretary approves it.",
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
      await refresh({ silent: true });
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || "Failed to update progress.");
      await refresh({ silent: true });
    }
  };

  const approveStep = async (task, index) => {
    if (!canCheckTaskSteps) return;
    const id = task?.id;
    if (!id) return;

    const steps = parseTaskSteps(task?.description);
    if (!steps.length) return;

    const doneSet = parseCompletedStepNumbers(task?.description);
    const pendingSet = parsePendingStepNumbers(task?.description);
    const step = steps[index];
    if (!step) return;
    if (!pendingSet.has(index + 1) || doneSet.has(index + 1)) return;

    const confirmation = await Swal.fire({
      title: `Approve Step ${index + 1}?`,
      text: "This will mark the submitted step as completed.",
      icon: "question",
      showCancelButton: true,
      confirmButtonText: "Approve",
      cancelButtonText: "Cancel",
      confirmButtonColor: "#16a34a",
      cancelButtonColor: "#64748b",
      reverseButtons: true,
      focusCancel: true,
    });
    if (!confirmation.isConfirmed) return;

    const nextDone = new Set(doneSet);
    nextDone.add(index + 1);
    const nextPending = new Set(pendingSet);
    nextPending.delete(index + 1);

    let updatedDesc = setPendingStepNumbers(String(task?.description || ""), nextPending);
    updatedDesc = setCompletedStepNumbers(updatedDesc, nextDone);
    updatedDesc = setStepCompletionTimestamp(updatedDesc, index + 1, createLocalStepTimestamp());
    const nextProgress = Math.round((nextDone.size / steps.length) * 100);
    updatedDesc = setProgress(updatedDesc, nextProgress);

    try {
      await api.post("task_update_status.php", { task_id: id, description: updatedDesc });
      await refresh({ silent: true });
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || "Failed to approve step.");
      await refresh({ silent: true });
    }
  };

  const refresh = async ({ silent } = { silent: false }) => {
    try {
      if (!silent) setLoading(true);
      setError("");
      const res = await api.get("task_list.php");
      const list = res?.data?.tasks || res?.data || [];
      const nextTasks = Array.isArray(list) ? list : [];
      setTasks(nextTasks);
    } catch (e) {
      setError(e?.response?.data?.message || "Unable to load tasks.");
      setTasks([]);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    let mounted = true;
    (async () => {
      await refresh({ silent: false });
      try {
        const [c, u] = await Promise.all([api.get("client_list.php"), api.get("user_list.php")]);
        if (mounted) {
          if (Array.isArray(c.data?.clients)) setClients(c.data.clients);
          if (Array.isArray(u.data?.users)) {
            const accs = u.data.users.filter((x) => {
              const role = String(x.role || "").toLowerCase();
              return role === "accountant" || role === "secretary";
            });
            setAccountants(accs);
          }
        }
      } catch (_) {
        // non-fatal
      }
    })();

    // Poll so this page updates as soon as secretary creates tasks.
    const intv = setInterval(() => {
      if (mounted) refresh({ silent: true });
    }, 3000);

    return () => {
      mounted = false;
      clearInterval(intv);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let active = true;

    (async () => {
      try {
        const response = await fetchAvailableServices(editForm.client_id);
        if (!active) return;

        const nextServices = Array.isArray(response?.data?.services)
          ? response.data.services
          : [];

        setServices(nextServices);
        setEditForm((current) => {
          const selectedService = String(current.service || "").trim();
          if (!selectedService) {
            return current;
          }

          const selectionStillAllowed = nextServices.some(
            (service) => String(service?.name || "").trim() === selectedService
          );
          if (selectionStillAllowed) {
            return current;
          }

          return {
            ...current,
            service: "",
          };
        });
      } catch (_) {
        if (!active) return;
        setServices([]);
      }
    })();

    return () => {
      active = false;
    };
  }, [editForm.client_id]);

  const partnerAccountants = useMemo(
    () => (Array.isArray(accountants) ? accountants : []).filter((accountant) => isAccountantUser(accountant)),
    [accountants]
  );
  const selectedEditAssignee = useMemo(
    () =>
      (Array.isArray(accountants) ? accountants : []).find(
        (accountant) => String(accountant.id) === String(editForm.accountant_id || "")
      ) || null,
    [accountants, editForm.accountant_id]
  );
  const selectedEditAssigneeIsSecretary = useMemo(
    () => isSecretaryUser(selectedEditAssignee),
    [selectedEditAssignee]
  );
  const selectedEditPartner = useMemo(
    () =>
      partnerAccountants.find((accountant) => String(accountant.id) === String(editForm.partner_id || "")) || null,
    [editForm.partner_id, partnerAccountants]
  );

  useEffect(() => {
    if (!editForm.partner_id) return;
    if (selectedEditAssigneeIsSecretary) return;
    setEditForm((current) => ({ ...current, partner_id: "" }));
  }, [editForm.partner_id, selectedEditAssigneeIsSecretary]);

  useEffect(() => {
    if (!editForm.partner_id) return;
    const stillExists = partnerAccountants.some((accountant) => String(accountant.id) === String(editForm.partner_id));
    if (!stillExists) {
      setEditForm((current) => ({ ...current, partner_id: "" }));
    }
  }, [editForm.partner_id, partnerAccountants]);

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
  const historyTaskCount = useMemo(
    () => (Array.isArray(tasks) ? tasks : []).filter((task) => isHistoryTask(task)).length,
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
  const quickStats = useMemo(() => {
    const data = { total: activeTasks.length, pending: 0, declined: 0, progress: 0 };
    activeTasks.forEach((task) => {
      const status = String(task?.status || "pending").toLowerCase();
      if (status === "declined") data.declined += 1;
      else if (status === "in progress") data.progress += 1;
      else data.pending += 1;
    });
    return data;
  }, [activeTasks]);

  const filteredTasks = useMemo(() => {
    const q = search.trim().toLowerCase();
    return activeTasks.filter((t) => {
      const status = (t.status || "").toLowerCase();
      const selectedStatus = statusFilter.toLowerCase();
      if (selectedStatus !== "all") {
        if (selectedStatus === "declined") {
          if (status !== "declined") return false;
        } else if (selectedStatus === "incomplete") {
          if (status !== "incomplete") return false;
        } else if (selectedStatus === "in progress") {
          if (status !== "in progress") return false;
        } else if (selectedStatus === "not started") {
          if (!(status === "pending" || status === "not started" || !status)) return false;
        }
      }

      const meta = extractMetaFromDescription(t.description);
      const priorityValue = String(t.priority || t.task_priority || t.level || meta.priority || "Low").trim().toLowerCase();
      const selectedPriority = priorityFilter.toLowerCase();
      if (selectedPriority !== "all" && priorityValue !== selectedPriority) return false;
      if (!q) return true;
      const title = (t.title || t.name || "").toLowerCase();
      const desc = (t.description || "").toLowerCase();
      const cli = (t.client_name || String(t.client_id || "")).toLowerCase();
      const service = (t.service || t.status || "").toLowerCase();
      return title.includes(q) || desc.includes(q) || cli.includes(q) || service.includes(q);
    });
  }, [activeTasks, search, statusFilter, priorityFilter]);

  const canEditTask = (task) => {
    const s = (task?.status || "").toLowerCase();
    return s !== "declined" && s !== "completed" && s !== "done";
  };

  const openEdit = (task) => {
    if (!canEditTaskUpdates) return;
    setEditTask(task);
    setEditForm({
      accountant_id: task?.accountant_id ? String(task.accountant_id) : "",
      partner_id: task?.partner_id ? String(task.partner_id) : "",
      client_id: task?.client_id ? String(task.client_id) : "",
      service: String(task?.service || task?.status || ""),
      deadline: String(task?.deadline || task?.due_date || ""),
    });
    setEditOpen(true);
  };

  const saveEdit = async () => {
    if (!canEditTaskUpdates || !editTask?.id) return;
    const nextAssigneeId = String(editForm.accountant_id || "").trim();
    const nextPartnerId = String(editForm.partner_id || "").trim();
    const nextAssignee =
      (Array.isArray(accountants) ? accountants : []).find((accountant) => String(accountant.id) === nextAssigneeId) ||
      null;
    const nextAssigneeIsSecretary = isSecretaryUser(nextAssignee);

    if (nextAssigneeId && !nextAssignee) {
      setError("Selected assignee is no longer available.");
      return;
    }

    if (nextAssigneeIsSecretary) {
      if (!partnerAccountants.length) {
        setError("No accountant partners are available for a secretary-assigned task.");
        return;
      }
      if (!nextPartnerId) {
        setError("Select a partner accountant when assigning this task to a secretary.");
        return;
      }
      if (!partnerAccountants.some((accountant) => String(accountant.id) === nextPartnerId)) {
        setError("Selected partner accountant is no longer available.");
        return;
      }
    }

    setEditSaving(true);
    setError("");

    const payload = {
      task_id: editTask.id,
      accountant_id: nextAssigneeId ? parseInt(nextAssigneeId, 10) : 0,
      partner_id: nextAssigneeIsSecretary && nextPartnerId ? parseInt(nextPartnerId, 10) : 0,
      client_id: editForm.client_id ? parseInt(editForm.client_id, 10) : 0,
      service: editForm.service || "",
      deadline: editForm.deadline || "",
    };

    // Optimistic UI patch
    setTasks((prev) =>
      prev.map((t) => {
        if (t.id !== editTask.id) return t;
        const accountant = accountants.find((a) => String(a.id) === String(payload.accountant_id));
        const partner = partnerAccountants.find((a) => String(a.id) === String(payload.partner_id));
        const client = clients.find((c) => String(c.id) === String(payload.client_id));
        return {
          ...t,
          accountant_id: payload.accountant_id || null,
          accountant_name: accountant?.username || t.accountant_name,
          partner_id: payload.partner_id || null,
          partner_name: partner?.username || "",
          client_id: payload.client_id || null,
          client_name: client ? [client.first_name, client.middle_name, client.last_name].filter(Boolean).join(" ") : t.client_name,
          status: payload.service || t.status,
        };
      })
    );

    try {
      await api.post("task_update_status.php", payload);
      setEditOpen(false);
      setEditTask(null);
      // Ensure server is the source of truth
      await refresh({ silent: true });
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || "Failed to save changes.");
      await refresh({ silent: true });
    } finally {
      setEditSaving(false);
    }
  };

  const markDone = async (task) => {
    if (!canMarkTaskDone) return;
    const id = task?.id;
    if (!id) return;
    if (getProgress(task) < 100) return;

    const prevStatus = task.status;
    setTasks((prev) => (prev || []).map((t) => (String(t.id) === String(id) ? { ...t, status: "Done" } : t)));

    try {
      await api.post("task_update_status.php", { task_id: id, status: "Done" });
      await refresh({ silent: true });
    } catch (e) {
      setTasks((prev) => (prev || []).map((t) => (String(t.id) === String(id) ? { ...t, status: prevStatus } : t)));
      setError(e?.response?.data?.message || e?.message || "Failed to update status.");
    }
  };

  const declineTask = async (task) => {
    if (!canDeclineTaskUpdates) return;

    const id = task?.id;
    if (!id) return;

    const status = String(task?.status || "").toLowerCase();
    if (["declined", "done", "completed"].includes(status)) return;

    const confirmation = await Swal.fire({
      title: "Cancel this task?",
      text: "This task will no longer stay active.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Yes, cancel it",
      cancelButtonText: "Keep task",
      confirmButtonColor: "#dc2626",
      cancelButtonColor: "#64748b",
      reverseButtons: true,
      focusCancel: true,
    });

    if (!confirmation.isConfirmed) return;

    const prevStatus = task.status;
    setTasks((prev) => (prev || []).map((t) => (String(t.id) === String(id) ? { ...t, status: "Declined" } : t)));

    try {
      await api.post("task_update_status.php", { task_id: id, status: "Declined" });
      await refresh({ silent: true });
    } catch (e) {
      setTasks((prev) => (prev || []).map((t) => (String(t.id) === String(id) ? { ...t, status: prevStatus } : t)));
      setError(e?.response?.data?.message || e?.message || "Failed to cancel task.");
    }
  };

  return (
    <div className="space-y-6">
      {/* Summary cards (match Task Management style) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4 text-center">
          <div className="text-[11px] uppercase tracking-wide text-slate-500">Total Active</div>
          <div className="mt-1 text-2xl font-bold text-slate-900">{quickStats.total}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 text-center">
          <div className="text-[11px] uppercase tracking-wide text-slate-500">Pending</div>
          <div className="mt-1 text-2xl font-bold text-amber-700">{quickStats.pending}</div>
        </div>
        <div className="rounded-xl border border-rose-200 bg-white p-4 text-center">
          <div className="text-[11px] uppercase tracking-wide text-rose-600">Declined</div>
          <div className="mt-1 text-2xl font-bold text-rose-700">{quickStats.declined}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 text-center">
          <div className="text-[11px] uppercase tracking-wide text-slate-500">History</div>
          <div className="mt-1 text-2xl font-bold text-emerald-700">{historyTaskCount}</div>
        </div>
      </div>

      {/* Filters (match the screenshot layout) */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center flex-1 min-w-[220px]">
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
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search tasks by title, client, description or status..."
              className="w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500/20"
            />
          </div>
          {canViewTaskUpdateHistory ? (
            <Link
              to="/admin/work-update/history"
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
            <option>Incomplete</option>
            <option>In Progress</option>
            <option>Declined</option>
            <option>Overdue</option>
            <option>Not Started</option>
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

      {/* Task cards grid (match screenshot cards) */}
      {loading ? (
        <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600">Loading tasks…</div>
      ) : error ? (
        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <div className="rounded-md border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error}</div>
        </div>
      ) : filteredTasks.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600">No tasks found.</div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filteredTasks.map((t, idx) => {
              const meta = extractMetaFromDescription(t.description);
              const steps = parseTaskSteps(t.description);
              const doneSet = parseCompletedStepNumbers(t.description);
              const pendingReviewCount = parsePendingStepNumbers(t.description).size;
              const taskStatus = String(t.status || "").toLowerCase();
              const isTaskDone = ["done", "completed"].includes(taskStatus);
              const isTaskDeclined = taskStatus === "declined";
              const deadlineState = getTaskDeadlineState(t);
              const isOverdue = taskStatus === "overdue" || deadlineState.isOverdue;
              const ownerSteps = getAssignedStepsForRole(steps, "owner");
              const pendingOwnerSteps = ownerSteps.filter((step) => !doneSet.has(step.number));
              const nextRequiredStepNumber = (() => {
                for (let i = 0; i < steps.length; i++) {
                  if (!doneSet.has(i + 1)) return i + 1;
                }
                return null;
              })();
              const hasCurrentOwnerStep = pendingOwnerSteps.some((step) => step.number === nextRequiredStepNumber);
              const deadline = getDeadline(t);
              const descriptionPreview = cleanDescription(t.description);
              const priorityValue = t.priority || t.task_priority || t.level || meta.priority;
              const taskKey = getTaskKey(t);
              const cardKey = taskKey || String(idx);
              const canOpenTaskEdit = canEditTaskUpdates && canEditTask(t);
              const canUseDoneAction = canMarkTaskDone && !isTaskDone && getProgress(t) >= 100;
              const canUseDeclineAction = canDeclineTaskUpdates && !isTaskDeclined && !isTaskDone;

              return (
                <div
                  key={cardKey}
                  className={`group rounded-xl border p-4 shadow-sm hover:shadow-md transition-shadow ${
                    isOverdue
                      ? "border-rose-300 bg-rose-50/40"
                      : String(t.status || "").toLowerCase() === "declined"
                        ? "border-rose-300 bg-rose-50/40"
                        : "border-slate-200 bg-white"
                  }`}
                >
                  {/* Header */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="min-w-0 space-y-1">
                        <h3 className="text-sm font-semibold text-slate-900 truncate">{t.title || t.name || "Untitled"}</h3>

                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                          <div className="inline-flex items-center gap-1 min-w-0">
                            <svg
                              className="h-3.5 w-3.5 text-slate-400"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.5"
                            >
                              <path d="M16 11c1.657 0 3-1.79 3-4s-1.343-4-3-4-3 1.79-3 4 1.343 4 3 4Zm-8 0c1.657 0 3-1.79 3-4S9.657 3 8 3 5 4.79 5 7s1.343 4 3 4Zm0 2c-2.761 0-5 1.79-5 4v2h10v-2c0-2.21-2.239-4-5-4Zm8 0c-.48 0-.94.056-1.371.159 1.6.744 2.871 2.02 2.871 3.841v2h6v-2c0-2.21-2.239-4-5-4Z" />
                            </svg>
                            <span className="truncate max-w-[180px]">{t.client_name || t.client_id || "-"}</span>
                          </div>

                          <div className="inline-flex items-center gap-1 min-w-0">
                            <svg
                              className="h-3.5 w-3.5 text-slate-400"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.5"
                            >
                              <path d="M6 9l6 6 6-6" />
                            </svg>
                            <span className="truncate max-w-[180px]">{t.service || t.status || "Service"}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="shrink-0">
                      <StatusBadge value={pendingReviewCount > 0 ? "Pending Review" : t.status} />
                    </div>
                  </div>

                  {/* Meta row: priority + deadline */}
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <div className="rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2">
                      <div className="text-[11px] uppercase tracking-wide text-slate-500">Priority</div>
                      <div className="mt-1">
                        <PriorityBadge value={priorityValue} />
                      </div>
                    </div>

                    <div className={`rounded-lg border px-3 py-2 ${isOverdue ? "border-rose-200 bg-rose-50/80" : "border-slate-200 bg-slate-50/60"}`}>
                      <div className={`text-[11px] uppercase tracking-wide ${isOverdue ? "text-rose-600" : "text-slate-500"}`}>Deadline</div>
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
                        <span className={`text-sm font-medium tabular-nums ${isOverdue ? "text-rose-700" : "text-slate-800"}`} title={String(deadline || "") || ""}>
                          {formatDate(deadline)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Description */}
                  {descriptionPreview ? (
                    <div className="mt-3">
                      <p className="text-sm text-slate-600 line-clamp-3">{descriptionPreview}</p>
                    </div>
                  ) : null}

                  {ownerSteps.length > 0 && (
                    <div
                      className={`mt-3 rounded-lg border px-3 py-2 ${
                        pendingOwnerSteps.length > 0
                          ? "border-indigo-200 bg-indigo-50/80"
                          : "border-slate-200 bg-slate-50/80"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div
                            className={`text-[11px] uppercase tracking-wide ${
                              pendingOwnerSteps.length > 0 ? "text-indigo-700" : "text-slate-500"
                            }`}
                          >
                            Assigned To You
                          </div>
                          <div
                            className={`mt-1 text-sm font-semibold ${
                              pendingOwnerSteps.length > 0 ? "text-indigo-950" : "text-slate-700"
                            }`}
                          >
                            {pendingOwnerSteps.length > 0
                              ? pendingOwnerSteps.length === 1
                                ? `${formatStepNumberLabel(pendingOwnerSteps)} is assigned to you`
                                : `${pendingOwnerSteps.length} steps are assigned to you`
                              : ownerSteps.length === 1
                                ? "Your assigned step is already completed"
                                : "Your assigned steps are already completed"}
                          </div>
                          <div
                            className={`mt-1 text-[11px] ${
                              pendingOwnerSteps.length > 0 ? "text-indigo-700/90" : "text-slate-500"
                            }`}
                          >
                            {pendingOwnerSteps.length > 0
                              ? hasCurrentOwnerStep
                                ? "Ready for your update now."
                                : `${formatStepNumberLabel(pendingOwnerSteps)} will open after earlier steps are done.`
                              : `${formatStepNumberLabel(ownerSteps)} completed.`}
                          </div>
                        </div>

                        <span
                          className={`inline-flex h-10 min-w-[2.5rem] shrink-0 items-center justify-center rounded-full px-3 text-sm font-bold ${
                            pendingOwnerSteps.length > 0
                              ? "bg-indigo-600 text-white shadow-sm"
                              : "border border-slate-200 bg-white text-slate-600"
                          }`}
                          title={
                            pendingOwnerSteps.length > 0
                              ? `${pendingOwnerSteps.length} pending owner-assigned ${
                                  pendingOwnerSteps.length === 1 ? "step" : "steps"
                                }`
                              : `${ownerSteps.length} owner-assigned ${ownerSteps.length === 1 ? "step" : "steps"}`
                          }
                        >
                          {pendingOwnerSteps.length > 1
                            ? pendingOwnerSteps.length
                            : pendingOwnerSteps[0]?.number || ownerSteps[0]?.number}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Steps are shown only in the floating View Steps card (no inline steps preview) */}

                  {/* Progress + actions */}
                  <div className="mt-4 space-y-2">
                    <div className="flex items-center justify-between text-xs text-slate-600">
                      <span className="font-medium">Work progress</span>
                      <span className="tabular-nums font-semibold text-slate-700">{getProgress(t)}%</span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden border border-slate-200">
                      <div
                        className={`h-full rounded-full ${getProgress(t) >= 100 ? "bg-emerald-500" : "bg-indigo-500"}`}
                        style={{ width: `${getProgress(t)}%` }}
                      />
                    </div>

                    <div className="pt-1 flex items-center justify-between">
                      {Array.isArray(steps) && steps.length > 0 ? (
                        <button
                          type="button"
                          onClick={() => openSteps(t)}
                          className="inline-flex items-center gap-2 rounded-md border border-slate-300 px-3 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                          title="View all steps"
                        >
                          <span>View Steps</span>
                          {ownerSteps.length > 0 && (
                            <span
                              className={`inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full px-1.5 text-[10px] font-bold ${
                                pendingOwnerSteps.length > 0 ? "bg-indigo-600 text-white" : "bg-slate-200 text-slate-600"
                              }`}
                            >
                              {pendingOwnerSteps.length > 0 ? pendingOwnerSteps.length : ownerSteps.length}
                            </span>
                          )}
                        </button>
                      ) : (
                        <div />
                      )}

                      <div className="flex items-center gap-2">
                        {canDeclineTaskUpdates ? (
                          <button
                            type="button"
                            onClick={() => declineTask(t)}
                            disabled={!canUseDeclineAction}
                            className={`rounded-md px-2 py-1 text-[11px] font-medium border ${
                              isTaskDeclined
                                ? "border-rose-200 bg-rose-50 text-rose-700 cursor-not-allowed"
                                : "border-rose-300 text-rose-700 hover:bg-rose-50"
                            } ${!canUseDeclineAction ? "opacity-60 cursor-not-allowed" : ""}`}
                            title={
                              isTaskDeclined
                                ? "Already Declined"
                                : isTaskDone
                                  ? "Completed tasks cannot be cancelled"
                                  : "Cancel task"
                            }
                          >
                            Cancel
                          </button>
                        ) : null}

                        {canEditTaskUpdates ? (
                          <button
                            type="button"
                            onClick={() => openEdit(t)}
                            disabled={!canOpenTaskEdit}
                            className={`rounded-md px-2 py-1 text-[11px] font-medium border ${
                              canOpenTaskEdit
                                ? "border-slate-300 text-slate-600 hover:bg-slate-50"
                                : "border-slate-200 bg-slate-50 text-slate-400 cursor-not-allowed"
                            }`}
                            title={canEditTask(t) ? "Edit task" : "Declined/Completed tasks cannot be edited"}
                          >
                            Edit
                          </button>
                        ) : null}

                        {canMarkTaskDone ? (
                          <button
                            type="button"
                            onClick={() => markDone(t)}
                            disabled={!canUseDoneAction}
                            className={`rounded-md px-2 py-1 text-[11px] font-medium border ${
                              isTaskDone
                                ? "border-emerald-200 bg-emerald-50 text-emerald-700 cursor-not-allowed"
                                : "border-slate-300 text-slate-600 hover:bg-slate-50"
                            } ${!canUseDoneAction ? "opacity-60 cursor-not-allowed" : ""}`}
                            title={
                              isTaskDone
                                ? "Already Done"
                                : getProgress(t) < 100
                                  ? "Progress must be 100% to mark Done"
                                  : "Mark as Done"
                            }
                          >
                            Done
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Steps Floating Card (match Accountant My Tasks design) */}
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
                        <div className="text-xs text-slate-500">Work Update • Step-by-step</div>
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
                        const nextRequiredIndex = getNextOpenStepIndex(steps, doneSet, pendingReviewSet);
                        const taskLocked = ["done", "completed"].includes(String(liveTask?.status || "").toLowerCase());

                        return (
                          <div className="space-y-2">
                            <div className="text-xs text-slate-500">
                              {canCheckTaskSteps
                                ? "Submitted steps stay pending here until admin or secretary approves them."
                                : "Step completion is disabled for your role. You can review the task details here."}
                            </div>
                            {steps.map((step, i) => {
                              const stepNumber = i + 1;
                              const done = doneSet.has(stepNumber);
                              const pendingReview = pendingReviewSet.has(stepNumber) && !done;
                              const canCompleteByOrder = i === nextRequiredIndex;
                              const isAssignedToOwner = roleCanCompleteStep(step.assignee, "owner");
                              const canComplete =
                                canCheckTaskSteps &&
                                !taskLocked &&
                                !done &&
                                !pendingReview &&
                                canCompleteByOrder &&
                                isAssignedToOwner;
                              const canApprove = canCheckTaskSteps && !taskLocked && !done && pendingReview;
                              const canEditRemark =
                                canManageStepRemarks && !taskLocked && !done && !pendingReview && isAssignedToOwner;
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
                                  className={`flex items-start gap-3 rounded-xl border px-3 py-2 ${
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
                                      disabled={!canComplete}
                                      onChange={(e) => {
                                        if (e.target.checked) updateStep(liveTask, i, "done");
                                      }}
                                      className={`h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500/30 ${done ? "opacity-60" : "opacity-100"}`}
                                      aria-label={`Step ${stepNumber}`}
                                      title={
                                        !canCheckTaskSteps
                                          ? "Step completion is disabled for your role"
                                          : done
                                            ? "Step already completed"
                                            : pendingReview
                                              ? "Submitted and waiting for approval"
                                            : canComplete
                                              ? `Submit Step ${stepNumber} for approval`
                                              : !isAssignedToOwner
                                                ? "Only owner-assigned steps can be completed"
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
                                    ) : !canCheckTaskSteps && isAssignedToOwner ? (
                                        <span className="text-[11px] font-medium text-slate-400">Read only</span>
                                      ) : !isAssignedToOwner ? (
                                        <span className="text-[11px] font-medium text-emerald-700">{stepAssigneeLabel(step.assignee)} step</span>
                                      ) : (
                                        <span className="text-[11px] font-medium text-slate-400">Locked</span>
                                      )}
                                    </div>
                                    <div
                                      className={`mt-0.5 text-sm leading-5 ${
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
                                        Submitted and waiting for approval.
                                      </div>
                                    ) : null}

                                    {canApprove ? (
                                      <div className="mt-2 flex items-center justify-end">
                                        <button
                                          type="button"
                                          onClick={() => approveStep(liveTask, i)}
                                          className="inline-flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-[11px] font-semibold text-emerald-700 transition hover:bg-emerald-100"
                                        >
                                          Approve
                                        </button>
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
                                                : "Only admin-assigned steps can add remarks"
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

          {/* Edit Modal */}
          {editOpen && (
            <div className="fixed inset-0 z-50">
              <div className="absolute inset-0 bg-black/40" onClick={() => setEditOpen(false)} />
              <div className="absolute inset-0 grid place-items-center p-4">
                <div className="w-full max-w-lg rounded-xl bg-white shadow-2xl border border-slate-200">
                  <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between bg-slate-50/60 rounded-t-xl">
                    <h3 className="text-sm font-semibold text-slate-800">Edit Task</h3>
                    <button
                      type="button"
                      onClick={() => setEditOpen(false)}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100"
                      aria-label="Close"
                    >
                      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>

                  <div className="p-4 space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">Assigned to</label>
                        <select
                          value={editForm.accountant_id}
                          onChange={(e) => setEditForm((f) => ({ ...f, accountant_id: e.target.value }))}
                          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500/20"
                        >
                          <option value="">Unassigned</option>
                          {accountants.map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.username || `User #${a.id}`}{a.role ? ` (${a.role})` : ""}
                            </option>
                          ))}
                        </select>
                        {selectedEditAssigneeIsSecretary ? (
                          <p className="mt-1 text-[11px] text-slate-500">
                            Secretary assignments need a partner accountant.
                          </p>
                        ) : null}
                      </div>

                      {selectedEditAssigneeIsSecretary ? (
                        <div>
                          <label className="block text-xs font-medium text-slate-600 mb-1">Partner accountant</label>
                          <select
                            value={editForm.partner_id}
                            onChange={(e) => setEditForm((f) => ({ ...f, partner_id: e.target.value }))}
                            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500/20"
                          >
                            <option value="">Select partner accountant</option>
                            {partnerAccountants.map((a) => (
                              <option key={a.id} value={a.id}>
                                {a.username || `User #${a.id}`}
                              </option>
                            ))}
                          </select>
                          <p className="mt-1 text-[11px] text-slate-500">
                            All accountants are available here, regardless of specialization.
                          </p>
                          {selectedEditPartner ? (
                            <p className="mt-1 text-[11px] text-slate-600">
                              Partner: {selectedEditPartner.username || `User #${selectedEditPartner.id}`}
                            </p>
                          ) : null}
                        </div>
                      ) : null}

                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">Client</label>
                        <select
                          value={editForm.client_id}
                          onChange={(e) => setEditForm((f) => ({ ...f, client_id: e.target.value }))}
                          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500/20"
                        >
                          <option value="">Select client</option>
                          {clients.map((c) => {
                            const full = [c.first_name, c.middle_name, c.last_name].filter(Boolean).join(" ") || c.email || c.id;
                            return (
                              <option key={c.id} value={c.id}>
                                {full}
                              </option>
                            );
                          })}
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">Service</label>
                        <select
                          value={editForm.service}
                          onChange={(e) => setEditForm((f) => ({ ...f, service: e.target.value }))}
                          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500/20"
                        >
                          <option value="">Select service</option>
                          {services.map((s) => (
                            <option key={s.name} value={s.name}>
                              {s.name}
                            </option>
                          ))}
                        </select>
                        {editForm.client_id &&
                        services.length === 1 &&
                        String(services[0]?.name || "").trim().toLowerCase() ===
                          "processing" ? (
                          <p className="mt-2 text-xs text-amber-700">
                            Only Processing is available until the client
                            business permit is uploaded.
                          </p>
                        ) : null}
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">Deadline</label>
                        <input
                          type="date"
                          value={editForm.deadline}
                          onChange={(e) => setEditForm((f) => ({ ...f, deadline: e.target.value }))}
                          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500/20"
                        />
                        <div className="mt-1 text-[11px] text-slate-500">Stored as a task note (no DB schema change).</div>
                      </div>
                    </div>

                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setEditOpen(false)}
                        className="rounded-md px-3 py-2 text-sm font-medium text-slate-700 border border-slate-300 bg-white hover:bg-slate-50"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={saveEdit}
                        disabled={editSaving}
                        className="inline-flex items-center gap-2 rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-60"
                      >
                        {editSaving ? "Saving…" : "Save Changes"}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}

    </div>
  );
}
