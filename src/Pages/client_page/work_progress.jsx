import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../services/api";
import { Modal } from "../../components/UI/modal";
import { joinPersonName, normalizeNameForComparison } from "../../utils/person_name";
import { useErrorToast } from "../../utils/feedback";
import {
  formatStepDateTime,
  parseStepCompletionTimestamps,
  parseStepRemarks,
  parseStepRemarkTimestamps,
} from "../../utils/task_step_metadata";
import { getTaskDeadlineState } from "../../utils/task_deadline";

const STEP_LINE_RE = /^\s*Step\s+(\d+)(?:\s*\((Owner|Accountant|Secretary)\))?\s*:\s*(.*)$/i;
const STEP_DONE_RE = /^\s*\[StepDone\]\s*([^\r\n]*)\s*$/i;

function clampPercent(n) {
  const num = Number(n);
  if (Number.isNaN(num)) return 0;
  return Math.max(0, Math.min(100, Math.round(num)));
}

function parseProgressFromDescription(desc) {
  if (!desc) return 0;
  const m = String(desc).match(/^\s*\[Progress\]\s*(\d{1,3})\s*$/gim);
  if (!m || !m.length) return 0;
  const last = m[m.length - 1];
  const n = last.match(/(\d{1,3})/);
  return clampPercent(n?.[1] ?? 0);
}

