import React, { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Swal from "sweetalert2";
import { api, fetchAvailableServices } from "../../services/api";
import { Button } from "../../components/UI/buttons";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/UI/card";
import { Modal } from "../../components/UI/modal";
import { useModulePermissions } from "../../context/ModulePermissionsContext";
import { useAuth } from "../../hooks/useAuth";
import ArchiveTasksCompleted from "./archive_tasks_completed";
import { getAutoDueDateForService, getEstimatedServiceDuration } from "../../utils/serviceDurations";
import { hasFeatureActionAccess } from "../../utils/module_permissions";
import { findClientById, getClientId, matchesClientId } from "../../utils/client_identity";
import { joinPersonName } from "../../utils/person_name";
import { remapIndexedStepMeta } from "../../utils/task_step_metadata";
import { useErrorToast } from "../../utils/feedback";

const ARCHIVED_TAG_RE = /^\s*\[Archived\]\s*(?:1|true|yes)?\s*$/i;
const SECRETARY_ARCHIVED_TAG_RE = /^\s*\[SecretaryArchived\]\s*(?:1|true|yes)?\s*$/i;
const STEP_LINE_RE = /^\s*Step\s+(\d+)(?:\s*\((Owner|Accountant|Secretary)\))?\s*:\s*(.*)$/i;
const STEP_DONE_RE = /^\s*\[StepDone\]\s*([^\r\n]*)\s*$/i;
const PROGRESS_RE = /^\s*\[Progress\]\s*(\d{1,3})\s*$/i;

const normalizeTaskIds = (ids) =>
  Array.from(
    new Set(
      (Array.isArray(ids) ? ids : [])
        .map((id) => String(id || "").trim())
        .filter(Boolean)
    )
  );

const areTaskIdListsEqual = (left, right) => {
  const a = normalizeTaskIds(left);
  const b = normalizeTaskIds(right);
  if (a.length !== b.length) return false;
  return a.every((id, index) => id === b[index]);
};

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

const getTaskCreatorLabel = (task) => {
  const direct = String(task?.created_by_name || task?.created_by_username || "").trim();
  if (direct) return direct;

  const creatorId = Number(task?.created_by || 0);
  return creatorId > 0 ? `User #${creatorId}` : "-";
};

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

const parseCompletedStepNumbers = (descriptionRaw) => {
  const lines = String(descriptionRaw || "").split(/\r?\n/);
  const set = new Set();

  for (const line of lines) {
    const match = String(line || "").match(STEP_DONE_RE);
    if (!match) continue;
    const values = String(match[1] || "")
      .split(/[,\s]+/)
      .map((token) => parseInt(token, 10))
      .filter((n) => Number.isInteger(n) && n > 0);
    values.forEach((n) => set.add(n));
  }

  return set;
};

const setCompletedStepNumbers = (descriptionRaw, completedSet) => {
  const numbers = Array.from(completedSet || [])
    .map((n) => parseInt(n, 10))
    .filter((n) => Number.isInteger(n) && n > 0)
    .sort((a, b) => a - b);

  const lines = String(descriptionRaw || "").split(/\r?\n/);
  const nextLines = [];
  let written = false;

  for (const line of lines) {
    if (STEP_DONE_RE.test(String(line || ""))) {
      if (!written && numbers.length > 0) {
        nextLines.push(`[StepDone] ${numbers.join(",")}`);
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
    nextLines.push(`[StepDone] ${numbers.join(",")}`);
  }

  return nextLines.join("\n").trim();
};

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

const getProgress = (task) => {
  const desc = String(task?.description || "");
  const m = desc.match(/^\s*\[Progress\]\s*(\d{1,3})\s*$/im);
  const p = m ? parseInt(m[1], 10) : 0;
  if (Number.isNaN(p)) return 0;
  return Math.max(0, Math.min(100, p));
};

const isTaskCompleted = (task) => {
  const progress = getProgress(task);
  const status = String(task?.status || "").trim().toLowerCase();
  return progress >= 100 || ["done", "completed"].includes(status);
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
  const compact = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");

  if (!compact) return "";
  if (compact === "booking" || compact.includes("bookkeep")) return "bookkeeping";
  if (compact.includes("taxfil")) return "taxfiling";
  if (compact.includes("audit")) return "auditing";
  if (compact.includes("taxcomp")) return "taxcomputation";
  return compact;
}

const TASK_BUNDLE_TEMPLATES = [
  {
    key: "taxfiling",
    label: "Tax Filing Bundle",
    serviceName: "Tax Filing",
    summary: "Ready-made filing workflow from document collection up to submission proof.",
    steps: [
      { assignee: "secretary", text: "Collect and validate the client's tax source documents for the filing period." },
      { assignee: "accountant", text: "Review records and reconcile transactions that affect the tax filing." },
      { assignee: "accountant", text: "Prepare the tax return and compute the amount due or refund." },
      { assignee: "owner", text: "Review the prepared return and approve it before submission." },
      { assignee: "secretary", text: "Submit the filing and save the official proof of submission." },
    ],
  },
  {
    key: "auditing",
    label: "Auditing Bundle",
    serviceName: "Auditing",
    summary: "Standard audit flow for requirements, testing, review, and report release.",
    steps: [
      { assignee: "secretary", text: "Request the audit requirements and prior records from the client." },
      { assignee: "accountant", text: "Organize the working papers and supporting schedules." },
      { assignee: "accountant", text: "Perform audit testing and document the findings." },
      { assignee: "owner", text: "Review the findings and approve the final audit report." },
      { assignee: "secretary", text: "Release the completed audit report to the client." },
    ],
  },
  {
    key: "bookkeeping",
    label: "Book Keeping Bundle",
    serviceName: "Book Keeping",
    summary: "Recurring bookkeeping flow for encoding, reconciliation, and report review.",
    steps: [
      { assignee: "secretary", text: "Collect bookkeeping documents, receipts, and supporting files from the client." },
      { assignee: "accountant", text: "Record and categorize the transactions for the covered period." },
      { assignee: "accountant", text: "Reconcile the bank records and subsidiary ledgers." },
      { assignee: "accountant", text: "Prepare the bookkeeping summary and draft reports." },
      { assignee: "owner", text: "Review the reports and confirm the bookkeeping output." },
    ],
  },
  {
    key: "taxcomputation",
    label: "Tax Computation Bundle",
    serviceName: "Tax Computation",
    summary: "Template for validating records, computing taxes due, and final client-ready output.",
    steps: [
      { assignee: "secretary", text: "Gather income, expense, and deductible documents needed for tax computation." },
      { assignee: "accountant", text: "Validate the source records and prepare the tax computation worksheet." },
      { assignee: "accountant", text: "Compute taxes due and document adjustments or discrepancies." },
      { assignee: "owner", text: "Review the computation and approve the finalized figures." },
      { assignee: "secretary", text: "Send the approved tax computation summary to the client." },
    ],
  },
  {
    key: "processing",
    label: "Processing Bundle",
    serviceName: "Processing",
    summary: "Default processing flow for requirements checking, forms, review, and submission tracking.",
    steps: [
      { assignee: "secretary", text: "Confirm the client's requirements and identify missing documents." },
      { assignee: "secretary", text: "Prepare the processing checklist and required forms." },
      { assignee: "accountant", text: "Review the submitted details and attachments for completeness." },
      { assignee: "secretary", text: "Submit the processed documents and track the status update." },
    ],
  },
];

function findTaskBundleTemplate(bundleKey) {
  return TASK_BUNDLE_TEMPLATES.find((template) => template.key === bundleKey) || null;
}

function cloneBundleSteps(steps) {
  return (Array.isArray(steps) ? steps : []).map((step) => ({
    assignee: normalizeStepAssignee(step?.assignee, "accountant"),
    text: String(step?.text || ""),
  }));
}

function getTaskBundleTemplateKey(serviceName) {
  const serviceKey = normalizeServiceMatchKey(serviceName);
  if (!serviceKey) return "";

  return (
    TASK_BUNDLE_TEMPLATES.find(
      (template) => normalizeServiceMatchKey(template.serviceName) === serviceKey
    )?.key || ""
  );
}

function resolveTaskBundleServiceName(bundle, availableServices) {
  const bundleKey = normalizeServiceMatchKey(bundle?.serviceName);
  const matchedService = (Array.isArray(availableServices) ? availableServices : []).find(
    (service) => normalizeServiceMatchKey(service?.name || "") === bundleKey
  );

  return String(matchedService?.name || bundle?.serviceName || "").trim();
}

function getAccountantSpecialization(accountant) {
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

function accountantMatchesService(accountant, serviceName) {
  if (isSecretaryUser(accountant)) return true;
  const serviceKey = normalizeServiceMatchKey(serviceName);
  if (!serviceKey) return true;
  return normalizeServiceMatchKey(getAccountantSpecialization(accountant)) === serviceKey;
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

  // To-Do filters
  const [todoSearch, setTodoSearch] = useState("");
  const [todoStatus, setTodoStatus] = useState("All"); // All | Completed | Uncompleted
  const [todoPriority, setTodoPriority] = useState("All"); // All | Low | Medium | High

  // Step edit floating card
  const [stepEditOpen, setStepEditOpen] = useState(false);
  const [stepEditCtx, setStepEditCtx] = useState(null); // { taskId, taskStatus, isCompleted, stepIndex, currentText }
  const [stepEditValue, setStepEditValue] = useState("");
  const [stepEditAssignee, setStepEditAssignee] = useState("accountant");
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [selectedTaskIds, setSelectedTaskIds] = useState([]);
  const [archiveLoading, setArchiveLoading] = useState(false);
  const [staffWorkloadOpen, setStaffWorkloadOpen] = useState(false);
  const [staffWorkloadSearch, setStaffWorkloadSearch] = useState("");
  const [bundlePickerOpen, setBundlePickerOpen] = useState(false);
  const [selectedBundleKey, setSelectedBundleKey] = useState("");
  const [editingBundleKey, setEditingBundleKey] = useState("");
  const [bundleDraftSteps, setBundleDraftSteps] = useState({});
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
  const activeClients = useMemo(() => {
    return (Array.isArray(clients) ? clients : []).filter(isActiveClient);
  }, [clients]);
  const matchingAccountants = useMemo(() => {
    return (Array.isArray(accountants) ? accountants : []).filter((accountant) =>
      accountantMatchesService(accountant, form.service_name || form.title)
    );
  }, [accountants, form.service_name, form.title]);
  const canCreateTask = hasFeatureActionAccess(user, "tasks", "create-task", permissions);
  const canEditStep = hasFeatureActionAccess(user, "tasks", "edit-step", permissions);
  const canRemoveStep = hasFeatureActionAccess(user, "tasks", "remove-step", permissions);
  const selectedServiceDuration = useMemo(
    () => getEstimatedServiceDuration(form.service_name || form.title),
    [form.service_name, form.title]
  );
  const suggestedBundleKey = useMemo(
    () => getTaskBundleTemplateKey(form.service_name || form.title),
    [form.service_name, form.title]
  );
  const bundleTemplates = useMemo(() => {
    return TASK_BUNDLE_TEMPLATES.map((template) => {
      const resolvedServiceName = resolveTaskBundleServiceName(template, services);
      const isAvailable = !form.client_id || Boolean(resolvedServiceName);
      const draftSteps = bundleDraftSteps[template.key];

      return {
        ...template,
        serviceName: resolvedServiceName || template.serviceName,
        isAvailable,
        steps: cloneBundleSteps(draftSteps || template.steps),
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
  const allTaskIds = useMemo(
    () => normalizeTaskIds((Array.isArray(tasks) ? tasks : []).map((task) => getTaskKey(task))),
    [tasks]
  );
  const allTaskIdSet = useMemo(() => new Set(allTaskIds), [allTaskIds]);
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
  const selectedTaskIdSet = useMemo(() => new Set(selectedTaskIds), [selectedTaskIds]);

  useEffect(() => {
    let stop = false;
    (async () => {
      try {
        const [c, t, u] = await Promise.all([
          api.get("client_list.php"),
          api.get("task_list.php"),
          api.get("user_list.php"),
        ]);
        if (!stop) {
          setClients(Array.isArray(c.data?.clients) ? c.data.clients : []);
          setDidLoadClients(true);
          if (Array.isArray(t.data?.tasks)) setTasks(t.data.tasks);
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

        const nextServices = Array.isArray(response?.data?.services)
          ? response.data.services
          : [];

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
    setSelectedTaskIds((current) => {
      const next = normalizeTaskIds(current).filter((id) => allTaskIdSet.has(id) && !archivedTaskIdSet.has(id));
      return areTaskIdListsEqual(current, next) ? current : next;
    });
  }, [allTaskIdSet, archivedTaskIdSet]);

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
    const appointment = location.state?.prefillTaskFromAppointment;
    if (!appointment) return undefined;

    const nextClientId = String(appointment?.clientId || "").trim();
    const nextServiceName = String(appointment?.serviceName || "").trim();
    const nextDueDate = String(appointment?.date || "").trim();

    if (!nextClientId || !nextServiceName) {
      setError("The selected appointment is missing a client or service.");
      navigate(location.pathname, { replace: true, state: {} });
      return undefined;
    }

    const autoBundleKey = getTaskBundleTemplateKey(nextServiceName);
    const fallbackDueDate = getAutoDueDateForService(nextServiceName) || "";

    setForm((current) => ({
      ...current,
      client_id: nextClientId,
      title: nextServiceName,
      service_name: nextServiceName,
      accountant_id: "",
      due_date: nextDueDate || fallbackDueDate,
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
    const autoBundleKey = getTaskBundleTemplateKey(value);
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
      if (current[bundleKey]) return current;
      return {
        ...current,
        [bundleKey]: cloneBundleSteps(findTaskBundleTemplate(bundleKey)?.steps),
      };
    });
    setEditingBundleKey(bundleKey);
  };

  const updateBundleStep = (bundleKey, stepIndex, changes) => {
    setBundleDraftSteps((current) => {
      const source = cloneBundleSteps(current[bundleKey] || findTaskBundleTemplate(bundleKey)?.steps);
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
      const source = cloneBundleSteps(current[bundleKey] || findTaskBundleTemplate(bundleKey)?.steps);
      source.push({ assignee: "accountant", text: "New bundle step" });
      return {
        ...current,
        [bundleKey]: source,
      };
    });
    setEditingBundleKey(bundleKey);
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
    if (!String(form.priority || "").trim()) {
      setError("Please select a priority.");
      return;
    }
    if (!String(form.due_date || "").trim()) {
      setError("Please select a due date.");
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

        setSuccess("Task created successfully.");
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
        });
        setSelectedAppointmentId("");
        setSelectedBundleKey("");
        setEditingBundleKey("");
        setTimeout(() => setSuccess(""), 1500);
      } else {
        setError(res?.data?.message || "Failed to create task.");
      }
    } catch (err) {
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
    const nextBundleKey = suggestedBundleKey || "";
    setSelectedBundleKey((current) => (current === nextBundleKey ? current : nextBundleKey));

    if (!nextBundleKey || (editingBundleKey && editingBundleKey !== nextBundleKey)) {
      setEditingBundleKey("");
    }
  }, [editingBundleKey, suggestedBundleKey]);

  // Derived data
  const quickStats = useMemo(() => {
    const data = { total: tasks.length, pending: 0, declined: 0, completed: 0, cancelled: 0, progress: 0 };
    tasks.forEach((t) => {
      const s = (t.status || "pending").toLowerCase();
      if (s === "completed") data.completed += 1;
      else if (s === "declined") data.declined += 1;
      else if (s === "in progress") data.progress += 1;
      else if (s === "cancelled") data.cancelled += 1;
      else data.pending += 1;
    });
    return data;
  }, [tasks]);

  const staffWorkloadRows = useMemo(() => {
    const taskCountsByStaffId = new Map();

    (Array.isArray(tasks) ? tasks : []).forEach((task) => {
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

  const sortedTodoTasks = useMemo(() => sortTasksNewestFirst(tasks), [tasks]);

  const archivedTodoTasks = useMemo(
    () => sortedTodoTasks.filter((task) => isTaskArchived(task)),
    [sortedTodoTasks]
  );

  const filteredTodoTasks = useMemo(() => {
    return sortedTodoTasks.filter((task) => {
      const taskKey = getTaskKey(task);
      if (!taskKey || archivedTaskIdSet.has(taskKey)) return false;

      const clientName = String(task.client_name || "");
      const query = todoSearch.trim().toLowerCase();
      if (query && !clientName.toLowerCase().includes(query)) return false;

      const completed = isTaskCompleted(task);
      if (todoStatus === "Completed" && !completed) return false;
      if (todoStatus === "Uncompleted" && completed) return false;

      const priority = parsePriority(task.description);
      if (todoPriority !== "All" && String(priority).toLowerCase() !== String(todoPriority).toLowerCase()) return false;

      return true;
    });
  }, [sortedTodoTasks, archivedTaskIdSet, todoSearch, todoStatus, todoPriority]);

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

  const archiveTasks = (taskIds) => {
    const ids = normalizeTaskIds(taskIds).filter((id) => allTaskIdSet.has(id) && !archivedTaskIdSet.has(id));
    if (ids.length === 0) return;

    const taskMap = new Map((Array.isArray(tasks) ? tasks : []).map((task) => [getTaskKey(task), task]));

    const run = async () => {
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
        setSelectedTaskIds((current) => current.filter((id) => !ids.includes(id)));
        setSuccess(ids.length === 1 ? "Task archived." : `${ids.length} tasks archived.`);
        setTimeout(() => setSuccess(""), 1200);
      } catch (err) {
        setError(err?.response?.data?.message || err?.message || "Failed to archive task.");
      } finally {
        setArchiveLoading(false);
      }
    };

    void run();
  };

  const toggleTaskSelection = (taskId) => {
    const normalizedId = String(taskId || "").trim();
    if (!normalizedId || archivedTaskIdSet.has(normalizedId)) return;

    setSelectedTaskIds((current) => {
      const ids = normalizeTaskIds(current);
      if (ids.includes(normalizedId)) {
        return ids.filter((id) => id !== normalizedId);
      }
      return [...ids, normalizedId];
    });
  };

  const closeStaffWorkload = () => {
    setStaffWorkloadOpen(false);
    setStaffWorkloadSearch("");
  };

  const closeStepEdit = () => {
    setStepEditOpen(false);
    setStepEditCtx(null);
    setStepEditValue("");
    setStepEditAssignee("accountant");
  };

  const saveStepEdit = async () => {
    if (!canEditStep) {
      setError("You do not have permission to edit task steps.");
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
          <CardDescription>
            Use Select Client (F2F) for walk-in tasks, or open Client Appointments to load an approved appointment here before assigning an accountant or secretary.
          </CardDescription>
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
                  placeholder="Search by client name..."
                  className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>

              <select
                value={todoStatus}
                onChange={(e) => setTodoStatus(e.target.value)}
                className="min-w-[150px] flex-[1_1_160px] rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500/20 xl:w-[160px] xl:flex-none"
              >
                <option>All</option>
                <option>Completed</option>
                <option>Uncompleted</option>
              </select>

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

              <div className="flex basis-full flex-col gap-3 sm:basis-auto sm:flex-row sm:flex-nowrap sm:justify-end xl:flex-none">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => archiveTasks(selectedTaskIds)}
                  disabled={selectedTaskIds.length === 0 || archiveLoading}
                  className="w-full justify-center gap-2 sm:min-w-[190px] sm:w-auto sm:flex-none"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M7 3v4" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17 3v4" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 11h16" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 7h14a1 1 0 0 1 1 1v10a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V8a1 1 0 0 1 1-1Z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="m10 15 2 2 4-4" />
                  </svg>
                  <span>{selectedTaskIds.length > 0 ? `Archive Selected (${selectedTaskIds.length})` : "Archive Selected"}</span>
                </Button>

                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setArchiveOpen(true)}
                  className="w-full justify-center gap-2 sm:min-w-[170px] sm:w-auto sm:flex-none"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 7.5h18" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 7.5V18a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7.5" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 7.5 6 4h12l1.5 3.5" />
                  </svg>
                  <span>View Archive</span>
                </Button>
              </div>
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
                  No matching tasks found.
                </div>
              </div>
            );
          }

          return filteredTodoTasks.map((t) => {
            const taskId = t.id || t.task_id;
            const taskKey = getTaskKey(t) || String(taskId || "");
            const accId = String(t.accountant_id || "");
            const accName = t.accountant_name || accountants.find((a) => String(a.id) === accId)?.username || (accId ? `Accountant #${accId}` : "Unassigned");
            const creatorLabel = getTaskCreatorLabel(t);
            const serviceName = String(t.service_name || t.title || t.name || "").trim() || "Uncategorized";
            const serviceDuration = getEstimatedServiceDuration(serviceName);

            const isCompleted = isTaskCompleted(t);
            const isSelected = selectedTaskIdSet.has(taskKey);

            const cardClassName = isCompleted
              ? "rounded-xl border border-emerald-200 bg-emerald-50/40 shadow-sm overflow-hidden"
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
              const filteredSteps = steps.filter((_, idx) => idx !== stepIndex);

              const nextDone = new Set();
              steps.forEach((_, oldIdx) => {
                if (oldIdx === stepIndex) return;
                const oldNumber = oldIdx + 1;
                if (!doneSet.has(oldNumber)) return;
                const newNumber = oldIdx < stepIndex ? oldNumber : oldNumber - 1;
                nextDone.add(newNumber);
              });

              let nextDescription = replaceTaskSteps(baseDescription, filteredSteps);
              nextDescription = setCompletedStepNumbers(nextDescription, nextDone);
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
                <div className={`px-5 py-3 border-b ${isCompleted ? "border-emerald-200 bg-emerald-50/60" : "border-slate-200 bg-white"}`}>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex min-w-0 items-center gap-3">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleTaskSelection(taskKey)}
                        disabled={archiveLoading}
                        className="h-4 w-4 shrink-0 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                        aria-label={`Select ${t.title || t.name || serviceName}`}
                      />

                      <div className="flex min-w-0 items-center gap-2">
                        <span className={isCompleted ? "text-emerald-700 text-sm font-semibold" : "text-indigo-600 text-sm font-semibold"}>
                          To-Do
                        </span>
                        {isCompleted && (
                          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                            <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-600" />
                            Completed
                          </span>
                        )}
                        <span className="text-sm font-medium text-slate-800 truncate">{t.client_name || "Client"}</span>
                        <span className="text-xs text-slate-400">|</span>
                        <span className={isCompleted ? "text-sm font-medium text-emerald-700 truncate" : "text-sm font-medium text-indigo-500 truncate"}>
                          {serviceName}
                        </span>
                        {serviceDuration ? (
                          <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                            {serviceDuration}
                          </span>
                        ) : null}
                      </div>
                    </div>

                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => archiveTasks([taskKey])}
                      disabled={archiveLoading}
                      className="justify-center gap-2 sm:self-start"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 7.5h18" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 7.5V18a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7.5" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 7.5 6 4h12l1.5 3.5" />
                      </svg>
                      <span>Archive</span>
                    </Button>
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
                      <div className="inline-flex items-center gap-2 text-sm text-slate-700 min-w-0">
                        <span className="inline-grid place-items-center h-7 w-7 rounded-full bg-slate-100 text-slate-500">
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4Zm0 2c-3.33 0-6 2.24-6 5v1h12v-1c0-2.76-2.67-5-6-5Z" /></svg>
                        </span>
                        <span className="truncate">{accName}</span>
                      </div>
                    </div>
                    <div className="col-span-2 px-3 py-2 flex items-center">
                      <PriorityPill description={t.description} />
                    </div>
                    <div className="col-span-2 px-3 py-2 text-sm text-slate-700 flex items-center">
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

                        {canEditStep || canRemoveStep ? (
                          <div className="col-span-2 px-3 py-2 flex items-center justify-end">
                            <div className="flex items-center gap-2">
                              {canEditStep ? (
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
                            const nextDone = new Set([...doneSet].filter((n) => n > 0 && n <= nextSteps.length));
                            updatedDesc = setCompletedStepNumbers(updatedDesc, nextDone);
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
                        disabled={!bundle.isAvailable}
                        onClick={() => {
                          if (isEditing) {
                            setEditingBundleKey("");
                            return;
                          }
                          startBundleEditing(bundle.key);
                        }}
                      >
                        {isEditing ? "Done Editing" : "Edit Steps"}
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        disabled={!bundle.isAvailable}
                        onClick={() => addBundleStep(bundle.key)}
                      >
                        Add Step
                      </Button>
                      {isEditing ? (
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
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
                    {bundle.steps.map((step, index) => (
                      <div
                        key={`${bundle.key}-step-${index}`}
                        className="rounded-lg border border-slate-200 bg-white px-3 py-2"
                      >
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
                          <textarea
                            rows={2}
                            value={step.text}
                            onChange={(e) =>
                              updateBundleStep(bundle.key, index, { text: e.target.value })
                            }
                            className="mt-2 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500/20"
                          />
                        ) : (
                          <div className="mt-1 text-sm text-slate-700">{step.text}</div>
                        )}
                      </div>
                    ))}
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
              Total tasks: {quickStats.total}
            </span>
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
                    <th className="px-4 py-3 text-right">Total Tasks Handled</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {filteredStaffWorkloadRows.map((staff) => (
                    <tr key={staff.id} className="hover:bg-slate-50/80">
                      <td className="px-4 py-3 font-medium text-slate-800">{staff.name}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-600">
                          {staff.role}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-slate-900">{staff.totalTasks}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
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
