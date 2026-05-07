import React from "react";
import { formatDateTime } from "../utils/helpers";
const AUDIT_RANGE_OPTIONS = [
  { value: "24h", label: "Last 24h" },
  { value: "7d", label: "Last 7d" },
  { value: "30d", label: "Last 30d" },
  { value: "all", label: "All time" },
];

function getAuditActionTone(action) {
  const normalized = String(action ?? "").toLowerCase();

  if (normalized.includes("failed") || normalized.includes("locked") || normalized.includes("blocked")) {
    return "border-rose-200 bg-rose-50 text-rose-700";
  }
  if (normalized.includes("security") || normalized.includes("permissions")) {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }
  if (normalized.includes("login") || normalized.includes("logout") || normalized.includes("returned")) {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  return "border-slate-200 bg-slate-100 text-slate-700";
}

function isLoopbackIpAddress(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized === "::1" || normalized === "127.0.0.1";
}

function formatAuditIpAddress(value) {
  if (isLoopbackIpAddress(value)) {
    return "Localhost";
  }

  return value || "-";
}

function formatAuditLocation(value, ipAddress) {
  if (value) {
    return value;
  }
  if (isLoopbackIpAddress(ipAddress)) {
    return "Local development";
  }

  return "-";
}

export default function AuditLogsSection({
  auditLoading,
  auditMeta,
  auditSearch,
  setAuditSearch,
  setAuditPage,
  auditRange,
  setAuditRange,
  auditPerPage,
  setAuditRefreshKey,
  auditLogs,
}) {
  return (
    <div className="flex w-full flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-5 py-4">
        <h3 className="text-base font-semibold text-slate-800">Audit Logs</h3>
        <p className="mt-1 text-sm text-slate-500">
          Review login activity, security updates, and other tracked system events.
        </p>
      </div>
      <div className="p-5">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-slate-600">
            {auditLoading
              ? "Loading audit activity..."
              : `${auditMeta.total} log entr${auditMeta.total === 1 ? "y" : "ies"} found`}
          </div>
          <div className="flex flex-wrap gap-2">
            <input
              type="text"
              value={auditSearch}
              onChange={(event) => {
                setAuditSearch(event.target.value);
                setAuditPage(1);
              }}
              placeholder="Search user, action, device..."
              className="w-56 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 shadow-sm outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/15"
            />
            <select
              value={auditRange}
              onChange={(event) => {
                setAuditRange(event.target.value);
                setAuditPage(1);
              }}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 shadow-sm outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/15"
            >
              {AUDIT_RANGE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <span className="inline-flex items-center rounded-md border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700">
              {auditPerPage} / page
            </span>
            <button
              type="button"
              onClick={() => setAuditRefreshKey((value) => value + 1)}
              disabled={auditLoading}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-70"
            >
              Refresh
            </button>
          </div>
        </div>

        {auditLoading && auditLogs.length === 0 ? (
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
            Loading audit logs...
          </div>
        ) : auditLogs.length === 0 ? (
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
            No audit logs found for the selected filters.
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-slate-200">
            <div className="max-h-[60vh] overflow-auto">
              <table className="min-w-full table-fixed text-sm">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="w-44 px-3 py-2 text-left font-medium align-middle">Time</th>
                    <th className="w-44 px-3 py-2 text-left font-medium align-middle">User</th>
                    <th className="w-48 px-3 py-2 text-left font-medium align-middle">Action</th>
                    <th className="w-36 px-3 py-2 text-left font-medium align-middle">IP Address</th>
                    <th className="w-44 px-3 py-2 text-left font-medium align-middle">Location</th>
                    <th className="w-44 px-3 py-2 text-left font-medium align-middle">Device</th>
                    <th className="w-40 px-3 py-2 text-left font-medium align-middle">Browser</th>
                    <th className="w-40 px-3 py-2 text-left font-medium align-middle">OS</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {auditLogs.map((log) => (
                    <tr key={log.id}>
                      <td className="px-3 py-2 align-middle text-slate-700">
                        {formatDateTime(log.created_at)}
                      </td>
                      <td className="px-3 py-2 align-middle">
                        <div className="font-medium text-slate-700">{log.display_name || "Unknown user"}</div>
                        {log.username ? <div className="text-xs text-slate-500">@{log.username}</div> : null}
                      </td>
                      <td className="px-3 py-2 align-middle">
                        <span
                          className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${getAuditActionTone(
                            log.action
                          )}`}
                        >
                          {log.action || "-"}
                        </span>
                      </td>
                      <td className="px-3 py-2 align-middle font-mono text-xs text-slate-600 break-all whitespace-normal">
                        {formatAuditIpAddress(log.ip_address)}
                      </td>
                      <td className="px-3 py-2 align-middle text-slate-600">
                        {formatAuditLocation(log.location, log.ip_address)}
                      </td>
                      <td className="px-3 py-2 align-middle text-slate-600">{log.device || "-"}</td>
                      <td className="px-3 py-2 align-middle text-slate-600">{log.browser || "-"}</td>
                      <td className="px-3 py-2 align-middle text-slate-600">{log.os || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex flex-col gap-3 border-t border-slate-200 bg-slate-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-xs text-slate-600">
                {auditMeta.total > 0
                  ? `Showing ${(auditMeta.page - 1) * auditMeta.per_page + 1}-${Math.min(
                    auditMeta.page * auditMeta.per_page,
                    auditMeta.total
                  )} of ${auditMeta.total}`
                  : "Showing 0 of 0"}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setAuditPage((current) => Math.max(1, current - 1))}
                  disabled={auditLoading || auditMeta.page <= 1}
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Previous
                </button>
                <div className="text-xs text-slate-600">
                  Page {auditMeta.page} of {auditMeta.total_pages}
                </div>
                <button
                  type="button"
                  onClick={() => setAuditPage((current) => Math.min(auditMeta.total_pages, current + 1))}
                  disabled={auditLoading || auditMeta.page >= auditMeta.total_pages}
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
