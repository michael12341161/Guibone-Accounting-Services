import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Modal } from "../../components/UI/modal";
import { api } from "../../services/api";
import { useErrorToast } from "../../utils/feedback";
import { joinPersonName, normalizeNameForComparison } from "../../utils/person_name";
import {
  formatStepDateTime,
  parseStepCompletionTimestamps,
  parseStepRemarks,
  parseStepRemarkTimestamps,
} from "../../utils/task_step_metadata";

const STEP_LINE_RE = /^\s*Step\s+(\d+)(?:\s*\((Owner|Accountant|Secretary)\))?\s*:\s*(.*)$/i;
const STEP_DONE_RE = /^\s*\[StepDone\]\s*([^\r\n]*)\s*$/i;
const CERTIFICATE_SERVICE_RE = /\b(auditing|book\s*keeping|bookkeeping|tax\s*filing)\b/i;

function clampPercent(n) {
  const num = Number(n);
  if (Number.isNaN(num)) return 0;
  return Math.max(0, Math.min(100, Math.round(num)));
}

function parseProgressFromDescription(desc) {
  if (!desc) return 0;
  const matches = String(desc).match(/^\s*\[Progress\]\s*(\d{1,3})\s*$/gim);
  if (!matches || !matches.length) return 0;
  const last = matches[matches.length - 1];
  const value = last.match(/(\d{1,3})/);
  return clampPercent(value?.[1] ?? 0);
}

function normalizeStepAssignee(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "owner" || normalized === "admin") return "Owner";
  if (normalized === "secretary") return "Secretary";
  return "Accountant";
}

function parseTaskSteps(desc) {
  const lines = String(desc || "").split(/\r?\n/);
  const steps = [];

  for (const line of lines) {
    const match = String(line || "").match(STEP_LINE_RE);
    if (!match) continue;

    const text = String(match[3] || "").trim();
    if (!text) continue;

    steps.push({
      number: steps.length + 1,
      assignee: normalizeStepAssignee(match[2]),
      text,
    });
  }

  return steps;
}

function parseCompletedStepNumbers(desc) {
  const lines = String(desc || "").split(/\r?\n/);
  const completed = new Set();

  for (const line of lines) {
    const match = String(line || "").match(STEP_DONE_RE);
    if (!match) continue;

    String(match[1] || "")
      .split(/[,\s]+/)
      .map((token) => parseInt(token, 10))
      .filter((value) => Number.isInteger(value) && value > 0)
      .forEach((value) => completed.add(value));
  }

  return completed;
}

function isCompletedStatus(statusText) {
  const normalized = String(statusText || "").trim().toLowerCase();
  return normalized === "completed" || normalized === "done";
}

function isCertificateEligibleService(task) {
  const values = [
    task?.service_name,
    task?.service,
    task?.name,
    task?.title,
  ];
  return values.some((value) => CERTIFICATE_SERVICE_RE.test(String(value || "")));
}

function getTaskKey(task) {
  const rawId = task?.id ?? task?.task_id ?? task?.Task_ID;
  if (rawId != null && String(rawId).trim()) {
    return String(rawId).trim();
  }

  return [
    String(task?.name || task?.title || "service").trim(),
    String(task?.created_at || task?.createdAt || "").trim(),
    String(task?.accountant_name || "").trim(),
  ]
    .filter(Boolean)
    .join(":");
}

function parseDate(value) {
  if (!value) return null;

  const raw = String(value).trim();
  if (!raw) return null;

  const direct = new Date(raw);
  if (!Number.isNaN(direct.getTime())) return direct;

  const dayFirstMatch = raw.match(/^\s*(\d{1,2})[/-](\d{1,2})[/-](\d{4})\s*$/);
  if (!dayFirstMatch) return null;

  const day = parseInt(dayFirstMatch[1], 10);
  const month = parseInt(dayFirstMatch[2], 10);
  const year = parseInt(dayFirstMatch[3], 10);
  const parsed = new Date(year, month - 1, day);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatDate(value) {
  const date = value instanceof Date ? value : parseDate(value);
  if (!date) return "-";
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "2-digit" });
}