function parseDeclinedReasonFromDescription(desc) {
  if (!desc) return "";
  const m = String(desc).match(/^\s*\[Declined reason\]\s*(.+?)\s*$/im);
  return (m?.[1] ?? "").trim();
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

function statusMeta(statusText, progress, options = {}) {
  const s = (statusText || "").toLowerCase();
  if (s.includes("declin")) {
    return { label: "Declined", pill: "bg-rose-50 text-rose-700 ring-1 ring-rose-200", bar: "bg-rose-500" };
  }
  if (s === "completed" || s === "done") {
    return { label: "Completed", pill: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200", bar: "bg-emerald-500" };
  }
  if (options.isOverdue || s === "overdue") {
    return { label: "Overdue", pill: "bg-rose-50 text-rose-700 ring-1 ring-rose-200", bar: "bg-rose-500" };
  }
  if (s === "incomplete" || progress >= 100) {
    return { label: "Incomplete", pill: "bg-orange-50 text-orange-700 ring-1 ring-orange-200", bar: "bg-orange-500" };
  }
  if (progress > 0 || s.includes("ongo")) {
    return { label: "Ongoing", pill: "bg-sky-50 text-sky-700 ring-1 ring-sky-200", bar: "bg-sky-500" };
  }
  return { label: "Pending", pill: "bg-slate-50 text-slate-700 ring-1 ring-slate-200", bar: "bg-slate-400" };
}

export default function WorkProgress() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useErrorToast(error);
  const [tasks, setTasks] = useState([]);
  const [stepsTaskId, setStepsTaskId] = useState(null);

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

        // IMPORTANT:
        // - session:user.id is tbluser.User_id, not tblclient.Client_ID.
        // - tasks are filtered by tbltasks.Client_ID.
        // We try to use client_id stored in session first.
        // If missing, fall back by matching client name against task_list results (unfiltered).
        const sessionClientId = user?.client_id || user?.Client_ID;

        if (sessionClientId) {
          const res = await api.get("/task_list.php", {
            params: { client_id: sessionClientId },
          });
          const rows = res?.data?.tasks || [];
          if (!mounted) return;
          setTasks((prev) => {
            const next = Array.isArray(rows) ? rows : [];
            // Avoid unnecessary re-render flicker when polling
            if (JSON.stringify(prev) === JSON.stringify(next)) return prev;
            return next;
          });
          return;
        }

        // Fallback (no session client id available): fetch all tasks then filter by the client's full name.
        // This uses the existing relationship already returned by task_list.php (client_name).
        const clientName = joinPersonName([user?.first_name, user?.middle_name, user?.last_name]);
        const allRes = await api.get("/task_list.php");
        const allRows = allRes?.data?.tasks || [];
        const filtered = Array.isArray(allRows) && clientName
          ? allRows.filter(
              (t) => normalizeNameForComparison(t?.client_name) === normalizeNameForComparison(clientName)
            )
          : Array.isArray(allRows) ? allRows : [];

        if (!mounted) return;
        setTasks((prev) => {
          const next = filtered;
          if (JSON.stringify(prev) === JSON.stringify(next)) return prev;
          return next;
        });
      } catch (e) {
        if (!mounted) return;
        const msg = e?.response?.data?.message || e?.message || "Failed to load work progress.";
        setError(msg);
      } finally {
        if (!mounted) return;
        setLoading(false);
      }
    }

    // initial load + auto-refresh so accountant updates reflect without manual reload
    load({ silent: false });
    const interval = setInterval(() => load({ silent: true }), 8000);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [user?.client_id, user?.Client_ID, user?.first_name, user?.middle_name, user?.last_name]);

  const normalized = useMemo(() => {
    return (tasks || []).map((t) => {
      const progress = parseProgressFromDescription(t.description);
      const reason = parseDeclinedReasonFromDescription(t.description);
      const steps = parseTaskSteps(t.description);
      const deadlineState = getTaskDeadlineState(t);
      const isOverdue = String(t?.status || "").trim().toLowerCase() === "overdue" || deadlineState.isOverdue;
      const meta = statusMeta(t.status, progress, { isOverdue });
      return {
        id: t.id,
        serviceName: t.name || "(Unnamed service)",
        serviceType: t.status || "",
        accountantName: t.accountant_name || "Unassigned",
        status: meta.label,
        statusPill: meta.pill,
        barColor: meta.bar,
        progress,
        isOverdue,
        declinedReason: meta.label === "Declined" ? reason : "",
        steps,
        completedSteps: parseCompletedStepNumbers(t.description),
        stepCompletionTimestamps: parseStepCompletionTimestamps(t.description),
        stepRemarks: parseStepRemarks(t.description),
        stepRemarkTimestamps: parseStepRemarkTimestamps(t.description),
      };
    });
  }, [tasks]);

  const historyRows = useMemo(
    () => normalized.filter((row) => row.status === "Completed"),
    [normalized]
  );

  const activeRows = useMemo(
    () => normalized.filter((row) => row.status !== "Completed"),
    [normalized]
  );

  const selectedStepsTask = useMemo(
    () => normalized.find((row) => String(row.id) === String(stepsTaskId)) || null,
    [normalized, stepsTaskId]
  );
  const nextIncompleteStep = useMemo(
    () => selectedStepsTask?.steps.find((item) => !selectedStepsTask.completedSteps.has(item.number))?.number ?? null,
    [selectedStepsTask]
  );

  const openSteps = (taskId) => {
    setStepsTaskId(taskId);
  };

  const closeSteps = () => {
    setStepsTaskId(null);
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Work Progress</h2>
            <p className="text-sm text-slate-500">
              Track the status and completion percentage of your requested services. Completed services are moved to
              history.
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-6 text-sm text-slate-600">Loading work progress…</div>
        ) : error ? (
          <div className="p-6">
            <div className="rounded-md border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
              {error}
            </div>
          </div>
        ) : activeRows.length === 0 ? (
          historyRows.length > 0 ? (
            <div className="p-6 text-sm text-slate-600">
              No active services right now. Your completed services are available in{" "}
              <Link to="/client/work-progress/history" className="font-semibold text-emerald-700 hover:text-emerald-800">
                History
              </Link>
              .
            </div>
          ) : (
            <div className="p-6 text-sm text-slate-600">No services found.</div>
          )
        ) : (
          <div className="space-y-4 p-4">
            {activeRows.map((row) => (
              <div
                key={row.id}
                className={`rounded-xl border p-5 shadow-sm ${
                  row.isOverdue ? "border-rose-300 bg-rose-50/40" : "border-slate-200 bg-white"
                }`}
              >
                <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <div className="font-semibold text-slate-900 truncate">
                        {row.serviceName}
                      </div>
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${row.statusPill}`}>
                        {row.status}
                      </span>
                    </div>
                    {row.serviceType ? (
                      <div className="mt-1 text-sm text-slate-600">
                        Service: <span className="font-medium text-slate-800">{row.serviceType}</span>
                      </div>
                    ) : null}

                    <div className="mt-1 text-sm text-slate-600">
                      Assigned accountant: <span className="font-medium text-slate-800">{row.accountantName}</span>
                    </div>

                    {row.steps.length > 0 ? (
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => openSteps(row.id)}
                          className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                        >
                          <span>View all steps</span>
                          <span className="inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">
                            {row.steps.length}
                          </span>
                        </button>
                        <span className="text-xs text-slate-500">
                          {row.steps.length} step{row.steps.length === 1 ? "" : "s"} available
                        </span>
                      </div>
                    ) : null}

                    {row.declinedReason ? (
                      <div className="mt-3 rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
                        <div className="font-semibold">Declined reason</div>
                        <div className="mt-1 text-rose-700">{row.declinedReason}</div>
                      </div>
                    ) : null}
                  </div>

                  <div className="w-full lg:w-[360px]">
                    <div className="flex items-center justify-between text-xs text-slate-500">
                      <span>Progress</span>
                      <span className="font-medium text-slate-700">{row.progress}%</span>
                    </div>
                    <div className="mt-2 h-2.5 w-full rounded-full bg-slate-100 overflow-hidden ring-1 ring-slate-200">
                      <div
                        className={`h-full ${row.barColor}`}
                        style={{ width: `${row.progress}%` }}
                        role="progressbar"
                        aria-valuenow={row.progress}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-label={`Progress ${row.progress}%`}
                      />
                    </div>
                    <div className="mt-2 text-xs text-slate-500">
                      {row.status === "Declined"
                        ? "This service was declined."
                        : row.status === "Overdue"
                          ? "This service is overdue and needs attention."
                        : row.status === "Ongoing"
                          ? "Work is currently in progress."
                          : "Waiting to be started."}
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
        title={selectedStepsTask ? `${selectedStepsTask.serviceName} Steps` : "Service Steps"}
        description={
          selectedStepsTask
            ? `Review all steps for this service and see which ones are already completed.`
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
            <div
              className={`rounded-xl border p-4 ${
                selectedStepsTask.isOverdue ? "border-rose-200 bg-rose-50" : "border-slate-200 bg-slate-50"
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Progress</div>
                  <div className="mt-1 text-sm text-slate-600">
                    {selectedStepsTask.progress}% complete
                  </div>
                </div>
                <div className="text-sm font-medium text-slate-700">
                  {selectedStepsTask.completedSteps.size} of {selectedStepsTask.steps.length} step
                  {selectedStepsTask.steps.length === 1 ? "" : "s"} completed
                </div>
              </div>
              <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-white ring-1 ring-slate-200">
                <div
                  className={`h-full ${selectedStepsTask.barColor}`}
                  style={{ width: `${selectedStepsTask.progress}%` }}
                />
              </div>
            </div>

            <div className="space-y-3">
              {selectedStepsTask.steps.map((step) => {
                const completed = selectedStepsTask.completedSteps.has(step.number);
                const isCurrent = !completed && step.number === nextIncompleteStep;
                const completionLabel = formatStepDateTime(selectedStepsTask.stepCompletionTimestamps?.[step.number]);
                const stepRemark = String(selectedStepsTask.stepRemarks?.[step.number] || "").trim();
                const stepRemarkTimeLabel = formatStepDateTime(selectedStepsTask.stepRemarkTimestamps?.[step.number]);

                return (
                  <div
                    key={`step-${selectedStepsTask.id}-${step.number}`}
                    className={`rounded-xl border px-4 py-3 ${
                      completed
                        ? "border-emerald-200 bg-emerald-50/60"
                        : isCurrent
                          ? "border-sky-200 bg-sky-50/60"
                          : "border-slate-200 bg-white"
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="inline-flex items-center gap-2 text-xs font-semibold text-slate-500">
                        <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-slate-700">
                          Step {step.number}
                        </span>
                        <span>{step.assignee}</span>
                      </div>
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                          completed
                            ? "bg-emerald-100 text-emerald-700"
                            : isCurrent
                              ? "bg-sky-100 text-sky-700"
                              : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {completed ? "Completed" : isCurrent ? "Current" : "Pending"}
                      </span>
                    </div>

                    <div
                      className={`mt-2 text-sm leading-6 ${
                        completed ? "text-slate-500 line-through" : "text-slate-800"
                      }`}
                    >
                      {step.text}
                    </div>

                    {completed && completionLabel ? (
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
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
