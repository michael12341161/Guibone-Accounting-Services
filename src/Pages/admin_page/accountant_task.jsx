import React, { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Swal from "sweetalert2";
import {
  api,
  fetchSpecializationTypes,
  fetchAvailableServices,
  fetchTaskWorkloadSettings,
  saveTaskWorkloadSettings,
  updateServiceType,
} from "../../services/api";
import { Button } from "../../components/UI/buttons";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/UI/card";
import { Modal } from "../../components/UI/modal";
import { useModulePermissions } from "../../context/ModulePermissionsContext";
import { useAuth } from "../../hooks/useAuth";
import ArchiveTasksCompleted from "./archive_tasks_completed";
import PartnerAccountantPicker from "../../components/tasks/PartnerAccountantPicker";
import { getAutoDueDateForService, getEstimatedServiceDuration } from "../../utils/serviceDurations";
import { hasFeatureActionAccess } from "../../utils/module_permissions";
import { findClientById, getClientId, matchesClientId } from "../../utils/client_identity";
import { joinPersonName } from "../../utils/person_name";
import { remapIndexedStepMeta } from "../../utils/task_step_metadata";
import { getTaskDeadlineState } from "../../utils/task_deadline";
import {
  buildServiceBundleCollection,
  cloneBundleSteps as cloneServiceBundleSteps,
  getServiceBundleKey,
  normalizeServiceNameKey,
} from "../../utils/service_bundles";
import { showErrorToast, showSuccessToast, useErrorToast } from "../../utils/feedback";
import { filterTaskServiceOptions } from "../../utils/task_service_options";
import {
  DEFAULT_TASK_WORKLOAD_SETTINGS,
  MAX_TASK_WORKLOAD_LIMIT,
  MIN_TASK_WORKLOAD_LIMIT,
  getTaskWorkloadLevel,
  hasReachedTaskWorkloadLimit,
  isTaskCountedInWorkload,
  normalizeTaskWorkloadLimit,
} from "../../utils/task_workload";

const ARCHIVED_TAG_RE = /^\s*\[Archived\]\s*(?:1|true|yes)?\s*$/i;
const SECRETARY_ARCHIVED_TAG_RE = /^\s*\[SecretaryArchived\]\s*(?:1|true|yes)?\s*$/i;
const STEP_LINE_RE = /^\s*Step\s+(\d+)(?:\s*\((Owner|Accountant|Secretary)\))?\s*:\s*(.*)$/i;
const STEP_DONE_RE = /^\s*\[StepDone\]\s*([^\r\n]*)\s*$/i;
const STEP_PENDING_RE = /^\s*\[StepPending\]\s*([^\r\n]*)\s*$/i;
const PROGRESS_RE = /^\s*\[Progress\]\s*(\d{1,3})\s*$/i;

const normalizeTaskIds = (ids) =>
  Array.from(
    new Set(
      (Array.isArray(ids) ? ids : [])
        .map((id) => String(id || "").trim())
        .filter(Boolean)
    )
  );

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

const hasBundleDraft = (drafts, bundleKey) =>
  Object.prototype.hasOwnProperty.call(drafts || {}, bundleKey);

const getBundleDraftSteps = (drafts, bundleKey, fallbackSteps) =>
  cloneServiceBundleSteps(hasBundleDraft(drafts, bundleKey) ? drafts[bundleKey] : fallbackSteps);

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

const getTaskCreatorLabel = (task) => {
  const direct = String(task?.created_by_name || task?.created_by_username || "").trim();
  if (direct) return direct;

  const creatorId = Number(task?.created_by || 0);
  return creatorId > 0 ? `User #${creatorId}` : "-";
};

function TaskWorkloadLimitEditor({
  currentLimit,
  minLimit,
  maxLimit,
  loading,
  saving,
  onSave,
}) {
  const [draftValue, setDraftValue] = useState(String(currentLimit));

  useEffect(() => {
    setDraftValue(String(currentLimit));
  }, [currentLimit]);

  const normalizedDraft = String(draftValue || "").trim();
  const isSaveDisabled =
    loading ||
    saving ||
    normalizedDraft === "" ||
    Number.parseInt(normalizedDraft || "0", 10) === Number(currentLimit);

  const handleChange = (event) => {
    setDraftValue(event.target.value.replace(/[^\d]/g, ""));
  };

  const handleKeyDown = (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    if (isSaveDisabled) return;
    onSave?.(draftValue);
  };

  return (
    <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-end">
      <label className="block">
        <span className="block text-[11px] font-medium uppercase tracking-wide text-slate-500">
          Task limit
        </span>
        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          min={minLimit}
          max={maxLimit}
          value={draftValue}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          disabled={loading || saving}
          className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500/20 sm:w-28"
        />
      </label>
      <Button
        type="button"
        onClick={() => onSave?.(draftValue)}
        disabled={isSaveDisabled}
      >
        {saving ? "Saving..." : "Save Limit"}
      </Button>
    </div>
  );
}

function StepAssigneeIdentity({ assignee }) {
  const label = stepAssigneeLabel(assignee);
  const tone = stepAssigneeTone(assignee);

  return (
    <div className="inline-flex min-w-0 items-center gap-2 text-sm text-slate-700">
      <span className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${tone.icon}`}>
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4Zm0 2c-3.33 0-6 2.24-6 5v1h12v-1c0-2.76-2.67-5-6-5Z" />
        </svg>
      </span>
      <span className="truncate font-medium">{label}</span>
    </div>
  );
}

const isStepLine = (line) => STEP_LINE_RE.test(String(line || ""));

const formatTaskStepLine = (stepNumber, text, assignee) => {
  const safeStep = Number.isFinite(Number(stepNumber)) && Number(stepNumber) > 0 ? Number(stepNumber) : 1;
  const safeText = String(text || "").trim();
  return `Step ${safeStep} (${stepAssigneeLabel(assignee)}): ${safeText}`;
};

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

const replaceTaskSteps = (descriptionRaw, steps) => {
  const baseLines = String(descriptionRaw || "")
    .split(/\r?\n/)
    .filter((line) => !isStepLine(line));

  const stepLines = (Array.isArray(steps) ? steps : []).map((step, index) =>
    formatTaskStepLine(index + 1, step?.text || "", step?.assignee || "accountant")
  );

  const nextLines = [...baseLines];
  while (nextLines.length && !String(nextLines[nextLines.length - 1] || "").trim()) {
    nextLines.pop();
  }

  if (stepLines.length) {
    if (nextLines.length && String(nextLines[nextLines.length - 1] || "").trim()) {
      nextLines.push(...stepLines);
    } else {
      while (nextLines.length && !String(nextLines[nextLines.length - 1] || "").trim()) {
        nextLines.pop();
      }
      nextLines.push(...stepLines);
    }
  }

  return nextLines.join("\n").trim();
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

// Status style helpers
const statusStyle = (statusRaw) => {
  const s = (statusRaw || "Pending").toLowerCase();
  if (s === "completed") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (s === "overdue") return "bg-rose-50 text-rose-700 border-rose-200";
  if (s === "incomplete") return "bg-orange-50 text-orange-700 border-orange-200";
  if (s === "declined") return "bg-rose-50 text-rose-700 border-rose-200";
  if (s === "in progress") return "bg-sky-50 text-sky-700 border-sky-200";
  if (s === "cancelled") return "bg-rose-50 text-rose-700 border-rose-200";
  return "bg-amber-50 text-amber-700 border-amber-200"; // pending / default
};

const StatusBadge = ({ value }) => (
  <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${statusStyle(value)}`}>
    <span className="inline-block h-1.5 w-1.5 rounded-full bg-current"></span>
    {value || "Pending"}
  </span>
);

const isTaskCompleted = (task) => {
  const status = String(task?.status || "").trim().toLowerCase();
  return ["done", "completed"].includes(status);
};

const isTaskArchived = (task) => {
  const lines = String(task?.description || "").split(/\r?\n/);
  return lines.some((line) =>
    ARCHIVED_TAG_RE.test(String(line || "")) || SECRETARY_ARCHIVED_TAG_RE.test(String(line || ""))
  );
};

const setTaskArchived = (descriptionRaw, archived) => {
  const nextLines = String(descriptionRaw || "")
    .split(/\r?\n/)
    .filter((line) => !ARCHIVED_TAG_RE.test(String(line || "")));

  while (nextLines.length && !String(nextLines[nextLines.length - 1] || "").trim()) {
    nextLines.pop();
  }

  if (archived) {
    nextLines.push("[Archived] 1");
  }

  return nextLines.join("\n").trim();
};

const upsertTaskMetaLine = (descriptionRaw, tag, value) => {
  const lines = String(descriptionRaw || "").split(/\r?\n/);
  const nextLines = [];
  let replaced = false;
  const tagPattern = new RegExp(`^\\s*\\[${tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\]\\s*`, "i");

  for (const line of lines) {
    if (tagPattern.test(String(line || ""))) {
      if (!replaced) {
        nextLines.push(`[${tag}] ${String(value || "").trim()}`);
        replaced = true;
      }
      continue;
    }
    nextLines.push(line);
  }

  if (!replaced) {
    while (nextLines.length && !String(nextLines[nextLines.length - 1] || "").trim()) {
      nextLines.pop();
    }
    nextLines.push(`[${tag}] ${String(value || "").trim()}`);
  }

  return nextLines.join("\n").trim();
};

const getTaskKey = (task) => String(task?.id ?? task?.task_id ?? "").trim();

const sortTasksNewestFirst = (list) => {
  return (Array.isArray(list) ? list : []).slice().sort((a, b) => {
    const aTime = Date.parse(a?.created_at || a?.createdAt || a?.date_created || a?.created_on || a?.timestamp || "");
    const bTime = Date.parse(b?.created_at || b?.createdAt || b?.date_created || b?.created_on || b?.timestamp || "");

    const aHasTime = !Number.isNaN(aTime) && aTime > 0;
    const bHasTime = !Number.isNaN(bTime) && bTime > 0;
    if (aHasTime && bHasTime) return bTime - aTime;
    if (aHasTime && !bHasTime) return -1;
    if (!aHasTime && bHasTime) return 1;

    const aId = Number(a?.id ?? a?.task_id);
    const bId = Number(b?.id ?? b?.task_id);
    const aHasId = Number.isFinite(aId);
    const bHasId = Number.isFinite(bId);
    if (aHasId && bHasId) return bId - aId;
    if (aHasId && !bHasId) return -1;
    if (!aHasId && bHasId) return 1;
    return 0;
  });
};

const formatDueDate = (raw) => {
  if (!raw) return "-";

  const value = String(raw).trim();
  let dateValue;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    dateValue = new Date(`${value}T00:00:00`);
  } else if (/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}(?::\d{2})?$/.test(value)) {
    dateValue = new Date(value.replace(" ", "T"));
  } else if (/^\d{2}\/\d{2}\/\d{4}$/.test(value)) {
    const [dd, mm, yyyy] = value.split("/");
    dateValue = new Date(`${yyyy}-${mm}-${dd}T00:00:00`);
  } else {
    dateValue = new Date(value);
  }

  if (Number.isNaN(dateValue?.getTime?.())) {
    return String(raw);
  }

  return dateValue.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

const cleanDescription = (desc) => {
  const d = String(desc || "");
  return d
    .split(/\r?\n/)
    .filter((line) => {
      const l = line.trim();
      if (!l) return false;
      if (/^\[Progress\]\s*\d{0,3}\s*$/i.test(l)) return false;
      if (/^\[Priority\]\s*/i.test(l)) return false;
      if (/^\[Deadline\]\s*/i.test(l)) return false;
      if (/^\[CreatedAt\]\s*/i.test(l)) return false;
      if (/^\[Appointment_ID\]\s*/i.test(l)) return false;
      if (/^\[Done\]\s*$/i.test(l)) return false;
      if (/^\[Declined reason\]\s*/i.test(l)) return false;
      if (/^\[(?:SecretaryArchived|Archived)\]\s*/i.test(l)) return false;
      if (/^\[StepDone\]\s*/i.test(l)) return false;
      if (/^\[StepPending\]\s*/i.test(l)) return false;
      if (/^\[(?:StepCompletedAt|StepRemark|StepRemarkAt)\s+\d+\]\s*/i.test(l)) return false;
      if (/^Step\s+\d+(?:\s*\((?:Owner|Accountant|Secretary)\))?\s*:/i.test(l)) return false;
      return true;
    })
    .join(" ")
    .trim();
};

const parsePriority = (desc) => {
  const d = String(desc || "");
  const m = d.match(/^\s*\[Priority\]\s*(Low|Medium|High)\s*$/im);
  return m ? m[1] : "Low";
};

const priorityStyle = (priorityRaw) => {
  const p = (priorityRaw || "Low").toLowerCase();
  if (p === "high") return "bg-rose-500 text-white";
  if (p === "medium") return "bg-amber-500 text-white";
  return "bg-emerald-500 text-white";
};

function PriorityPill({ description }) {
  const p = parsePriority(description);
  return (
    <span className={`inline-flex w-full items-center justify-center rounded-md px-2 py-1 text-xs font-semibold ${priorityStyle(p)}`}>
      {p}
    </span>
  );
}

function getClientDisplayName(client) {
  const fullName = joinPersonName([client?.first_name, client?.middle_name, client?.last_name]);
  const clientId = getClientId(client);
  return fullName || client?.email || (clientId ? `Client #${clientId}` : "Client");
}

function getClientSecondaryLabel(client) {
  const clientId = getClientId(client);
  return String(
    client?.business_trade_name ||
      client?.email ||
      (clientId ? `Client ID: ${clientId}` : "")
  ).trim();
}

function isActiveClient(client) {
  const statusText = String(client?.status || "").trim().toLowerCase();
  const statusId = Number(client?.status_id || 0);
  return statusText === "active" || statusId === 1;
}

function normalizeServiceMatchKey(value) {
  return normalizeServiceNameKey(value);
}

function isProcessingService(value) {
  return normalizeServiceMatchKey(value) === "processing";
}

function getAccountantSpecialization(accountant) {
  const names = Array.isArray(accountant?.employee_specialization_type_names)
    ? accountant.employee_specialization_type_names.map((value) => String(value || "").trim()).filter(Boolean)
    : [];
  if (names.length > 0) {
    return names.join(", ");
  }
  return String(accountant?.employee_specialization_type_name || "").trim();
}

function getUserRoleLabel(user) {
  return String(user?.role || "").trim();
}

function getReadableUserRole(user) {
  const role = getUserRoleLabel(user).toLowerCase();
  if (role === "accountant") return "Accountant";
  if (role === "secretary") return "Secretary";
  return getUserRoleLabel(user) || "User";
}

function isSecretaryUser(user) {
  return getUserRoleLabel(user).toLowerCase() === "secretary";
}

function isAccountantUser(user) {
  return getUserRoleLabel(user).toLowerCase() === "accountant";
}

function getUserSpecializationIds(user) {
  const values = Array.isArray(user?.employee_specialization_type_ids)
    ? user.employee_specialization_type_ids
    : [user?.employee_specialization_type_id];

  return values
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value) && value > 0);
}

function getUserSpecializationNames(user) {
  const values = Array.isArray(user?.employee_specialization_type_names)
    ? user.employee_specialization_type_names
    : [user?.employee_specialization_type_name];

  return values
    .map((value) => normalizeServiceMatchKey(value))
    .filter(Boolean);
}