function getCompletionMeta(task, completionTimestamps) {
  const values = Object.values(completionTimestamps || {});
  let latestRaw = "";
  let latestTime = Number.NEGATIVE_INFINITY;

  values.forEach((value) => {
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

  const fallbackRaw = String(task?.updated_at || task?.updatedAt || task?.created_at || task?.createdAt || "").trim();
  const raw = latestRaw || fallbackRaw;
  const label = raw ? formatStepDateTime(raw) || formatDate(raw) : "";

  return { raw, label };
}

function compareHistoryRows(left, right) {
  const leftTime = parseDate(left.completedAtSortRaw)?.getTime() || parseDate(left.createdAtRaw)?.getTime() || 0;
  const rightTime = parseDate(right.completedAtSortRaw)?.getTime() || parseDate(right.createdAtRaw)?.getTime() || 0;
  if (leftTime !== rightTime) return rightTime - leftTime;
  return String(right.id).localeCompare(String(left.id), undefined, { numeric: true, sensitivity: "base" });
}

export default function ClientHistory() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tasks, setTasks] = useState([]);
  const [search, setSearch] = useState("");
  const [stepsTaskId, setStepsTaskId] = useState("");

  useErrorToast(error);

  const user = useMemo(() => {
    try {
      const raw = sessionStorage.getItem("session:user");
      return raw ? JSON.parse(raw) : null;
    } catch (_) {
      return null;
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    async function load({ silent } = { silent: false }) {
      try {
        if (!silent) {
          setLoading(true);
        }
        setError("");

        const sessionClientId = user?.client_id || user?.Client_ID;

        if (sessionClientId) {
          const response = await api.get("/task_list.php", {
            params: { client_id: sessionClientId },
          });
          const rows = Array.isArray(response?.data?.tasks) ? response.data.tasks : [];
          if (!mounted) return;
          setTasks((prev) => {
            const next = rows;
            if (JSON.stringify(prev) === JSON.stringify(next)) return prev;
            return next;
          });
          return;
        }

        const clientName = joinPersonName([user?.first_name, user?.middle_name, user?.last_name]);
        const response = await api.get("/task_list.php");
        const rows = Array.isArray(response?.data?.tasks) ? response.data.tasks : [];
        const filtered = clientName
          ? rows.filter(
              (task) => normalizeNameForComparison(task?.client_name) === normalizeNameForComparison(clientName)
            )
          : rows;

        if (!mounted) return;
        setTasks((prev) => {
          const next = filtered;
          if (JSON.stringify(prev) === JSON.stringify(next)) return prev;
          return next;
        });
      } catch (e) {
        if (!mounted) return;
        setError(e?.response?.data?.message || e?.message || "Failed to load service history.");
      } finally {
        if (!mounted) return;
        setLoading(false);
      }
    }

    load({ silent: false });
    const interval = setInterval(() => load({ silent: true }), 8000);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [user?.client_id, user?.Client_ID, user?.first_name, user?.middle_name, user?.last_name]);

  const historyRows = useMemo(() => {
    return (tasks || [])
      .filter((task) => isCompletedStatus(task?.status))
      .map((task) => {
        const completionTimestamps = parseStepCompletionTimestamps(task?.description);
        const completionMeta = getCompletionMeta(task, completionTimestamps);

        return {
          id: getTaskKey(task),
          taskId: task?.id ?? task?.task_id ?? null,
          serviceName: task?.name || task?.title || "(Unnamed service)",
          serviceType: task?.service_name || task?.service || task?.name || task?.title || "",
          accountantName: task?.accountant_name || "Unassigned",
          progress: Math.max(100, parseProgressFromDescription(task?.description)),
          steps: parseTaskSteps(task?.description),
          completedSteps: parseCompletedStepNumbers(task?.description),
          stepCompletionTimestamps: completionTimestamps,
          stepRemarks: parseStepRemarks(task?.description),
          stepRemarkTimestamps: parseStepRemarkTimestamps(task?.description),
          completedOn: completionMeta.label,
          completedAtSortRaw: completionMeta.raw,
          createdAtRaw: String(task?.created_at || task?.createdAt || "").trim(),
          certificateId: String(task?.certificate_id || "").trim(),
          certificateIssueDate: String(task?.certificate_issue_date || "").trim(),
          certificateDeliveryStatus: String(task?.certificate_delivery_status || "").trim(),
          certificateDeliveryMessage: String(task?.certificate_delivery_message || "").trim(),
          certificateDeliveredAt: String(task?.certificate_delivered_at || "").trim(),
          certificateEligible: isCertificateEligibleService(task),
        };
      })
      .sort(compareHistoryRows);
  }, [tasks]);

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return historyRows;

    return historyRows.filter((row) => {
      return (
        String(row.serviceName || "").toLowerCase().includes(query) ||
        String(row.accountantName || "").toLowerCase().includes(query) ||
        String(row.completedOn || "").toLowerCase().includes(query)
      );
    });
  }, [historyRows, search]);

  const completedServicesPercent = useMemo(() => {
    if (!historyRows.length) return 0;
    return Math.round(
      historyRows.reduce((sum, row) => sum + clampPercent(row.progress), 0) / historyRows.length
    );
  }, [historyRows]);

  const selectedStepsTask = useMemo(
    () => historyRows.find((row) => String(row.id) === String(stepsTaskId)) || null,
    [historyRows, stepsTaskId]
  );
  const closeSteps = () => {
    setStepsTaskId("");
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">History</h2>
            <p className="text-sm text-slate-500">
              Completed services from Work Progress are moved here automatically.
            </p>
          </div>
          <Link
            to="/client/work-progress"
            className="inline-flex items-center justify-center rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            Back to Work Progress
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Completed Services</div>
          <div className="mt-2 text-2xl font-bold text-emerald-700">{historyRows.length}</div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Showing</div>
          <div className="mt-2 text-2xl font-bold text-slate-900">{filteredRows.length}</div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Average Progress</div>
          <div className="mt-2 text-2xl font-bold text-slate-900">{completedServicesPercent}%</div>
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="relative">
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
            placeholder="Search completed services by service name, accountant, or completion date..."
            className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-emerald-500/20"
          />
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-6 text-sm text-slate-600">Loading service history...</div>
        ) : error ? (
          <div className="p-6">
            <div className="rounded-md border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
              {error}
            </div>
          </div>
        ) : filteredRows.length === 0 ? (
          historyRows.length > 0 ? (
            <div className="p-6 text-sm text-slate-600">No completed services matched your search.</div>
          ) : (
            <div className="p-6 text-sm text-slate-600">
              No completed services yet. Once a service is marked completed, it will appear here.
            </div>
          )
        ) : (
          <div className="divide-y divide-slate-200">
            {filteredRows.map((row) => (
              <div key={row.id} className="p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="font-semibold text-slate-900">{row.serviceName}</div>
                      <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-emerald-200">
                        Completed
                      </span>
                    </div>

                    <div className="mt-1 text-sm text-slate-600">
                      Assigned accountant: <span className="font-medium text-slate-800">{row.accountantName}</span>
                    </div>

                    <div className="mt-1 text-sm text-slate-600">
                      Completed on: <span className="font-medium text-slate-800">{row.completedOn || "-"}</span>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setStepsTaskId(row.id)}
                        className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                      >
                        <span>View completed steps</span>
                        <span className="inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">
                          {row.steps.length}
                        </span>
                      </button>
                    </div>

                    {row.certificateId ? null : row.certificateEligible ? (
                      <div className="mt-2 text-xs text-amber-700">
                        Certificate is not available yet for this completed service.
                      </div>
                    ) : null}
                  </div>

                  <div className="w-full lg:w-[360px]">
                    <div className="flex items-center justify-between text-xs text-slate-500">
                      <span>Final Progress</span>
                      <span className="font-medium text-slate-700">{row.progress}%</span>
                    </div>
                    <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-slate-100 ring-1 ring-slate-200">
                      <div
                        className="h-full bg-emerald-500"
                        style={{ width: `${row.progress}%` }}
                        role="progressbar"
                        aria-valuenow={row.progress}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-label={`Final progress ${row.progress}%`}
                      />
                    </div>
                    <div className="mt-2 text-xs text-slate-500">
                      {row.steps.length > 0
                        ? `${row.steps.length} step${row.steps.length === 1 ? "" : "s"} recorded for this service.`
                        : "This completed service has no saved step list."}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Modal
        open={Boolean(selectedStepsTask)}
        onClose={closeSteps}
        title={selectedStepsTask ? `${selectedStepsTask.serviceName} History` : "Service History"}
        description={
          selectedStepsTask
            ? "Review the completed steps and any saved remarks for this finished service."
            : undefined
        }
        size="lg"
        footer={
          <button
            type="button"
            onClick={closeSteps}
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Close
          </button>
        }
      >
        {selectedStepsTask ? (
          <div className="space-y-4">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Completed</div>
                  <div className="mt-1 text-sm text-emerald-700">
                    {selectedStepsTask.completedOn || "Completion date unavailable"}
                  </div>
                </div>
                <div className="text-sm font-medium text-slate-700">
                  {selectedStepsTask.steps.length} step{selectedStepsTask.steps.length === 1 ? "" : "s"} recorded
                </div>
              </div>
              <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-white ring-1 ring-emerald-200">
                <div className="h-full bg-emerald-500" style={{ width: `${selectedStepsTask.progress}%` }} />
              </div>
            </div>

            {selectedStepsTask.steps.length > 0 ? (
              <div className="space-y-3">
                {selectedStepsTask.steps.map((step) => {
                  const hasExplicitCompletedSteps = selectedStepsTask.completedSteps.size > 0;
                  const completed = hasExplicitCompletedSteps
                    ? selectedStepsTask.completedSteps.has(step.number)
                    : true;
                  const completionLabel = formatStepDateTime(selectedStepsTask.stepCompletionTimestamps?.[step.number]);
                  const stepRemark = String(selectedStepsTask.stepRemarks?.[step.number] || "").trim();
                  const stepRemarkTimeLabel = formatStepDateTime(selectedStepsTask.stepRemarkTimestamps?.[step.number]);

                  return (
                    <div
                      key={`history-step-${selectedStepsTask.id}-${step.number}`}
                      className="rounded-xl border border-emerald-200 bg-emerald-50/60 px-4 py-3"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="inline-flex items-center gap-2 text-xs font-semibold text-slate-500">
                          <span className="inline-flex items-center rounded-full bg-white px-2 py-0.5 text-slate-700">
                            Step {step.number}
                          </span>
                          <span>{step.assignee}</span>
                        </div>
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                            completed ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"
                          }`}
                        >
                          {completed ? "Completed" : "Recorded"}
                        </span>
                      </div>

                      <div className={`mt-2 text-sm leading-6 ${completed ? "text-slate-600" : "text-slate-800"}`}>
                        {step.text}
                      </div>

                      {completionLabel ? (
                        <div className="mt-2 text-xs font-medium text-emerald-700">
                          Completed on {completionLabel}
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
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm text-slate-500">
                No step-by-step entries were saved for this service.
              </div>
            )}
          </div>
        ) : null}
      </Modal>

    </div>
  );
}
