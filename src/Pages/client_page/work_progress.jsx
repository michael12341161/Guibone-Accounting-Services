import React, { useEffect, useMemo, useState } from "react";
import { api } from "../../services/api";
import { joinPersonName, normalizeNameForComparison } from "../../utils/person_name";

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

function statusMeta(statusText, progress) {
  const s = (statusText || "").toLowerCase();
  if (s.includes("declin")) {
    return { label: "Declined", pill: "bg-rose-50 text-rose-700 ring-1 ring-rose-200", bar: "bg-rose-500" };
  }
  if (s.includes("done") || s.includes("complete")) {
    return { label: "Completed", pill: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200", bar: "bg-emerald-500" };
  }
  if (progress > 0 || s.includes("ongo")) {
    return { label: "Ongoing", pill: "bg-sky-50 text-sky-700 ring-1 ring-sky-200", bar: "bg-sky-500" };
  }
  return { label: "Pending", pill: "bg-slate-50 text-slate-700 ring-1 ring-slate-200", bar: "bg-slate-400" };
}

export default function WorkProgress() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tasks, setTasks] = useState([]);

  const user = useMemo(() => {
    try {
      const raw = localStorage.getItem("session:user");
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
      const meta = statusMeta(t.status, progress);
      return {
        id: t.id,
        serviceName: t.name || "(Unnamed service)",
        serviceType: t.status || "",
        accountantName: t.accountant_name || "Unassigned",
        status: meta.label,
        statusPill: meta.pill,
        barColor: meta.bar,
        progress,
        declinedReason: meta.label === "Declined" ? reason : "",
      };
    });
  }, [tasks]);

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Work Progress</h2>
            <p className="text-sm text-slate-500">
              Track the status and completion percentage of your requested services.
            </p>
          </div>
          <div className="text-xs text-slate-500">
            Updated by your assigned accountant
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
        ) : normalized.length === 0 ? (
          <div className="p-6 text-sm text-slate-600">No services found.</div>
        ) : (
          <div className="divide-y divide-slate-200">
            {normalized.map((row) => (
              <div key={row.id} className="p-5">
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
                      {row.status === "Completed"
                        ? "This service is completed."
                        : row.status === "Declined"
                          ? "This service was declined."
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

      
    </div>
  );
}