function userMatchesEnabledService(user, serviceName, activeSpecializationById, activeSpecializationByName) {
  const serviceKey = normalizeServiceMatchKey(serviceName);
  const enabledSpecializations = [];

  getUserSpecializationIds(user).forEach((specializationId) => {
    const match = activeSpecializationById.get(specializationId);
    if (match) {
      enabledSpecializations.push(match);
    }
  });

  getUserSpecializationNames(user).forEach((specializationName) => {
    const match = activeSpecializationByName.get(specializationName);
    if (match) {
      enabledSpecializations.push(match);
    }
  });

  if (enabledSpecializations.length === 0) {
    return false;
  }

  if (!serviceKey) {
    return true;
  }

  return enabledSpecializations.some((specialization) => {
    const serviceKeys = Array.isArray(specialization?.serviceKeys) ? specialization.serviceKeys : [];
    if (serviceKeys.length > 0) {
      return serviceKeys.includes(serviceKey);
    }

    return normalizeServiceMatchKey(specialization?.name) === serviceKey;
  });
}

function ClientPicker({ clients, value, onChange }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const searchInputRef = useRef(null);

  const selectedClient = useMemo(() => {
    return findClientById(clients, value);
  }, [clients, value]);

  const filteredClients = useMemo(() => {
    const list = Array.isArray(clients) ? clients : [];
    const query = search.trim().toLowerCase();
    if (!query) return list;

    return list.filter((client) => {
      const displayName = getClientDisplayName(client);
      const secondary = getClientSecondaryLabel(client);
      const phone = String(client?.phone || "");
      return `${displayName} ${secondary} ${phone} ${getClientId(client)}`.toLowerCase().includes(query);
    });
  }, [clients, search]);

  useEffect(() => {
    if (!open) {
      setSearch("");
      return undefined;
    }

    const focusTimer = window.setTimeout(() => searchInputRef.current?.focus(), 220);
    return () => {
      window.clearTimeout(focusTimer);
    };
  }, [open]);

  const buttonLabel = selectedClient ? getClientDisplayName(selectedClient) : "Select Client (F2F)";
  const buttonMeta = selectedClient
    ? getClientSecondaryLabel(selectedClient)
    : "For face-to-face tasks. Use Client Appointments for approved requests.";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={`flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left text-sm outline-none transition focus:ring-2 focus:ring-indigo-500/20 ${
          value ? "border-slate-300 bg-white text-slate-900" : "border-slate-300 bg-white text-slate-500"
        }`}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <span className="flex min-w-0 items-center gap-2">
          <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500">
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M15 19a7 7 0 1 0-6 0" />
              <path d="M12 12a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
              <path d="M17.5 21a5.5 5.5 0 0 0-11 0" />
            </svg>
          </span>

          <span className="min-w-0">
            <span className={`block truncate font-medium ${value ? "text-slate-800" : "text-slate-500"}`}>{buttonLabel}</span>
            <span className="block truncate text-xs text-slate-500">{buttonMeta}</span>
          </span>
        </span>

        <svg
          className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" />
        </svg>
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Select client"
        description="Client"
        size="sm"
      >
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
              Available clients
            </div>
            <div className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-500">
              {filteredClients.length}
            </div>
          </div>

          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-4.35-4.35m1.85-5.15a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z" />
              </svg>
            </span>
            <input
              ref={searchInputRef}
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search client..."
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-10 py-2.5 text-sm text-slate-700 outline-none focus:border-indigo-300 focus:bg-white focus:ring-2 focus:ring-indigo-500/20"
            />
          </div>

          <div className="max-h-72 space-y-1 overflow-y-auto pr-1">
            {filteredClients.length > 0 ? (
              filteredClients.map((client) => {
                const clientId = getClientId(client);
                const isSelected = matchesClientId(client, value);
                const name = getClientDisplayName(client);
                const secondary = getClientSecondaryLabel(client);

                return (
                  <button
                    key={clientId || name}
                    type="button"
                    onClick={() => {
                      onChange?.(clientId);
                      setOpen(false);
                    }}
                    className={`flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-left transition ${
                      isSelected
                        ? "border-indigo-200 bg-indigo-50 text-indigo-900"
                        : "border-transparent bg-white text-slate-700 hover:border-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{name}</div>
                      <div className="truncate text-xs text-slate-500">{secondary}</div>
                    </div>

                    {isSelected && (
                      <span className="inline-flex h-6 shrink-0 items-center rounded-full bg-indigo-600 px-2 text-[11px] font-semibold text-white">
                        Selected
                      </span>
                    )}
                  </button>
                );
              })
            ) : (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-6 text-center text-sm text-slate-500">
                No clients match your search.
              </div>
            )}
          </div>
        </div>
      </Modal>
    </>
  );
}

function AccountantPicker({ accountants, value, onChange, serviceName }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const searchInputRef = useRef(null);

  const selectedAccountant = useMemo(() => {
    return (Array.isArray(accountants) ? accountants : []).find((accountant) => String(accountant.id) === String(value || ""));
  }, [accountants, value]);

  const filteredAccountants = useMemo(() => {
    const list = Array.isArray(accountants) ? accountants : [];
    const query = search.trim().toLowerCase();
    if (!query) return list;

    return list.filter((accountant) => {
      const label = accountant?.username || `Accountant #${accountant?.id || ""}`;
      const email = accountant?.email || "";
      const specialization = getAccountantSpecialization(accountant);
      const role = getUserRoleLabel(accountant);
      return `${label} ${email} ${specialization} ${role}`.toLowerCase().includes(query);
    });
  }, [accountants, search]);

  useEffect(() => {
    if (!open) {
      setSearch("");
      return undefined;
    }

    const focusTimer = window.setTimeout(() => searchInputRef.current?.focus(), 220);

    return () => {
      window.clearTimeout(focusTimer);
    };
  }, [open]);

  const buttonLabel = selectedAccountant?.username || (value ? `User #${value}` : "Select Accountant or Secretary");
  const helperText = selectedAccountant
    ? getReadableUserRole(selectedAccountant)
    : (serviceName
      ? `Showing matching accountants and all secretaries for ${serviceName}`
      : "Choose an accountant or secretary from the list");

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={`flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left text-sm outline-none transition focus:ring-2 focus:ring-indigo-500/20 ${
          value ? "border-slate-300 bg-white text-slate-900" : "border-slate-300 bg-white text-slate-500"
        }`}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <span className="flex min-w-0 items-center gap-2">
          <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500">
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M16 11c1.657 0 3-1.79 3-4s-1.343-4-3-4-3 1.79-3 4 1.343 4 3 4Zm-8 0c1.657 0 3-1.79 3-4S9.657 3 8 3 5 4.79 5 7s1.343 4 3 4Zm0 2c-2.761 0-5 1.79-5 4v2h10v-2c0-2.21-2.239-4-5-4Zm8 0c-.48 0-.94.056-1.371.159 1.6.744 2.871 2.02 2.871 3.841v2h6v-2c0-2.21-2.239-4-5-4Z" />
            </svg>
          </span>

          <span className="min-w-0">
            <span className={`block truncate font-medium ${value ? "text-slate-800" : "text-slate-500"}`}>{buttonLabel}</span>
            <span className="block truncate text-xs text-slate-500">{helperText}</span>
          </span>
        </span>

        <svg
          className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" />
        </svg>
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Select assignee"
        description="Assigned To"
        size="sm"
      >
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
              {serviceName ? `${serviceName} assignees` : "Available assignees"}
            </div>
            <div className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-500">
              {filteredAccountants.length}
            </div>
          </div>

          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-4.35-4.35m1.85-5.15a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z" />
              </svg>
            </span>
            <input
              ref={searchInputRef}
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search assignee..."
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-10 py-2.5 text-sm text-slate-700 outline-none focus:border-indigo-300 focus:bg-white focus:ring-2 focus:ring-indigo-500/20"
            />
          </div>

          <div className="max-h-72 space-y-1 overflow-y-auto pr-1">
            {filteredAccountants.length > 0 ? (
              filteredAccountants.map((accountant) => {
                const isSelected = String(accountant.id) === String(value || "");
                const name = accountant.username || `User #${accountant.id}`;
                const specialization = getAccountantSpecialization(accountant);
                const isSecretary = isSecretaryUser(accountant);
                const badgeLabel = specialization;
                const badgeClass = isSecretary
                  ? "bg-sky-100 text-sky-700"
                  : "bg-slate-100 text-slate-600";

                return (
                  <button
                    key={accountant.id}
                    type="button"
                    onClick={() => {
                      onChange?.(String(accountant.id));
                      setOpen(false);
                    }}
                    className={`flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-left transition ${
                      isSelected
                        ? "border-indigo-200 bg-indigo-50 text-indigo-900"
                        : "border-transparent bg-white text-slate-700 hover:border-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <div className="truncate text-sm font-medium">{name}</div>
                        {badgeLabel && (
                          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${badgeClass}`}>
                            {badgeLabel}
                          </span>
                        )}
                      </div>
                      <div className="truncate text-xs text-slate-500">{getReadableUserRole(accountant)}</div>
                    </div>

                    {isSelected && (
                      <span className="inline-flex h-6 shrink-0 items-center rounded-full bg-indigo-600 px-2 text-[11px] font-semibold text-white">
                        Selected
                      </span>
                    )}
                  </button>
                );
              })
            ) : (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-6 text-center text-sm text-slate-500">
                {serviceName
                  ? `No matching accountants or secretaries match your search for ${serviceName}.`
                  : "No assignees match your search."}
              </div>
            )}
          </div>
        </div>
      </Modal>
    </>
  );
}

export default function AdminAccountantTaskManagement() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { permissions } = useModulePermissions();
  const [tasks, setTasks] = useState([]);
  // Per (accountant_id + client_id + service_name) step counter for inline "Next Step" tasks
  const [stepCounters, setStepCounters] = useState({});
  const [clients, setClients] = useState([]);
  const [services, setServices] = useState([]);
  const [accountants, setAccountants] = useState([]);
  const [specializations, setSpecializations] = useState([]);

  // To-Do filters
  const [todoSearch, setTodoSearch] = useState("");
  const [todoPriority, setTodoPriority] = useState("All"); // All | Low | Medium | High

  // Step edit floating card
  const [stepEditOpen, setStepEditOpen] = useState(false);
  const [stepEditCtx, setStepEditCtx] = useState(null); // { taskId, taskStatus, isCompleted, stepIndex, currentText }
  const [stepEditValue, setStepEditValue] = useState("");
  const [stepEditAssignee, setStepEditAssignee] = useState("accountant");
  const [taskAssigneeEditOpen, setTaskAssigneeEditOpen] = useState(false);
  const [taskAssigneeEditCtx, setTaskAssigneeEditCtx] = useState(null);
  const [taskAssigneeEditValue, setTaskAssigneeEditValue] = useState("");
  const [taskPartnerEditValue, setTaskPartnerEditValue] = useState("");
  const [taskPriorityEditValue, setTaskPriorityEditValue] = useState("Low");
  const [taskEditError, setTaskEditError] = useState("");
  const [taskAssigneeSaving, setTaskAssigneeSaving] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [archiveLoading, setArchiveLoading] = useState(false);
  const [staffWorkloadOpen, setStaffWorkloadOpen] = useState(false);
  const [staffWorkloadSearch, setStaffWorkloadSearch] = useState("");
  const [taskWorkloadSettings, setTaskWorkloadSettings] = useState(DEFAULT_TASK_WORKLOAD_SETTINGS);
  const [taskWorkloadLoading, setTaskWorkloadLoading] = useState(false);
  const [taskWorkloadSaving, setTaskWorkloadSaving] = useState(false);
  const [bundlePickerOpen, setBundlePickerOpen] = useState(false);
  const [selectedBundleKey, setSelectedBundleKey] = useState("");
  const [editingBundleKey, setEditingBundleKey] = useState("");
  const [bundleDraftSteps, setBundleDraftSteps] = useState({});
  const [savingBundleKey, setSavingBundleKey] = useState("");
  const [selectedAppointmentId, setSelectedAppointmentId] = useState("");
  const [didLoadClients, setDidLoadClients] = useState(false);

  // Create form
  // title = selected service/task type (Tax Filing, Auditing, Book Keeping, Tax Computation)
  // priority = Low/Medium/High stored in Description to avoid backend changes
  const [form, setForm] = useState({
    client_id: "",
    title: "",
    // Single-select service (validated by backend via `status`)
    service_name: "",
    accountant_id: "",
    partner_id: "",
    priority: "Low",
    period_date: "",
    start_date: "",
    due_date: "",
  });

  // UI state
  const [creatingTask, setCreatingTask] = useState(false);
  const [stepLoading, setStepLoading] = useState(false);
  const [error, setError] = useState("");
  useErrorToast(error);
  const [success, setSuccess] = useState("");
  const taskAssigneeResetTimerRef = useRef(null);
  const workloadLimit = normalizeTaskWorkloadLimit(taskWorkloadSettings?.limit, DEFAULT_TASK_WORKLOAD_SETTINGS.limit);
  const activeClients = useMemo(() => {
    return (Array.isArray(clients) ? clients : []).filter(isActiveClient);
  }, [clients]);
  const activeSpecializationById = useMemo(() => {
    const map = new Map();
    (Array.isArray(specializations) ? specializations : []).forEach((specialization) => {
      if (specialization?.disabled) return;
      const specializationId = Number(specialization?.id);
      if (!Number.isFinite(specializationId) || specializationId <= 0) return;
      map.set(specializationId, {
        name: String(specialization?.name || "").trim(),
        serviceKeys: (Array.isArray(specialization?.service_names) ? specialization.service_names : [])
          .map((value) => normalizeServiceMatchKey(value))
          .filter(Boolean),
      });
    });
    return map;
  }, [specializations]);
  const activeSpecializationByName = useMemo(() => {
    const map = new Map();
    activeSpecializationById.forEach((value) => {
      const nameKey = normalizeServiceMatchKey(value?.name);
      if (nameKey) {
        map.set(nameKey, value);
      }
    });
    return map;
  }, [activeSpecializationById]);
  const matchingAccountants = useMemo(() => {
    return (Array.isArray(accountants) ? accountants : []).filter((accountant) =>
      userMatchesEnabledService(
        accountant,
        form.service_name || form.title,
        activeSpecializationById,
        activeSpecializationByName
      )
    );
  }, [accountants, activeSpecializationById, activeSpecializationByName, form.service_name, form.title]);
  const selectedCreateTaskServiceName = String(form.service_name || form.title || "").trim();
  const partnerUsesAllSpecializations = isProcessingService(selectedCreateTaskServiceName);
  const partnerAccountants = useMemo(() => {
    return (Array.isArray(accountants) ? accountants : []).filter((accountant) =>
      isAccountantUser(accountant) &&
      (partnerUsesAllSpecializations ||
        userMatchesEnabledService(
          accountant,
          selectedCreateTaskServiceName,
          activeSpecializationById,
          activeSpecializationByName
        ))
    );
  }, [
    accountants,
    activeSpecializationById,
    activeSpecializationByName,
    partnerUsesAllSpecializations,
    selectedCreateTaskServiceName,
  ]);
  const selectedAssignee = useMemo(
    () => (Array.isArray(accountants) ? accountants : []).find((accountant) => String(accountant.id) === String(form.accountant_id || "")) || null,
    [accountants, form.accountant_id]
  );
  const selectedAssigneeIsSecretary = Boolean(selectedAssignee && isSecretaryUser(selectedAssignee));
  const selectedPartnerAccountant = useMemo(
    () => partnerAccountants.find((accountant) => String(accountant.id) === String(form.partner_id || "")) || null,
    [form.partner_id, partnerAccountants]
  );
  const canCreateTask = hasFeatureActionAccess(user, "tasks", "create-task", permissions);
  const canOpenClientAppointments = hasFeatureActionAccess(user, "tasks", "client-appointments", permissions);
  const canViewTaskLimit = hasFeatureActionAccess(user, "tasks", "task-limit", permissions);
  const canEditTaskTodo = hasFeatureActionAccess(user, "tasks", "edit-step", permissions);
  const canEditTaskAssignee = canEditTaskTodo;
  const canRemoveStep = hasFeatureActionAccess(user, "tasks", "remove-step", permissions);
  const createTaskDescription = canOpenClientAppointments
    ? "Use Select Client (F2F) for walk-in tasks, or open Client Appointments to load an approved appointment here before assigning an accountant or secretary."
    : "Use Select Client (F2F) for walk-in tasks, then assign an accountant or secretary here.";
  const canManageTaskWorkloadLimit =
    canViewTaskLimit &&
    (Number(user?.role_id || user?.roleId || 0) === 1 ||
      String(user?.role || user?.role_name || "").trim().toLowerCase() === "admin");
  const resolveBundleKeyForService = (serviceName, serviceId = "") => {
    const normalizedServiceId = String(serviceId || "").trim();
    if (normalizedServiceId) {
      const matchedById = (Array.isArray(services) ? services : []).find(
        (service) => String(service?.id ?? service?.Services_type_Id ?? "").trim() === normalizedServiceId
      );
      if (matchedById) {
        return String(matchedById?.id ?? matchedById?.Services_type_Id ?? "").trim();
      }
    }

    const targetKey = normalizeServiceMatchKey(serviceName);
    if (!targetKey) return "";

    const matchedService = (Array.isArray(services) ? services : []).find(
      (service) => normalizeServiceMatchKey(service?.name || "") === targetKey
    );

    return String(matchedService?.id || getServiceBundleKey(serviceName) || "").trim();
  };
  const selectedServiceDuration = useMemo(
    () => getEstimatedServiceDuration(form.service_name || form.title),
    [form.service_name, form.title]
  );
  const suggestedBundleKey = useMemo(
    () => resolveBundleKeyForService(form.service_name || form.title),
    [form.service_name, form.title, services]
  );
  const bundleTemplates = useMemo(() => {
    return buildServiceBundleCollection(services).map((bundle) => {
      const isAvailable = !form.client_id || Boolean(bundle.serviceName);
      const draftSteps = bundleDraftSteps[bundle.key];

      return {
        ...bundle,
        isAvailable,
        steps: cloneServiceBundleSteps(draftSteps || bundle.steps),
      };
    });
  }, [bundleDraftSteps, form.client_id, services]);
  const selectedBundle = useMemo(
    () => bundleTemplates.find((bundle) => bundle.key === selectedBundleKey) || null,
    [bundleTemplates, selectedBundleKey]
  );
  const hasSelectedBundleDraft = useMemo(
    () => Boolean(selectedBundle && bundleDraftSteps[selectedBundle.key]),
    [bundleDraftSteps, selectedBundle]
  );
  const sortedTodoTasks = useMemo(() => sortTasksNewestFirst(tasks), [tasks]);
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
  const activeTodoTasks = useMemo(
    () =>
      sortedTodoTasks.filter((task) => {
        const taskKey = getTaskKey(task);
        return Boolean(taskKey) && !archivedTaskIdSet.has(taskKey) && !isTaskCompleted(task);
      }),
    [sortedTodoTasks, archivedTaskIdSet]
  );
  const activeTaskIds = useMemo(
    () => normalizeTaskIds(activeTodoTasks.map((task) => getTaskKey(task))),
    [activeTodoTasks]
  );
  const activeTaskIdSet = useMemo(() => new Set(activeTaskIds), [activeTaskIds]);
  useEffect(() => {
    let stop = false;
    (async () => {
      try {
        const [c, t, u, specializationRes] = await Promise.all([
          api.get("client_list.php"),
          api.get("task_list.php"),
          api.get("user_list.php"),
          fetchSpecializationTypes({
            params: {
              include_disabled: 1,
            },
          }),
        ]);
        if (!stop) {
          setClients(Array.isArray(c.data?.clients) ? c.data.clients : []);
          setDidLoadClients(true);
          if (Array.isArray(t.data?.tasks)) setTasks(t.data.tasks);
          setSpecializations(
            Array.isArray(specializationRes?.data?.specialization_types) ? specializationRes.data.specialization_types : []
          );
          if (Array.isArray(u.data?.users)) {
            const accs = u.data.users.filter((x) => {
              const role = String(x.role || "").toLowerCase();
              return role === "accountant" || role === "secretary";
            });
            setAccountants(accs);
          }
        }
      } catch (_) {
        if (!stop) {
          setDidLoadClients(true);
        }
      }
    })();

    const intv = setInterval(async () => {
      try {
        const t = await api.get("task_list.php");
        if (!stop && Array.isArray(t.data?.tasks)) setTasks(t.data.tasks);
      } catch (_) { }
    }, 10000);

    return () => {
      stop = true;
      clearInterval(intv);
    };
  }, []);

  useEffect(() => {
    let active = true;

    (async () => {
      try {
        const response = await fetchAvailableServices(form.client_id);
        if (!active) return;

        const nextServices = filterTaskServiceOptions(response?.data?.services);

        setServices(nextServices);
        setForm((current) => {
          const selectedService = String(
            current.service_name || current.title || ""
          ).trim();
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
            title: "",
            service_name: "",
            due_date: "",
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
  }, [form.client_id]);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();

    const loadTaskWorkloadLimit = async () => {
      setTaskWorkloadLoading(true);

      try {
        const response = await fetchTaskWorkloadSettings({ signal: controller.signal });
        if (!active) return;

        const nextSettings = response?.data?.settings || DEFAULT_TASK_WORKLOAD_SETTINGS;
        setTaskWorkloadSettings(nextSettings);
      } catch (_) {
        if (!active) return;
        setTaskWorkloadSettings(DEFAULT_TASK_WORKLOAD_SETTINGS);
      } finally {
        if (active) {
          setTaskWorkloadLoading(false);
        }
      }
    };

    void loadTaskWorkloadLimit();

    return () => {
      active = false;
      controller.abort();
    };
  }, []);

  useEffect(() => {
    const hasSelectedService = String(form.service_name || form.title || "").trim();
    if (hasSelectedService) return;

    if (selectedAppointmentId) {
      setSelectedAppointmentId("");
    }
    if (selectedBundleKey) {
      setSelectedBundleKey("");
      setEditingBundleKey("");
    }
  }, [form.service_name, form.title, selectedAppointmentId, selectedBundleKey]);

  useEffect(() => {
    if (!selectedAppointmentId || selectedBundleKey || !suggestedBundleKey) return;
    setSelectedBundleKey(suggestedBundleKey);
  }, [selectedAppointmentId, selectedBundleKey, suggestedBundleKey]);

  useEffect(() => {
    const hasSelectedService = String(form.service_name || form.title || "").trim();
    if (!hasSelectedService) return;
    if (!suggestedBundleKey) return;
    if (selectedBundle) return;
    setSelectedBundleKey(suggestedBundleKey);
  }, [form.service_name, form.title, selectedBundle, selectedBundleKey, suggestedBundleKey]);

  useEffect(() => {
    const appointment = location.state?.prefillTaskFromAppointment;
    if (!appointment) return undefined;

    const nextClientId = String(appointment?.clientId || "").trim();
    const nextServiceName = String(appointment?.serviceName || "").trim();
    const nextServiceId = String(appointment?.serviceId || "").trim();
    const nextDueDate = String(appointment?.date || "").trim();

    if (!nextClientId || !nextServiceName) {
      setError("The selected appointment is missing a client or service.");
      navigate(location.pathname, { replace: true, state: {} });
      return undefined;
    }

    const autoBundleKey = resolveBundleKeyForService(nextServiceName, nextServiceId);
    const fallbackDueDate = getAutoDueDateForService(nextServiceName) || "";

    setForm((current) => ({
      ...current,
      client_id: nextClientId,
      title: nextServiceName,
      service_name: nextServiceName,
      accountant_id: "",
      partner_id: "",
      due_date: fallbackDueDate || nextDueDate,
    }));
    setSelectedAppointmentId(String(appointment?.id || ""));
    setSelectedBundleKey(autoBundleKey);
    setBundlePickerOpen(false);
    setEditingBundleKey("");
    setError("");
    setSuccess(
      `Appointment loaded for ${appointment?.clientName || "the selected client"}. Assign an accountant or secretary, then click Create Task.`
    );
    navigate(location.pathname, { replace: true, state: {} });

    const timerId = window.setTimeout(() => setSuccess(""), 2200);
    return () => {
      window.clearTimeout(timerId);
    };
  }, [location.pathname, location.state, navigate]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));
  };

  const handleClientSelection = (clientId, options = {}) => {
    if (options.clearAppointment !== false) {
      setSelectedAppointmentId("");
    }
    setForm((current) => ({ ...current, client_id: clientId }));
  };

  const handleServiceSelection = (value, options = {}) => {
    const autoDueDate = getAutoDueDateForService(value);
    const autoBundleKey = resolveBundleKeyForService(value);
    if (options.clearAppointment !== false) {
      setSelectedAppointmentId("");
    }
    setForm((current) => ({
      ...current,
      title: value,
      service_name: value,
      due_date: autoDueDate || "",
    }));
    setSelectedBundleKey(autoBundleKey);
    setEditingBundleKey("");
  };

  const applyTaskBundle = (bundleKey) => {
    const bundle = bundleTemplates.find((item) => item.key === bundleKey);
    if (!bundle) return;
    if (!bundle.isAvailable) {
      setError("The selected bundle is not available for the current client.");
      return;
    }

    handleServiceSelection(bundle.serviceName);
    setSelectedBundleKey(bundle.key);
    setBundlePickerOpen(false);
    setError("");
    setSuccess(`${bundle.label} applied. You can still add more steps later if needed.`);
    window.setTimeout(() => setSuccess(""), 1800);
  };

  const startBundleEditing = (bundleKey) => {
    setBundleDraftSteps((current) => {
      if (hasBundleDraft(current, bundleKey)) return current;
      const sourceBundle = bundleTemplates.find((bundle) => bundle.key === bundleKey);
      return {
        ...current,
        [bundleKey]: cloneServiceBundleSteps(sourceBundle?.steps),
      };
    });
    setEditingBundleKey(bundleKey);
  };

  const updateBundleStep = (bundleKey, stepIndex, changes) => {
    setBundleDraftSteps((current) => {
      const sourceBundle = bundleTemplates.find((bundle) => bundle.key === bundleKey);
      const source = getBundleDraftSteps(current, bundleKey, sourceBundle?.steps);
      if (!source[stepIndex]) return current;

      source[stepIndex] = {
        ...source[stepIndex],
        ...changes,
        assignee:
          changes && Object.prototype.hasOwnProperty.call(changes, "assignee")
            ? normalizeStepAssignee(changes.assignee, "accountant")
            : source[stepIndex].assignee,
        text:
          changes && Object.prototype.hasOwnProperty.call(changes, "text")
            ? String(changes.text || "")
            : source[stepIndex].text,
      };

      return {
        ...current,
        [bundleKey]: source,
      };
    });
  };

  const addBundleStep = (bundleKey) => {
    setBundleDraftSteps((current) => {
      const sourceBundle = bundleTemplates.find((bundle) => bundle.key === bundleKey);
      const source = getBundleDraftSteps(current, bundleKey, sourceBundle?.steps);
      source.push({ assignee: "accountant", text: "" });
      return {
        ...current,
        [bundleKey]: source,
      };
    });
    setEditingBundleKey(bundleKey);
  };

  const removeBundleStep = (bundleKey, stepIndex) => {
    setBundleDraftSteps((current) => {
      const sourceBundle = bundleTemplates.find((bundle) => bundle.key === bundleKey);
      const source = getBundleDraftSteps(current, bundleKey, sourceBundle?.steps);
      if (!source[stepIndex]) return current;

      return {
        ...current,
        [bundleKey]: source.filter((_, index) => index !== stepIndex),
      };
    });
    setEditingBundleKey(bundleKey);
  };

  const finishBundleEditing = async (bundleKey) => {
    const activeBundle = bundleTemplates.find((bundle) => bundle.key === bundleKey);
    if (!activeBundle) {
      return;
    }

    const nextSteps = getBundleDraftSteps(bundleDraftSteps, bundleKey, activeBundle?.steps).map((step) => ({
      assignee: normalizeStepAssignee(step?.assignee, "accountant"),
      text: String(step?.text || ""),
    }));

    const serviceId = Number(activeBundle?.id || 0);
    if (!Number.isInteger(serviceId) || serviceId <= 0) {
      showErrorToast("Unable to save bundle steps because the service record is missing.");
      return;
    }

    try {
      setSavingBundleKey(bundleKey);
      await updateServiceType({
        service_id: serviceId,
        name: activeBundle.serviceName,
        disabled: Boolean(activeBundle.disabled),
        bundle_steps: nextSteps,
      });

      setServices((current) =>
        (Array.isArray(current) ? current : []).map((service) =>
          String(service?.id ?? "") === String(serviceId)
            ? { ...service, bundle_steps: nextSteps }
            : service
        )
      );
      setBundleDraftSteps((current) => ({
        ...current,
        [bundleKey]: nextSteps,
      }));
      setEditingBundleKey("");
      showSuccessToast("Bundle steps saved to the database.");
    } catch (error) {
      showErrorToast(error?.response?.data?.message || error?.message || "Failed to save bundle steps.");
    } finally {
      setSavingBundleKey("");
    }
  };

  const resetBundleDraft = (bundleKey) => {
    setBundleDraftSteps((current) => {
      const next = { ...current };
      delete next[bundleKey];
      return next;
    });
  };

  const resetForm = () => {
    setForm({
      client_id: "",
      title: "",
      service_name: "", // must be selected per task
      priority: "Low",
      period_date: "",
      start_date: "",
      due_date: "",
      accountant_id: "",
      partner_id: "",
    });
    setSelectedAppointmentId("");
    setSelectedBundleKey("");
    setBundlePickerOpen(false);
    setEditingBundleKey("");
    setError("");
    setSuccess("");
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!canCreateTask) {
      setError("You do not have permission to create tasks.");
      return;
    }
    setError("");
    setSuccess("");

    let selectedClientId = String(form.client_id || "").trim();

    // If there is only one client, auto-select it to avoid blocking quick-entry
    if (!selectedClientId && didLoadClients && activeClients.length === 1) {
      const onlyId = getClientId(activeClients[0]);
      selectedClientId = onlyId;
      setForm((f) => ({ ...f, client_id: onlyId }));
    }

    // Enforce single service selection (required)
    if (!selectedClientId) {
      setError("Please select a client.");
      return;
    }
    if (didLoadClients && !activeClients.some((client) => matchesClientId(client, selectedClientId))) {
      setError("Please select an active client.");
      return;
    }
    // Require explicit service selection; do not auto-select to avoid accidental submissions.
    // This ensures proper validation per requirements.

    if (!String(form.service_name || "").trim()) {
      setError("Please select a service (To-Do).");
      return;
    }
    if (!String(form.title || "").trim()) {
      setError("Please select a task title (service).");
      return;
    }
    if (matchingAccountants.length === 0) {
      setError("No assignees are available for the selected service.");
      return;
    }
    if (!String(form.accountant_id || "").trim()) {
      setError("Please assign an accountant or secretary.");
      return;
    }
    if (!matchingAccountants.some((accountant) => String(accountant.id) === String(form.accountant_id))) {
      setError("Please assign a matching accountant or secretary for the selected service.");
      return;
    }
    if (selectedAssigneeIsSecretary) {
      if (partnerAccountants.length === 0) {
        setError("No accountant partners are available right now.");
        return;
      }
      if (!String(form.partner_id || "").trim()) {
        setError("Please select an accountant partner for the secretary.");
        return;
      }
      if (!partnerAccountants.some((accountant) => String(accountant.id) === String(form.partner_id))) {
        setError("Please select a valid partner accountant for the secretary.");
        return;
      }
    }
    if (!String(form.priority || "").trim()) {
      setError("Please select a priority.");
      return;
    }
    if (!String(form.due_date || "").trim()) {
      setError("Please select a due date.");
      return;
    }
    if (hasReachedTaskWorkloadLimit(selectedAssigneeWorkload?.totalTasks || 0, workloadLimit)) {
      const assigneeName = selectedAssigneeWorkload?.name || "The selected staff member";
      showErrorToast(
        `${assigneeName} already has ${selectedAssigneeWorkload?.totalTasks || 0} active tasks and has reached the workload limit of ${workloadLimit}. Please choose another accountant or secretary.`
      );
      return;
    }

    // Map UI fields to backend contract (KEEP BACKEND INTACT)
    // Backend expects payload.status to be a VALID service name from tblservices.
    // Therefore:
    // - title -> task name stored in tbltasks.Name
    // - status -> we send the selected service name (same as title)
    // - priority -> stored into description as a tagged line: [Priority] Low|Medium|High
    // - due_date -> deadline (optional)
    try {
      setCreatingTask(true);
      const priority = (form.priority || "Low").trim();
      const descriptionMetaLines = [`[Priority] ${priority}`];
      if (selectedAppointmentId) {
        descriptionMetaLines.push(`[Appointment_ID] ${selectedAppointmentId}`);
      }
      const baseDescription = descriptionMetaLines.join("\n");
      const selectedBundleSteps = (Array.isArray(selectedBundle?.steps) ? selectedBundle.steps : []).filter((step) =>
        String(step?.text || "").trim()
      );
      const descWithPriority = selectedBundle?.steps?.length
        ? replaceTaskSteps(baseDescription, selectedBundleSteps)
        : baseDescription;

      // Backend validates `status` against tblservices.Name.
      // When using the inline quick-add input, `form.title` can be a free-text task title.
      // So:
      // - title: the task title (free text)
      // - status: the selected service name (must be a valid service)
      const payload = {
        client_id: parseInt(selectedClientId, 10),
        title: form.title,
        description: descWithPriority,
        deadline: form.due_date || null,
        status: form.service_name || "",
        accountant_id: form.accountant_id ? parseInt(form.accountant_id, 10) : undefined,
        partner_id: selectedAssigneeIsSecretary && form.partner_id ? parseInt(form.partner_id, 10) : 0,
      };
      const res = await api.post("task_create.php", payload);
      if (res?.data?.success) {
        // Ensure the UI updates immediately: append created task locally (oldest first)
        if (res.data?.task) {
          setTasks((prev) => {
            const next = Array.isArray(prev) ? prev.slice() : [];
            const newId = res.data.task.id || res.data.task.task_id;
            // De-duplicate if backend list already contains the task
            const deduped = next.filter((t) => {
              const tid = t?.id || t?.task_id;
              return !newId || String(tid) !== String(newId);
            });
            return [...deduped, res.data.task];
          });
        }

        // Then reconcile with server list (still keep newest-first ordering in UI)
        try {
          const list = await api.get("task_list.php");
          if (Array.isArray(list.data?.tasks)) {
            setTasks(list.data.tasks);
          }
        } catch (_) { }

        showSuccessToast("Task created successfully.");
        // After creating, reset the whole create-task form (client/assignee/priority/due date/etc.)
        // per requirement to avoid accidentally reusing previous selections.
        setForm({
          client_id: "",
          title: "",
          service_name: "",
          priority: "Low",
          period_date: "",
          start_date: "",
          due_date: "",
          accountant_id: "",
          partner_id: "",
        });
        setSelectedAppointmentId("");
        setSelectedBundleKey("");
        setEditingBundleKey("");
      } else {
        setError(res?.data?.message || "Failed to create task.");
      }
    } catch (err) {
      if (err?.response?.data?.workload_limit_reached) {
        showErrorToast(err?.response?.data?.message || "The selected staff member already reached the workload limit.");
        return;
      }
      setError(err?.response?.data?.message || err?.message || "Request failed.");
    } finally {
      setCreatingTask(false);
    }
  };

  // If there is only one client, auto-select it for convenience
  useEffect(() => {
    if (!didLoadClients || form.client_id || activeClients.length !== 1) return;
    const onlyId = getClientId(activeClients[0]);
    if (onlyId) {
      setForm((f) => ({ ...f, client_id: onlyId }));
    }
  }, [activeClients, didLoadClients, form.client_id]);

  useEffect(() => {
    if (!didLoadClients || !form.client_id) return;
    const stillActive = activeClients.some((client) => matchesClientId(client, form.client_id));
    if (!stillActive) {
      setForm((current) => ({ ...current, client_id: "" }));
    }
  }, [activeClients, didLoadClients, form.client_id]);

  useEffect(() => {
    if (!form.accountant_id) return;
    const stillMatches = matchingAccountants.some((accountant) => String(accountant.id) === String(form.accountant_id));
    if (!stillMatches) {
      setForm((current) => ({ ...current, accountant_id: "" }));
    }
  }, [form.accountant_id, matchingAccountants]);

  useEffect(() => {
    if (selectedAssigneeIsSecretary) return;
    if (!form.partner_id) return;
    setForm((current) => ({ ...current, partner_id: "" }));
  }, [form.partner_id, selectedAssigneeIsSecretary]);

  useEffect(() => {
    if (!form.partner_id) return;
    const stillExists = partnerAccountants.some((accountant) => String(accountant.id) === String(form.partner_id));
    if (!stillExists) {
      setForm((current) => ({ ...current, partner_id: "" }));
    }
  }, [form.partner_id, partnerAccountants]);

  useEffect(() => {
    const nextBundleKey = suggestedBundleKey || "";

    setSelectedBundleKey((current) => {
      if (!nextBundleKey) {
        return current;
      }
      return current || nextBundleKey;
    });
  }, [suggestedBundleKey]);

  const staffWorkloadRows = useMemo(() => {
    const taskCountsByStaffId = new Map();

    (Array.isArray(tasks) ? tasks : []).forEach((task) => {
      if (!isTaskCountedInWorkload(task)) return;
      const staffId = Number(task?.accountant_id || 0);
      if (!Number.isInteger(staffId) || staffId <= 0) return;
      taskCountsByStaffId.set(staffId, (taskCountsByStaffId.get(staffId) || 0) + 1);
    });

    return (Array.isArray(accountants) ? accountants : [])
      .filter((staff) => {
        const role = getUserRoleLabel(staff).toLowerCase();
        return role === "accountant" || role === "secretary";
      })
      .map((staff) => {
        const staffId = Number(staff?.id || 0);
        const name = String(staff?.username || "").trim() || (staffId > 0 ? `User #${staffId}` : "Unnamed staff");
        return {
          id: staffId > 0 ? staffId : name,
          name,
          role: getReadableUserRole(staff),
          totalTasks: staffId > 0 ? taskCountsByStaffId.get(staffId) || 0 : 0,
        };
      })
      .sort((a, b) => {
        if (b.totalTasks !== a.totalTasks) return b.totalTasks - a.totalTasks;
        return a.name.localeCompare(b.name);
      });
  }, [accountants, tasks]);

  const filteredStaffWorkloadRows = useMemo(() => {
    const query = String(staffWorkloadSearch || "").trim().toLowerCase();
    if (!query) return staffWorkloadRows;

    return staffWorkloadRows.filter((staff) =>
      `${staff.name} ${staff.role}`.toLowerCase().includes(query)
    );
  }, [staffWorkloadRows, staffWorkloadSearch]);
  const totalActiveTasksInWorkload = useMemo(
    () => staffWorkloadRows.reduce((total, staff) => total + Number(staff.totalTasks || 0), 0),
    [staffWorkloadRows]
  );
  const selectedAssigneeWorkload = useMemo(() => {
    if (!form.accountant_id) return null;
    return staffWorkloadRows.find((staff) => String(staff.id) === String(form.accountant_id)) || null;
  }, [form.accountant_id, staffWorkloadRows]);
  const taskAssigneeOptions = useMemo(() => {
    if (!taskAssigneeEditCtx) return [];

    const serviceName = String(taskAssigneeEditCtx.serviceName || "").trim();
    const available = (Array.isArray(accountants) ? accountants : []).filter((accountant) =>
      userMatchesEnabledService(accountant, serviceName, activeSpecializationById, activeSpecializationByName)
    );
    const currentId = String(taskAssigneeEditCtx.currentAssigneeId || "").trim();
    if (!currentId) return available;

    const alreadyIncluded = available.some((accountant) => String(accountant.id) === currentId);
    if (alreadyIncluded) return available;

    const currentAssignee = (Array.isArray(accountants) ? accountants : []).find(
      (accountant) => String(accountant.id) === currentId
    );
    return currentAssignee ? [currentAssignee, ...available] : available;
  }, [accountants, activeSpecializationById, activeSpecializationByName, taskAssigneeEditCtx]);
  const taskPartnerOptions = useMemo(() => {
    const serviceName = String(taskAssigneeEditCtx?.serviceName || "").trim();
    const allowAllSpecializations = isProcessingService(serviceName);
    return (Array.isArray(accountants) ? accountants : []).filter((accountant) =>
      isAccountantUser(accountant) &&
      (allowAllSpecializations ||
        userMatchesEnabledService(accountant, serviceName, activeSpecializationById, activeSpecializationByName))
    );
  }, [accountants, activeSpecializationById, activeSpecializationByName, taskAssigneeEditCtx]);
  const selectedTaskAssignee = useMemo(() => {
    if (!taskAssigneeEditValue) return null;
    return taskAssigneeOptions.find((accountant) => String(accountant.id) === String(taskAssigneeEditValue)) || null;
  }, [taskAssigneeEditValue, taskAssigneeOptions]);
  const selectedTaskAssigneeIsSecretary = Boolean(selectedTaskAssignee && isSecretaryUser(selectedTaskAssignee));
  const selectedTaskPartnerAccountant = useMemo(() => {
    if (!taskPartnerEditValue) return null;
    return taskPartnerOptions.find((accountant) => String(accountant.id) === String(taskPartnerEditValue)) || null;
  }, [taskPartnerEditValue, taskPartnerOptions]);
  const selectedTaskAssigneeWorkload = useMemo(() => {
    if (!taskAssigneeEditValue) return null;
    return staffWorkloadRows.find((staff) => String(staff.id) === String(taskAssigneeEditValue)) || null;
  }, [staffWorkloadRows, taskAssigneeEditValue]);
  const isTaskAssigneeEditActive = Boolean(taskAssigneeEditOpen && taskAssigneeEditCtx);
  const taskAssigneeCurrentMatchesService = useMemo(() => {
    const currentId = String(taskAssigneeEditCtx?.currentAssigneeId || "").trim();
    if (!currentId) return true;

    const currentAssignee = (Array.isArray(accountants) ? accountants : []).find(
      (accountant) => String(accountant.id) === currentId
    );
    if (!currentAssignee) return true;

    return userMatchesEnabledService(
      currentAssignee,
      taskAssigneeEditCtx?.serviceName,
      activeSpecializationById,
      activeSpecializationByName
    );
  }, [accountants, activeSpecializationById, activeSpecializationByName, taskAssigneeEditCtx]);

  useEffect(() => {
    if (selectedTaskAssigneeIsSecretary) return;
    if (!taskPartnerEditValue) return;
    setTaskPartnerEditValue("");
  }, [selectedTaskAssigneeIsSecretary, taskPartnerEditValue]);

  useEffect(() => {
    if (!taskPartnerEditValue) return;
    const stillExists = taskPartnerOptions.some((accountant) => String(accountant.id) === String(taskPartnerEditValue));
    if (!stillExists) {
      setTaskPartnerEditValue("");
    }
  }, [taskPartnerEditValue, taskPartnerOptions]);

  useEffect(() => {
    return () => {
      if (taskAssigneeResetTimerRef.current) {
        window.clearTimeout(taskAssigneeResetTimerRef.current);
      }
    };
  }, []);

  // Sorting & filtering state
  const [sortBy, setSortBy] = useState("date_desc");
  const [statusFilter, setStatusFilter] = useState("");
  const [ownerFilter, setOwnerFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [search, setSearch] = useState("");

  // Map tasks to a board-ready shape
  const boardRows = useMemo(() => {
    const items = (Array.isArray(tasks) ? tasks : []).map((t) => ({
      id: t.id || t.task_id,
      title: t.title || t.name || "Untitled task",
      owner: t.accountant_name || t.accountant || "Unassigned",
      owner_id: t.accountant_id || null,
      creator: getTaskCreatorLabel(t),
      status: t.status || "Pending",
      due_date: t.due_date || t.deadline || "",
      client_name: t.client_name || "",
      description: t.description || "",
    }));

    // Filter
    let out = items.filter((r) => {
      const okStatus = !statusFilter || (r.status || "").toLowerCase() === statusFilter.toLowerCase();
      const okOwner = !ownerFilter || String(r.owner_id || r.owner) === String(ownerFilter);
      const okDateFrom = !dateFrom || (r.due_date && r.due_date >= dateFrom);
      const okDateTo = !dateTo || (r.due_date && r.due_date <= dateTo);
      const q = search.trim().toLowerCase();
      const okSearch = !q || r.title.toLowerCase().includes(q) || r.owner.toLowerCase().includes(q) || r.creator.toLowerCase().includes(q) || r.status.toLowerCase().includes(q) || r.client_name.toLowerCase().includes(q) || r.description.toLowerCase().includes(q);
      return okStatus && okOwner && okDateFrom && okDateTo && okSearch;
    });

    // Sort
    out.sort((a, b) => {
      switch (sortBy) {
        case "task_asc": return a.title.localeCompare(b.title);
        case "task_desc": return b.title.localeCompare(a.title);
        case "owner_asc": return a.owner.localeCompare(b.owner);
        case "owner_desc": return b.owner.localeCompare(a.owner);
        case "status_asc": return a.status.localeCompare(b.status);
        case "status_desc": return b.status.localeCompare(a.status);
        case "date_asc": return (a.due_date || "").localeCompare(b.due_date || "");
        case "date_desc":
        default:
          return (b.due_date || "").localeCompare(a.due_date || "");
      }
    });

    return out;
  }, [tasks, sortBy, statusFilter, ownerFilter, dateFrom, dateTo, search]);

  const archivedTodoTasks = useMemo(
    () => sortedTodoTasks.filter((task) => isTaskArchived(task)),
    [sortedTodoTasks]
  );

  const filteredTodoTasks = useMemo(() => {
    return activeTodoTasks.filter((task) => {
      const clientName = String(task.client_name || "");
      const query = todoSearch.trim().toLowerCase();
      if (query && !clientName.toLowerCase().includes(query)) return false;

      const priority = parsePriority(task.description);
      if (todoPriority !== "All" && String(priority).toLowerCase() !== String(todoPriority).toLowerCase()) return false;

      return true;
    });
  }, [activeTodoTasks, todoSearch, todoPriority]);

  const archivedTaskRows = useMemo(() => {
    return archivedTodoTasks.map((task) => {
      const accId = String(task.accountant_id || "");
      const accountantName =
        task.accountant_name ||
        accountants.find((accountant) => String(accountant.id) === accId)?.username ||
        (accId ? `Accountant #${accId}` : "Unassigned");

      return {
        id: task.id || task.task_id,
        title: task.title || task.name || "Untitled task",
        clientName: task.client_name || "Client",
        serviceName: String(task.service_name || task.title || task.name || "").trim() || "Uncategorized",
        accountantName,
        statusLabel: String(task.status || (isTaskCompleted(task) ? "Completed" : "Pending")).trim() || "Pending",
        priority: parsePriority(task.description),
        dueDateLabel: formatDueDate(task.deadline || task.due_date),
        description: cleanDescription(task.description),
        stepCount: parseTaskSteps(task.description).length,
      };
    });
  }, [archivedTodoTasks, accountants]);

  const archiveTasks = async (taskIds) => {
    const ids = normalizeTaskIds(taskIds).filter((id) => activeTaskIdSet.has(id));
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

    const taskMap = new Map((Array.isArray(tasks) ? tasks : []).map((task) => [getTaskKey(task), task]));
    try {
      setArchiveLoading(true);
      setError("");

      await Promise.all(
        ids.map((id) => {
          const task = taskMap.get(id);
          if (!task) return Promise.resolve();
          return api.post("task_update_status.php", {
            task_id: Number(id),
            description: setTaskArchived(String(task.description || ""), true),
          });
        })
      );

      const listRes = await api.get("task_list.php");
      if (Array.isArray(listRes.data?.tasks)) setTasks(listRes.data.tasks);
      setSuccess(ids.length === 1 ? "Task archived." : `${ids.length} tasks archived.`);
      setTimeout(() => setSuccess(""), 1200);
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || "Failed to archive task.");
    } finally {
      setArchiveLoading(false);
    }
  };

  const closeStaffWorkload = () => {
    setStaffWorkloadOpen(false);
    setStaffWorkloadSearch("");
  };

  const handleSaveTaskWorkloadLimit = async (draftValue) => {
    const nextLimitText = String(draftValue || "").trim();
    if (!/^\d+$/.test(nextLimitText)) {
      showErrorToast(`Enter a workload limit from ${MIN_TASK_WORKLOAD_LIMIT} to ${MAX_TASK_WORKLOAD_LIMIT}.`);
      return;
    }

    const nextLimit = Number.parseInt(nextLimitText, 10);
    if (nextLimit < MIN_TASK_WORKLOAD_LIMIT || nextLimit > MAX_TASK_WORKLOAD_LIMIT) {
      showErrorToast(`Enter a workload limit from ${MIN_TASK_WORKLOAD_LIMIT} to ${MAX_TASK_WORKLOAD_LIMIT}.`);
      return;
    }

    setTaskWorkloadSaving(true);
    try {
      const response = await saveTaskWorkloadSettings({ limit: nextLimit });
      const nextSettings = response?.data?.settings || { limit: nextLimit };
      setTaskWorkloadSettings(nextSettings);
      showSuccessToast(response?.data?.message || "Task workload limit saved successfully.");
    } catch (saveError) {
      showErrorToast(saveError?.response?.data?.message || "Unable to save the task workload limit.");
    } finally {
      setTaskWorkloadSaving(false);
    }
  };

  const resetTaskAssigneeEditState = () => {
    setTaskAssigneeEditCtx(null);
    setTaskAssigneeEditValue("");
    setTaskPartnerEditValue("");
    setTaskPriorityEditValue("Low");
    setTaskEditError("");
  };

  const closeTaskAssigneeEdit = () => {
    setTaskAssigneeEditOpen(false);
    setTaskEditError("");

    if (taskAssigneeResetTimerRef.current) {
      window.clearTimeout(taskAssigneeResetTimerRef.current);
    }

    taskAssigneeResetTimerRef.current = window.setTimeout(() => {
      resetTaskAssigneeEditState();
      taskAssigneeResetTimerRef.current = null;
    }, 220);
  };

  const openTaskAssigneeEdit = ({
    taskId,
    taskStatus,
    isCompleted,
    serviceName,
    taskLabel,
    currentAssigneeId,
    currentAssigneeName,
    currentPartnerId,
    currentPartnerName,
  }) => {
    if (!canEditTaskAssignee) {
      showErrorToast("You do not have permission to edit task details.");
      return;
    }

    if (taskAssigneeResetTimerRef.current) {
      window.clearTimeout(taskAssigneeResetTimerRef.current);
      taskAssigneeResetTimerRef.current = null;
    }

    const normalizedCurrentId = String(currentAssigneeId || "").trim();
    const currentAssignee = (Array.isArray(accountants) ? accountants : []).find(
      (accountant) => String(accountant.id) === normalizedCurrentId
    );
    const matchingAssignees = (Array.isArray(accountants) ? accountants : []).filter((accountant) =>
      userMatchesEnabledService(accountant, serviceName, activeSpecializationById, activeSpecializationByName)
    );
    const hasCurrent = matchingAssignees.some((accountant) => String(accountant.id) === normalizedCurrentId);
    const nextDefaultValue = currentAssignee ? normalizedCurrentId : String(matchingAssignees[0]?.id || "");

    const taskRow = (Array.isArray(tasks) ? tasks : []).find(
      (task) => String(task?.id || task?.task_id) === String(taskId)
    );

    setTaskAssigneeEditCtx({
      taskId: Number(taskId),
      taskStatus: String(taskStatus || ""),
      isCompleted: Boolean(isCompleted),
      serviceName: String(serviceName || "").trim(),
      taskLabel: String(taskLabel || "").trim() || "Task",
      currentAssigneeId: normalizedCurrentId,
      currentAssigneeName: String(currentAssigneeName || "").trim() || "Unassigned",
      currentPartnerId: String(currentPartnerId || "").trim(),
      currentPartnerName: String(currentPartnerName || "").trim(),
      currentPriority: parsePriority(taskRow?.description || ""),
      hasLegacyAssignee: Boolean(currentAssignee && normalizedCurrentId && !hasCurrent),
    });
    setTaskAssigneeEditValue(nextDefaultValue);
    setTaskPartnerEditValue(String(currentPartnerId || "").trim());
    setTaskPriorityEditValue(parsePriority(taskRow?.description || ""));
    setTaskEditError("");
    setTaskAssigneeEditOpen(true);
  };

  const saveTaskAssigneeEdit = async () => {
    if (!canEditTaskAssignee) {
      setTaskEditError("You do not have permission to edit task details.");
      return;
    }
    if (!taskAssigneeEditCtx) return;

    const statusLocked = ["done", "completed"].includes(String(taskAssigneeEditCtx.taskStatus || "").toLowerCase());
    if (Boolean(taskAssigneeEditCtx.isCompleted) || statusLocked) {
      closeTaskAssigneeEdit();
      return;
    }

    const nextAssigneeId = String(taskAssigneeEditValue || "").trim();
    const currentAssigneeId = String(taskAssigneeEditCtx.currentAssigneeId || "").trim();
    const currentPartnerId = String(taskAssigneeEditCtx.currentPartnerId || "").trim();
    const nextPriority = ["Low", "Medium", "High"].includes(String(taskPriorityEditValue || ""))
      ? String(taskPriorityEditValue)
      : "";
    if (!nextPriority) {
      setTaskEditError("Please select a priority.");
      return;
    }

    const assigneeChanged = nextAssigneeId !== currentAssigneeId;
    const nextAssignee = taskAssigneeOptions.find((accountant) => String(accountant.id) === nextAssigneeId) || null;
    const shouldRequirePartner = Boolean(nextAssignee && isSecretaryUser(nextAssignee));
    const nextPartnerId = shouldRequirePartner ? String(taskPartnerEditValue || "").trim() : "";
    const partnerChanged = nextPartnerId !== currentPartnerId;
    const priorityChanged = nextPriority !== String(taskAssigneeEditCtx.currentPriority || "Low");
    if (!assigneeChanged && !partnerChanged && !priorityChanged) {
      closeTaskAssigneeEdit();
      return;
    }

    if (assigneeChanged) {
      if (!nextAssigneeId) {
        setTaskEditError("Please assign an accountant or secretary.");
        return;
      }
      if (
        !nextAssignee ||
        !userMatchesEnabledService(
          nextAssignee,
          taskAssigneeEditCtx.serviceName,
          activeSpecializationById,
          activeSpecializationByName
        )
      ) {
        setTaskEditError("Please assign a matching accountant or secretary for the selected service.");
        return;
      }
      if (hasReachedTaskWorkloadLimit(selectedTaskAssigneeWorkload?.totalTasks || 0, workloadLimit)) {
        const assigneeName = selectedTaskAssigneeWorkload?.name || nextAssignee.username || "The selected staff member";
        showErrorToast(
          `${assigneeName} already has ${selectedTaskAssigneeWorkload?.totalTasks || 0} active tasks and has reached the workload limit of ${workloadLimit}. Please choose another accountant or secretary.`
        );
        return;
      }
    }
    if (shouldRequirePartner) {
      if (!taskPartnerOptions.length) {
        setTaskEditError("No accountant partners are available right now.");
        return;
      }
      if (!nextPartnerId) {
        setTaskEditError("Please select an accountant partner for the secretary.");
        return;
      }
      if (!taskPartnerOptions.some((accountant) => String(accountant.id) === nextPartnerId)) {
        setTaskEditError("Please select a valid partner accountant for the secretary.");
        return;
      }
    }

    const taskRow = (Array.isArray(tasks) ? tasks : []).find(
      (task) => String(task?.id || task?.task_id) === String(taskAssigneeEditCtx.taskId)
    );
    if (!taskRow) {
      setTaskEditError("Unable to find the latest task details. Please refresh and try again.");
      return;
    }

    const payload = {
      task_id: Number(taskAssigneeEditCtx.taskId),
    };

    if (assigneeChanged) {
      payload.accountant_id = Number.parseInt(nextAssigneeId, 10);
    }
    if (partnerChanged || shouldRequirePartner || currentPartnerId) {
      payload.partner_id = nextPartnerId ? Number.parseInt(nextPartnerId, 10) : 0;
    }
    if (priorityChanged) {
      payload.description = upsertTaskMetaLine(String(taskRow.description || ""), "Priority", nextPriority);
    }

    try {
      setTaskAssigneeSaving(true);
      setTaskEditError("");

      const response = await api.post("task_update_status.php", payload);

      if (response?.data?.success) {
        const listRes = await api.get("task_list.php");
        if (Array.isArray(listRes.data?.tasks)) setTasks(listRes.data.tasks);
        showSuccessToast("Task updated.");
        closeTaskAssigneeEdit();
      } else {
        setTaskEditError(response?.data?.message || "Failed to update task.");
      }
    } catch (err) {
      if (err?.response?.data?.workload_limit_reached) {
        showErrorToast(err?.response?.data?.message || "The selected staff member already reached the workload limit.");
        return;
      }
      setTaskEditError(err?.response?.data?.message || err?.message || "Request failed.");
    } finally {
      setTaskAssigneeSaving(false);
    }
  };

  const closeStepEdit = () => {
    setStepEditOpen(false);
    setStepEditCtx(null);
    setStepEditValue("");
    setStepEditAssignee("accountant");
  };

  const saveStepEdit = async () => {
    if (!canEditTaskTodo) {
      setError("You do not have permission to edit task to-do items.");
      return;
    }
    if (!stepEditCtx) return;

    const statusLocked = ["done", "completed"].includes(String(stepEditCtx.taskStatus || "").toLowerCase());
    const locked = Boolean(stepEditCtx.isCompleted) || statusLocked;
    if (locked) return;

    const trimmed = String(stepEditValue || "").trim();
    if (!trimmed) return;

    const stepIndex = Number(stepEditCtx.stepIndex);

    // Re-run the same edit logic used inside the card rendering,
    // but referencing the current tasks list so it uses the latest description.
    const taskRow = (Array.isArray(tasks) ? tasks : []).find((x) => String(x?.id || x?.task_id) === String(stepEditCtx.taskId));
    const currentDesc = String(taskRow?.description || "");

    const lineNo = stepIndex + 1;
    const newLine = formatTaskStepLine(lineNo, trimmed, stepEditAssignee);

    const lines = currentDesc.split(/\r?\n/);
    const nextLines = lines.map((ln) => {
      const m = String(ln).match(/^\s*Step\s+(\d+)(?:\s*\((?:Owner|Accountant|Secretary)\))?\s*:\s*(.*)$/i);
      if (m && Number(m[1]) === lineNo) return newLine;
      return ln;
    });

    try {
      setStepLoading(true);
      const res = await api.post("task_update_status.php", {
        task_id: Number(stepEditCtx.taskId),
        description: nextLines.join("\n"),
      });
      if (res?.data?.success) {
        const listRes = await api.get("task_list.php");
        if (Array.isArray(listRes.data?.tasks)) setTasks(listRes.data.tasks);
        setSuccess("Updated.");
        setTimeout(() => setSuccess(""), 900);
        closeStepEdit();
      } else {
        setError(res?.data?.message || "Failed to update.");
      }
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || "Request failed.");
    } finally {
      setStepLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Create Task Form */}
      <Card compact>
        <CardHeader>
          <CardTitle>Create Task</CardTitle>
          <CardDescription>{createTaskDescription}</CardDescription>
        </CardHeader>

        <CardContent className="space-y-5">
          <form onSubmit={handleCreate} className="space-y-5">
            {/* Inputs */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-12">
              <div className="md:col-span-4">
                <label className="mb-1 block text-xs font-medium text-slate-600">Select Client (F2F)</label>
                <ClientPicker
                  clients={activeClients}
                  value={form.client_id}
                  onChange={(clientId) => handleClientSelection(clientId)}
                />
                <p className="mt-1 text-[11px] text-slate-500">
                  {selectedAppointmentId
                    ? "Loaded from Client Appointments."
                    : "Use this for face-to-face or walk-in task creation."}
                </p>
              </div>

              <div className="md:col-span-4">
                <label className="mb-1 block text-xs font-medium text-slate-600">Services</label>
                <select
                  name="title"
                  value={form.title}
                  onChange={(e) => {
                    handleServiceSelection(e.target.value);
                  }}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500/20"
                  required
                >
                  <option value="">Select Service</option>
                  {services.map((s) => (
                    <option key={s.name} value={s.name}>
                      {s.name}
                    </option>
                  ))}
                </select>
                {form.client_id &&
                services.length === 1 &&
                String(services[0]?.name || "").trim().toLowerCase() ===
                  "processing" ? (
                  <p className="mt-2 text-xs text-amber-700">
                    Only Processing is available until the client business
                    permit is uploaded.
                  </p>
                ) : null}
                {selectedServiceDuration ? (
                  <div className="mt-2 rounded-lg border border-indigo-100 bg-indigo-50 px-3 py-2">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-indigo-700">
                      Estimated duration
                    </div>
                    <div className="mt-1 text-sm font-medium text-slate-900">
                      {selectedServiceDuration}
                    </div>
                    <div className="mt-1 text-[11px] text-slate-500">
                      Use this as a guide when setting the due date.
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="md:col-span-4">
                <label className="mb-1 block text-xs font-medium text-slate-600">Assign To (Accountant or Secretary)</label>
                <AccountantPicker
                  accountants={matchingAccountants}
                  value={form.accountant_id || ""}
                  onChange={(accountantId) => setForm((current) => ({ ...current, accountant_id: accountantId }))}
                  serviceName={form.service_name || form.title}
                />
                {selectedAppointmentId ? (
                  <p className="mt-1 text-[11px] text-slate-500">
                    This approved appointment is ready. Only the accountant or secretary assignment is still needed before you click Create Task.
                  </p>
                ) : null}
                {form.accountant_id ? (
                  <p
                    className={`mt-1 text-[11px] ${
                      getTaskWorkloadLevel(selectedAssigneeWorkload?.totalTasks || 0, workloadLimit) === "over"
                        ? "text-rose-600"
                        : getTaskWorkloadLevel(selectedAssigneeWorkload?.totalTasks || 0, workloadLimit) === "at"
                        ? "text-amber-700"
                        : "text-slate-500"
                    }`}
                  >
                    {hasReachedTaskWorkloadLimit(selectedAssigneeWorkload?.totalTasks || 0, workloadLimit)
                      ? `${selectedAssigneeWorkload?.name || "Selected staff"} already reached the ${workloadLimit}-task limit. Choose another accountant or secretary.`
                      : `${selectedAssigneeWorkload?.name || "Selected staff"} currently has ${selectedAssigneeWorkload?.totalTasks || 0} active task${
                          (selectedAssigneeWorkload?.totalTasks || 0) === 1 ? "" : "s"
                        } out of the ${workloadLimit}-task limit.`}
                  </p>
                ) : null}
                {selectedAssigneeIsSecretary ? (
                  <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50/80 p-3">
                    <label className="mb-1 block text-xs font-medium text-slate-600">Partner Accountant</label>
                    <PartnerAccountantPicker
                      accountants={partnerAccountants}
                      value={form.partner_id || ""}
                      onChange={(partnerId) => {
                        setForm((current) => ({ ...current, partner_id: partnerId }));
                        setError("");
                      }}
                      serviceName={form.service_name || form.title}
                      filterByService={!partnerUsesAllSpecializations}
                      disabled={partnerAccountants.length === 0}
                    />
                    <p className="mt-1 text-[11px] text-slate-500">
                      Required for secretary-assigned tasks.
                    </p>
                    {partnerAccountants.length === 0 ? (
                      <p className="mt-1 text-[11px] text-rose-600">
                        {partnerUsesAllSpecializations
                          ? "No partner accountant is available yet."
                          : "No partner accountant matches this task specialization yet."}
                      </p>
                    ) : null}
                    {selectedPartnerAccountant ? (
                      <p className="mt-1 text-[11px] text-slate-600">
                        Partner: {selectedPartnerAccountant.username || `User #${selectedPartnerAccountant.id}`}
                        {getAccountantSpecialization(selectedPartnerAccountant)
                          ? ` - ${getAccountantSpecialization(selectedPartnerAccountant)}`
                          : ""}
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </div>

              <div className="md:col-span-4 md:col-start-9 md:row-start-2 md:pt-6">
                <div className="flex flex-col gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => setBundlePickerOpen(true)}
                    className="w-full justify-center gap-2"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 7.5h16" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 12h16" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16.5h10" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M18 16.5h2" />
                    </svg>
                    <span>{selectedBundle ? "Change Bundle" : "Bundle Tasks"}</span>
                  </Button>

                  {canViewTaskLimit ? (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => setStaffWorkloadOpen(true)}
                      className="w-full justify-center gap-2"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M17 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M10 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21v-2a4 4 0 0 0-3-3.87" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M14 3.13a4 4 0 0 1 0 7.75" />
                      </svg>
                      <span>Staff Workload</span>
                    </Button>
                  ) : null}
                </div>
              </div>

              <div className="md:col-span-4">
                <label className="mb-1 block text-xs font-medium text-slate-600">Priority</label>
                <select
                  name="priority"
                  value={form.priority}
                  onChange={handleChange}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500/20"
                  required
                >
                  <option value="Low">Low</option>
                  <option value="Medium">Medium</option>
                  <option value="High">High</option>
                </select>
              </div>

              <div className="md:col-span-4">
                <label className="mb-1 block text-xs font-medium text-slate-600">Due Date</label>
                <input
                  type="date"
                  name="due_date"
                  value={form.due_date}
                  onChange={handleChange}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500/20"
                  required
                />
                {selectedServiceDuration ? (
                  <p className="mt-1 text-[11px] text-slate-500">
                    {selectedAppointmentId
                      ? "Loaded from the selected approved appointment. You can still adjust it."
                      : "Auto-filled from the selected service. You can still adjust it."}
                  </p>
                ) : null}
              </div>
            </div>

            {selectedBundle ? (
              <div className="rounded-xl border border-indigo-200 bg-indigo-50/70 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-indigo-700">
                      Bundle Tasks
                    </div>
                    <div className="mt-1 text-sm font-semibold text-slate-900">
                      {selectedBundle.label}
                    </div>
                    <div className="mt-1 text-xs text-slate-600">
                      This bundle is automatically loaded from the selected service or approved appointment. Add Step will stay optional afterward.
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                      Auto applied
                    </span>
                    <span className="inline-flex items-center rounded-full border border-indigo-200 bg-white px-2.5 py-1 text-xs font-medium text-indigo-700">
                      {selectedBundle.steps.length} step{selectedBundle.steps.length === 1 ? "" : "s"}
                    </span>
                    {hasSelectedBundleDraft ? (
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => resetBundleDraft(selectedBundle.key)}
                      >
                        Reset Edited Steps
                      </Button>
                    ) : null}
                  </div>
                </div>

                <div className="mt-4 space-y-2">
                  {selectedBundle.steps.map((step, index) => (
                    <div
                      key={`${selectedBundle.key}-preview-${index}`}
                      className="rounded-lg border border-indigo-100 bg-white px-3 py-2"
                    >
                      <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold text-slate-500">
                        <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-slate-700">
                          Step {index + 1}
                        </span>
                        <span>{stepAssigneeLabel(step.assignee)}</span>
                      </div>
                      <div className="mt-1 text-sm text-slate-700">{step.text}</div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {/* Actions */}
            <div className="flex flex-col gap-3 pt-1 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-xs">
                {error && <div className="text-rose-600">{error}</div>}
                {!error && success && <div className="text-emerald-600">{success}</div>}
              </div>

              <div className="flex items-center justify-end gap-2">
                <Button type="button" variant="secondary" size="sm" onClick={resetForm}>
                  Reset
                </Button>
                {canCreateTask ? (
                  <Button type="submit" size="sm" disabled={creatingTask} className="gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4 text-white">
                      <path d="M11 11V6h2v5h5v2h-5v5h-2v-5H6v-2h5Z" />
                    </svg>
                    <span>{creatingTask ? "Creating..." : "Create Task"}</span>
                  </Button>
                ) : null}
              </div>
            </div>
          </form>
        </CardContent>
      </Card>

      <div className="space-y-4">
        {/* Filters: search + status + priority */}
        <Card compact className="p-4">
          <CardContent className="space-y-0">
            <div className="flex flex-wrap items-stretch gap-3 xl:flex-nowrap xl:items-center">
              <div className="relative min-w-[200px] flex-[1_1_220px] xl:max-w-[360px]">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="11" cy="11" r="7"></circle>
                    <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                  </svg>
                </span>
                <input
                  type="text"
                  value={todoSearch}
                  onChange={(e) => setTodoSearch(e.target.value)}
                  placeholder="Search active tasks by client name..."
                  className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>

              <select
                value={todoPriority}
                onChange={(e) => setTodoPriority(e.target.value)}
                className="min-w-[150px] flex-[1_1_160px] rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500/20 xl:w-[160px] xl:flex-none"
              >
                <option>All</option>
                <option>Low</option>
                <option>Medium</option>
                <option>High</option>
              </select>

            </div>
          </CardContent>
        </Card>

        {(() => {
          if (filteredTodoTasks.length === 0) {
            return (
              <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-500">
                <div className="mx-auto mb-3 grid h-10 w-10 place-items-center rounded-full bg-slate-100 text-slate-500">
                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M12 6v12m6-6H6" />
                  </svg>
                </div>
                <div className="text-sm">
                  No matching active tasks found.
                </div>
              </div>
            );
          }

          return filteredTodoTasks.map((t) => {
            const taskId = t.id || t.task_id;
            const taskKey = getTaskKey(t) || String(taskId || "");
            const accId = String(t.accountant_id || "");
            const accName = t.accountant_name || accountants.find((a) => String(a.id) === accId)?.username || (accId ? `Accountant #${accId}` : "Unassigned");
            const partnerId = String(t.partner_id || "");
            const partnerName =
              t.partner_name ||
              partnerAccountants.find((accountant) => String(accountant.id) === partnerId)?.username ||
              (partnerId ? `Accountant #${partnerId}` : "");
            const mainAssignee = (Array.isArray(accountants) ? accountants : []).find((accountant) => String(accountant.id) === accId) || null;
            const mainAssigneeIsSecretary = Boolean(mainAssignee && isSecretaryUser(mainAssignee));
            const creatorLabel = getTaskCreatorLabel(t);
            const serviceName = String(t.service_name || t.title || t.name || "").trim() || "Uncategorized";
            const serviceDuration = getEstimatedServiceDuration(serviceName);

            const isCompleted = isTaskCompleted(t);
            const deadlineState = getTaskDeadlineState(t);
            const isOverdue = String(t.status || "").trim().toLowerCase() === "overdue" || deadlineState.isOverdue;

            const cardClassName = isCompleted
              ? "rounded-xl border border-emerald-200 bg-emerald-50/40 shadow-sm overflow-hidden"
              : isOverdue
                ? "rounded-xl border border-rose-300 bg-rose-50/40 shadow-sm overflow-hidden"
                : "rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden";

            const desc = String(t.description || "");
            const steps = parseTaskSteps(desc);

            const updateTaskDescription = async (nextDescription) => {
              try {
                setStepLoading(true);
                const res = await api.post("task_update_status.php", {
                  task_id: Number(taskId),
                  description: nextDescription,
                });
                if (res?.data?.success) {
                  const listRes = await api.get("task_list.php");
                  if (Array.isArray(listRes.data?.tasks)) setTasks(listRes.data.tasks);
                  setSuccess("Updated.");
                  setTimeout(() => setSuccess(""), 900);
                } else {
                  setError(res?.data?.message || "Failed to update.");
                }
              } catch (err) {
                setError(err?.response?.data?.message || err?.message || "Request failed.");
              } finally {
                setStepLoading(false);
              }
            };

            const editStepLine = async (stepIndex, newText) => {
              const trimmed = String(newText || "").trim();
              if (!trimmed) return;

              const nextSteps = steps.map((step, idx) => {
                if (idx !== stepIndex) return step;
                return { ...step, text: trimmed };
              });

              await updateTaskDescription(replaceTaskSteps(String(t.description || ""), nextSteps));
            };

            const removeStepLine = async (stepIndex) => {
              if (!canRemoveStep) {
                setError("You do not have permission to remove task steps.");
                return;
              }

              const baseDescription = String(t.description || "");
              const doneSet = parseCompletedStepNumbers(baseDescription);
              const pendingSet = parsePendingStepNumbers(baseDescription);
              const filteredSteps = steps.filter((_, idx) => idx !== stepIndex);

              const nextDone = new Set();
              const nextPending = new Set();
              steps.forEach((_, oldIdx) => {
                if (oldIdx === stepIndex) return;
                const oldNumber = oldIdx + 1;
                const newNumber = oldIdx < stepIndex ? oldNumber : oldNumber - 1;
                if (doneSet.has(oldNumber)) nextDone.add(newNumber);
                if (pendingSet.has(oldNumber)) nextPending.add(newNumber);
              });

              let nextDescription = replaceTaskSteps(baseDescription, filteredSteps);
              nextDescription = setCompletedStepNumbers(nextDescription, nextDone);
              nextDescription = setPendingStepNumbers(nextDescription, nextPending);
              nextDescription = remapIndexedStepMeta(nextDescription, (oldNumber) => {
                if (oldNumber === stepIndex + 1) return null;
                return oldNumber < stepIndex + 1 ? oldNumber : oldNumber - 1;
              });
              const nextProgress = filteredSteps.length ? Math.round((nextDone.size / filteredSteps.length) * 100) : 0;
              nextDescription = setProgress(nextDescription, nextProgress);

              await updateTaskDescription(nextDescription);
            };

            return (
              <div key={taskKey} className={cardClassName}>
                <div
                  className={`px-5 py-3 border-b ${
                    isCompleted
                      ? "border-emerald-200 bg-emerald-50/60"
                      : isOverdue
                        ? "border-rose-200 bg-rose-50/70"
                        : "border-slate-200 bg-white"
                  }`}
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex min-w-0 items-center gap-2">
                        <span
                          className={
                            isCompleted
                              ? "text-emerald-700 text-sm font-semibold"
                              : isOverdue
                                ? "text-rose-700 text-sm font-semibold"
                                : "text-indigo-600 text-sm font-semibold"
                          }
                        >
                          To-Do
                        </span>
                        {isCompleted && (
                          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                            <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-600" />
                            Completed
                          </span>
                        )}
                        {!isCompleted && isOverdue && (
                          <span className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-100 px-2 py-0.5 text-[11px] font-semibold text-rose-700">
                            <span className="inline-block h-1.5 w-1.5 rounded-full bg-rose-600" />
                            Overdue
                          </span>
                        )}
                        <span className="text-sm font-medium text-slate-800 truncate">{t.client_name || "Client"}</span>
                        <span className="text-xs text-slate-400">|</span>
                        <span
                          className={
                            isCompleted
                              ? "text-sm font-medium text-emerald-700 truncate"
                              : isOverdue
                                ? "text-sm font-medium text-rose-700 truncate"
                                : "text-sm font-medium text-indigo-500 truncate"
                          }
                        >
                          {serviceName}
                        </span>
                        {serviceDuration ? (
                          <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                            {serviceDuration}
                          </span>
                        ) : null}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 sm:self-start">
                      {canEditTaskAssignee ? (
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          onClick={() =>
                            openTaskAssigneeEdit({
                              taskId,
                              taskStatus: t.status,
                              isCompleted,
                              serviceName,
                              taskLabel: t.title || t.name || serviceName,
                              currentAssigneeId: accId,
                              currentAssigneeName: accName,
                              currentPartnerId: partnerId,
                              currentPartnerName: partnerName,
                            })
                          }
                          disabled={archiveLoading || taskAssigneeSaving}
                          className="justify-center gap-2"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 3.487a2.1 2.1 0 0 1 2.97 2.97L8.5 17.79 4 19l1.21-4.5L16.862 3.487Z" />
                          </svg>
                          <span>Edit</span>
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </div>

                {/* Monday-like header */}
                <div className="grid grid-cols-12 bg-slate-50/60 border-b border-slate-200 text-[11px] font-medium text-slate-500 uppercase tracking-wide">
                  <div className="col-span-5 px-3 py-2 flex items-center">Task</div>
                  <div className="col-span-3 px-3 py-2 flex items-center">Assigned To</div>
                  <div className="col-span-2 px-3 py-2 flex items-center">Priority</div>
                  <div className="col-span-2 px-3 py-2 flex items-center">Due date</div>
                </div>

                {/* Single row for this task */}
                <div className="divide-y divide-slate-100">
                  <div className="grid grid-cols-12 items-center hover:bg-slate-50">
                    <div className="col-span-5 px-3 py-2 flex items-center">
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-slate-800 truncate">{t.title || t.name || serviceName}</div>
                        <div className="text-xs text-slate-500 line-clamp-2">{cleanDescription(t.description)}</div>
                        <div className="mt-1 text-[11px] text-slate-400">Created by: {creatorLabel}</div>
                      </div>
                    </div>
                    <div className="col-span-3 px-3 py-2 flex items-center">
                      <div className="min-w-0 text-sm text-slate-700">
                        <div className="inline-flex min-w-0 items-center gap-2">
                          <span className="inline-grid h-7 w-7 place-items-center rounded-full bg-slate-100 text-slate-500">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4Zm0 2c-3.33 0-6 2.24-6 5v1h12v-1c0-2.76-2.67-5-6-5Z" /></svg>
                          </span>
                          <span className="truncate">{accName}</span>
                        </div>
                        {mainAssigneeIsSecretary && partnerName ? (
                          <div className="mt-1 truncate text-[11px] text-slate-500">Partner accountant: {partnerName}</div>
                        ) : null}
                      </div>
                    </div>
                    <div className="col-span-2 px-3 py-2 flex items-center">
                      <PriorityPill description={t.description} />
                    </div>
                    <div className={`col-span-2 px-3 py-2 text-sm flex items-center ${isOverdue ? "text-rose-700" : "text-slate-700"}`}>
                      {(() => {
                        const raw = t.deadline || t.due_date;
                        if (!raw) return <span className="text-slate-400">ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â</span>;

                        // Supports both YYYY-MM-DD and DD/MM/YYYY
                        let d;
                        if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
                          d = new Date(raw);
                        } else if (/^\d{2}\/\d{2}\/\d{4}$/.test(raw)) {
                          const [dd, mm, yyyy] = raw.split("/");
                          d = new Date(`${yyyy}-${mm}-${dd}`);
                        } else {
                          d = new Date(raw);
                        }

                        if (!d || Number.isNaN(d.getTime())) {
                          return String(raw);
                        }
                        return formatDueDate(raw);
                      })()}
                    </div>
                  </div>

                  {steps.map((step, idx) => {
                    const stepText = step.text;
                    const stepAssignee = normalizeStepAssignee(step.assignee, "accountant");
                    const statusLocked = ["done", "completed"].includes(String(t.status || "").toLowerCase());
                    const stepLocked = isCompleted || statusLocked;

                    return (
                      <div key={idx} className="grid grid-cols-12 bg-slate-50/40">
                        <div className="col-span-5 px-3 py-2">
                          <div className="rounded-md border border-slate-200 bg-white px-3 py-2">
                            <div className="inline-flex shrink-0 items-center justify-center rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                              {`Step ${idx + 1}`}
                            </div>
                            <div className="mt-1 text-[12px] leading-snug text-slate-700 break-words">
                              {stepText}
                            </div>
                            {stepLocked && (
                              <div className="mt-1 text-[11px] text-slate-400">Locked</div>
                            )}
                          </div>
                        </div>

                        <div className="col-span-3 px-3 py-2 flex items-center">
                          <StepAssigneeIdentity assignee={stepAssignee} />
                        </div>

                        <div className="col-span-2 px-3 py-2" />

                        {canEditTaskTodo || canRemoveStep ? (
                          <div className="col-span-2 px-3 py-2 flex items-center justify-end">
                            <div className="flex items-center gap-2">
                              {canEditTaskTodo ? (
                                <button
                                  type="button"
                                  disabled={stepLocked || stepLoading}
                                  onClick={() => {
                                    if (stepLocked) return;
                                    setStepEditCtx({
                                      taskId: Number(taskId),
                                      taskStatus: String(t.status || ""),
                                      isCompleted,
                                      stepIndex: idx,
                                      currentText: stepText,
                                    });
                                    setStepEditValue(stepText);
                                    setStepEditAssignee(stepAssignee);
                                    setStepEditOpen(true);
                                  }}
                                  className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-semibold shadow-sm transition-colors ${
                                    stepLocked
                                      ? "border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed"
                                      : "border-slate-300 bg-white text-indigo-700 hover:bg-indigo-50"
                                  }`}
                                  title={stepLocked ? "Task completed" : "Edit step"}
                                >
                                  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 3.487a2.1 2.1 0 0 1 2.97 2.97L8.5 17.79 4 19l1.21-4.5L16.862 3.487Z" />
                                  </svg>
                                  <span className="hidden sm:inline">Edit</span>
                                </button>
                              ) : null}

                              {canRemoveStep ? (
                                <button
                                  type="button"
                                  disabled={stepLocked || stepLoading}
                                  onClick={async () => {
                                    if (stepLocked || stepLoading) return;

                                    const res = await Swal.fire({
                                      title: `Remove Step ${idx + 1}?`,
                                      text: "This action cannot be undone.",
                                      icon: "warning",
                                      showCancelButton: true,
                                      confirmButtonText: "Remove",
                                      cancelButtonText: "Cancel",
                                      confirmButtonColor: "#dc2626",
                                      cancelButtonColor: "#64748b",
                                      reverseButtons: true,
                                      focusCancel: true,
                                    });

                                    if (!res.isConfirmed) return;
                                    await removeStepLine(idx);
                                  }}
                                  className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-semibold shadow-sm transition-colors ${
                                    stepLocked
                                      ? "border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed"
                                      : "border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
                                  }`}
                                  title={stepLocked ? "Task completed" : "Remove step"}
                                >
                                  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 7h16M10 11v6m4-6v6M9 7l1-2h4l1 2m-9 0 1 14h10l1-14" />
                                  </svg>
                                  <span className="hidden sm:inline">Remove</span>
                                </button>
                              ) : null}
                            </div>
                          </div>
                        ) : null}
                      </div>
                    );
                  })}

                  {/* Keep step-by-step: add a next-step line to THIS specific task */}
                  {(() => {
                    const statusLocked = ["done", "completed"].includes(String(t.status || "").toLowerCase());
                    const stepLocked = isCompleted || statusLocked;

                    return (
                      <div className={stepLocked ? "opacity-60 pointer-events-none" : ""}>
                        {canEditTaskTodo ? (
                          <InlineAddRow
                            onAddNextStep={async (e, localForm) => {
                              e?.preventDefault?.();
                              e?.stopPropagation?.();
                              if (stepLocked) return;

                              const stepText = String(localForm.title || "").trim();
                              if (!stepText) return;

                              const currentDesc = String(t.description || "");
                              const currentSteps = parseTaskSteps(currentDesc);
                              const nextSteps = [
                                ...currentSteps,
                                {
                                  text: stepText,
                                  assignee: normalizeStepAssignee(localForm.step_owner, "accountant"),
                                },
                              ];

                              let updatedDesc = replaceTaskSteps(currentDesc, nextSteps);
                              const doneSet = parseCompletedStepNumbers(currentDesc);
                              const pendingSet = parsePendingStepNumbers(currentDesc);
                              const nextDone = new Set([...doneSet].filter((n) => n > 0 && n <= nextSteps.length));
                              const nextPending = new Set([...pendingSet].filter((n) => n > 0 && n <= nextSteps.length));
                              updatedDesc = setCompletedStepNumbers(updatedDesc, nextDone);
                              updatedDesc = setPendingStepNumbers(updatedDesc, nextPending);
                              const nextProgress = nextSteps.length ? Math.round((nextDone.size / nextSteps.length) * 100) : 0;
                              updatedDesc = setProgress(updatedDesc, nextProgress);

                              try {
                                setStepLoading(true);
                                const res = await api.post("task_update_status.php", {
                                  task_id: Number(taskId),
                                  description: updatedDesc,
                                });
                                if (res?.data?.success) {
                                  const listRes = await api.get("task_list.php");
                                  if (Array.isArray(listRes.data?.tasks)) setTasks(listRes.data.tasks);
                                  setSuccess("Step added.");
                                  setTimeout(() => setSuccess(""), 1200);
                                } else {
                                  setError(res?.data?.message || "Failed to add step.");
                                }
                              } catch (err) {
                                setError(err?.response?.data?.message || err?.message || "Request failed.");
                              } finally {
                                setStepLoading(false);
                              }
                            }}
                            initialForm={form}
                            setParentForm={setForm}
                            clients={clients}
                            accountants={accountants}
                            services={services}
                            loading={stepLoading || stepLocked}
                            variant="monday"
                            defaultAccountantId={String(accId)}
                          />
                        ) : null}

                        {stepLocked && (
                          <div className="px-3 pb-3 text-[11px] text-slate-500">
                            Step-by-step is disabled because this task is completed.
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              </div>
            );
          });
        })()}
      </div>

      <Modal
        open={archiveOpen}
        onClose={() => setArchiveOpen(false)}
        title="Archived Tasks"
        description="Only tasks archived from this page are shown here."
        size="lg"
        footer={
          <Button type="button" variant="secondary" onClick={() => setArchiveOpen(false)}>
            Close
          </Button>
        }
      >
        <ArchiveTasksCompleted tasks={archivedTaskRows} />
      </Modal>

      <Modal
        open={bundlePickerOpen}
        onClose={() => setBundlePickerOpen(false)}
        title="Bundle Tasks"
        description="The bundle that matches the selected service is applied automatically. Use this card to edit steps, add new ones, and change assignees."
        size="lg"
        footer={
          <Button type="button" variant="secondary" onClick={() => setBundlePickerOpen(false)}>
            Close
          </Button>
        }
      >
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1 font-medium text-slate-600">
              Bundles: {bundleTemplates.length}
            </span>
            {form.service_name || form.title ? (
              <span className="inline-flex items-center rounded-full border border-indigo-100 bg-indigo-50 px-3 py-1 font-medium text-indigo-700">
                Selected service: {form.service_name || form.title}
              </span>
            ) : null}
            {selectedBundle ? (
              <span className="inline-flex items-center rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1 font-medium text-emerald-700">
                Applied: {selectedBundle.label}
              </span>
            ) : null}
          </div>

          <div className="grid gap-4">
            {bundleTemplates.map((bundle) => {
              const isSelected = selectedBundleKey === bundle.key;
              const isSuggested = suggestedBundleKey === bundle.key;
              const isEditing = editingBundleKey === bundle.key;
              return (
                <div
                  key={bundle.key}
                  className={`rounded-xl border p-4 ${
                    isSelected
                      ? "border-indigo-200 bg-indigo-50/60"
                      : bundle.isAvailable
                        ? "border-slate-200 bg-white"
                        : "border-slate-200 bg-slate-50/70 opacity-70"
                  }`}
                >
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="text-sm font-semibold text-slate-900">{bundle.label}</div>
                        <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                          {bundle.serviceName}
                        </span>
                        <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-600">
                          {bundle.steps.length} step{bundle.steps.length === 1 ? "" : "s"}
                        </span>
                        {isSuggested ? (
                          <span className="inline-flex items-center rounded-full border border-indigo-100 bg-indigo-100 px-2 py-0.5 text-[11px] font-medium text-indigo-700">
                            Matches selected service
                          </span>
                        ) : null}
                      </div>

                      <div className="mt-1 text-sm text-slate-600">{bundle.summary}</div>
                      {!bundle.isAvailable ? (
                        <div className="mt-2 text-xs text-amber-700">
                          This bundle is unavailable for the currently selected client.
                        </div>
                      ) : null}
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        disabled={!bundle.isAvailable || savingBundleKey === bundle.key}
                        onClick={async () => {
                          if (isEditing) {
                            await finishBundleEditing(bundle.key);
                            return;
                          }
                          startBundleEditing(bundle.key);
                        }}
                      >
                        {savingBundleKey === bundle.key ? "Saving..." : isEditing ? "Done Editing" : "Edit Steps"}
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        disabled={!bundle.isAvailable || savingBundleKey === bundle.key}
                        onClick={() => addBundleStep(bundle.key)}
                      >
                        Add Step
                      </Button>
                      {isEditing ? (
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            disabled={savingBundleKey === bundle.key}
                            onClick={() => resetBundleDraft(bundle.key)}
                          >
                            Reset Steps
                        </Button>
                      ) : null}
                      {suggestedBundleKey ? (
                        isSelected ? (
                          <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                            Auto Applied
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                            Different service
                          </span>
                        )
                      ) : (
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          disabled={!bundle.isAvailable}
                          onClick={() => applyTaskBundle(bundle.key)}
                        >
                          {isSelected ? "Reapply Bundle" : "Use Bundle"}
                        </Button>
                      )}
                    </div>
                  </div>

                  <div className="mt-4 grid gap-2">
                    {bundle.steps.length ? (
                      bundle.steps.map((step, index) => (
                        <div
                          key={`${bundle.key}-step-${index}`}
                          className="rounded-lg border border-slate-200 bg-white px-3 py-2"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold text-slate-500">
                              <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-slate-700">
                                Step {index + 1}
                              </span>
                              {isEditing ? (
                                <select
                                  value={step.assignee}
                                  onChange={(e) =>
                                    updateBundleStep(bundle.key, index, { assignee: e.target.value })
                                  }
                                  className="rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500/20"
                                >
                                  <option value="accountant">Accountant</option>
                                  <option value="secretary">Secretary</option>
                                  <option value="owner">Owner</option>
                                </select>
                              ) : (
                                <span>{stepAssigneeLabel(step.assignee)}</span>
                              )}
                            </div>
                            {isEditing ? (
                              <Button
                                type="button"
                                variant="secondary"
                                size="sm"
                                disabled={savingBundleKey === bundle.key}
                                onClick={() => removeBundleStep(bundle.key, index)}
                              >
                                Remove Step
                              </Button>
                            ) : null}
                          </div>
                          {isEditing ? (
                            <textarea
                              rows={2}
                              value={step.text}
                              onChange={(e) =>
                                updateBundleStep(bundle.key, index, { text: e.target.value })
                              }
                              className="mt-2 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500/20"
                              placeholder="Describe the bundle step"
                            />
                          ) : (
                            <div className="mt-1 text-sm text-slate-700">{step.text}</div>
                          )}
                        </div>
                      ))
                    ) : (
                      <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-4 text-sm text-slate-500">
                        No bundle steps yet. Use Add Step to create one.
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-xs text-slate-600">
            Bundled steps are created with the task automatically. The inline Add Step action will still be available after creation if you need extra custom steps.
          </div>
        </div>
      </Modal>

      {canViewTaskLimit ? (
        <Modal
          open={staffWorkloadOpen}
          onClose={closeStaffWorkload}
          title="Staff Workload"
          description="View the total tasks assigned to each accountant and secretary."
          size="lg"
          footer={
            <Button type="button" variant="secondary" onClick={closeStaffWorkload}>
              Close
            </Button>
          }
        >
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600">
                Staff: {staffWorkloadRows.length}
              </span>
              <span className="inline-flex items-center rounded-full border border-indigo-100 bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700">
                Active tasks: {totalActiveTasksInWorkload}
              </span>
              <span className="inline-flex items-center rounded-full border border-amber-100 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">
                Limit: {workloadLimit}
              </span>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                <div>
                  <div className="text-sm font-semibold text-slate-800">Active workload limit</div>
                  <p className="mt-1 text-xs text-slate-500">
                    Staff are marked once they reach or go over this limit. Secretaries receive a notice when they assign past it.
                  </p>
                </div>
                {canManageTaskWorkloadLimit ? (
                  <TaskWorkloadLimitEditor
                    currentLimit={workloadLimit}
                    minLimit={MIN_TASK_WORKLOAD_LIMIT}
                    maxLimit={MAX_TASK_WORKLOAD_LIMIT}
                    loading={taskWorkloadLoading}
                    saving={taskWorkloadSaving}
                    onSave={handleSaveTaskWorkloadLimit}
                  />
                ) : (
                  <div className="text-xs text-slate-500">Only admins can change this limit.</div>
                )}
              </div>
            </div>

            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="7"></circle>
                  <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                </svg>
              </span>
              <input
                type="text"
                value={staffWorkloadSearch}
                onChange={(e) => setStaffWorkloadSearch(e.target.value)}
                placeholder="Search by staff name or role..."
                className="w-full rounded-xl border border-slate-300 bg-white py-2.5 pl-10 pr-3 text-sm outline-none focus:ring-2 focus:ring-indigo-500/20"
              />
            </div>

            {staffWorkloadRows.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                No accountant or secretary records found.
              </div>
            ) : filteredStaffWorkloadRows.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                No staff workload records match your search.
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-3">Name</th>
                      <th className="px-4 py-3">Role</th>
                      <th className="px-4 py-3 text-right">Active Tasks</th>
                      <th className="px-4 py-3 text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {filteredStaffWorkloadRows.map((staff) => {
                      const workloadLevel = getTaskWorkloadLevel(staff.totalTasks, workloadLimit);
                      const workloadStatusLabel =
                        workloadLevel === "over" ? "Over limit" : workloadLevel === "at" ? "At limit" : "Available";
                      const workloadStatusClass =
                        workloadLevel === "over"
                          ? "border-rose-200 bg-rose-50 text-rose-700"
                          : workloadLevel === "at"
                          ? "border-amber-200 bg-amber-50 text-amber-700"
                          : "border-emerald-200 bg-emerald-50 text-emerald-700";

                      return (
                        <tr key={staff.id} className="hover:bg-slate-50/80">
                          <td className="px-4 py-3 font-medium text-slate-800">{staff.name}</td>
                          <td className="px-4 py-3">
                            <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-600">
                              {staff.role}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right font-semibold text-slate-900">
                            {staff.totalTasks} / {workloadLimit}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${workloadStatusClass}`}>
                              {workloadStatusLabel}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </Modal>
      ) : null}

      <Modal
        open={Boolean(taskAssigneeEditOpen && taskAssigneeEditCtx)}
        onClose={closeTaskAssigneeEdit}
        title={taskAssigneeEditCtx ? `Edit ${taskAssigneeEditCtx.taskLabel}` : "Edit Task"}
        description="Task details"
        size="sm"
        footer={
          <>
            <Button type="button" variant="secondary" onClick={closeTaskAssigneeEdit}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={saveTaskAssigneeEdit}
              disabled={taskAssigneeSaving}
            >
              {taskAssigneeSaving ? "Saving..." : "Save"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Priority</label>
            <select
              value={taskPriorityEditValue}
              onChange={(event) => {
                setTaskPriorityEditValue(event.target.value);
                setTaskEditError("");
              }}
              disabled={taskAssigneeSaving}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500/20 disabled:cursor-not-allowed disabled:bg-slate-100"
            >
              <option value="Low">Low</option>
              <option value="Medium">Medium</option>
              <option value="High">High</option>
            </select>
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Current assignee</div>
            <div className="mt-1 text-sm font-medium text-slate-800">
              {taskAssigneeEditCtx?.currentAssigneeName || "Unassigned"}
            </div>
            <div className="mt-1 text-[11px] text-slate-500">
              {taskAssigneeEditCtx?.serviceName
                ? `Showing matching accountants and all secretaries for ${taskAssigneeEditCtx.serviceName}.`
                : "Choose an accountant or secretary for this task."}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Assign To (Accountant or Secretary)</label>
            <select
              value={taskAssigneeEditValue}
              onChange={(event) => {
                setTaskAssigneeEditValue(event.target.value);
                setTaskEditError("");
              }}
              disabled={taskAssigneeSaving || taskAssigneeOptions.length === 0}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500/20 disabled:cursor-not-allowed disabled:bg-slate-100"
            >
              <option value="">Select assignee</option>
              {taskAssigneeOptions.map((accountant) => {
                const roleLabel = getReadableUserRole(accountant);
                const specialization = getAccountantSpecialization(accountant);
                const name = accountant.username || `User #${accountant.id}`;
                return (
                  <option key={accountant.id} value={String(accountant.id)}>
                    {specialization ? `${name} (${roleLabel} - ${specialization})` : `${name} (${roleLabel})`}
                  </option>
                );
              })}
            </select>
            {isTaskAssigneeEditActive && taskAssigneeOptions.length === 0 ? (
              <div className="mt-2 text-[11px] text-rose-600">No assignees are available for the selected service.</div>
            ) : null}
            {isTaskAssigneeEditActive && taskAssigneeEditCtx?.hasLegacyAssignee && !taskAssigneeCurrentMatchesService ? (
              <div className="mt-2 text-[11px] text-amber-700">
                The current assignee does not match this service, but it remains selectable until you save a new assignment.
              </div>
            ) : null}
          </div>

          {selectedTaskAssigneeIsSecretary ? (
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Partner Accountant</label>
              <PartnerAccountantPicker
                accountants={taskPartnerOptions}
                value={taskPartnerEditValue}
                onChange={(partnerId) => {
                  setTaskPartnerEditValue(partnerId);
                  setTaskEditError("");
                }}
                serviceName={taskAssigneeEditCtx?.serviceName || ""}
                filterByService={!isProcessingService(taskAssigneeEditCtx?.serviceName || "")}
                disabled={taskAssigneeSaving || taskPartnerOptions.length === 0}
              />
              <div className="mt-2 text-[11px] text-slate-500">
                Required for secretary-assigned tasks.
              </div>
              {taskPartnerOptions.length === 0 ? (
                <div className="mt-2 text-[11px] text-rose-600">
                  {isProcessingService(taskAssigneeEditCtx?.serviceName || "")
                    ? "No partner accountant is available yet."
                    : "No partner accountant matches this task specialization yet."}
                </div>
              ) : null}
              {selectedTaskPartnerAccountant ? (
                <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                  <div className="text-sm font-medium text-slate-900">
                    {selectedTaskPartnerAccountant.username || `User #${selectedTaskPartnerAccountant.id}`}
                  </div>
                  <div className="mt-1 text-[11px] text-slate-600">
                    {getAccountantSpecialization(selectedTaskPartnerAccountant) || "Accountant"}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          {isTaskAssigneeEditActive && selectedTaskAssignee ? (
            <div className="rounded-lg border border-indigo-100 bg-indigo-50 px-3 py-2">
              <div className="text-sm font-medium text-slate-900">
                {selectedTaskAssignee.username || `User #${selectedTaskAssignee.id}`}
              </div>
              <div className="mt-1 text-[11px] text-slate-600">
                {getReadableUserRole(selectedTaskAssignee)}
                {getAccountantSpecialization(selectedTaskAssignee)
                  ? ` - ${getAccountantSpecialization(selectedTaskAssignee)}`
                  : ""}
              </div>
              <div className="mt-2 text-[11px] text-slate-500">
                Active tasks: {selectedTaskAssigneeWorkload?.totalTasks || 0} / {workloadLimit}
              </div>
            </div>
          ) : null}

          {isTaskAssigneeEditActive && taskEditError ? (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {taskEditError}
            </div>
          ) : null}
        </div>
      </Modal>

      {/* Step Edit Floating Card */}
      <Modal
        open={Boolean(stepEditOpen && stepEditCtx)}
        onClose={closeStepEdit}
        title={stepEditCtx ? `Edit Step ${Number(stepEditCtx.stepIndex) + 1}` : "Edit Step"}
        description="To-Do Step"
        size="sm"
        footer={
          <>
            <Button type="button" variant="secondary" onClick={closeStepEdit}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={saveStepEdit}
              disabled={stepLoading || !String(stepEditValue || "").trim()}
            >
              Save
            </Button>
          </>
        }
      >
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Step owner</label>
          <select
            value={stepEditAssignee}
            onChange={(e) => setStepEditAssignee(normalizeStepAssignee(e.target.value, "accountant"))}
            className="mb-3 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500/20"
          >
            <option value="accountant">Accountant</option>
            <option value="secretary">Secretary</option>
            <option value="owner">Owner</option>
          </select>

          <label className="mb-1 block text-xs font-medium text-slate-600">Step text</label>
          <textarea
            rows={3}
            value={stepEditValue}
            onChange={(e) => setStepEditValue(e.target.value)}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500/20"
            placeholder="Enter step details..."
            autoFocus
          />
          <div className="mt-1 text-[11px] text-slate-500">This updates the task description step line.</div>
        </div>
      </Modal>
    </div>
  );
}

// Inline Add Row Component (Monday.com-like "+ Add task" row)
function InlineAddRow({
  onAdd,
  onAddNextStep,
  initialForm,
  setParentForm,
  clients,
  accountants,
  services,
  loading,
  variant,
  defaultAccountantId,
}) {
  // Local state per-card to avoid mirroring typed values across multiple cards.
  const [localForm, setLocalForm] = useState(() => ({
    // Only require the step text. Metadata is derived from the main task.
    client_id: initialForm?.client_id || "",
    service_name: initialForm?.service_name || "",
    priority: initialForm?.priority || "Low",
    due_date: initialForm?.due_date || "",
    accountant_id: defaultAccountantId || initialForm?.accountant_id || "",
    step_owner: "accountant",
    title: "",
    description: "",
  }));

  // Keep parent form in sync for the shared required fields (client/service/priority/due date).
  // Keep title/description mostly local so typing doesn't mirror into other cards.
  useEffect(() => {
    setLocalForm((prev) => {
      // Sync only shared fields from the parent form.
      // IMPORTANT: do NOT sync `title` from parent.
      // Also: only sync service_name when parent has a value;
      // when the Create Task form resets (service_name becomes ""),
      // we keep the previous service_name so inline add continues to work.
      const next = {
        ...prev,
        client_id: initialForm.client_id,
        priority: initialForm.priority,
        due_date: initialForm.due_date,
      };
      if (String(initialForm.service_name || "").trim()) {
        next.service_name = initialForm.service_name;
      }
      // If parent accountant changes (shouldn't often), keep local aligned
      if (defaultAccountantId) next.accountant_id = defaultAccountantId;
      return next;
    });
  }, [initialForm.client_id, initialForm.service_name, initialForm.priority, initialForm.due_date, defaultAccountantId]);

  const onChange = (e) => {
    const { name, value } = e.target;
    setLocalForm((f) => ({ ...f, [name]: value }));
    // Only propagate shared fields to parent to avoid duplication/mirroring across cards
    if (["client_id", "service_name", "priority", "due_date"].includes(name)) {
      setParentForm((f) => ({ ...f, [name]: value }));
    }
  };

  const monday = variant === "monday";

  const onKeyDown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      // Enter should only quick-add when the required fields are already set
      const title = String(localForm.title || "").trim();
      if (!title) return;
      if (!String(localForm.client_id || "").trim()) return;
      if (!String(localForm.accountant_id || "").trim()) return;
      if (!String(localForm.priority || "").trim()) return;
      if (!String(localForm.due_date || "").trim()) return;

      if (typeof onAddNextStep === "function") {
        onAddNextStep(e, localForm);
      } else {
        // Fallback
        setParentForm((f) => ({
          ...f,
          title: localForm.title,
          description: localForm.description,
          accountant_id: localForm.accountant_id,
        }));
        onAdd(e);
      }

      // Clear only local inputs
      setLocalForm((f) => ({ ...f, title: "", description: "" }));
    }
  };

  return (
    <div className={monday ? "grid grid-cols-12 items-center bg-white" : "grid grid-cols-12 gap-0 items-center px-5 py-3 bg-white"}>
      {/* No checkbox for the inline add-step row */}

      <div className={monday ? "col-span-12 px-3 py-3" : "col-span-12"}>
        <input
          name="title"
          value={localForm.title}
          onChange={onChange}
          onKeyDown={onKeyDown}
          placeholder="+ Add Next Step Task"
          className="w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500/20"
        />
        <div className="mt-2 flex items-center gap-2">
          <label className="text-[11px] font-medium text-slate-600">Step owner</label>
          <select
            name="step_owner"
            value={localForm.step_owner || "accountant"}
            onChange={onChange}
            className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-indigo-500/20"
          >
            <option value="accountant">Accountant</option>
            <option value="secretary">Secretary</option>
            <option value="owner">Owner</option>
          </select>
        </div>
      </div>

      {!monday && (
        <div className="col-span-12 flex justify-start mt-2">
          <Button
            type="button"
            size="sm"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (typeof onAddNextStep === "function") {
                onAddNextStep(e, localForm);
              } else {
                // Fallback
                setParentForm((f) => ({
                  ...f,
                  title: localForm.title,
                  description: localForm.description,
                  accountant_id: localForm.accountant_id,
                }));
                onAdd(e);
              }
              setLocalForm((f) => ({ ...f, title: "", description: "" }));
            }}
            disabled={loading}
            className="gap-2"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-3.5 w-3.5 text-white"><path d="M11 11V6h2v5h5v2h-5v5h-2v-5H6v-2h5Z" /></svg>
            <span>{loading ? "Adding..." : "Add Next Step Task"}</span>
          </Button>
        </div>
      )}

      {monday && (
        <div className="col-span-12 px-3 pb-3">
          <Button
            type="button"
            size="sm"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (typeof onAddNextStep === "function") {
                onAddNextStep(e, localForm);
              } else {
                // Fallback
                setParentForm((f) => ({
                  ...f,
                  title: localForm.title,
                  description: localForm.description,
                  accountant_id: localForm.accountant_id,
                }));
                onAdd(e);
              }
              setLocalForm((f) => ({ ...f, title: "", description: "" }));
            }}
            disabled={loading}
            className="gap-2"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-3.5 w-3.5 text-white"><path d="M11 11V6h2v5h5v2h-5v5h-2v-5H6v-2h5Z" /></svg>
            <span>{loading ? "Add Next Step Task" : "Add Next Step Task"}</span>
          </Button>
        </div>
      )}
    </div>
  );
}
